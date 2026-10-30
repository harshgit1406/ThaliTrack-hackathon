# Mealy Working Agreement

This directory is the only writable project area for new Mealy work. The sibling repositories `../mealyapp/` and `../mealy-backend/` are read-only reference implementations. Do not edit, format, generate files in, install dependencies in, or commit inside either legacy repository unless the user explicitly reverses this rule.

## Mandatory context pass

Before changing anything, read:

1. `docs/PROJECT_CONTEXT.md`
2. `docs/DECISIONS.md`
3. `docs/TASKS.md`
4. The domain document relevant to the request
5. `docs/KNOWN_ISSUES.md`

Treat labels consistently:

- **Confirmed**: explicitly approved by the user.
- **Observed**: verified in legacy code, but not automatically approved for the new product.
- **Proposed**: a recommendation awaiting approval.
- **TBD**: uncertain or unapproved; do not silently decide it.

If a request conflicts with a confirmed decision, stop and surface the conflict. Record newly approved decisions in `docs/DECISIONS.md` and update affected documents before implementation.

## Approval and scope gate

The documentation baseline and database-foundation work were approved on 2026-09-14. Database work is authorized under `apps/backend/database/`. The clean separated-app direction was approved on 2026-09-20. Student/POS/KDS/admin implementation must still respect unresolved MVP, authentication, payment, workflow, and design decisions in `docs/PROJECT_CONTEXT.md`; do not silently copy a legacy app or commit to an unapproved user flow.

## Implementation boundaries

- Keep student/QR ordering, canteen POS, kitchen/KDS, canteen/admin management, and shared backend as explicit domains even if they share a repository.
- Build the Mealy POS as a clean application rather than importing the ProBills/Firebase application. ProBills may be inspected for workflow ideas only; do not copy its Firebase persistence, authentication, plans, or combined-app architecture.
- Keep POS billing, kitchen/KDS, student ordering, and management as separate product surfaces connected to the shared backend.
- Treat optional capabilities as backend-enforced canteen entitlements. Central admin controls enablement; disabled modules must not appear in navigation and their APIs must reject access.
- The student application and POS use separate design inspirations. Do not force one visual system onto both.
- Use real backend sources of truth. Do not leave production behavior backed by mock arrays, duplicated pricing rules, or hardcoded operational data.
- Never commit secrets. Browser-exposed environment variables are public values, not secrets.
- Add migrations for schema changes; never edit production data manually as an implementation shortcut.
- Keep API contracts versioned and update the API document/spec with implementation changes.
- Add or update tests with each behavior change and record user-visible changes in `CHANGELOG.md`.

## Required end-of-prompt Git hygiene

After every completed user prompt:

1. Run `git status --short --ignored` from `C:\Users\Harsh\Desktop\mealy`.
2. Review every new or generated file and decide whether it belongs in Git.
3. Update the root `.gitignore` when new secrets, logs, caches, dependencies, build output, editor files, uploads, or other machine-generated artifacts appear. Do not ignore source code, migrations, tests, specifications, or project documentation merely to hide an unexplained file.
4. Inspect staged changes for credentials and unrelated files.
5. Make a scoped local commit for the completed prompt. Do not push unless explicitly requested.
6. Verify the commit and report any intentionally uncommitted files.

If the request is analysis-only and produces no file changes, do not create an empty commit; report that there was nothing to commit.
