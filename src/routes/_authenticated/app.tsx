import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, AlertTriangle, BookOpen, MessageSquare, Split, LogOut, Copy, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { alertes, controle, eur, tvaLigne, type Facture, type Ligne } from "@/lib/ventilation";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Dossiers — Comptabilité Augmentée" },
      { name: "description", content: "Validation des ventilations, livre de lecture et échanges client." },
      { property: "og:title", content: "Dossiers — Comptabilité Augmentée" },
      { property: "og:description", content: "Validation des ventilations, livre de lecture et échanges client." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppPage,
});

type FactureDB = Facture & { statut: string; valide_le: string | null };
type Dossier = { id: string; nom: string; client_nom: string | null; client_token: string };
type Piece = { id: string; date: string; libelle: string; montant: number; action: string; statut: string; fichier_path: string | null; recu_le: string | null };
type Evt = { id: string; auteur: string; message: string; created_at: string };

async function chargerDossier(dossierId: string) {
  const [{ data: f }, { data: p }, { data: j }] = await Promise.all([
    supabase.from("factures").select("*, lignes(*)").eq("dossier_id", dossierId).order("date"),
    supabase.from("pieces_manquantes").select("*").eq("dossier_id", dossierId).order("date"),
    supabase.from("journal").select("*").eq("dossier_id", dossierId).order("created_at", { ascending: false }).limit(30),
  ]);
  const factures: FactureDB[] = (f ?? []).map((r) => ({
    id: r.id, numero: r.numero, fournisseur: r.fournisseur, date: r.date,
    totalHt: Number(r.total_ht), totalTva: Number(r.total_tva), totalTtc: Number(r.total_ttc),
    libelleGenerique: r.libelle_generique, libelleEcriture: r.libelle_ecriture,
    ...(r.regle_appliquee ? { regleAppliquee: r.regle_appliquee } : {}),
    statut: r.statut, valide_le: r.valide_le,
    lignes: [...r.lignes].sort((a, b) => a.position - b.position).map((l) => ({
      id: l.id, compte: l.compte, compteLibelle: l.compte_libelle, libelle: l.libelle,
      ht: Number(l.ht), tauxTva: Number(l.taux_tva),
      ...(l.nature ? { nature: l.nature as Ligne["nature"] & string } : {}),
      ...(l.periode_mois ? { periodeMois: l.periode_mois } : {}),
    })),
  }));
  return { factures, pieces: (p ?? []).map((x) => ({ ...x, montant: Number(x.montant) })) as Piece[], journal: (j ?? []) as Evt[] };
}

