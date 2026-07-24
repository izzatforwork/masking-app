# master-prompt.md — masking-app

A start-to-finish prompt/guide that could rebuild this project from scratch,
synthesized from the original brief, actual build order, and closure learnings.
Written 2026-07-24 at project closure.

## What to tell Claude Code, from a cold start

> Build a local-only web app that masks sensitive company info (client names,
> codenames, internal IPs/domains/emails) out of a `.docx` requirement document
> before any of it can leave the machine — so it's safe to hand off to a separate
> app that calls an external LLM API. Nothing about the document content or the
> real values should ever touch the network. Two-step flow:
>
> 1. **Mask**: upload a `.docx` → extract text (mammoth) → auto-detect sensitive
>    terms via regex (IPs, emails, domains) + a user-maintained glossary
>    (case-insensitive, word-boundary matched) → user reviews a preview, can
>    exclude auto-detected terms, and can highlight any other text in the preview
>    to mark it for masking too (highlighting one instance must auto-propagate to
>    every other occurrence of that same text in the document — no partial
>    masking, ever) → confirm → produces `masked_output.docx` (docx.js) as one
>    download, and `mapping.xlsx` (exceljs, token ↔ real value columns) as a
>    second, separate download.
> 2. **Unmask**: later, upload a result `.docx` (produced elsewhere, still
>    containing `[MASK_n]` tokens) + the `mapping.xlsx` from step 1 → substitute
>    tokens back to real values → download `final_output.docx`.
>
> Stack: Node + TypeScript + Express backend, React + TypeScript + Vite frontend,
> two independent `npm run dev` processes (server on :4000, client on :5173, no
> shared root script). No database — glossary persists to a gitignored JSON file
> on disk. No test framework — a single assertion-based manual script
> (`__manual_test__.ts`) exercises the core lib functions end-to-end.
>
> **Do NOT add encryption or a passphrase to the mapping file, and do NOT bundle
> outputs into a zip.** Both were tried and explicitly rejected — see "Design
> pivots" below. Ship the plain two-file-download version directly.

## User flow (as actually built)

1. Upload a requirement `.docx`.
2. Server extracts raw text (mammoth) and runs `detectAll`: regex (IP/email/domain,
   word-boundary anchored) + glossary term matching (also word-boundary anchored,
   case-insensitive). Returns matches to the client.
