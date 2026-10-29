# Projet d'automatisation comptable : Pennylane × Claude MCP

## 1. Objectif du projet

Développer une solution d'automatisation comptable intelligente en connectant Pennylane à Claude via MCP (Model Context Protocol), avec la possibilité de lire, analyser, enrichir et modifier les écritures comptables.

L'objectif est de dépasser les limites de l'OCR natif de Pennylane, notamment pour les factures complexes, tout en améliorant la qualité de la comptabilisation et en simplifiant les échanges avec les clients.

Le projet s'articule autour de deux axes :

- **Phase 1** : automatisation et enrichissement de la comptabilisation des factures.
- **Phase 2** : identification des factures manquantes et gestion proactive des demandes clients.

## 2. Phase 1 : traitement intelligent des factures complexes

### A. Ventilation automatique des factures multilignes

**Problématique actuelle**

L'OCR natif de Pennylane ne permet pas toujours une ventilation comptable suffisamment détaillée. Certaines factures comprennent plusieurs natures de charges qui nécessitent des comptes comptables et des libellés distincts.

**Fonctionnalités envisagées**

- Analyser le contenu intégral de la facture avec Claude.
- Identifier les différentes natures de charges.
- Décomposer automatiquement une facture en plusieurs lignes comptables.
- Affecter le compte comptable adapté à chaque ligne.
- Vérifier la cohérence entre le total des lignes, la TVA et le montant TTC.
- Proposer une ventilation à valider avant écriture dans Pennylane.

**Exemple : facture de loyer commercial**

| Nature de la charge | Compte indicatif | Libellé enrichi |
|---|---|---|
| Loyer | 6132 | Loyer, octobre 2026 |
| Charges de copropriété | 614 | Charges copropriété, oct. 2026 |
| Taxe foncière refacturée | 614 ou compte existant adapté | Taxe foncière 2026 |
| Taxe d'enlèvement des ordures ménagères | Compte existant adapté | TEOM 2026 |

Les comptes sont indicatifs : l'affectation devra respecter le plan comptable et les pratiques de chaque dossier, ainsi que la nature exacte des charges.

### B. Enrichissement automatique des libellés comptables

**Problématique actuelle**

Les libellés générés par l'OCR de Pennylane sont souvent trop génériques et ne permettent pas d'identifier facilement la nature, la période ou l'objet de la dépense.

**Fonctionnalités envisagées**

Extraire automatiquement les informations clés présentes sur la facture et les intégrer dans les libellés comptables :

- Période concernée (mois, trimestre, année).
- Nature précise de la prestation ou de la charge.
- Référence contractuelle ou numéro de facture.
- Adresse du local ou site concerné.
- Autres éléments utiles propres au fournisseur ou au dossier.

**Exemple**

| Libellé OCR Pennylane | Libellé proposé par Claude |
|---|---|
| FACTURE FONCIERE 2026 | Taxe foncière 2026, local Paris 8e, refacturation bailleur |

L'objectif est de disposer de libellés normalisés, pertinents et exploitables pour la révision comptable, le reporting et la recherche d'écritures.

### C. Proposition intelligente des comptes comptables

**Problématique actuelle**

L'affectation automatique peut manquer de cohérence avec les pratiques comptables historiques du dossier et conduire à multiplier inutilement les comptes.

**Fonctionnalités envisagées**

- Analyser les écritures antérieures du même fournisseur.
- Identifier les comptes comptables déjà utilisés.
- Comparer les factures similaires précédemment traitées.
- Privilégier systématiquement les comptes existants dans le dossier.
- Détecter les incohérences avec l'historique de comptabilisation.
- Proposer un nouveau compte uniquement lorsqu'aucun compte existant n'est approprié, après validation humaine.

**Principe clé** : Claude doit s'appuyer prioritairement sur l'historique comptable du dossier, et non uniquement sur une proposition théorique issue du Plan comptable général.

## 3. Phase 2 : identification des factures manquantes et suivi client

### A. Détection intelligente des pièces manquantes

**Problématique actuelle**

Le suivi des factures manquantes repose sur des vérifications manuelles et des échanges dispersés avec les clients. Les montants non rapprochés ou non lettrés ne permettent pas toujours de comprendre immédiatement l'origine du problème.

**Fonctionnalités envisagées**

- Analyser les transactions bancaires et les écritures fournisseurs non rapprochées ou non lettrées.
- Identifier les paiements pour lesquels aucune facture justificative n'est disponible.
- Identifier les écarts entre les factures et les règlements.
- Regrouper les anomalies par fournisseur et par période.
- Distinguer les véritables pièces manquantes des acomptes, paiements partiels, doublons ou écarts de règlement.
- Proposer automatiquement une demande d'explication lorsque la situation est ambiguë.

### B. Création d'une vue globale orientée client

Développer un tableau de bord simple, compréhensible par un dirigeant ou un responsable administratif non comptable.

**Documents et opérations à régulariser (exemple illustratif, octobre 2026)**

5 actions : 3 factures manquantes, 1 écart de montant, 1 à clarifier.

