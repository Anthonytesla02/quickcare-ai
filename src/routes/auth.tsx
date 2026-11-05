import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined }),
  head: () => ({
    meta: [
      { title: "Sign in — QuickCare AI" },
      { name: "description", content: "Sign in to QuickCare AI to save your progress and access shared training cases." },
      { property: "og:title", content: "Sign in — QuickCare AI" },
      { property: "og:description", content: "Sign in to QuickCare AI to save your progress." },
    ],
  }),
  component: AuthPage,
});

function safePath(p?: string) {
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/play";
}

function AuthPage() {
  const { redirect: target } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: safePath(target) });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: safePath(target) });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: window.location.origin + "/play" },
      });
      if (error) setError(error.message);
      else if (!data.session) setInfo("Check your email to confirm your account, then sign in.");
    }
    setBusy(false);
  };

  const google = async () => {
    setError(null);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) setError(r.error.message ?? "Google sign-in failed");
  };

  return (
    <div className="app-shell grid place-items-center px-4 py-10">
      <div className="panel-card w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#dff0e9] text-[#156d63]"><ShieldPlus size={22} /></span>
          <div>
            <h1 className="font-black text-xl tracking-[-.04em]">QuickCare AI</h1>
            <p className="text-xs text-slate-400">{mode === "signin" ? "Welcome back" : "Create your account"}</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm" />
          <input type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-sm" />
          {error && <p className="text-xs text-red-400">{error}</p>}
          {info && <p className="text-xs text-emerald-400">{info}</p>}
          <button disabled={busy} className="clinical-primary-action w-full rounded-xl py-3 text-sm font-bold disabled:opacity-60">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button type="button" onClick={google}
          className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-900 py-3 text-sm font-bold hover:bg-slate-800">
          Continue with Google
        </button>
        <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setInfo(null); }}
          className="mt-4 w-full text-center text-xs font-semibold text-cyan-400">
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
