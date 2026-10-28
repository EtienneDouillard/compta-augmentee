import type { Facture } from "./ventilation";

// Données d'exemple inspirées du dossier « Demo Hackathon - Comptabilité Augmentée 7 ».
export const DOSSIER = "Dossier Demo Hackathon - Comptabilité Augmentée 7";

export const factures: Facture[] = [
  {
    id: "f1",
    numero: "F-2026-1042",
    fournisseur: "Atelier Numérique",
    date: "2026-02-12",
    totalHt: 2140,
    totalTva: 428,
    totalTtc: 2568,
    libelleGenerique: "Facture Atelier Numérique - F-2026-1042",
    libelleEcriture: "Équipement poste dev + licences + garantie 24 mois",
    regleAppliquee: "Matrice Atelier Numérique (validée en janvier)",
    lignes: [
      { id: "1", compte: "218300", compteLibelle: "Matériel informatique", libelle: "MacBook Pro 14\" M4", ht: 1690, tauxTva: 0.2, nature: "immobilisation" },
      { id: "2", compte: "651000", compteLibelle: "Licences logiciels", libelle: "Licences JetBrains 12 mois", ht: 210, tauxTva: 0.2, nature: "charge" },
      { id: "3", compte: "486000", compteLibelle: "Charges constatées d'avance", libelle: "Extension garantie 24 mois", ht: 180, tauxTva: 0.2, nature: "charge_etalee", periodeMois: 24 },
      { id: "4", compte: "606300", compteLibelle: "Petit équipement", libelle: "Câbles et adaptateur USB-C", ht: 60, tauxTva: 0.2, nature: "charge" },
    ],
  },
  {
    id: "f2",
    numero: "F-2026-779",
    fournisseur: "Pennylane Cabinet Démo",
    date: "2026-02-28",
    totalHt: 850,
    totalTva: 170,
    totalTtc: 1020,
    libelleGenerique: "Facture Pennylane Cabinet Démo - F-2026-779",
    libelleEcriture: "Honoraires comptables février 2026",
    regleAppliquee: "Matrice Pennylane Cabinet Démo",
    lignes: [
      { id: "1", compte: "622600", compteLibelle: "Honoraires", libelle: "Tenue comptable février 2026", ht: 600, tauxTva: 0.2 },
      { id: "2", compte: "622600", compteLibelle: "Honoraires", libelle: "Établissement paie février 2026", ht: 150, tauxTva: 0.2 },
      { id: "3", compte: "651000", compteLibelle: "Licences logiciels", libelle: "Abonnement logiciel Pennylane", ht: 100, tauxTva: 0.2 },
    ],
  },
  {
    id: "f3",
    numero: "LOY-2026-03",
    fournisseur: "SCI Les Tilleuls (bailleur)",
    date: "2026-03-01",
    totalHt: 1450,
    totalTva: 260,
    totalTtc: 1710,
    libelleGenerique: "Facture SCI Les Tilleuls - LOY-2026-03",
    libelleEcriture: "Loyer bureaux mars 2026 + charges + TEOM",
    lignes: [
      { id: "1", compte: "613200", compteLibelle: "Locations immobilières", libelle: "Loyer bureaux mars 2026", ht: 1200, tauxTva: 0.2 },
      { id: "2", compte: "614000", compteLibelle: "Charges locatives", libelle: "Provision charges locatives mars", ht: 100, tauxTva: 0.2 },
      { id: "3", compte: "635120", compteLibelle: "Taxe ordures ménagères", libelle: "TEOM refacturée", ht: 150, tauxTva: 0 },
    ],
  },
];

export const piecesManquantes = [
  { id: "p1", date: "2026-02-03", libelle: "WEEZEVENT", montant: 25, action: "Déposer le billet d'événement" },
  { id: "p2", date: "2026-02-09", libelle: "OPENROUTER INC", montant: 186.51, action: "Autoriser l'accès OpenRouter" },
  { id: "p3", date: "2026-02-15", libelle: "ANTHROPIC PBC", montant: 90, action: "Autoriser l'accès Anthropic" },
];
