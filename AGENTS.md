<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- This app is Julien's « PBC List » (factures-manquantes repo) merged with « Comptabilité augmentée »: PBC List is the base; the ventilation/livre de lecture screen lives at `/app` on the legacy tables (factures, lignes, pieces_manquantes, journal), cabinet role only, because those features had no equivalent in PBC List.
- The client portal `/client/$token` is public and authorised only by the dossier's secret `client_token`, checked in server functions (`src/lib/client-portal.functions.ts`), because clients have no account.
- Ventilation math and rules live in `src/lib/ventilation.ts`, tested in `src/test/ventilation.test.ts`, so UI and future Pennylane writes share one source of truth.
- Writing to Pennylane lives only in `src/lib/pennylane-write.beta.ts` behind the `PENNYLANE_ECRITURE_ACTIVE` switch, so one flag can stop every write.
- `envoyerPennylane` and `envoyerGroupe` (saisie.functions.ts) write to Pennylane on the hackathon demo dossiers only (`isDemoCompany`, checked again in `envoyerFacture`), as Julien decided on 29/10/2026; every other dossier is refused.
- Splitting an invoice by nature (one account per invoice line, multi-month services cut between expense and 486) lives in `src/lib/eclatement.ts`, tested in `src/lib/eclatement.test.ts`; invoice lines are read from the uploaded document by AI in `src/lib/piece.functions.ts`, because Pennylane does not expose invoice line details or PDFs.
## Architecture rules
- Subdirectories have their own `AGENTS.md` (e.g. `src/lib/AGENTS.md`: saisie, dépôt client, envoi groupé, skip rules); read it before changing files there.
- Invoice source setup lives separately from upload and accounting states in invoice_sources; saved paths are not active collectors, and direct supplier-to-Pennylane email must never be labelled Claude-verified because CA+ does not receive it first.
- Assistant actions are schema-validated proposals executed only after an explicit cabinet confirmation; reuse the existing sync, analysis and invoice-reading functions, and never expose Pennylane writes to chat, so workflow safeguards remain authoritative.
- Roles live in `user_roles` (cabinet/client); client access is scoped by `dossier_members` via `is_member()` in RLS — never filter by dossier only in the UI.
- Client accounts are created only by cabinet through `createClientAccount` (admin API), and further cabinet accounts through `createCabinetAccount` (Paramètres du cabinet); the first cabinet account is bootstrapped only while none exists, and only from the cabinet sign-in page. Client and cabinet have separate sign-in pages; route guards (`requireCabinet`/`requireClient`) are UX only, RLS stays the boundary.
- Files go to private bucket `factures` at `<dossier_id>/<transaction_id>/<file>`; storage RLS depends on that first folder segment.
- Supplier grouping: `supplier_detected` comes from `normalizeSupplier()`; cabinet corrections are stored in `supplier_aliases` and applied to `transactions.supplier` (sync must reapply aliases).
- Transactions no longer requiring a document are set `is_open=false` by sync, not deleted, to keep client answers/history.
- Never store third-party supplier credentials (GDPR requirement).
- Pennylane sync uses the MCP server first (`src/lib/mcp.server.ts`, OAuth tokens AES-GCM-encrypted in locked table `mcp_connection`), API v2 only as fallback — one detection function shared by both so results stay identical.
- pkce-challenge is aliased in vite.config.ts to its browser build because it exports no workerd condition (build fails otherwise).
- Firm identity (name, e-mail, phone, logo) is the single row `cabinet_settings` (id = 1), readable by anon because the client sign-in page shows it; logo in private bucket `logos` (written by the cabinet only), served to everyone through a signed URL by `getCabinetIdentity`. Read it with `useCabinet()` (src/lib/cabinet.ts).
- Priority rule (Julien): the Pennylane MCP is used ONLY on the hackathon demo companies listed in `src/lib/demo-dossiers.ts`. `openMcp().call` refuses any tool aimed at another company, and other dossiers sync through the API (source "API", not an error). Only Julien extends that list.
- Claude key and model are resolved per call by `claudeFor()` (src/lib/claude-config.server.ts): key typed in Paramètres (AES-GCM in locked `ai_key`) else the ANTHROPIC_API_KEY secret; model per role in `ai_settings` (model_cabinet / model_client), so no call site hardcodes a model.
- Robot CA+ (`extension/`, zipped to `public/ca-plus-robot.zip`, card `src/components/RobotChrome.tsx`): the Chrome extension is the primary "Automatiser" path; its content script `bridge.js` links it to the app page (postMessage), so the user installs once then clicks "Lancer le robot" (no code to paste). It opens the supplier page in the user's own logged-in Chrome, finds invoices and posts them to `/api/public/collector`, authorised only by a token stored hashed in `collector_tokens` (no cookies or passwords leave the browser); the route attaches the file to an open payment and runs `traiterDepotRobot`. Manual drop and the bookmarklet stay folded under "À la main".
- Claude's reading returns `type_document` (facture, avoir, proforma, devis, bon_de_commande, autre), kept in `saisies.lecture` and read back as `lecture->>typeDocument` (older readings count as facture). A proforma, a quote or an order form never counts towards the payment, keeps the request open and is never sent to Pennylane (`TYPE_NON_VALABLE`, `src/lib/type-document.ts`).
- Supplier request e-mail (`src/lib/demande-fournisseur.ts`) and "photo hors facture" (comment `PHOTO_SANS_FACTURE_COMMENT`, no Claude reading, no VAT) are client-side only: no e-mail is sent by the app, no column added.
- Supplier logos (`src/lib/logos.ts`): the favicon of the supplier's own site (invoice source URL, else a short list of well-known suppliers), loaded by the browser, initials as fallback; nothing stored, no logo service.
- Several dossiers per client: `meQuery` lists the client's `dossier_members` rows and picks the active one from the browser (`chooseDossier`, localStorage), the first otherwise. `createClientAccount` adds a dossier to an e-mail that is already a client instead of failing.
- Cabinet preview of a client space (`startPreview` / `stopPreview`, `me.preview`): `requireClient` lets a cabinet user in only in preview; every client action is blocked in `useDepot` and the choice cards are inert. RLS is unchanged (the cabinet already reads every dossier).
- "Mon cabinet contacte le fournisseur": the client's authorisation goes to `cabinet_questions` (with the prepared e-mail) and a comment on the payments; the supplier e-mail comes from Claude's readings (`lecture->>emailFournisseur`, `emailsFournisseur`) or is typed by the client. The app never writes to the supplier.
