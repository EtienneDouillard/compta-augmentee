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

- Data lives in Lovable Cloud tables (dossiers, factures, lignes, pieces_manquantes, journal); cabinet staff = any signed-in user (prototype), because Phase 1 has a single cabinet.
- The client portal `/client/$token` is public and authorised only by the dossier's secret `client_token`, checked in server functions (`src/lib/client-portal.functions.ts`), because clients have no account.
- Ventilation math and rules live in `src/lib/ventilation.ts`, tested in `src/test/ventilation.test.ts`, so UI and future Pennylane writes share one source of truth.
