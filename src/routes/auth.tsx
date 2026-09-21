import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Loader2, MailCheck } from "lucide-react";
import authVisual from "@/assets/auth-visual.jpg";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  redirect: z.string().optional(),
});

// Only allow same-origin, non-protocol-relative internal paths.
function safeRedirect(r: string | undefined): string {
  if (!r) return "/sheets";
  // must start with a single "/", and NOT "//" or "/\" (both resolve off-site)
  if (!r.startsWith("/") || r.startsWith("//") || r.startsWith("/\\")) return "/sheets";
  return r;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const dest = safeRedirect(search.redirect);
      throw redirect({ href: dest });
    }
  },
  component: AuthPage,
});

type Mode = "signin" | "signup";

/** Map Supabase error shapes to friendly, user-facing copy. */
function friendlyAuthError(err: unknown, mode: Mode): string {
  const e = (err ?? {}) as { message?: unknown; code?: unknown; status?: unknown };
  const raw = typeof e.message === "string" ? e.message : String(err ?? "");
  const code = typeof e.code === "string" ? e.code : "";
  const status = typeof e.status === "number" ? e.status : 0;
  const m = raw.toLowerCase();


  if (m.includes("invalid login credentials") || m.includes("invalid_credentials") || code === "invalid_credentials") {
    if (mode === "signin") return "That email and password don't match. Double-check and try again.";
  }

  if (m.includes("email not confirmed")) {
    return "Please confirm your email address before signing in — check your inbox.";
  }
  if (m.includes("user already registered") || m.includes("already registered") || code === "user_already_exists") {
    return "An account already exists for this email. Try signing in instead.";
  }
  if (m.includes("password") && (m.includes("short") || m.includes("at least") || m.includes("weak") || code === "weak_password")) {
    return "That password is too weak. Use at least 8 characters with a mix of letters and numbers.";
  }
  if (m.includes("rate") || status === 429) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (mode === "signup") return "Couldn't create your account. Please try again.";
  return "Couldn't sign you in. Please try again.";
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const initialMode: Mode = search.mode === "signup" ? "signup" : "signin";
  const redirectTo = safeRedirect(search.redirect);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  // Land on the intended destination as soon as a session appears.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ href: redirectTo, replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, redirectTo]);

  function validate(): string | null {
    if (!email.trim()) return "Please enter your email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "That doesn't look like a valid email.";
    if (!password) return "Please enter your password.";
    if (mode === "signup" && password.length < 8) {
      return "Choose a password with at least 8 characters.";
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin + redirectTo },
        });
        if (err) {
          setError(friendlyAuthError(err, mode));
          return;
        }
        if (data.session) {
          navigate({ href: redirectTo, replace: true });
          return;
        }
        // No session means email confirmation is required.
        setConfirmationSent(true);
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) {
          setError(friendlyAuthError(err, mode));
          return;
        }
        navigate({ href: redirectTo, replace: true });
      }
    } catch (err) {
      setError(friendlyAuthError(err, mode));
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setOauthLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        // Return to this public auth route, never straight into the protected
        // subtree: in the full-page redirect flow the session isn't hydrated
        // yet when the browser lands, so /sheets would bounce back to /auth.
        // This page's onAuthStateChange lands on `redirect` once signed in.
        redirect_uri: `${window.location.origin}/auth?redirect=${encodeURIComponent(redirectTo)}`,
      });
      if (result.error) {
        setError("Couldn't sign in with Google. Please try again or use email.");
      }
    } catch {
      setError("Couldn't sign in with Google. Please try again or use email.");
    } finally {
      setOauthLoading(false);
    }
  }

  if (confirmationSent) {
    return (
      <Shell>
        <div className="text-center" data-testid="confirmation-sent">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
            Click it to finish setting up your account.
          </p>
          <Button
            variant="outline"
            className="mt-6 w-full"
            onClick={() => {
              setConfirmationSent(false);
              setMode("signin");
            }}
          >
            Back to sign in
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <span className="font-semibold tracking-tight text-foreground">SyncSheets</span>
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Create your private spreadsheet workspace in seconds."
            : "Sign in to open your spreadsheets."}
        </p>
      </div>

      <form className="mt-6 space-y-4" onSubmit={submit} noValidate data-testid="auth-form">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={loading}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "auth-error" : undefined}
            className="min-h-11"
            data-testid="email-input"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            disabled={loading}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "auth-error" : undefined}
            className="min-h-11"
            data-testid="password-input"
          />
        </div>

        {error && (
          <p
            id="auth-error"
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            data-testid="auth-error"
          >
            {error}
          </p>
        )}

        <Button type="submit" className="w-full min-h-11" disabled={loading} data-testid="auth-submit">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === "signup" ? "Creating account…" : "Signing in…"}
            </>
          ) : mode === "signup" ? (
            "Create account"
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full min-h-11"
        onClick={signInWithGoogle}
        disabled={oauthLoading || loading}
        data-testid="google-button"
      >
        {oauthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continue with Google
      </Button>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
        <button
          type="button"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setError(null);
            setMode(mode === "signup" ? "signin" : "signup");
          }}
          data-testid="toggle-mode"
        >
          {mode === "signup" ? "Sign in" : "Create an account"}
        </button>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">
      <div className="relative hidden lg:block overflow-hidden bg-muted">
        <img
          src={authVisual}
          alt="Illustration of a spreadsheet with charts and highlighted data cells"
          width={1024}
          height={1536}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-foreground/40" />
        <div className="relative flex h-full flex-col justify-end p-8 xl:p-10">
          <p className="max-w-[20ch] text-3xl font-semibold leading-snug tracking-tight text-background xl:text-4xl">
            Your spreadsheets,<br />private by default.
          </p>
          <p className="mt-3 max-w-[45ch] text-sm leading-relaxed text-background/80 xl:text-base">
            Build, edit and organise your sheets in one calm workspace.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-muted/30 px-4 py-8 sm:px-6 sm:py-10 lg:bg-background lg:px-8">
        <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-sm sm:p-7 lg:border-0 lg:shadow-none lg:bg-transparent lg:p-0">
          {children}
        </div>
      </div>

    </div>
  );
}
