# Pragati development

- Local-first JEE prep app. The original design and implementation review are in `jee_prep_design.md`, especially section 16. Never describe demo sign-in, sample questions, fixed reports, or taxonomy retrieval as production auth, reviewed JEE content, AI, or vector search.
- Frontend: `npm ci`, then `npm run dev` (127.0.0.1:3000). Requires Node >=20.9. Next proxies `/api` to FastAPI on port 8000. Fonts are bundled locally.
- Backend: from `backend`, run `uv sync --locked`, then `uv run uvicorn main:app --host 127.0.0.1 --port 8000`. Requires Python >=3.11. SQLite is initialized and seeded on first startup. Do not delete an existing database to reseed it.
- Verification: from `backend`, `uv run pytest -q`; from root, `npm run typecheck`, `npm run build`, and `npm run test:e2e`. Install test Chromium once with `npx playwright install chromium`. Browser tests own servers on ports 8001/3001 and use a separate SQLite database and Next output directory.
- For a build while the dev server is running: `JPI_BUILD_DIR=.next-build npm run build`, followed by `JPI_BUILD_DIR=.next-build npm run start` when using that artifact. Default build/start both use `.next`.
- Frontend formatting: `npx prettier --write app components tests next.config.ts playwright.config.ts tsconfig.json`. Backend formatting/checks, from `backend`: `uv run ruff format .` and `uv run ruff check --select F .`.
- Browser-preview proxies with a different origin need that exact origin in `JPI_FRONTEND_ORIGIN` when starting FastAPI. Do not allow arbitrary origins. Test databases are fresh temporary files, isolated from the local demo database.
- Use the standard API error envelope. Mutations require `X-JPI-Request: 1`; browser requests must come from an approved local origin. Sessions are server-side and cookies are HttpOnly.
- Analytics use completed ISO weeks in Asia/Kolkata. Practice/homework answers must not change test analytics. Never expose solutions before the student's own submission.
- Preserve atomic imports, batch ownership checks, unique submissions, three-level recommendation ancestry, and actual-source paper quotas. Do not relax security checks to make tests pass.
