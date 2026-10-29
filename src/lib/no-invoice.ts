// Texts shown when the client has no invoice (sources checked on Légifrance and BOFiP, 29/10/2026).
export const NO_INVOICE_WARNING = `Attention : sans facture, cette dépense risque de :
– ne pas être déduite de votre résultat, car une charge doit être appuyée de justificatifs suffisants (BOI-BIC-CHG-10-20-20 § 1 et 10) ;
– vous faire perdre la TVA récupérable, car la TVA n'est déductible que si elle figure sur une facture (CGI art. 271, II-2 ; BOI-TVA-DED-40-10-10 § 30) ;
– être reclassée s'il s'agit d'une dépense personnelle : elle ne sera alors pas prise en charge par l'entreprise.
Vous pouvez souvent obtenir un duplicata auprès du fournisseur. Votre comptable reviendra vers vous si besoin.`;

// For a sale, the missing document is the client's own invoice: guidance only, no tax rule.
export const NO_INVOICE_NOTE_SALE = `À savoir : pour un encaissement, la pièce attendue est la facture (ou le justificatif de vente) que vous avez établie pour votre client.
– Si vous l'avez émise, vous la retrouverez dans votre logiciel de facturation ou dans vos e-mails envoyés : vous pouvez la déposer ou la transférer.
– S'il s'agit d'un remboursement d'un fournisseur, déposez plutôt l'avoir qu'il vous a adressé (choix 1).
– S'il ne s'agit pas d'une vente (apport, prêt, virement entre vos comptes…), précisez-le dans le commentaire.
Votre comptable reviendra vers vous si besoin.`;

// Retour de Stéphane: exceptionally, a photo can support an expense without an invoice (e.g. no receipt at the
// fuel pump: photo of the pump showing amount and litres). The expense is documented, the VAT is not deductible.
export const PHOTO_SANS_FACTURE_NOTE = `Exceptionnellement, une photo peut servir de justificatif quand aucune facture n'existe (par exemple : pas de ticket au distributeur de carburant, photo de la pompe montrant le montant et les litres).
– Aucune TVA ne sera déduite : la déduction suppose une facture (CGI art. 271, II ; BOI-TVA-DED-40-10-10 § 30).
Votre comptable appréciera si la photo suffit à justifier la dépense.`;

export const PHOTO_SANS_FACTURE_COMMENT = "Photo justificative hors facture : aucune TVA déductible.";
