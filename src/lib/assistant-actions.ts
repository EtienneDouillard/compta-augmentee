import { z } from "zod";

export const AssistantAction = z.object({
  action: z.enum(["sync", "analyse", "lire", "envoyer", "ecarter", "reactiver"]),
  dossierId: z.string().uuid(),
  ids: z.array(z.string().uuid()).max(100),
});
export type AssistantActionInput = z.infer<typeof AssistantAction>;
export const ACTION_LABELS = {
  sync: "Actualiser le dossier", analyse: "Analyser les opérations avec Claude",
  lire: "Lire une facture", envoyer: "Envoyer les demandes au client",
  ecarter: "Ne pas demander les justificatifs", reactiver: "Réactiver les demandes",
};
export function assertActionScope(action: AssistantActionInput, dossierId: string | null) {
  if (!dossierId || action.dossierId !== dossierId) throw new Error("Ouvrez le dossier concerné avant cette action.");
  if (["envoyer", "ecarter", "reactiver", "lire"].includes(action.action) && !action.ids.length)
    throw new Error("Sélection vide : aucune action effectuée.");
  if (action.action === "lire" && action.ids.length !== 1) throw new Error("Lisez une pièce à la fois.");
}
export function actionState(action: string) {
  if (action === "envoyer") return { from: "pending", to: "sent" };
  if (action === "ecarter") return { from: "pending", to: "dismissed" };
  if (action === "reactiver") return { from: "dismissed", to: "pending" };
  throw new Error("Action non autorisée.");
}