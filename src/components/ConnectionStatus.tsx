type ConnState = "connected" | "reconnecting" | "offline" | "sync-issue";

const LABELS: Record<ConnState, string> = {
  connected: "Connected",
  reconnecting: "Reconnecting…",
  offline: "Offline",
  "sync-issue": "Sync issue",
};

const DOT_CLASSES: Record<ConnState, string> = {
  connected: "bg-emerald-500",
  reconnecting: "bg-amber-500 animate-pulse",
  offline: "bg-red-500",
  "sync-issue": "bg-amber-500",
};

export function ConnectionStatus({ state }: { state: ConnState }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="connection-status"
      data-state={state}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={
        state === "offline"
          ? "You're offline. Local edits are queued and will sync when reconnected."
          : state === "sync-issue"
            ? "Skipped a bad remote update. The session is still live."
            : undefined
      }
    >
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${DOT_CLASSES[state]}`}
      />
      <span className="hidden sm:inline">{LABELS[state]}</span>
      <span className="sr-only sm:hidden">{LABELS[state]}</span>
    </div>
  );
}

export type { ConnState };
