import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MAX_ENVOI_GROUPE } from "@/lib/envoi-groupe";
import { envoyerGroupe, listerEnvoiGroupe, type LigneEnvoi } from "@/lib/saisie.functions";
import { formatDate, formatEUR } from "@/lib/session";
import { InfoTip } from "@/components/Aide";

type Result = { id: string; ok: boolean; message: string };
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`;

// Envoi groupé (demande de Julien) : le cabinet valide et envoie dans Pennylane, en une seule confirmation,
// toutes les factures lues par Claude qui sont prêtes. Les autres restent à ouvrir une par une.
export function EnvoiGroupe({
  dossierId,
  onDone,
  onOpen,
}: {
  dossierId: string;
  onDone: () => void;
  onOpen: (uploadId: string) => void;
}) {
  const q = useQuery({
    queryKey: ["envoi-groupe", dossierId],
    queryFn: () => listerEnvoiGroupe({ data: { dossierId } }),
  });
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  if (q.isLoading || q.isError || !q.data) return null;
  const { demo, ecritureActive, lignes } = q.data;
  const prets = lignes.filter((l) => l.etat.pret);
  const aRevoir = lignes.filter(
    (l) => !l.etat.pret && l.state !== "rejetee" && !l.etat.raison.startsWith("Déjà"),
  );
  if (!prets.length && !aRevoir.length && !results) return null;

  // Every ready invoice is checked at first: one click sends the whole dossier.
  const chosen = sel ?? new Set(prets.slice(0, MAX_ENVOI_GROUPE).map((l) => l.id));
  const selected = prets.filter((l) => chosen.has(l.id));
  const total = selected.reduce((s, l) => s + l.totalTtc, 0);
  const aValider = selected.filter((l) => l.etat.pret && l.etat.aValider).length;
  const actif = demo && ecritureActive;
  const toggle = (id: string, on: boolean) => {
    const n = new Set(chosen);
    if (on) n.add(id);
    else n.delete(id);
    setSel(n);
  };

  async function envoyer() {
    setBusy(true);
    try {
      const r = await envoyerGroupe({ data: { dossierId, ids: selected.map((l) => l.id) } });
      setResults(r.results);
      const ok = r.results.filter((x) => x.ok).length;
      const ko = r.results.length - ok;
      if (ko)
        toast.warning(`${plural(ok, "facture")} envoyée${ok > 1 ? "s" : ""}, ${ko} à revoir.`);
      else toast.success(`${plural(ok, "facture")} envoyée${ok > 1 ? "s" : ""} dans Pennylane.`);
      setSel(null);
      await q.refetch();
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmer(false);
    }
  }

  const name = (id: string) => {
    const l = lignes.find((x) => x.id === id);
    return l ? `${l.fournisseur}${l.numero ? ` n° ${l.numero}` : ""}` : id;
  };

  return (
    <section id="envoi-groupe" className="scroll-mt-6 rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg">
        <Send className="h-5 w-5" /> Valider et envoyer dans Pennylane
        <InfoTip label="Envoi dans Pennylane">
          Les factures lues par Claude, sans écart, sont validées telles que proposées puis envoyées avec leur PDF, en une
          seule confirmation. Cliquez sur une facture pour voir l'affectation comptable proposée. Réservé aux dossiers de démonstration. Sont mises de côté : les factures avec un écart, un compte hors du plan
          comptable ANC 2026, un fichier qui n'est pas un PDF, ou déjà envoyées.
        </InfoTip>
      </h2>

      {!demo ? (
        <p className="mt-3 text-sm text-muted-foreground">
          L'envoi dans Pennylane est réservé aux dossiers démo du hackathon.
        </p>
      ) : !ecritureActive ? (
        <p className="mt-3 text-sm text-muted-foreground">
          L'envoi vers Pennylane est désactivé pour l'instant (fonction bêta).
        </p>
      ) : null}

      {prets.length > 0 && (
        <>
          <ul className="mt-4 divide-y rounded-lg border">
            {prets.map((l) => (
              <EnvoiRow
                key={l.id}
                l={l}
                checked={chosen.has(l.id)}
                disabled={!actif || busy}
                onToggle={(on) => toggle(l.id, on)}
                onOpen={() => onOpen(l.uploadId)}
              />
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {confirmer ? (
              <>
                <span className="text-sm">
                  {plural(selected.length, "facture")} ({formatEUR(total)} TTC)
                  {aValider ? `, dont ${aValider} encore à valider,` : ""} vont être créées dans le
                  dossier Pennylane avec leur PDF. Confirmez-vous ?
                </span>
                <Button onClick={envoyer} disabled={busy}>
                  <Send /> {busy ? "Envoi en cours…" : "Confirmer l'envoi"}
                </Button>
                <Button variant="outline" onClick={() => setConfirmer(false)} disabled={busy}>
                  Annuler
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setConfirmer(true)}
                disabled={!actif || selected.length === 0 || selected.length > MAX_ENVOI_GROUPE}
              >
                <Send /> Valider et envoyer la sélection ({selected.length})
              </Button>
            )}
            {selected.length > MAX_ENVOI_GROUPE && (
              <span className="text-sm text-destructive">
                {MAX_ENVOI_GROUPE} factures au plus par envoi.
              </span>
            )}
          </div>
        </>
      )}

      {results && (
        <div role="status" className="mt-4 space-y-1 rounded-lg border bg-pale-2 p-3 text-sm">
          <p className="font-semibold">
            Compte rendu : {plural(results.filter((r) => r.ok).length, "envoyée")},{" "}
            {results.filter((r) => !r.ok).length} à revoir.
          </p>
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.id} className="flex gap-2">
                {r.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <span>
                  <span className="font-semibold">{name(r.id)}</span> : {r.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {aRevoir.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-yellow-ink">
            <AlertTriangle className="h-4 w-4" /> {plural(aRevoir.length, "facture")} à revoir avant
            l'envoi
          </p>
          <ul className="mt-2 divide-y rounded-lg border text-sm">
            {aRevoir.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => onOpen(l.uploadId)}
                  className="w-full px-3 py-2 text-left hover:bg-muted/50"
                >
                  <FileText className="mr-1.5 inline h-4 w-4 text-muted-foreground" aria-hidden />
                  <span className="font-semibold underline-offset-2 hover:underline">
                    {l.fournisseur}
                    {l.numero ? ` n° ${l.numero}` : ""}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatEUR(l.totalTtc)} · {!l.etat.pret && l.etat.raison}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function EnvoiRow({
  l,
  checked,
  disabled,
  onToggle,
  onOpen,
}: {
  l: LigneEnvoi;
  checked: boolean;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onOpen: () => void;
}) {
  const label = `${l.fournisseur}${l.numero ? ` n° ${l.numero}` : ""}`;
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={`Sélectionner ${label}`}
      />
      <button
        type="button"
        onClick={onOpen}
        title="Ouvrir la facture et son affectation"
        className="min-w-0 flex-1 truncate text-left"
      >
        <FileText className="mr-1.5 inline h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="font-semibold underline-offset-2 hover:underline">{label}</span>
        {l.date && <span className="text-muted-foreground"> · {formatDate(l.date)}</span>}
      </button>
      <span className="text-xs text-muted-foreground">
        {l.etat.pret && l.etat.aValider ? "à valider et envoyer" : "validée, à envoyer"}
      </span>
      <span className="w-24 text-right font-semibold tabular-nums">{formatEUR(l.totalTtc)}</span>
    </li>
  );
}
