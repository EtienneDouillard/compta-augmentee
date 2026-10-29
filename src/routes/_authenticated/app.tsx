import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, AlertTriangle, ArrowLeft, BookOpen, MessageSquare, Split, Copy, FileDown, Download, ExternalLink, Upload, FlaskConical } from "lucide-react";
import { importerFacturesPennylane, NB_FACTURES_PENNYLANE } from "@/lib/pennylane-snapshot";
import { envoyerVentilation, PENNYLANE_ECRITURE_ACTIVE } from "@/lib/pennylane-write.beta";
import { supabase } from "@/integrations/supabase/client";
import { alertes, controle, ecriture, eur, round2, tvaLigne, type Facture, type Ligne } from "@/lib/ventilation";
import { eclater } from "@/lib/eclatement";
import { lireLignesPiece } from "@/lib/piece.functions";
import { AppHeader } from "@/components/AppHeader";
import { requireCabinet } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app")({
  beforeLoad: requireCabinet,
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

type FactureDB = Facture & { statut: string; valide_le: string | null; pennylane_invoice_id: string | null; pennylane_url: string | null; compte_fournisseur: string | null; devise: string; piece_path: string | null; lignes_importees: boolean };
type Dossier = { id: string; nom: string; client_nom: string | null; client_token: string };
type Piece = { id: string; date: string; libelle: string; montant: number; action: string; statut: string; fichier_path: string | null; recu_le: string | null };
type Evt = { id: string; auteur: string; message: string; created_at: string };

async function chargerDossier(dossierId: string) {
  const [{ data: f }, { data: p }, { data: j }] = await Promise.all([
    supabase.from("factures").select("*, lignes(*)").eq("dossier_id", dossierId).order("date", { ascending: false }),
    supabase.from("pieces_manquantes").select("*").eq("dossier_id", dossierId).order("date"),
    supabase.from("journal").select("*").eq("dossier_id", dossierId).order("created_at", { ascending: false }).limit(30),
  ]);
  const factures: FactureDB[] = (f ?? []).map((r) => ({
    id: r.id, numero: r.numero, fournisseur: r.fournisseur, date: r.date,
    totalHt: Number(r.total_ht), totalTva: Number(r.total_tva), totalTtc: Number(r.total_ttc),
    libelleGenerique: r.libelle_generique, libelleEcriture: r.libelle_ecriture,
    ...(r.regle_appliquee ? { regleAppliquee: r.regle_appliquee } : {}),
    statut: r.statut, valide_le: r.valide_le, pennylane_invoice_id: r.pennylane_invoice_id, pennylane_url: r.pennylane_url,
    compte_fournisseur: r.compte_fournisseur, devise: r.devise, piece_path: r.piece_path, lignes_importees: r.lignes_importees,
    lignes: [...r.lignes].sort((a, b) => a.position - b.position).map((l) => ({
      id: l.id, compte: l.compte, compteLibelle: l.compte_libelle, libelle: l.libelle,
      ht: Number(l.ht), tauxTva: Number(l.taux_tva),
      ...(l.tva_montant != null ? { tvaMontant: Number(l.tva_montant) } : {}),
      ...(l.nature ? { nature: l.nature as Ligne["nature"] & string } : {}),
      ...(l.periode_mois ? { periodeMois: l.periode_mois } : {}),
    })),
  }));
  return { factures, pieces: (p ?? []).map((x) => ({ ...x, montant: Number(x.montant) })) as Piece[], journal: (j ?? []) as Evt[] };
}

