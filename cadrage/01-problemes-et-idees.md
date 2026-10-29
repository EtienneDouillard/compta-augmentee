# Cadrage : problèmes et idées (enregistrement du 28/10/2026, 12h24)

Source : enregistrement Noota « Nouvel enregistrement 28 oct. à 12:24 » (38 min).
Note : la transcription attribue au locuteur « Claude » les propos du porteur côté cabinet (libellés, taxe d'ordures ménagères, récap client). On les attribue ici à Benjamin.

## Problèmes par personne

| Qui | Problème | Idée |
|---|---|---|
| Benjamin (cabinet) | Factures multi-lignes saisies à la main (loyer, copro, CFE, taxe d'ordures ménagères). Libellés pauvres : « la compta raconte une histoire ». | Compte proposé par défaut + mémoire : une fois une ligne affectée, l'IA s'en souvient pour ce fournisseur. Récap client interactif à la place des 60 tags. |
| Julien V. (cabinet, immobilier) | L'OCR ne sépare que HT / TVA, sans périodicité du loyer. | Split par ligne, affecté selon le plan de comptes propre à chaque dossier. « On dépose un zip, on récupère bon libellé, bon split, TVA vérifiée. » |
| Expert-comptable | OCR mauvais sur le multi-taux, règles Pennylane peu fiables. | A déjà fait récupérer des factures fournisseurs par Claude via Chrome. |
| Simon (cabinet, transport fluvial) | Données extra-financières perdues (litres, adresses départ/arrivée, km). | Les extraire des factures pour du conseil : marge à la tonne vs carburant consommé. |
| Stéphane (cabinet) | Ventes extraites en Excel d'un logiciel de gestion, sur une ligne globale. | Import de n'importe quel fichier, individualisation par client, lettrage auto (n° facture, montant), états d'anomalies. Rappel : la facture électronique va réduire le besoin d'OCR. |
| Étienne (client) | 61 transactions non justifiées, une demi-journée par mois à chercher les factures. | Donner une seule fois l'autorisation (email dédié sur chaque outil) et l'agent va chercher les factures tous les mois. |

## Conseils de l'équipe IA Pennylane

- Le MCP a les mêmes droits que l'utilisateur : tout ce qu'on fait à la main, il peut le faire.
- La lecture des factures se fait par l'agent (Claude), pas par l'OCR Pennylane. La facture électronique est déjà structurée : 100 % exploitable.
- Restitution : commencer par un simple mail récap, la mini-app interactive seulement si on a le temps.
- Pas de messagerie entre client et cabinet dans le récap (on réinventerait une messagerie).
- Pour l'accès aux outils du client : plutôt une adresse mail du cabinet ajoutée au compte que des identifiants.
- Se mettre d'accord sur les étapes et sur le problème que chaque étape résout. Plus on traite de problèmes, plus c'est complexe.

## Schéma (carte du flux)

```
SOURCES                      1. RÉCUPÉRER            2. LIRE ET VENTILER           3. RAPPROCHER         4. RESTITUER
PDF achats, e-factures  ──►  Agent va chercher  ──►  Lecture ligne à ligne    ──►  Lettrage auto     ──►  Récap client (mail
(PA), mails, comptes         les pièces manquantes   Libellé propre                 n° facture/montant     puis mini-app)
SaaS, Excel ventes           (Étienne, EC)           Split par compte du dossier    Anomalies             Pilotage / conseil
                                                     Mémoire par fournisseur        (Stéphane)            (Benjamin, Simon)
                                                     Données extra-fin. (Simon)
                                                     (Benjamin, Julien, EC)
                                    ▲                                                                          │
                                    └──────────── le client autorise l'accès ou dépose la pièce ◄──────────────┘

Validation humaine avant toute écriture dans Pennylane.
```

Le cœur commun (4 personnes sur 6) : l'étape 2, lire et ventiler les factures d'achat multi-lignes.
