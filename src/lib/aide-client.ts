// Help texts of the client space (retour de Julien, 29/10/2026): plain words, no accounting jargon, and for each
// choice when to use it and what happens next. Legal mentions reuse the sources already checked in no-invoice.ts.

export type Choix = "source" | "upload" | "email" | "none" | "cabinet";

export type AideChoix = { quand: string; apres: string };

/** For each answer the client can give: when to pick it, then what happens once it is done. */
export const AIDE_CHOIX: Record<Choix, AideChoix> = {
  source: {
    quand:
      "Pour un fournisseur qui vous facture régulièrement (téléphone, internet, logiciel, énergie…). Vous le configurez une seule fois, guidé pas à pas.",
    apres:
      "Les factures suivantes de ce fournisseur sont récupérées seules chaque mois. Vous n'avez plus rien à faire pour lui, sauf si nous vous signalons un souci.",
  },
  upload: {
    quand:
      "Vous avez la facture sous la main : un PDF, un scan ou une photo nette. C'est la réponse la plus rapide.",
    apres:
      "La facture est lue aussitôt (fournisseur et montant) et comparée au paiement : un message s'affiche ici si quelque chose ne correspond pas. Votre cabinet la vérifie ensuite et l'enregistre dans votre comptabilité.",
  },
  email: {
    quand:
      "La facture se trouve dans votre messagerie : il suffit de la transférer à l'adresse de votre dossier.",
    apres:
      "Elle arrive directement dans votre dossier chez votre cabinet. Cliquez ensuite sur « C'est fait » pour que la ligne passe en « Transféré par e-mail ».",
  },
  none: {
    quand:
      "Il n'existe pas de facture pour ce paiement (achat personnel, virement entre vos comptes, frais bancaires…) ou elle est introuvable.",
    apres:
      "Votre comptable lit votre explication et décide du traitement ; il revient vers vous si besoin. Un mot d'explication lui fait gagner du temps.",
  },
  cabinet: {
    quand:
      "Vous ne retrouvez pas la facture et préférez que votre cabinet la demande lui-même au fournisseur.",
    apres:
      "Votre cabinet reçoit l'e-mail prêt à partir et écrit au fournisseur à votre place. La ligne reste « À faire » jusqu'à l'arrivée de la facture.",
  },
};

/** Help for "Demandez-la au fournisseur": nothing is sent by the app. */
export const AIDE_DEMANDE =
  "Le message s'ouvre dans votre propre messagerie : relisez-le, rien n'est envoyé sans vous. Dès que le fournisseur vous répond, revenez déposer la facture ici.";

/** Subtitles of the client screens, one per title. */
export const SOUS_TITRES = {
  accueil:
    "Votre cabinet a vérifié vos relevés bancaires : voici les paiements pour lesquels il lui manque encore la facture. Cliquez sur « Je continue », nous vous guidons fournisseur par fournisseur.",
  achats: "Ce que vous avez payé : la facture vient de votre fournisseur.",
  ventes:
    "Ce que vous avez encaissé : la facture est celle que vous avez établie pour votre client.",
  paiements:
    "Ce sont les paiements vus sur votre compte bancaire. Ils sont tous cochés : votre réponse s'appliquera aux lignes cochées. Décochez celles qui ne sont pas concernées.",
  choix:
    "Choisissez la réponse qui vous convient. Chaque option explique ce qui se passera ensuite.",
  sources:
    "Une source, c'est l'endroit où un fournisseur met vos factures à disposition (votre espace client sur son site, un e-mail…). Configurée une fois, elle permet de récupérer les factures suivantes sans rien faire.",
} as const;

/** Small "?" tips. */
export const INFOBULLES = {
  statuts:
    "« À faire » : la facture est attendue. « En cours » : une partie des paiements est traitée. « Terminé » : plus rien à faire pour ce fournisseur.",
  libelle:
    "Le texte tel qu'il apparaît sur votre relevé de compte : il aide à retrouver de quel achat il s'agit.",
  selection:
    "Cochez plusieurs fournisseurs pour leur donner la même réponse en une seule fois (déposer, e-mail ou pas de facture).",
  ordre:
    "« Par priorité » place en premier ce qui reste à faire, le montant le plus élevé d'abord. Vous pouvez aussi trier par montant ou par nom.",
  recupAuto:
    "Nombre de fournisseurs dont les factures sont récupérées automatiquement chaque mois. Plus il y en a, moins vous aurez de factures à chercher.",
} as const;

export type EtapeVisite = { titre: string; texte: string };

/** Mini-tour shown on the client's first visit, in 3 steps. */
export const VISITE: EtapeVisite[] = [
  {
    titre: "Votre cabinet a besoin de quelques factures",
    texte:
      "Chaque ligne est un paiement vu sur votre compte bancaire pour lequel il manque la facture. Les fournisseurs sont classés par montant à justifier, le plus élevé en premier.",
  },
  {
    titre: "Pour chaque fournisseur, une réponse",
    texte:
      "Déposez la facture, transférez-la par e-mail, automatisez sa récupération ou indiquez qu'il n'y en a pas. Chaque choix est expliqué à l'écran avant que vous le confirmiez.",
  },
  {
    titre: "Votre cabinet s'occupe de la suite",
    texte:
      "Vos réponses sont enregistrées au fur et à mesure : vous pouvez vous arrêter et reprendre quand vous voulez. Une question ? L'assistant, en bas à droite de l'écran, vous répond.",
  },
];

/** What happens once the client has answered everything. */
export const APRES_TERMINE = [
  "Votre cabinet vérifie les factures reçues et les enregistre dans votre comptabilité.",
  "S'il manque une précision, votre comptable vous recontacte.",
  "Si de nouveaux paiements arrivent sans facture, ils apparaîtront ici : vous pouvez revenir à tout moment.",
] as const;
