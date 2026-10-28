import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, AlertTriangle, BookOpen, MessageSquare, Split, Plug, Send } from "lucide-react";
import { DOSSIER, factures as initial, piecesManquantes } from "@/lib/demo-data";
import { alertes, controle, eur, tvaLigne, type Facture } from "@/lib/ventilation";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Comptabilité Augmentée — Ventilation de factures" },
      { name: "description", content: "Validez la ventilation proposée par Claude avant écriture dans Pennylane." },
      { property: "og:title", content: "Comptabilité Augmentée" },
      { property: "og:description", content: "Ventilation, livre de lecture et échange client pour cabinets comptables." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Onglet = "ventilation" | "livre" | "client";

function Index() {
  const [onglet, setOnglet] = useState<Onglet>("ventilation");
  const [factures, setFactures] = useState(initial);
  const [selId, setSelId] = useState(initial[0].id);
  const [valides, setValides] = useState<string[]>([]);
  const sel = factures.find((f) => f.id === selId)!;

  const update = (f: Facture) => setFactures((all) => all.map((x) => (x.id === f.id ? f : x)));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-6 py-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{DOSSIER}</p>
            <h1 className="font-display text-4xl">Comptabilité augmentée</h1>
          </div>
          <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {([
              ["ventilation", "Ventilation", Split],
              ["livre", "Livre de lecture", BookOpen],
              ["client", "Échange client", MessageSquare],
            ] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setOnglet(id)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 ${onglet === id ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {onglet === "ventilation" && (
          <div className="grid gap-6 md:grid-cols-[260px_1fr]">
            <aside className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Factures importantes</p>
              {factures.map((f) => {
                const ok = controle(f).ok;
                return (
                  <button
                    key={f.id}
                    onClick={() => setSelId(f.id)}
                    className={`w-full rounded-lg border p-3 text-left ${f.id === selId ? "border-primary bg-card" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between text-sm font-medium">
                      {f.fournisseur}
                      {valides.includes(f.id) ? <Check className="h-4 w-4 text-success" /> : !ok && <AlertTriangle className="h-4 w-4 text-destructive" />}
                    </div>
                    <div className="text-xs text-muted-foreground">{f.numero} · {eur(f.totalTtc)}</div>
                  </button>
                );
              })}
            </aside>
            <Ventilation f={sel} onChange={update} valide={valides.includes(sel.id)} onValider={() => setValides((v) => [...v, sel.id])} />
          </div>
        )}
        {onglet === "livre" && <Livre factures={factures} valides={valides} />}
        {onglet === "client" && <Client />}
      </main>
    </div>
  );
}

function Ventilation({ f, onChange, valide, onValider }: { f: Facture; onChange: (f: Facture) => void; valide: boolean; onValider: () => void }) {
  const c = controle(f);
  const al = alertes(f.lignes);
  const setLigne = (id: string, patch: Partial<Facture["lignes"][number]>) =>
    onChange({ ...f, lignes: f.lignes.map((l) => (l.id === id ? { ...l, ...patch } : l)) });

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground line-through">{f.libelleGenerique}</p>
          <input
            value={f.libelleEcriture}
            onChange={(e) => onChange({ ...f, libelleEcriture: e.target.value })}
            className="font-display w-full bg-transparent text-2xl outline-none"
            aria-label="Libellé d'écriture"
          />
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
              <td className="text-right">
                <input type="number" value={l.ht} onChange={(e) => setLigne(l.id, { ht: Number(e.target.value) })} className="w-24 rounded bg-muted px-2 py-1 text-right" />
              </td>
              <td className="text-right tabular-nums">{eur(tvaLigne(l))} <span className="text-xs text-muted-foreground">({l.tauxTva * 100}%)</span></td>
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

      {al.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-destructive">{al.map((a) => <li key={a}>⚠ {a}</li>)}</ul>
      )}

      <div className="mt-6 flex justify-end">
        <button
          disabled={!c.ok || valide}
          onClick={onValider}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {valide ? "Écrit dans Pennylane ✓" : "Valider et écrire dans Pennylane"}
        </button>
      </div>
    </section>
  );
}

function Livre({ factures, valides }: { factures: Facture[]; valides: string[] }) {
  const parCompte = new Map<string, { lib: string; ht: number }>();
  factures.flatMap((f) => f.lignes).forEach((l) => {
    const e = parCompte.get(l.compte) ?? { lib: l.compteLibelle, ht: 0 };
    e.ht += l.ht;
    parCompte.set(l.compte, e);
  });
  const total = [...parCompte.values()].reduce((s, e) => s + e.ht, 0);
  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <h2 className="font-display text-3xl">Le livre de lecture — février / mars 2026</h2>
      <p className="leading-relaxed">
        {valides.length} facture(s) sur {factures.length} validée(s) et écrite(s). Les dépenses ventilées représentent{" "}
        <strong>{eur(total)} HT</strong>. Le poste principal est l'investissement informatique (MacBook Pro immobilisé), suivi du loyer des bureaux.
        Le coût de gestion (honoraires comptables + logiciels) s'élève à <strong>{eur(860 + 210)}</strong> HT.
      </p>
      <div className="space-y-2">
        {[...parCompte.entries()].sort((a, b) => b[1].ht - a[1].ht).map(([compte, e]) => (
          <div key={compte}>
            <div className="flex justify-between text-sm"><span>{compte} · {e.lib}</span><span className="tabular-nums">{eur(e.ht)}</span></div>
            <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${(e.ht / total) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border-l-4 border-primary bg-card p-4 text-sm">
        <strong>Points d'attention.</strong> Extension de garantie sur 24 mois à étaler. 3 pièces manquantes (301,51 €) bloquent la clôture du mois.
      </div>
    </article>
  );
}

function Client() {
  const [faits, setFaits] = useState<string[]>([]);
  const reste = piecesManquantes.filter((p) => !faits.includes(p.id));
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="rounded-xl bg-muted p-4 text-sm">
        Bonjour, il nous manque {piecesManquantes.length} justificatifs pour boucler février. On les traite un par un, ça prend 2 minutes.
      </div>
      {reste[0] ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Action {faits.length + 1} / {piecesManquantes.length}</p>
          <p className="mt-1 font-medium">{reste[0].libelle} — {eur(reste[0].montant)}</p>
          <p className="text-sm text-muted-foreground">{new Date(reste[0].date).toLocaleDateString("fr-FR")}</p>
          <button onClick={() => setFaits((f) => [...f, reste[0].id])} className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
            {reste[0].action.startsWith("Autoriser") ? <Plug className="h-4 w-4" /> : <Send className="h-4 w-4" />} {reste[0].action}
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-success/10 p-5 text-sm">Merci ! Toutes les pièces sont reçues, le mois peut être clôturé.</div>
      )}
    </div>
  );
}
