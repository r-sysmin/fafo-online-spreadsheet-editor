import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { SpreadsheetErrorBoundary } from "@/components/SpreadsheetErrorBoundary";

const SpreadsheetEditor = lazy(() => import("@/components/SpreadsheetEditor"));

export const Route = createFileRoute("/_authenticated/sheet/$id")({
  ssr: false,
  component: SheetPage,
});

function SheetPage() {
  const { id } = Route.useParams();
  const [resetKey, setResetKey] = useState(0);
  return (
    <SpreadsheetErrorBoundary
      resetKey={resetKey}
      onReset={() => setResetKey((k) => k + 1)}
    >
      <Suspense
        fallback={
          <div
            className="h-dvh w-screen flex flex-col"
            data-testid="editor-skeleton"
            aria-label="Loading spreadsheet"
          >
            <div className="border-b bg-background px-4 py-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-muted animate-pulse" />
              <div className="h-5 w-48 rounded bg-muted animate-pulse" />
              <div className="ml-auto h-8 w-24 rounded bg-muted animate-pulse" />
            </div>
            <div className="flex-1 p-4">
              <div className="h-full w-full rounded bg-muted/40 animate-pulse" />
            </div>
          </div>
        }
      >
        <SpreadsheetEditor key={resetKey} id={id} />
      </Suspense>
    </SpreadsheetErrorBoundary>
  );
}
