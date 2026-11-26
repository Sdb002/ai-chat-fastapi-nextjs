"""m2-ai backend: FastAPI + SQLite + JWT auth + Groq chat (streaming) for the m2-ai-frontend (Next.js) app.

Version 0.18.0 (m2d18): adds POST /chat, POST /chat/stream, GET /chat/history on top of the
existing register / login / me routes. Auth code below is unchanged from the version on your Desktop.

Run:  .venv\\Scripts\\python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
Docs: http://127.0.0.1:8000/docs
"""

import logging
import os
from collections.abc import Iterator  # Iterator[str] = "something you can loop over that yields str"
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse  # sends the body piece by piece instead of all at once
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jwt.exceptions import InvalidTokenError
from openai import APIError, OpenAI  # OpenAI SDK, pointed at Groq via base_url (m2d8)
from openai.types.chat import ChatCompletionMessageParam  # type of one {"role", "content"} message
from pwdlib import PasswordHash
from pydantic import BaseModel, ConfigDict, EmailStr
from pydantic import Field as PydanticField
from sqlalchemy.exc import IntegrityError
from sqlmodel import Field, Session, SQLModel, col, create_engine, select

load_dotenv()  # reads .env next to this file into os.environ (does NOT overwrite vars already set in the shell)

logger = logging.getLogger("m2-ai-backend")

# ---------- settings (from .env) ----------
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set. Copy .env.example to .env and fill it in.")
ALGORITHM = "HS256"
# Must match TOKEN_LIFETIME_MINUTES in the frontend's lib/auth.ts (cookie and JWT expire together).
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")
# The Next.js dev server's origins. Browsers block cross-origin calls unless they are listed here.
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
]

# NEW m2d18: required. Hard-fail (m2d1 rule): a missing key must crash at startup, not at the first chat.
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is not set. Add it to .env (get one at console.groq.com/keys).")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")  # the model that worked on m2d8
GROQ_BASE_URL = "https://api.groq.com/openai/v1"

# ---------- database ----------
# check_same_thread=False: FastAPI may use the SQLite connection from a different thread than the one that opened it.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# NEW m2d18: one row = one user message + the full AI reply.
# create_all() in lifespan creates this table on next start; your existing users are untouched.
class Conversation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)  # index: /chat/history filters by this
    mode: str
    user_message: str
    assistant_message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


# ---------- request / response shapes ----------
class UserCreate(BaseModel):
    email: EmailStr
    password: str = PydanticField(min_length=8, max_length=128)  # same rule as frontend lib/schemas.ts


class UserPublic(BaseModel):  # what the API returns: never the password hash
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# NEW m2d18 ---------------------------------------------------------------
ChatMode = Literal["default", "tutor", "concise"]  # Literal = only these exact strings are valid (else 422)


class HistoryMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")  # unknown keys -> 422, so frontend typos fail loudly
    role: Literal["user", "assistant"]  # the client may NOT send "system": the server owns the system prompt
    content: str = PydanticField(max_length=20_000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = PydanticField(min_length=1, max_length=4_000)
    history: list[HistoryMessage] = PydanticField(default_factory=list)  # earlier turns, oldest first
    mode: ChatMode = "default"


class ChatResponse(BaseModel):
    reply: str
    mode: ChatMode


class ConversationPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mode: str
    user_message: str
    assistant_message: str
    created_at: datetime


# ---------- security ----------
password_hash = PasswordHash.recommended()  # argon2
# Verifying against a dummy hash when the email is unknown keeps response time the same,
# so attackers can't tell which emails are registered by timing the login request.
DUMMY_HASH = password_hash.hash("dummy-password-for-timing")
# tokenUrl is only used by the /docs "Authorize" button.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], session: SessionDep) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])  # also checks "exp"
        user_id = int(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError):
        raise credentials_error
    user = session.get(User, user_id)
    if user is None:  # token is valid but the user was deleted
        raise credentials_error
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# ---------- LLM (NEW m2d18) ----------
# Sync client: the chat routes are plain `def`, so FastAPI runs them in a worker thread (m2d10).
groq_client = OpenAI(api_key=GROQ_API_KEY, base_url=GROQ_BASE_URL)

SYSTEM_PROMPTS: dict[str, str] = {
    "default": "You are a helpful, friendly assistant. Answer clearly and accurately.",
    "tutor": (
        "You are a patient computer-science tutor. Explain step by step, use small examples, "
        "and end with one short question that checks understanding."
    ),
    "concise": "You are a concise assistant. Answer in at most three sentences. No filler.",
}

# Guard against huge prompts: oldest history is dropped first once this many characters is reached (m2d12).
MAX_HISTORY_CHARS = 12_000


def build_messages(body: ChatRequest) -> list[ChatCompletionMessageParam]:
    """System prompt + as much recent history as fits + the new user message."""
    kept: list[HistoryMessage] = []
    total = 0
    for item in reversed(body.history):  # walk newest -> oldest
        total += len(item.content)
        if total > MAX_HISTORY_CHARS:
            break  # everything older than this is dropped
        kept.append(item)
    kept.reverse()  # back to oldest -> newest, the order the model expects

    messages: list[ChatCompletionMessageParam] = [{"role": "system", "content": SYSTEM_PROMPTS[body.mode]}]
    for item in kept:
        messages.append({"role": item.role, "content": item.content})
    messages.append({"role": "user", "content": body.message})
    return messages


def save_conversation(user_id: int, body: ChatRequest, reply: str) -> None:
    # Own Session (not the request's): the streaming generator runs AFTER the route function returned,
    # so we never rely on the request-scoped session still being open.
    with Session(engine) as session:
        session.add(
            Conversation(user_id=user_id, mode=body.mode, user_message=body.message, assistant_message=reply)
        )
        session.commit()


def upstream_error(exc: APIError) -> HTTPException:
    logger.exception("Groq request failed: %s", exc)
    # 502 Bad Gateway = "the server I depend on failed", not "your request was wrong".
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="The AI service is unavailable. Try again.")


