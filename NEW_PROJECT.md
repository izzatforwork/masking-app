# New Project Brief

## Pre-flight checklist
- [x] Started via ai-os skill kickoff (consulted, brief interviewed, plan approved) —
      folder, this file, and the PROJECTS.md row created as part of that flow.
- [ ] git repo initialized + first commit made.
- [x] git identity configured on this machine (user.name / user.email confirmed:
      Izzat / izzatforwork@gmail.com).
- [ ] No MCP server dependency for this project.
- [x] Claude can test/verify this directly in-session (local web app, runnable via
      `npm run dev`, not manual-only like a browser extension).
- [ ] N/A — not a manual-only-verification project type.

## Goal
Ingest a client requirement document (.docx) and locally mask all sensitive company
info (client names, codenames, internal IPs/domains/emails) before any of it can
leave the machine — so it's safe to hand off to a separate app that calls an
external LLM API. This app owns the only decryption key; nothing downstream can
ever reconstruct real data without coming back through here.

## User flow
1. Upload a requirement `.docx`.
2. App runs local-only detection: regex (IPs, emails, domains) + a user-maintained
   glossary (client names/codenames, case-insensitive/fuzzy matching). No network
   calls during detection.
3. User reviews a preview/diff of everything flagged for masking, can add missed
   terms to the glossary before continuing (human-confirm gate — the real safety
   net on top of regex/glossary). **Additive highlight-to-mask:** the user can also
   manually highlight/select any other text in the preview and mark it for masking
   — auto-detection still runs as normal, this just catches whatever it missed.
   **Highlighting one instance auto-propagates to every other exact-match
   occurrence of that same text in the document** (case-insensitive, same matching
   logic as the glossary) — the preview updates to show all newly-caught instances,
   and the term is added to the session glossary so a later re-scan also catches it.
   This app never masks "some occurrences" of a term, only all-or-none, since a
   partial mask would defeat the whole point of the trust boundary. Every confirmed
   item (auto-flagged or manually highlighted) becomes a token → real-value pair.
4. User enters a passphrase. App encrypts the token→real-value mapping
   (`mapping.enc.json`, AES-256-GCM, key derived via scrypt from the passphrase —
   never stored in plaintext) and produces `masked_output.txt`/`.docx`.
   **Whenever at least one item was masked, the app also always generates
   `mapping.xlsx`** (not optional) — a plain, human-readable spreadsheet with one
   row per masked item, with columns for the masked token and the actual real
   value, covering both auto-detected and manually-highlighted items.
5. User downloads all files and can stop here — no forced continuation into any
   other app.
6. Later (separately, whenever ready): user uploads a generated result file (e.g.
   `masked_output_result.docx`, produced elsewhere) + `mapping.enc.json`, enters the
   passphrase → app decrypts the mapping, replaces tokens with real values, and the
   user downloads `final_<name>.docx`.

## Output / deliverables
- `masked_output.txt`/`.docx` + `mapping.enc.json` + `mapping.xlsx` (mask step;
  `mapping.xlsx` only when at least one item was masked, which is the normal case)
- `final_<name>.docx` with real data restored (unmask step)
- A local web app (localhost) the user runs whenever they need to mask/unmask a doc.

## Tech constraints
- Build approach: Claude Code project (standalone repo, own project).
- Frontend: React + TypeScript (paired by standing default).
- Backend: Node + TypeScript.
- Does this project require paid API credits? No — fully local, no LLM calls of any
  kind. This is the whole point of the trust boundary.
- SPA: yes, single-page local web app. No known SPA-specific constraints expected
  (no tab-following/content-script concerns like a browser extension).
- LAN testing: not needed — personal, local-only tool.
- docx parsing/writing: use existing libraries (e.g. `mammoth` for read, `docx` for
  write) rather than building a parser from scratch.
- Encryption: Node `crypto`, AES-256-GCM, key derived via scrypt from a per-session
  passphrase entered by the user — never persisted in plaintext anywhere.
- Excel mapping export (`mapping.xlsx`): always generated whenever at least one item
  was masked (not optional/on-request), via a library like `exceljs`. One row per
  masked item, columns for the masked token and the actual real value, covering
  both auto-detected and manually-highlighted items. **Accepted trade-off,
  explicitly chosen by the user over a password-protected alternative**: this file
  is plaintext and is the user's own responsibility to store/delete securely. It
  sits alongside `mapping.enc.json` (still the encrypted source of truth the app
  itself uses for the unmask step) as a human-readable convenience copy, not a
  replacement.
- Highlight-to-mask: additive to regex/glossary auto-detection, not a replacement —
  both feed the same confirmed-mapping list.
- Must never make an outbound network call of any kind with document content or the
  decryption key/mapping — this app's entire value is being the one piece that
  stays fully offline-capable for sensitive data handling.
- Designed to stay agnostic of any specific downstream generation use case (LLD or
  otherwise) — it only knows "doc in → masked text + encrypted mapping out" and
  "result doc + mapping in → real doc out." This lets future generation apps (for
  different document types) reuse this app unmodified.

## Done criteria
- Given a real test requirement doc, regex + glossary detection correctly catches
  known sensitive terms (client names, codenames, IPs/emails/domains).
- Preview/confirm UI correctly shows what will be masked, lets the user add missed
  terms to the glossary, and lets the user manually highlight/select additional
  text to mask before finalizing. Highlighting one instance of a term correctly
  masks every other occurrence of that same term in the document (verify with a
  test doc containing the same keyword 3+ times) — no partial masking.
- Masking produces a valid `mapping.enc.json` (encrypted, unreadable without the
  passphrase) and a valid `masked_output.txt`/`.docx` with all confirmed sensitive
  terms (auto-detected and manually-highlighted) replaced by placeholder tokens.
- `mapping.xlsx` is always generated whenever at least one item was masked, with
  correct token + actual-value columns covering both auto-detected and
  manually-highlighted items.
- Unmask flow: given a result file with placeholder tokens + the correct mapping +
  correct passphrase, produces a `final_<name>.docx` with real values correctly
  restored — verified by inspection against the known mapping. Wrong passphrase is
  correctly rejected (doesn't silently produce garbage output).

## Open questions
- Whether local NER (on top of regex + glossary) is needed at all — only add if
  real testing shows regex + glossary misses real cases. Don't build it
  speculatively.
- Whether the user wants masked placeholder tokens to be human-readable (e.g.
  `[CLIENT_A]`) or fully opaque (e.g. `[TOKEN_7F3A]`) — revisit during build, low
  cost to change either way.

---

## During & After Build — Files for Review

As you build, the following files may be created. Ask for review if you want changes:

- **CLAUDE.md** — Project-specific documentation for Claude Code (architecture, setup commands, implementation details, maintenance tasks). Optional but recommended for projects with multiple components or complex setup. Ask for review during or after build to ensure it's accurate.

- **master-prompt.md** — Created during project closure. A start-to-finish rebuild guide synthesizing the brief, build decisions, and key learnings. Ask for review after closure to validate it captures what actually happened vs. what was planned.

---

## Related project
This app is paired with a separate, fully independent project — **`generation-app`**
(`~/.claude/development/projects/generation-app/`) — which reads this app's
`masked_output` file and calls the Anthropic API to generate a document (LLD first,
more templates later), then hands a result file back to this app for unmasking.
The two are connected only through downloadable files, never a shared repo, shared
process, or shared decryption key. `generation-app` is optional from the user's
perspective — this app is fully usable on its own (mask → download) without it.
