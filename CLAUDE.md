# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app does

Locally masks sensitive company info (client names, codenames, internal IPs/domains/
emails) out of a `.docx` requirement document before it can leave the machine. Runs
entirely offline — no network calls of any kind touch document content. Produces a
masked `.docx` + a `mapping.xlsx` (token ↔ real value). Later, a separately-generated
result file can be uploaded back with the same `mapping.xlsx` to restore real values
into a `final_output.docx`.

This app is deliberately standalone and format-agnostic: it only knows "doc in →
masked text + mapping out" and "result doc + mapping in → real doc out." A separate,
unrelated project (`generation-app`, `~/.claude/development/projects/generation-app/`)
consumes `masked_output` and calls the Anthropic API to generate documents; the two
connect only through downloadable files, never a shared repo or process.

## Design pivot from original brief

`NEW_PROJECT.md` originally specced AES-256-GCM encryption of the mapping
(`mapping.enc.json`, scrypt-derived key from a user passphrase). **This was built,
then deliberately removed** after a user threat-model review: the original unmasked
source `.docx` already sits in plaintext on the same laptop, so encrypting only the
mapping added friction with no real protection (the unmasked source is an
equal-or-greater-sensitivity plaintext copy in the same trust boundary). There is no
`crypto.ts`, no passphrase field, and no `.enc.json` anywhere in the current code —
`mapping.xlsx` is the plaintext source of truth for both masking and unmasking.
Do not reintroduce encryption without a new explicit user request.

Also removed: a `jszip`-bundled single-download output. Chrome silently drops all
but the first of several auto-triggered downloads fired from one click, so
`masked_output.docx` and `mapping.xlsx` are two separate single-file downloads from
two separate endpoints, not a zip.

## Commands

Server (`server/`):
```
npm run dev      # tsx watch src/index.ts — dev server on :4000 (PORT env overrides)
npm run build     # tsc -p tsconfig.json
npm start         # node dist/index.js (after build)
npm test          # tsx src/lib/__manual_test__.ts — assertion-based smoke test, no test framework
```

Client (`client/`):
```
npm run dev       # vite — dev server on :5173
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview   # vite preview (serves the build output)
```

Both must be running simultaneously for the app to work (client calls the server
over HTTP at `http://localhost:4000`, overridable via `VITE_API_URL`). There is no
root-level script that starts both — start each independently.

There is no server test framework wired up — `npm test` runs a single manual script
(`server/src/lib/__manual_test__.ts`) that exercises detect → mask → docx round-trip
→ excel export → unmask with `assert()` calls and exits non-zero on failure. Extend
this file directly when adding lib-level test coverage; don't introduce a test
runner unless asked.

## Architecture

**Trust boundary is the entire point of the split between mask detection/confirmation
(client) and byte-level masking (server).** The client only ever sends already-typed
strings (extracted text, confirmed values) back to its own localhost server — it
never talks to any third-party endpoint.

### Server (`server/src/`)
- `lib/detect.ts` — regex detection (IP/email/domain) + glossary term matching against
  raw extracted text. All matching (including glossary) uses `\b` word-boundary
  regex — this was a real bug fix (bare substring match on "CI" was matching inside
  "dependencies"). `findAllOccurrences` here and the client's `lib/textMatch.ts` are
  intentionally near-duplicates (same word-boundary logic) so client-side manual
  highlighting and server-side detection stay behaviorally identical; keep them in
  sync if the matching rule changes.
- `lib/mask.ts` — `applyMask` is all-or-none per confirmed term: once a value is
  confirmed, every case-insensitive occurrence in the whole document is masked, never
  a subset (a partial mask defeats the trust boundary). Token assignment order is by
  first-occurrence position in the text (`[MASK_1]`, `[MASK_2]`, ...), not detection
  order. `applyUnmask` does a straightforward token→value substitution.
- `lib/docx.ts` — `mammoth` for read (raw text extraction only, formatting is not
  preserved), `docx` (docx.js) for write (one `Paragraph` per newline-split line).
