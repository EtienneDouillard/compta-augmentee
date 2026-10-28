import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Comptabilité Augmentée" },
      { name: "description", content: "Espace collaborateur du cabinet." },
      { property: "og:title", content: "Connexion — Comptabilité Augmentée" },
      { property: "og:description", content: "Espace collaborateur du cabinet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (error) return setMsg(error.message);
      nav({ to: "/app" });
    } else {
      const { error } = await supabase.auth.signUp({ email, password: pwd, options: { emailRedirectTo: window.location.origin + "/app" } });
      setMsg(error ? error.message : "Compte créé : cliquez sur le lien reçu par e-mail pour confirmer.");
    }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) return setMsg(String(r.error.message ?? r.error));
    if (r.redirected) return;
    nav({ to: "/app" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8">
        <h1 className="font-display text-3xl">Comptabilité augmentée</h1>
        <p className="mt-1 text-sm text-muted-foreground">Espace collaborateur du cabinet</p>
        <button onClick={google} className="mt-6 w-full rounded-lg border border-border px-4 py-2 text-sm">Continuer avec Google</button>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <input type="password" required minLength={6} placeholder="Mot de passe" value={pwd} onChange={(e) => setPwd(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          <button className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{mode === "in" ? "Se connecter" : "Créer mon compte"}</button>
        </form>
        {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-sm text-primary">
          {mode === "in" ? "Pas de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