function AppPage() {
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [factures, setFactures] = useState<FactureDB[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [journal, setJournal] = useState<Evt[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<"ventilation" | "livre" | "client">("ventilation");
  const [dirty, setDirty] = useState(false);
  const [email, setEmail] = useState("");
  const [recherche, setRecherche] = useState("");
  const [importEnCours, setImportEnCours] = useState(false);
  const importer = async () => {
    if (!dossierId) return;
    setImportEnCours(true);
    try { const n = await importerFacturesPennylane(dossierId); await supabase.from("journal").insert({ dossier_id: dossierId, auteur: email || "Collaborateur", message: `Import Pennylane : ${n} factures fournisseurs 2026 (lecture seule)` }); await recharger(); }
    catch (e) { alert(`Import impossible : ${(e as Error).message}`); }
    setImportEnCours(false);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
    supabase.from("dossiers").select("id, nom:name, client_nom, client_token").order("created_at").then(({ data }) => {
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
    await supabase.from("lignes").delete().eq("facture_id", f.id);
    await supabase.from("lignes").insert(f.lignes.map((l, position) => ({ facture_id: f.id, position, compte: l.compte, compte_libelle: l.compteLibelle, libelle: l.libelle, ht: l.ht, taux_tva: l.tauxTva, tva_montant: l.tvaMontant ?? null, nature: l.nature ?? null, periode_mois: l.periodeMois ?? null })));
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
    <div className="space-cabinet min-h-screen bg-background text-foreground">
      {/* Same cabinet bar as the rest of the firm's space, so the way back is always visible. */}
      <AppHeader space="cabinet" />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-end justify-between gap-4 px-6 py-6">
          <div>
            <Link to="/cabinet" className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              <ArrowLeft className="h-4 w-4" /> Retour aux dossiers clients
            </Link>
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
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-8">
        {onglet === "ventilation" && (
          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
            <aside className="space-y-2">
              <button onClick={importer} disabled={importEnCours} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
                <Download className="h-4 w-4" /> {importEnCours ? "Import…" : `Importer ${NB_FACTURES_PENNYLANE} factures 2026`}
              </button>
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Fournisseur, numéro…" className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{factures.length} factures · {factures.filter((f) => f.statut === "validee").length} validées</p>
              <div className="max-h-[75vh] space-y-2 overflow-y-auto pr-1">
              {factures.filter((f) => `${f.fournisseur} ${f.numero}`.toLowerCase().includes(recherche.toLowerCase())).map((f) => (
                <button key={f.id} onClick={() => setSelId(f.id)} className={`w-full rounded-lg border p-3 text-left ${f.id === selId ? "border-primary bg-card" : "border-border"}`}>
                  <div className="flex items-center justify-between gap-2 text-sm font-medium">
                    <span className="truncate">{f.fournisseur}</span>
                    {f.statut === "validee" ? <Check className="h-4 w-4 shrink-0 text-success" /> : !f.lignes_importees ? <span className="shrink-0 text-[10px] text-muted-foreground">à ventiler</span> : !controle(f).ok && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(f.date).toLocaleDateString("fr-FR")} · {f.numero} · {eur(f.totalTtc)}</div>
                </button>
              ))}
              </div>
            </aside>
            {sel && <Ventilation f={sel} dirty={dirty} onChange={update} onSave={(v) => enregistrer(sel, v)} />}
            {sel && <Piece f={sel} onUploaded={() => recharger()} />}
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
  const setLigne = (id: string, patch: Partial<Ligne>) => onChange({ ...f, lignes: f.lignes.map((l) => (l.id === id ? { ...l, ...patch, ...(patch.ht !== undefined ? { tvaMontant: round2(patch.ht * l.tauxTva) } : {}) } : l)) });
  const ec = ecriture(f, f.compte_fournisseur ?? "401");
  const [beta, setBeta] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
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
      <h3 className="mt-6 text-xs uppercase tracking-wider text-muted-foreground">Écriture d'achat proposée</h3>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-1">Compte</th><th>Libellé</th><th className="text-right">Débit</th><th className="text-right">Crédit</th></tr></thead>
        <tbody>
          {ec.lignes.map((l, i) => (
            <tr key={i} className={`border-t border-border ${l.credit ? "font-medium" : ""}`}>
              <td className="py-1.5 font-mono">{l.compte}</td><td>{l.libelle}</td>
              <td className="text-right tabular-nums">{l.debit ? eur(l.debit) : ""}</td>
              <td className="text-right tabular-nums">{l.credit ? eur(l.credit) : ""}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-border text-xs"><td colSpan={2} className={`py-1.5 ${ec.equilibree ? "text-success" : "text-destructive"}`}>{ec.equilibree ? "Écriture équilibrée" : "Écriture déséquilibrée"}</td><td className="text-right tabular-nums">{eur(ec.totalDebit)}</td><td className="text-right tabular-nums">{eur(ec.totalCredit)}</td></tr>
        </tbody>
      </table>
      {!f.lignes_importees && <p className="mt-3 text-sm text-muted-foreground">Lignes pas encore importées de Pennylane pour cette facture : ajoutez la pièce à droite pour la ventiler.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button disabled={busy || valide || !f.piece_path} title={f.piece_path ? "Lit chaque ligne de la pièce et propose un compte par nature" : "Ajoutez d'abord la pièce à droite"} onClick={async () => {
          setBusy(true); setInfo("Lecture de la pièce…");
          try {
            const { lignes } = await lireLignesPiece({ data: { piecePath: f.piece_path! } });
            if (!lignes.length) throw new Error("Aucune ligne lue sur la pièce");
            onChange({ ...f, lignes: eclater(lignes, f.date) });
            setInfo(`${lignes.length} lignes lues sur la pièce, éclatées par nature. Vérifiez puis enregistrez.`);
          } catch (e) { setInfo(e instanceof Error ? e.message : "Lecture impossible"); }
          setBusy(false);
        }} className="flex items-center gap-1 rounded-lg border border-primary px-3 py-2 text-sm text-primary disabled:opacity-50"><Split className="h-4 w-4" /> Éclater depuis la pièce</button>
        {info && <span className="text-xs text-muted-foreground">{info}</span>}
      </div>
      {al.length > 0 && <ul className="mt-4 space-y-1 text-sm text-destructive">{al.map((a) => <li key={a}>⚠ {a}</li>)}</ul>}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        {valide && <span className="text-sm text-success">Validée le {new Date(f.valide_le!).toLocaleString("fr-FR")} · prête pour Pennylane</span>}
        <button disabled={!dirty || busy} onClick={() => run(false)} className="rounded-lg border border-border px-4 py-2.5 text-sm disabled:opacity-50">Enregistrer</button>
        <button title="Bêta : prépare l'envoi vers Pennylane sans rien écrire" onClick={async () => { const r = await envoyerVentilation(f); setBeta(r.envoye ? "Envoyé" : `${r.raison} — aperçu prêt (${r.payload.invoice_lines.length} lignes)`); console.info("Aperçu envoi Pennylane", r.payload); }} className="flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
          <FlaskConical className="h-3 w-3" /> Écrire dans Pennylane (bêta{PENNYLANE_ECRITURE_ACTIVE ? "" : ", désactivé"})
        </button>
        <button disabled={!c.ok || busy} onClick={() => run(true)} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {busy ? "Enregistrement…" : valide ? "Revalider" : "Valider la ventilation"}
        </button>
      </div>
      {beta && <p className="mt-2 text-right text-xs text-muted-foreground">{beta}</p>}
    </section>
  );
}

function Piece({ f, onUploaded }: { f: FactureDB; onUploaded: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setUrl(null);
    if (f.piece_path) supabase.storage.from("justificatifs").createSignedUrl(f.piece_path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [f.piece_path]);
  const deposer = async (file: File) => {
    setBusy(true);
    const path = `pieces/${f.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("justificatifs").upload(path, file, { contentType: file.type });
    if (!error) await supabase.from("factures").update({ piece_path: path }).eq("id", f.id);
    else alert(`Dépôt impossible : ${error.message}`);
    setBusy(false); onUploaded();
  };
  return (
    <section className="flex min-h-[80vh] flex-col overflow-hidden rounded-xl border border-border bg-card lg:sticky lg:top-4 lg:h-[85vh]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-sm">
        <span className="font-medium">Pièce · {f.fournisseur}</span>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1 text-primary"><Upload className="h-4 w-4" />{busy ? "Envoi…" : f.piece_path ? "Remplacer" : "Ajouter la pièce"}
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => e.target.files?.[0] && deposer(e.target.files[0])} />
          </label>
          {f.pennylane_url && <a href={f.pennylane_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-muted-foreground"><ExternalLink className="h-4 w-4" />Pennylane</a>}
        </div>
      </div>
      {url ? (
        <iframe src={url} title={`Pièce ${f.numero}`} className="h-full w-full flex-1 bg-muted" />
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-6 text-sm">
          <div className="rounded-lg border border-dashed border-border p-4 text-muted-foreground">Aucun PDF attaché ici. Ajoutez la pièce (PDF multipage accepté) pour l'afficher à côté de la ventilation, ou ouvrez-la dans Pennylane.</div>
          <div className="space-y-1">
            <div className="font-display text-xl">{f.fournisseur}</div>
            <div className="text-muted-foreground">Facture {f.numero} · {new Date(f.date).toLocaleDateString("fr-FR")} · {f.devise}</div>
          </div>
          <div className="text-xs text-muted-foreground">Libellé Pennylane : {f.libelleGenerique}</div>
          <div className="grid grid-cols-3 gap-2">
            {([["HT", f.totalHt], ["TVA", f.totalTva], ["TTC", f.totalTtc]] as const).map(([k, v]) => <div key={k} className="rounded bg-muted p-2"><div className="text-xs text-muted-foreground">{k}</div><div className="tabular-nums">{eur(v)}</div></div>)}
          </div>
          {f.compte_fournisseur && <div className="text-xs text-muted-foreground">Compte fournisseur : <span className="font-mono">{f.compte_fournisseur}</span></div>}
        </div>
      )}
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
