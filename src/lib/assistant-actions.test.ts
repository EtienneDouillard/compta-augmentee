import { describe, expect, it } from "vitest";
import { actionState, assertActionScope, AssistantAction } from "./assistant-actions";
const dossierId = "00000000-0000-4000-8000-000000000001";
describe("actions de l'assistant", () => {
  it("refuse un autre dossier", () => {
    expect(() => assertActionScope({ action: "sync", dossierId, ids: [] }, "00000000-0000-4000-8000-000000000002")).toThrow();
  });
  it("ne propose aucune écriture Pennylane", () => {
    expect(AssistantAction.safeParse({ action: "envoyerPennylane", dossierId, ids: [] }).success).toBe(false);
  });
  it("envoie seulement les demandes à valider", () => {
    expect(actionState("envoyer")).toEqual({ from: "pending", to: "sent" });
  });
  it("réactive seulement les demandes écartées", () => {
    expect(actionState("reactiver")).toEqual({ from: "dismissed", to: "pending" });
  });
  it("refuse une lecture de plusieurs pièces", () => {
    expect(() => assertActionScope({ action: "lire", dossierId, ids: [dossierId, dossierId] }, dossierId)).toThrow();
  });
});