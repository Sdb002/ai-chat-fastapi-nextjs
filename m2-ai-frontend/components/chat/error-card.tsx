// components/chat/error-card.tsx (NEW m2d19)
// Friendly, dismissible error shown above the input. Pure presentational: the page owns the state.
import { Button } from "@/components/ui/button";

type ErrorCardProps = {
  title: string;
  message: string;
  onRetry?: () => void; // optional: no Retry button when there's nothing to resend (e.g. history load failed)
  onDismiss: () => void;
};

export function ErrorCard({ title, message, onRetry, onDismiss }: ErrorCardProps) {
  return (
    // role="alert": screen readers read it out immediately when it appears
    <div
      role="alert"
      className="mx-4 mb-2 flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm"
    >
      <div className="min-w-0">
        {/* min-w-0 lets long text wrap inside flex instead of pushing the buttons off-screen */}
        {/* CHANGED m2d20: text-red-600 -> text-destructive (theme token, lighter red in dark mode) */}
        <p className="font-medium text-destructive">{title}</p>
        <p className="text-foreground/80">{message}</p>
      </div>

      <div className="flex shrink-0 gap-2">
        {/* shrink-0: buttons keep their size when the message is long */}
        {onRetry && (
          <Button className="h-8 px-3" onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button
          className="h-8 border border-foreground/20 bg-transparent px-3 text-foreground hover:bg-foreground/5"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