3. Client renders the extracted text with auto-detected matches highlighted. User
   can uncheck any auto-detected term to exclude it, or select/highlight any other
   text in the preview via the DOM Selection API to mark it for masking — this
   client-side highlight uses the same word-boundary matching logic
   (`textMatch.ts`, deliberately kept in sync with the server's `detect.ts`) to
   find and highlight every other occurrence of that same text live in the
   preview, and the term is also added to the session's confirmed list.
4. User can add terms to the persistent glossary directly from this screen — doing
   so also immediately marks it for masking in the currently-loaded document.
5. On confirm, the client sends the extracted text + the full confirmed-values list
   to two separate endpoints:
   - `POST /api/mask/finalize` → returns `masked_output.docx` directly as a file
     download (with `X-Masked-Item-Count` header — requires `cors({
     exposedHeaders: [...] })` server-side or the client can't read it).
   - `POST /api/mask/finalize/mapping-xlsx` → returns `mapping.xlsx` as a second,
     separate download.
   These are two separate single-click downloads, not one bundled zip — Chrome
   silently drops all but the first of several auto-triggered downloads fired
   from one click.
6. Later, separately: user uploads a result `.docx` (tokens still present) +
   `mapping.xlsx` to `POST /api/unmask`, which reads the xlsx back into a
   token→value map and returns the substituted `final_output.docx` as base64 JSON
   (client decodes and triggers the download).

## Design pivots from the original brief

- **Mapping encryption (AES-256-GCM + scrypt passphrase) was built, then
  deliberately removed.** The original brief called for an encrypted
  `mapping.enc.json` requiring a passphrase to unmask. This was implemented in the
  first MVP build, then removed in a follow-up session after the user's own
  threat-model review: the original unmasked source `.docx` already sits in
  plaintext on the same laptop, so encrypting only the mapping added friction
  (an extra passphrase field on both mask and unmask) with no real protection —
  an equal-or-greater-sensitivity plaintext copy of the same data already exists
  in the same trust boundary. `mapping.xlsx` is the plaintext source of truth for
  both directions now. **Do not reintroduce encryption without a fresh, explicit
  user request** — see the standing decision on shipping the simplest version
  first (`DECISIONS.md`).
- **Zip-bundled single download → two separate single-file downloads.** Also
  built first, also removed. Chrome's multi-download protection silently dropped
  2 of 3 auto-triggered downloads when everything was bundled into one zip via
  `jszip`; splitting into two independent endpoints/downloads (each its own user
  click) sidesteps the browser behavior without needing to bundle anything.
- **Word-boundary matching was a real, user-discovered bug**, not part of any
  pivot: bare substring matching on glossary term "CI" was matching inside
  "dependencies." Fixed with `\b`-anchored regex in all three places matching
  logic lives — `server/src/lib/detect.ts`, `server/src/lib/mask.ts`, and
  `client/src/lib/textMatch.ts`. Keep these three in sync if the matching rule
  ever changes again.

## Key technical decisions

- **Detection is regex + user-maintained glossary only — no NER**, per the
  brief's explicit choice not to add ML-based detection speculatively. Revisit
  only if real testing shows regex + glossary misses real cases.
- **All-or-none masking per confirmed term**: once a value is confirmed (auto or
  manual), every case-insensitive, word-boundary-matched occurrence in the whole
  document is masked — never a subset. A partial mask would defeat the app's
  entire trust-boundary purpose.
- **Token assignment order is by first-occurrence position in the text**
  (`[MASK_1]`, `[MASK_2]`, ...), not detection order — keeps output deterministic
  and readable.
- **`mapping.xlsx` is always generated whenever at least one item is masked** —
  not optional/on-request. This was an explicit brief requirement, unaffected by
  the encryption removal (it was always meant to be the human-readable
  convenience copy; it just became the *only* copy after encryption was dropped).
- **This app is deliberately generation-use-case-agnostic** — it only knows
  "doc in → masked text + mapping out" and "result doc + mapping in → real doc
  out," so it stays reusable by future generation apps beyond the paired
  `generation-app` project. Don't couple it to any specific downstream document
  template or use case.

## Verification approach

Verified via real HTTP calls (curl) plus live browser interaction driven through
`claude-in-chrome` — not just unit tests. A DOM Selection API workaround (JS-driven
selection rather than pixel-coordinate clicks) was needed for reliable text
highlighting in the browser-automation environment; reuse that approach if
automating this UI again. The manual test script
(`server/src/lib/__manual_test__.ts`) covers detect → mask → docx round-trip →
excel export → unmask with `assert()` calls; extend it directly for new lib-level
coverage rather than introducing a test runner.

## Learnings to carry into future projects

- **Don't lock "hardening" features (encryption, extra confirmation/bundling
  steps) into a brief by default** — state their concrete cost alongside the
  benefit during the kickoff interview and get a deliberate confirmation, not a
  passive "sounds good." This project shipped two such features (encryption, zip
  bundling) that were both walked back post-build once real use revealed the
  friction outweighed the benefit. Ship the simplest version first; let the user
  request hardening once they've actually felt the need for it.
- Client-side and server-side text-matching logic that must behave identically
  (here: word-boundary term matching for live preview vs. actual masking) is
  worth keeping as near-duplicate, clearly cross-referenced functions rather than
  trying to share code across a client/server boundary — simpler to keep in sync
  by comment than to engineer a shared package for two small functions.