| Fournisseur | Montant | Action attendue |
|---|---|---|
| EDF | 320 € | Fournir facture |
| Orange | 89 € | Fournir facture |
| Bailleur | 2 450 € | Expliquer l'écart |
| Amazon | 165 € | Fournir facture |
| Virement inconnu | 780 € | Préciser l'objet |

L'objectif est de transformer une liste d'anomalies comptables en actions claires et directement compréhensibles par le client.

### C. Accompagnement du client dans la récupération des factures

Pour chaque facture manquante, proposer au client plusieurs possibilités :

1. Télécharger la facture depuis son espace fournisseur (EDF, Orange, Amazon, etc.) puis l'importer dans Pennylane.
2. Demander la facture au fournisseur, avec un message prérempli précisant le montant, la date et les références du paiement.
3. Téléverser directement le document dans une interface dédiée.
4. Apporter une explication lorsque l'opération ne correspond pas à une facture classique.

L'objectif est de réduire les échanges par email et de centraliser la résolution des anomalies dans une interface intuitive.

### D. Suivi des demandes et relances

Fonctionnalités complémentaires à envisager :

- Statut des demandes : à traiter, en cours, document reçu, résolu.
- Historique des échanges et documents transmis.
- Relances automatiques en cas d'absence de réponse.
- Priorisation selon l'ancienneté et le montant.
- Mise à jour des demandes dès qu'une facture est ajoutée dans Pennylane, après vérification du rapprochement.

## 4. Architecture fonctionnelle envisagée

```
┌───────────────────────────────────────────────────────────────────┐
│ Pennylane                                                         │
│ Factures · Écritures comptables · Historique fournisseurs ·       │
│ Transactions bancaires                                            │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│ Connecteur MCP / API                                              │
│ Lecture des données · Échanges sécurisés · Écriture contrôlée     │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌───────────────────────────────▼───────────────────────────────────┐
│ Claude, moteur d'analyse IA                                       │
│ Lecture des factures · Ventilation multilignes ·                  │
│ Cohérence historique · Détection des anomalies                    │
└───────────────┬───────────────────────────────────┬───────────────┘
                │                                   │
┌───────────────▼───────────────┐   ┌───────────────▼───────────────┐
│ Phase 1                       │   │ Phase 2                       │
│ Propositions comptables et    │   │ Portail client et             │
│ validation dans Pennylane     │   │ régularisation des pièces     │
│                               │   │ manquantes                    │
└───────────────────────────────┘   └───────────────────────────────┘
```

Schéma conceptuel : les possibilités réelles de lecture et d'écriture via le connecteur MCP/API Pennylane devront être vérifiées avant le développement.

## 5. Priorités et feuille de route

| Priorité | Fonctionnalité | Phase |
|---|---|---|
| P1 | Lecture et analyse des factures complexes | 1 |
| P1 | Ventilation automatique en plusieurs lignes | 1 |
| P1 | Enrichissement des libellés comptables | 1 |
| P1 | Réutilisation des comptes comptables existants | 1 |
| P1 | Validation avant écriture dans Pennylane | 1 |
| P2 | Analyse des transactions et factures non rapprochées | 2 |
| P2 | Tableau de bord des factures manquantes | 2 |
| P2 | Interface client de régularisation | 2 |
| P3 | Automatisation des demandes fournisseurs et des relances | 2 |

## 6. Points techniques à vérifier

Avant de développer, plusieurs éléments nécessitent une validation :

- **Capacité d'écriture** : vérifier si le connecteur MCP de Pennylane permet de modifier une facture fournisseur, ses lignes, ses comptes et ses libellés, ou si des appels API complémentaires sont nécessaires.
- **Accès à l'historique** : pouvoir consulter les écritures passées, les fournisseurs et le plan de comptes de chaque dossier.
- **Contrôles comptables** : garantir l'équilibre des montants HT/TVA/TTC, la bonne affectation de la TVA et l'absence de doublons.
- **Sécurité** : prévoir des droits d'accès par dossier, une journalisation des modifications et une validation humaine des propositions sensibles.
- **Fiabilité** : distinguer les données réellement extraites de la facture des informations simplement déduites par l'IA.
- **Interface client** : déterminer si la seconde phase peut être intégrée à Pennylane ou doit prendre la forme d'un portail externe connecté.

## 7. Résultat attendu

Le projet doit permettre de faire évoluer Pennylane d'un outil de collecte et de précomptabilisation des factures vers un processus comptable intelligent, cohérent avec l'historique du dossier et orienté client.

À terme, trois bénéfices principaux sont recherchés :

1. Réduire le temps de saisie et de révision des factures complexes.
2. Améliorer la qualité et la cohérence des données comptables.
3. Diminuer le temps consacré à la recherche des justificatifs et aux relances clients.

## Recommandation pour le premier MVP

Commencer avec les factures de loyers et charges immobilières, qui présentent des schémas récurrents, plusieurs natures de charges et des informations exploitables dans les libellés. Cela permettra de tester la pertinence de Claude, la réutilisation de l'historique comptable et surtout la capacité d'écriture dans Pennylane, avant d'étendre le système à d'autres types de factures.