function AppPage() {
  const nav = useNavigate();
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [factures, setFactures] = useState<FactureDB[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [journal, setJournal] = useState<Evt[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<"ventilation" | "livre" | "client">("ventilation");
  const [dirty, setDirty] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    supabase.from("dossiers").select("id, nom, client_nom, client_token").order("created_at").then(({ data }) => {
      setDossiers(data ?? []);
      if (data?.[0]) setDossierId(data[0].id);
    });
  }, []);

  const recharger = async (id = dossierId) => {
    if (!id) return;
    const r = await chargerDossier(id);
    setFactures(r.factures); setPieces(r.pieces); setJournal(r.journal);
    setSelId((s) => s && r.factures.some((f) => f.id === s) ? s : r.factures[0]?.id ?? null);
    setDirty(false);
  };
  useEffect(() => { void recharger(); }, [dossierId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dossier = dossiers.find((d) => d.id === dossierId);
  const sel = factures.find((f) => f.id === selId);

  const update = (f: FactureDB) => { setFactures((all) => all.map((x) => (x.id === f.id ? f : x))); setDirty(true); };

  const enregistrer = async (f: FactureDB, valider: boolean) => {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("factures").update({
      libelle_ecriture: f.libelleEcriture,
      ...(valider ? { statut: "validee", valide_par: u.user?.id ?? null, valide_le: new Date().toISOString() } : {}),
    }).eq("id", f.id);
    await Promise.all(f.lignes.map((l) => supabase.from("lignes").update({ compte: l.compte, libelle: l.libelle, ht: l.ht }).eq("id", l.id)));
    await supabase.from("journal").insert({
      dossier_id: dossierId!, auteur: email || "Collaborateur",
      message: valider ? `Ventilation validée : ${f.fournisseur} ${f.numero} (${f.lignes.length} lignes, ${eur(f.totalTtc)} TTC)` : `Ventilation modifiée : ${f.fournisseur} ${f.numero}`,
    });
    await recharger();
  };

  const ouvrirPiece = async (path: string) => {
    const { data } = await supabase.storage.from("justificatifs").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 py-6">
          <div>
            <select value={dossierId ?? ""} onChange={(e) => setDossierId(e.target.value)} className="bg-transparent text-xs uppercase tracking-[0.15em] text-muted-foreground outline-none">
              {dossiers.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
            </select>
            <h1 className="font-display text-4xl">Comptabilité augmentée</h1>
            <p className="text-xs text-muted-foreground">Client : {dossier?.client_nom ?? "—"} · connecté : {email}</p>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
              {([["ventilation", "Ventilation", Split], ["livre", "Livre de lecture", BookOpen], ["client", "Échange client", MessageSquare]] as const).map(([id, label, Icon]) => (
                <button key={id} onClick={() => setOnglet(id)} className={`flex items-center gap-2 rounded-md px-3 py-2 ${onglet === id ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </nav>
            <button aria-label="Se déconnecter" onClick={async () => { await supabase.auth.signOut(); nav({ to: "/auth" }); }} className="text-muted-foreground"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {onglet === "ventilation" && (
          <div className="grid gap-6 md:grid-cols-[260px_1fr]">
            <aside className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Factures importantes</p>
              {factures.map((f) => (
                <button key={f.id} onClick={() => setSelId(f.id)} className={`w-full rounded-lg border p-3 text-left ${f.id === selId ? "border-primary bg-card" : "border-border"}`}>
                  <div className="flex items-center justify-between text-sm font-medium">
                    {f.fournisseur}
                    {f.statut === "validee" ? <Check className="h-4 w-4 text-success" /> : !controle(f).ok && <AlertTriangle className="h-4 w-4 text-destructive" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{f.numero} · {eur(f.totalTtc)}</div>
                </button>
              ))}
            </aside>
            {sel && <Ventilation f={sel} dirty={dirty} onChange={update} onSave={(v) => enregistrer(sel, v)} />}
          </div>
        )}
        {onglet === "livre" && <Livre factures={factures} pieces={pieces} />}
        {onglet === "client" && dossier && <Client dossier={dossier} pieces={pieces} journal={journal} onOpen={ouvrirPiece} onRefresh={() => recharger()} />}
      </main>
    </div>
  );
}

function Ventilation({ f, dirty, onChange, onSave }: { f: FactureDB; dirty: boolean; onChange: (f: FactureDB) => void; onSave: (valider: boolean) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const c = controle(f);
  const al = alertes(f.lignes);
  const valide = f.statut === "validee";
  const setLigne = (id: string, patch: Partial<Ligne>) => onChange({ ...f, lignes: f.lignes.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const run = async (v: boolean) => { setBusy(true); await onSave(v); setBusy(false); };

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground line-through">{f.libelleGenerique}</p>
          <input value={f.libelleEcriture} onChange={(e) => onChange({ ...f, libelleEcriture: e.target.value })} className="font-display w-full bg-transparent text-2xl outline-none" aria-label="Libellé d'écriture" />
          {f.regleAppliquee && <p className="mt-1 text-xs text-primary">Règle réappliquée : {f.regleAppliquee}</p>}
        </div>
        <div className="text-right text-sm text-muted-foreground">{f.numero}<br />{new Date(f.date).toLocaleDateString("fr-FR")}</div>
      </div>
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr><th className="pb-2">Compte</th><th>Libellé de ligne</th><th className="text-right">HT</th><th className="text-right">TVA</th></tr>
        </thead>
        <tbody>
          {f.lignes.map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="py-2 pr-2">
                <input value={l.compte} onChange={(e) => setLigne(l.id, { compte: e.target.value })} className="w-20 rounded bg-muted px-2 py-1 font-mono" />
                <div className="text-xs text-muted-foreground">{l.compteLibelle}</div>
              </td>
              <td><input value={l.libelle} onChange={(e) => setLigne(l.id, { libelle: e.target.value })} className="w-full bg-transparent outline-none" /></td>
              <td className="text-right"><input type="number" step="0.01" value={l.ht} onChange={(e) => setLigne(l.id, { ht: Number(e.target.value) })} className="w-24 rounded bg-muted px-2 py-1 text-right" /></td>
              <td className="text-right tabular-nums">{eur(tvaLigne(l))} <span className="text-xs text-muted-foreground">({Math.round(l.tauxTva * 1000) / 10}%)</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
        {([["HT", c.ht, f.totalHt, c.ecartHt], ["TVA", c.tva, f.totalTva, c.ecartTva], ["TTC", c.ttc, f.totalTtc, c.ecartTtc]] as const).map(([k, v, attendu, ecart]) => (
          <div key={k} className={`rounded-lg p-3 ${Math.abs(ecart) <= 0.01 ? "bg-success/10" : "bg-destructive/10"}`}>
            <div className="text-xs text-muted-foreground">{k} ventilé / facture</div>
            <div className="font-medium tabular-nums">{eur(v)} / {eur(attendu)}</div>
            {Math.abs(ecart) > 0.01 && <div className="text-xs text-destructive">Écart {eur(ecart)}</div>}
          </div>
        ))}
      </div>
      {al.length > 0 && <ul className="mt-4 space-y-1 text-sm text-destructive">{al.map((a) => <li key={a}>⚠ {a}</li>)}</ul>}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {valide && <span className="text-sm text-success">Validée le {new Date(f.valide_le!).toLocaleString("fr-FR")} · prête pour Pennylane</span>}
        <button disabled={!dirty || busy} onClick={() => run(false)} className="rounded-lg border border-border px-4 py-2.5 text-sm disabled:opacity-50">Enregistrer</button>
        <button disabled={!c.ok || busy} onClick={() => run(true)} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "Enregistrement…" : valide ? "Revalider" : "Valider la ventilation"}
        </button>
      </div>
    </section>
  );
}

function Livre({ factures, pieces }: { factures: FactureDB[]; pieces: Piece[] }) {
  const parCompte = new Map<string, { lib: string; ht: number }>();
  factures.flatMap((f) => f.lignes).forEach((l) => {
    const e = parCompte.get(l.compte) ?? { lib: l.compteLibelle, ht: 0 };
    e.ht += l.ht; parCompte.set(l.compte, e);
  });
  const total = [...parCompte.values()].reduce((s, e) => s + e.ht, 0);
  const gestion = factures.flatMap((f) => f.lignes).filter((l) => l.compte.startsWith("6226") || l.compte.startsWith("651")).reduce((s, l) => s + l.ht, 0);
  const valides = factures.filter((f) => f.statut === "validee").length;
  const manquantes = pieces.filter((p) => p.statut !== "recue");
  const top = [...parCompte.entries()].sort((a, b) => b[1].ht - a[1].ht);
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <h2 className="font-display text-3xl">Le livre de lecture</h2>
      <p className="leading-relaxed">
        {valides} facture(s) sur {factures.length} validée(s). Les dépenses ventilées représentent <strong>{eur(total)} HT</strong>.
        {top[0] && <> Le premier poste est « {top[0][1].lib} » ({eur(top[0][1].ht)}).</>} Le coût de gestion (honoraires + logiciels) s'élève à <strong>{eur(gestion)}</strong> HT.
      </p>
      <div className="space-y-2">
        {top.map(([compte, e]) => (
          <div key={compte}>
            <div className="flex justify-between text-sm"><span>{compte} · {e.lib}</span><span className="tabular-nums">{eur(e.ht)}</span></div>
            <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(e.ht / total) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border-l-4 border-primary bg-card p-4 text-sm">
        <strong>Points d'attention.</strong> {factures.flatMap((f) => alertes(f.lignes)).join(" ") || "Aucune alerte de ventilation."}{" "}
        {manquantes.length > 0 ? `${manquantes.length} pièce(s) manquante(s) (${eur(manquantes.reduce((s, p) => s + p.montant, 0))}) bloquent la clôture.` : "Toutes les pièces sont reçues."}
      </div>
    </article>
  );
}

function Client({ dossier, pieces, journal, onOpen, onRefresh }: { dossier: Dossier; pieces: Piece[]; journal: Evt[]; onOpen: (p: string) => void; onRefresh: () => void }) {
  const [copie, setCopie] = useState(false);
  const lien = typeof window !== "undefined" ? `${window.location.origin}/client/${dossier.client_token}` : "";
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-3">
        <h2 className="font-display text-2xl">Pièces manquantes</h2>
        <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-xs">
          <span className="flex-1 truncate">{lien}</span>
          <button onClick={() => { void navigator.clipboard.writeText(lien); setCopie(true); }} className="flex items-center gap-1 text-primary"><Copy className="h-3 w-3" />{copie ? "Copié" : "Copier le lien client"}</button>
        </div>
        {pieces.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
            <div><div className="font-medium">{p.libelle} — {eur(p.montant)}</div><div className="text-xs text-muted-foreground">{new Date(p.date).toLocaleDateString("fr-FR")}</div></div>
            {p.statut === "recue" && p.fichier_path
              ? <button onClick={() => onOpen(p.fichier_path!)} className="flex items-center gap-1 text-success"><FileDown className="h-4 w-4" /> Reçue</button>
              : <span className="text-xs text-muted-foreground">En attente</span>}
          </div>
        ))}
        <button onClick={onRefresh} className="text-sm text-primary">Actualiser</button>
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-2xl">Historique du dossier</h2>
        {journal.length === 0 && <p className="text-sm text-muted-foreground">Rien pour l'instant.</p>}
        {journal.map((e) => (
          <div key={e.id} className="border-l-2 border-border pl-3 text-sm">
            <div>{e.message}</div>
            <div className="text-xs text-muted-foreground">{e.auteur} · {new Date(e.created_at).toLocaleString("fr-FR")}</div>
          </div>
        ))}
      </section>
    </div>
  );
}
