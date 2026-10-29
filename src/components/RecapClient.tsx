import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BellRing, CalendarClock, Check, Copy, Mail, MailPlus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  confirmerRecapEnvoye,
  etatRecap,
  preparerRecaps,
  reglerRecap,
  type RecapPret,
} from "@/lib/recap.functions";
import { RELANCES_JOURS } from "@/lib/recap-client";

const lien = () => (typeof window === "undefined" ? "https://localhost" : window.location.origin);
// The app sends nothing (Julien, 29/10/2026): the recap opens in the firm's own mail app.
const mailto = (to: string[], subject: string, text: string) =>
  `mailto:${to.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    dateStyle: "short",
    timeStyle: "short",
  });

// Open in the mail app, copy, then confirm: the confirmation starts the 12-hour rule.
function Brouillon({
  to,
  subject,
  text,
  onSent,
}: {
  to: string[];
  subject: string;
  text: string;
  onSent: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <a href={mailto(to, subject, text)}>
          <MailPlus /> Ouvrir ma messagerie
        </a>
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(`${subject}\n\n${text}`);
          toast.success("Texte copié");
        }}
      >
        <Copy /> Copier le texte
      </Button>
      <Button size="sm" variant="outline" onClick={onSent}>
        <Check /> C'est envoyé
      </Button>
    </div>
  );
}

// Firm side, on a dossier (Julien, 29/10/2026): one detailed recap e-mail to the client, at most one every 12 hours,
// and a reminder schedule that tells the firm when to write again.
export function RecapClientPanel({ dossierId }: { dossierId: string }) {
  const qc = useQueryClient();
  const etat = useServerFn(etatRecap);
  const confirmer = useServerFn(confirmerRecapEnvoye);
  const regler = useServerFn(reglerRecap);
  const queryKey = ["recap-client", dossierId];
  const q = useQuery({
    queryKey,
    queryFn: () => etat({ data: { dossierId, lien: lien() } }),
    retry: false,
  });
  const [voir, setVoir] = useState(false);
  const [auto, setAuto] = useState(false);
  const [relance, setRelance] = useState<number | null>(null);
  useEffect(() => {
    if (!q.data) return;
    setAuto(q.data.reglage.auto);
    setRelance(q.data.reglage.relanceJours);
  }, [q.data]);
  const reload = () => qc.invalidateQueries({ queryKey: ["recap-client"] });

  async function sent() {
    await confirmer({ data: { dossierId } });
    toast.success("C'est noté : prochain récapitulatif possible dans 12 h.");
    reload();
  }
  async function save() {
    try {
      await regler({ data: { dossierId, auto, relanceJours: relance } });
      toast.success("Programmation enregistrée");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const d = q.data;
  return (
    <section id="recap" className="scroll-mt-6 rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg">
        <BellRing className="h-5 w-5" /> Prévenir le client par e-mail
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Un seul e-mail récapitulatif, détaillé par fournisseur (date, montant, libellé, reste à
        justifier, lien direct vers chaque demande), au plus un toutes les 12 h. Il part de votre
        propre messagerie : l'application n'envoie rien.
      </p>
      {q.isError ? (
        <p className="mt-3 rounded-lg bg-yellow-soft/60 p-3 text-sm text-yellow-ink">
          {(q.error as Error).message}
        </p>
      ) : !d ? (
        <p className="mt-3 text-sm text-muted-foreground">Chargement…</p>
      ) : (
        <div className="mt-4 space-y-4">
          {d.relanceDue && d.recap && d.to.length > 0 && (
            <p className="rounded-lg bg-yellow-soft/60 p-3 text-sm font-semibold text-yellow-ink">
              Relance à faire :{" "}
              {d.reglage.dernierEnvoi
                ? "le délai de relance est passé ou de nouvelles demandes sont arrivées."
                : "le client n'a encore reçu aucun récapitulatif."}
            </p>
          )}
          <ul className="space-y-1 text-sm">
            <li>
              Destinataire{d.to.length > 1 ? "s" : ""} :{" "}
              {d.to.length ? (
                <span className="font-mono">{d.to.join(", ")}</span>
              ) : (
                <strong className="text-yellow-ink">aucun compte client</strong>
              )}
            </li>
            <li>
              À demander :{" "}
              <strong>
                {d.recap
                  ? `${d.recap.nbFactures} facture${d.recap.nbFactures > 1 ? "s" : ""}`
                  : "rien en attente"}
              </strong>
            </li>
            <li>
              Dernier récapitulatif :{" "}
              {d.reglage.dernierEnvoi ? quand(d.reglage.dernierEnvoi) : "jamais"}
              {d.prochainEnvoi && <> · prochain possible le {d.prochainEnvoi}</>}
            </li>
          </ul>
          {d.recap && d.to.length > 0 && !d.prochainEnvoi ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Send className="h-4 w-4" /> Envoyer le récapitulatif au client
              </p>
              <Brouillon to={d.to} subject={d.recap.subject} text={d.recap.text} onSent={sent} />
            </div>
          ) : null}
          {d.recap && (
            <Button variant="ghost" size="sm" onClick={() => setVoir(!voir)} aria-expanded={voir}>
              <Mail /> {voir ? "Masquer" : "Voir"} l'e-mail
            </Button>
          )}
          {voir && d.recap && (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border bg-pale-2 p-3 font-sans text-sm text-muted-foreground">{`Objet : ${d.recap.subject}\n\n${d.recap.text}`}</pre>
          )}
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold">
              <CalendarClock className="h-4 w-4" /> Programmation des relances
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={auto}
                onCheckedChange={(v) => setAuto(v === true)}
              />
              Me signaler quand de nouvelles demandes ont été envoyées au client depuis le dernier
              récapitulatif (12 h d'écart au moins)
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              Me rappeler de relancer s'il reste des factures :
              <select
                value={relance ?? ""}
                onChange={(e) => setRelance(e.target.value ? Number(e.target.value) : null)}
                className="h-9 rounded-md border border-input bg-card px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">jamais</option>
                {RELANCES_JOURS.map((j) => (
                  <option key={j} value={j}>
                    tous les {j} jours
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" variant="outline" onClick={save}>
              Enregistrer la programmation
            </Button>
            <p className="text-xs text-muted-foreground">
              Les relances dues s'affichent ici et sur le tableau de bord (« Envoyer les
              récapitulatifs »).
            </p>
          </fieldset>
        </div>
      )}
    </section>
  );
}

// Dashboard: the recaps of every dossier shown that still waits for invoices, each ready to open in the mail app.
export function RecapGroupe({ dossierIds }: { dossierIds: string[] }) {
  const preparer = useServerFn(preparerRecaps);
  const confirmer = useServerFn(confirmerRecapEnvoye);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ["recap-client", "groupe", ...dossierIds];
  const q = useQuery({
    queryKey: key,
    enabled: dossierIds.length > 0,
    retry: false,
    queryFn: () => preparer({ data: { dossierIds, lien: lien() } }),
  });
  // Before the migration every dossier comes back in error: nothing to show yet.
  if (!dossierIds.length || q.isError || q.data?.every((r) => r.statut === "erreur")) return null;
  const prets = (q.data ?? []).filter(
    (r): r is RecapPret & Required<Pick<RecapPret, "to" | "subject" | "text">> =>
      r.statut === "pret",
  );
  const dues = prets.filter((r) => r.relanceDue).length;
  const autres = (q.data ?? []).filter((r) => r.statut !== "pret" && r.statut !== "rien");

  async function sent(dossierId: string) {
    await confirmer({ data: { dossierId } });
    toast.success("C'est noté : prochain récapitulatif possible dans 12 h.");
    qc.invalidateQueries({ queryKey: ["recap-client"] });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={!q.data}>
        <Send /> Envoyer les récapitulatifs ({prets.length})
        {dues > 0 && (
          <span className="rounded-full bg-yellow-soft px-2 text-xs font-bold text-yellow-ink">
            {dues} relance{dues > 1 ? "s" : ""} due{dues > 1 ? "s" : ""}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Récapitulatifs à envoyer</DialogTitle>
            <DialogDescription>
              Un e-mail détaillé par dossier, à envoyer depuis votre messagerie puis à confirmer.
              Les relances dues sont en premier.
            </DialogDescription>
          </DialogHeader>
          {prets.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucun récapitulatif à envoyer pour le moment.
            </p>
          )}
          <ul className="space-y-3">
            {[...prets]
              .sort((a, b) => Number(!!b.relanceDue) - Number(!!a.relanceDue))
              .map((r) => (
                <li key={r.dossierId} className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm">
                    <strong>{r.dossier}</strong> · {r.nbFactures} facture
                    {(r.nbFactures ?? 0) > 1 ? "s" : ""} ·{" "}
                    <span className="font-mono">{r.to.join(", ")}</span>
                    {r.relanceDue && (
                      <span className="ml-2 rounded-full bg-yellow-soft px-2 text-xs font-bold text-yellow-ink">
                        relance due
                      </span>
                    )}
                  </p>
                  <Brouillon
                    to={r.to}
                    subject={r.subject}
                    text={r.text}
                    onSent={() => sent(r.dossierId)}
                  />
                </li>
              ))}
          </ul>
          {autres.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {autres.map((r) => (
                <li key={r.dossierId}>
                  {r.dossier || "Dossier"} :{" "}
                  {r.statut === "attente"
                    ? `déjà prévenu, prochain récapitulatif possible le ${r.detail}`
                    : r.statut === "sans_compte"
                      ? "aucun compte client"
                      : r.detail}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
