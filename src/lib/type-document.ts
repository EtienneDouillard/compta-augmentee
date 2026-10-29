// What an uploaded purchase document says it is (read by Claude, saisie.ts).
export const TYPES_DOCUMENT = [
  "facture",
  "avoir",
  "proforma",
  "devis",
  "bon_de_commande",
  "autre",
] as const;
export type TypeDocument = (typeof TYPES_DOCUMENT)[number];
// A proforma, a quote or an order form is not an invoice: it justifies neither the expense nor the VAT.
export const TYPE_NON_VALABLE: Partial<Record<TypeDocument, string>> = {
  proforma: "une facture proforma",
  devis: "un devis",
  bon_de_commande: "un bon de commande",
};
export const typeDocumentOf = (v: unknown): TypeDocument =>
  (TYPES_DOCUMENT as readonly unknown[]).includes(v) ? (v as TypeDocument) : "facture";