- `lib/excel.ts` — `exceljs`; always builds a `mapping.xlsx` with a `Mapping` sheet,
  two columns (`Masked Token`, `Actual Value`).
- `lib/glossary.ts` — glossary persists to `server/data/glossary.json` (gitignored;
  may contain real client names/codenames — never commit `server/data/`). Global,
  not per-document: adding a term here affects all future detections.
- `routes/mask.ts` — three endpoints, deliberately separate so each is a single-click
  download (see Chrome multi-download note above):
  - `POST /api/mask/detect` — upload `.docx`, get back extracted text + auto-matches.
  - `POST /api/mask/finalize` — given `{ text, confirmedValues[] }`, returns the
    masked `.docx` directly as a file download. Also sets `X-Masked-Item-Count`
    (requires `cors({ exposedHeaders: [...] })` in `index.ts` — without it the
    client can't read the header cross-origin and the UI always shows 0).
  - `POST /api/mask/finalize/mapping-xlsx` — same masking pass, returns `mapping.xlsx`
    instead. Note both endpoints independently re-run `applyMask` on the same inputs
    — token assignment is deterministic (sorted by first-occurrence index), so the
    two responses stay consistent, but there's no shared masking pass between them.
  - `routes/glossary.ts` — plain CRUD over the glossary file.
  - `routes/unmask.ts` — upload result `.docx` + `mapping.xlsx`, reads the xlsx back
    into a token→value map (`Mapping` sheet, skips header row), applies substitution,
    returns the final `.docx` as base64 JSON (not a raw file stream, unlike the mask
    endpoints — client decodes and triggers the download itself).

### Client (`client/src/`)
- `App.tsx` — top-level tab switch between `MaskFlow` and `UnmaskFlow`, no shared
  state between them.
- `components/MaskFlow.tsx` — the core interaction surface:
  - Upload → `detectDocx` → renders extracted text with auto-detected matches
    highlighted (`buildSegments` merges auto + manual highlight ranges, manual wins
    on overlap).
  - **Highlight-to-mask**: `onMouseUp` on the preview reads the DOM Selection API via
    `getSelectionOffsets` (walks the selection back to a text offset within the
    preview container), extracts the selected substring, and adds it as a manual
    term. `manualRanges` then re-derives *every* occurrence of that term across the
    whole document via `findAllOccurrences` — so highlighting one instance
    auto-propagates to all matching occurrences in the preview, per the brief's
    all-or-none requirement.
  - Auto-detected matches can be individually excluded via checkbox (`excluded` set,
    keyed by lowercased value) without touching the glossary.
  - Adding a glossary term also immediately adds it as a manual term for the
    currently-loaded document (so it's caught in *this* document without needing a
    re-upload/re-detect round trip).
  - `confirmedValues` (auto minus excluded, plus manual terms) is the single source
    of truth sent to both `/finalize` and `/finalize/mapping-xlsx`.
- `components/UnmaskFlow.tsx` — independent form: result `.docx` + `mapping.xlsx` in,
  `final_output.docx` out. No shared state with `MaskFlow`.
- `lib/textMatch.ts` — client-side mirror of the server's word-boundary matching
  logic (see note above); used for live preview highlighting before anything is
  sent to the server.
- `api.ts` — thin fetch wrappers; `API_BASE` defaults to `http://localhost:4000`,
  overridable via `VITE_API_URL`.

## Known constraints worth preserving

- Never add an outbound network call from server code that transmits document text,
  extracted values, or the mapping — that would break the entire reason this app
  exists as a separate trust boundary from `generation-app`.
- `server/data/` (glossary) and any `.env*` files must stay gitignored — the
  glossary may contain real client names/codenames. This repo is public on GitHub
  (`izzatforwork/masking-app`); double-check `git status`/diff before pushing new
  files that could contain real client data (test `.docx` fixtures, ad hoc glossary
  exports, etc).
- Detection/masking must stay word-boundary-aware (`\b`-anchored) in all three
  places it's implemented (`detect.ts`, `mask.ts`, `textMatch.ts`) — a prior bug had
  substring-only matching silently mask fragments of unrelated words.
