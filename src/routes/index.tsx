import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  FileSpreadsheet,
  Lock,
  Sigma,
  MessageSquare,
  ArrowUpDown,
  FileDown,
  CloudUpload,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: "/sheets" });
  },
  head: () => ({
    meta: [
      { title: "SyncSheets — Your private spreadsheet workspace" },
      {
        name: "description",
        content:
          "A fast personal spreadsheet app with formulas, comments, sorting, and CSV/XLSX import-export. Your sheets stay private to you.",
      },
      { property: "og:title", content: "SyncSheets — Your private spreadsheet workspace" },
      {
        property: "og:description",
        content:
          "A fast, focused spreadsheet that's yours alone. Formulas, comments, sorting, and import-export built in.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Lock,
    title: "Private by default",
    body: "Every sheet belongs to you alone. Nothing is shared, and no one else can open your data.",
  },
  {
    icon: Sigma,
    title: "Formulas that work",
    body: "SUM, IF, VLOOKUP, cross-sheet references — a familiar formula engine with instant recalc.",
  },
  {
    icon: MessageSquare,
    title: "Cell comments",
    body: "Drop a note on any cell to keep context next to the numbers it belongs to.",
  },
  {
    icon: ArrowUpDown,
    title: "Sort & find / replace",
    body: "Range sort, multi-criteria ordering, and find/replace across the whole workbook.",
  },
  {
    icon: FileDown,
    title: "CSV & XLSX import-export",
    body: "Bring spreadsheets in from Excel or Google Sheets, export back out — formatting preserved.",
  },
  {
    icon: CloudUpload,
    title: "Saved as you type",
    body: "Every edit is stored automatically, so your work is there when you come back.",
  },
];

function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate text-base font-semibold tracking-tight">SyncSheets</span>
          </div>
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="min-h-11 min-w-11 px-3">
              <Link to="/auth" data-testid="nav-sign-in">
                Sign in
              </Link>
            </Button>
            <Button asChild size="sm" className="min-h-11 min-w-11 px-3">
              <Link to="/auth" search={{ mode: "signup" }} data-testid="nav-sign-up">
                Get started
              </Link>
            </Button>
          </nav>
        </div>
      </header>


      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.12),transparent_70%)]"
          />
          <div className="mx-auto max-w-4xl px-4 pt-10 pb-10 text-center sm:px-6 sm:pt-20 sm:pb-14 lg:px-8 lg:pt-28 lg:pb-16">
            <span className="inline-flex items-center rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium leading-relaxed text-muted-foreground">
              Built for people who live in spreadsheets
            </span>
            <h1 className="mt-5 text-2xl font-semibold leading-tight tracking-tight sm:text-3xl md:text-4xl lg:text-6xl">
              Your spreadsheets,
              <br className="hidden sm:block" />{" "}
              <span className="text-primary">private by default.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-[65ch] text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-base lg:text-lg">
              Open a sheet and get to work. Formulas, comments, sorting, and import-export — all in
              one fast, focused workspace only you can see.
            </p>

            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg" className="min-h-11" data-testid="hero-get-started">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Get started <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-11">
                <Link to="/auth" data-testid="hero-sign-in">
                  Sign in
                </Link>
              </Button>
            </div>
          </div>

          {/* Screenshot stand-in: a stylised sheet preview */}
          <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6 sm:pb-14 lg:px-8 lg:pb-16">
            <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
              <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-3 text-xs text-muted-foreground">
                  Q3 Planning · only you
                </span>
              </div>
              <div className="grid grid-cols-4 font-mono text-[11px] sm:grid-cols-6 sm:text-xs">
                {Array.from({ length: 36 }).map((_, i) => {
                  const sample = [
                    "Region",
                    "Q1",
                    "Q2",
                    "Q3",
                    "Q4",
                    "Total",
                    "EMEA",
                    "120",
                    "140",
                    "168",
                    "201",
                    "=SUM(B2:E2)",
                    "APAC",
                    "98",
                    "115",
                    "132",
                    "150",
                    "=SUM(B3:E3)",
                    "AMER",
                    "210",
                    "225",
                    "247",
                    "260",
                    "=SUM(B4:E4)",
                  ];
                  const value = sample[i] ?? "";
                  const isHeader = i < 6;
                  const isFormula = typeof value === "string" && value.startsWith("=");
                  const column = i % 6;
                  // Hide the two middle quarters on narrow screens so the mock
                  // never clips inside its card.
                  const hideOnMobile = column === 3 || column === 4;
                  return (
                    <div
                      key={i}
                      className={`truncate border-b border-r px-2 py-1.5 last:border-r-0 sm:px-3 sm:py-2 ${
                        hideOnMobile ? "hidden sm:block" : ""
                      } ${
                        isHeader
                          ? "bg-muted/50 font-semibold text-foreground"
                          : isFormula
                          ? "text-primary"
                          : "text-foreground/80"
                      }`}
                    >
                      {value}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </section>

        {/* Features strip */}
        <section className="border-t bg-muted/20">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-[65ch] text-center">
              <h2 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl lg:text-4xl">
                Everything a spreadsheet should be — together.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base lg:text-lg">
                Just the features you actually reach for, kept fast and out of your way.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-lg border bg-background p-5 transition hover:shadow-sm"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
                  <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>


        {/* CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-3xl px-4 py-10 text-center sm:px-6 sm:py-14 lg:px-8 lg:py-20">
            <h2 className="text-2xl font-semibold leading-tight tracking-tight md:text-3xl lg:text-4xl">
              Start a sheet in seconds.
            </h2>
            <p className="mx-auto mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground sm:text-base lg:text-lg">
              Sign up, open a blank workbook, and start typing. Everything saves as you go.
            </p>
            <div className="mt-6 flex justify-center">
              <Button asChild size="lg" className="min-h-11 w-full sm:w-auto">
                <Link to="/auth" search={{ mode: "signup" }} data-testid="cta-get-started">
                  Create your first spreadsheet
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">

          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            <span>SyncSheets</span>
          </div>
          <span>© {new Date().getFullYear()} SyncSheets. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