# ---------- app ----------
@asynccontextmanager
async def lifespan(_: FastAPI):
    SQLModel.metadata.create_all(engine)  # creates app.db and any missing tables (user, conversation)
    yield


app = FastAPI(title="m2-ai backend", version="0.18.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],  # needed for the Authorization: Bearer header
)


@app.get("/")
def health():
    return {"status": "ok", "service": "m2-ai-backend", "version": app.version}


@app.post("/auth/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(body: UserCreate, session: SessionDep):
    email = body.email.strip().lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(email=email, hashed_password=password_hash.hash(body.password))
    session.add(user)
    try:
        session.commit()
    except IntegrityError:  # two sign-ups with the same email at the same moment
        session.rollback()
        raise HTTPException(status_code=400, detail="Email already registered")
    session.refresh(user)
    return user


@app.post("/auth/login", response_model=Token)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], session: SessionDep):
    # OAuth2 form fields are called "username" and "password"; the frontend puts the email in "username".
    user = session.exec(select(User).where(User.email == form.username.strip().lower())).first()
    hashed = user.hashed_password if user else DUMMY_HASH
    if not password_hash.verify(form.password, hashed) or user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user.id))


@app.get("/auth/me", response_model=UserPublic)
def me(user: CurrentUser):
    return user


# ---------- chat (NEW m2d18) ----------
@app.post("/chat", response_model=ChatResponse)
def chat(body: ChatRequest, user: CurrentUser):
    """Non-streaming: waits for the whole reply, returns it as JSON."""
    try:
        completion = groq_client.chat.completions.create(model=GROQ_MODEL, messages=build_messages(body))
    except APIError as exc:
        raise upstream_error(exc) from exc

    reply = completion.choices[0].message.content or ""
    save_conversation(user.id, body, reply)  # type: ignore[arg-type]  # user.id is set once saved
    return ChatResponse(reply=reply, mode=body.mode)


@app.post("/chat/stream")
def chat_stream(body: ChatRequest, user: CurrentUser):
    """Streaming: sends plain-text chunks as Groq generates them (read with fetch + ReadableStream)."""
    user_id = user.id  # copy now: the generator runs after this function returns

    # Open the Groq stream BEFORE returning. If the key is wrong or Groq is down, this raises here,
    # so the client gets a proper 502 instead of a 200 with a broken, empty body.
    try:
        stream = groq_client.chat.completions.create(
            model=GROQ_MODEL, messages=build_messages(body), stream=True
        )
    except APIError as exc:
        raise upstream_error(exc) from exc

    def generate() -> Iterator[str]:
        parts: list[str] = []  # collect the chunks so we can save the full reply at the end
        try:
            for chunk in stream:
                if not chunk.choices:  # some chunks (e.g. usage info) carry no choices
                    continue
                delta = chunk.choices[0].delta.content
                if delta:  # skip None / "" (role-only or finish chunks)
                    parts.append(delta)
                    yield delta  # StreamingResponse encodes this str to UTF-8 and sends it immediately
        except APIError:
            logger.exception("Groq stream broke mid-reply")
            yield "\n\n[The AI service stopped responding. Try again.]"  # headers are already sent: can't change status now
            return
        # Only reached if the stream finished normally (not if the client disconnected / pressed Stop).
        save_conversation(user_id, body, "".join(parts))  # type: ignore[arg-type]

    return StreamingResponse(generate(), media_type="text/plain; charset=utf-8")


@app.get("/chat/history", response_model=list[ConversationPublic])
def chat_history(user: CurrentUser, session: SessionDep, limit: int = 50):
    limit = max(1, min(limit, 200))  # clamp: never let a client ask for 1,000,000 rows
    rows = session.exec(
        select(Conversation)
        .where(Conversation.user_id == user.id)  # ONLY this user's rows (the m2d14 leak lesson)
        .order_by(col(Conversation.created_at).desc())  # newest first, so LIMIT keeps the latest
        .limit(limit)
    ).all()
    return list(reversed(rows))  # return oldest -> newest, the order a chat screen shows them
