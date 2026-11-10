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

## Architecture
- The PharmEmerg app lives in `src/pharm/` (ported from the original repo; legacy files carry `@ts-nocheck`) and renders at `/play` behind `_authenticated`. Why: keeps the ported app intact while routing stays TanStack.
- New cases come from `getNextCases` in `src/pharm/cases.functions.ts`: reuse unsolved cases from the shared `global_cases` pool first, only call Groq for the shortfall, and save every generated case to the pool. Why: limits AI API usage across accounts.
- Per-account data (`user_progress`, `user_case_attempts`) is RLS-scoped to the owner; `global_cases` is readable by all signed-in users. Why: shared case library, private progress.
- Every case has one canonical `anatomicalSite` (`src/pharm/data/anatomy.ts`); `affectedBodyRegion`, focus labels, diagrams and treatment targets derive from it, and `validateCaseAnatomy` (tested in `anatomy.test.ts`, applied to AI cases) rejects text naming a different location. Why: location fields must never contradict each other in a medical simulation.
