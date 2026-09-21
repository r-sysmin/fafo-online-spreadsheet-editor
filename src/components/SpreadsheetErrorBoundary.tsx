import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";

type Props = {
  children: ReactNode;
  /** Bumping this key remounts the boundary's children — used by Retry. */
  resetKey?: number;
  onReset?: () => void;
};

type State = { error: Error | null };

export class SpreadsheetErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error("SpreadsheetErrorBoundary caught", error, info);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          message={this.state.error.message}
          onRetry={() => {
            this.setState({ error: null });
            this.props.onReset?.();
          }}
        />
      );
    }
    return this.props.children;
  }
}

export function ErrorFallback({
  message,
  onRetry,
  title = "Couldn't open this spreadsheet",
}: {
  message?: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div
      data-testid="spreadsheet-error-fallback"
      className="min-h-screen w-full flex items-center justify-center bg-background p-6"
    >
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Something went wrong while loading this spreadsheet. Your data is
          safe — the last successful save is still in the cloud.
        </p>
        {message && (
          <pre className="text-[11px] text-left bg-muted/50 rounded p-2 overflow-auto max-h-32 text-muted-foreground">
            {message}
          </pre>
        )}
        <div className="flex items-center justify-center gap-2 pt-2">
          {onRetry && (
            <Button onClick={onRetry} data-testid="spreadsheet-error-retry">
              <RefreshCw className="h-4 w-4 mr-1" /> Retry
            </Button>
          )}
          <Button asChild variant="outline">
            <a href="/" data-testid="spreadsheet-error-home">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to home
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
