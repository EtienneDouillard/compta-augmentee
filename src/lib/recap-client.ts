// Recap e-mail to the client (Julien, 29/10/2026): one detailed e-mail at most every 12 hours instead of one per
// request, sent by the firm with one click or on a reminder schedule. Pure functions; the firm sends it from its own mail app.

export const RECAP_INTERVALLE_MS = 12 * 60 * 60 * 1000;
/** Reminder intervals the firm can pick, in days. */
export const RELANCES_JOURS = [2, 3, 7, 14] as const;

export type LigneRecap = {
  supplier: string;
  direction: string;
  date: string;
  label: string;
  amount: number;
  status: string;
  review_state: string;
  is_open: boolean;
  updated_at: string;
};

export type Recap = { subject: string; text: string; nbFactures: number };

/** Lines the client still has to answer: sent by the firm, open, not answered. */
const aFaire = (l: LigneRecap) => l.review_state === "sent" && l.is_open && l.status === "a_faire";

/** When the next recap may leave, or null if it may leave now. */
export function prochainEnvoiPossible(dernierEnvoi: string | null, maintenant: Date): Date | null {
  if (!dernierEnvoi) return null;
  const next = new Date(new Date(dernierEnvoi).getTime() + RECAP_INTERVALLE_MS);
  return next > maintenant ? next : null;
}

/**
 * Whether the firm is told to write now (reminder schedule). Always: something to do and 12 hours since the last one. Then either
 * new requests since the last recap (option "prévenir des nouvelles demandes"), or the reminder delay is over.
 */
export function recapDu(
  lignes: LigneRecap[],
  reglage: { dernierEnvoi: string | null; auto: boolean; relanceJours: number | null },
  maintenant: Date,
): boolean {
  const todo = lignes.filter(aFaire);
  if (!todo.length || prochainEnvoiPossible(reglage.dernierEnvoi, maintenant)) return false;
  const last = reglage.dernierEnvoi ? new Date(reglage.dernierEnvoi).getTime() : null;
  const nouveau = last === null || todo.some((l) => new Date(l.updated_at).getTime() > last);
  if (reglage.auto && nouveau) return true;
  if (!reglage.relanceJours) return false;
  return last === null || maintenant.getTime() - last >= reglage.relanceJours * 24 * 60 * 60 * 1000;
}

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
const jour = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

const MAX_FOURNISSEURS = 15;
const MAX_LIGNES = 5;

/**
 * The detailed recap (retour de Julien: "plus de détail dans les alertes"): per supplier, each payment with its
 * date, bank label and amount, the amount left to justify, and a direct link to that supplier's page.
 */
export function recapClient(
  lignes: LigneRecap[],
  { dossier, cabinet, lien }: { dossier: string; cabinet: string; lien: string },
): Recap | null {
  const todo = lignes.filter(aFaire);
  if (!todo.length) return null;
  const groupes = new Map<string, LigneRecap[]>();
  for (const l of todo) {
    // Same key as groupBySupplier (session.ts), so the link opens the right page.
    const key = `${l.direction === "in" ? "vente" : "achat"}:${l.supplier}`;
    groupes.set(key, [...(groupes.get(key) ?? []), l]);
  }
  const total = (ls: LigneRecap[]) => ls.reduce((s, l) => s + Math.abs(Number(l.amount)), 0);
  const tri = [...groupes].sort((a, b) => total(b[1]) - total(a[1]));
  const base = lien.replace(/\/+$/, "");

  const blocs = tri.slice(0, MAX_FOURNISSEURS).map(([key, ls]) => {
    const vente = ls[0]!.direction === "in";
    const tête = `${ls[0]!.supplier} (${vente ? "vente : votre facture au client" : "achat : facture du fournisseur"}) – ${pluriel(ls.length, "facture")}, ${eur(total(ls))} à justifier`;
    const détail = [...ls]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, MAX_LIGNES)
      .map(
        (l) =>
          `   • ${vente ? "encaissé" : "payé"} le ${jour(l.date)} : ${eur(Math.abs(Number(l.amount)))} – « ${l.label} »`,
      );
    if (ls.length > MAX_LIGNES)
      détail.push(`   • et ${pluriel(ls.length - MAX_LIGNES, "autre paiement")}`);
    return [
      tête,
      ...détail,
      `   Répondre pour ce fournisseur : ${base}/espace/${encodeURIComponent(key)}`,
    ].join("\n");
  });
  if (tri.length > MAX_FOURNISSEURS)
    blocs.push(
      `… et ${pluriel(tri.length - MAX_FOURNISSEURS, "autre fournisseur")} dans votre espace.`,
    );

  return {
    nbFactures: todo.length,
    subject: `${dossier} : ${pluriel(todo.length, "facture")} à transmettre à ${cabinet}`,
    text: [
      "Bonjour,",
      "",
      `Pour tenir à jour la comptabilité de ${dossier}, ${cabinet} a besoin de ${pluriel(todo.length, "facture")} (${eur(total(todo))} au total). Ce sont des paiements vus sur votre compte bancaire, pour lesquels la facture manque encore :`,
      "",
      blocs.join("\n\n"),
      "",
      `Pourriez-vous s'il vous plaît les transmettre depuis votre espace : ${base}/espace`,
      "Pour chaque fournisseur, il suffit de déposer la facture (PDF ou photo), de la transférer par e-mail, ou d'indiquer qu'il n'y en a pas avec un mot d'explication. Vos réponses sont enregistrées au fur et à mesure.",
      "",
      "Vous recevez au plus un e-mail récapitulatif toutes les 12 heures.",
      "",
      "Bonne journée,",
      cabinet,
    ].join("\n"),
  };
}
