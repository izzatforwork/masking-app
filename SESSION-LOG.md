# Session Log

## Session 2026-07-23

### Timeline
- 18:02: ai-os skill kickoff — consulted on the masking + LLD-generation idea, interviewed to a locked brief, project folder + NEW_PROJECT.md + git repo created, first commit made
- 19:49: Brief updated (via plan mode) with highlight-to-mask (additive to auto-detection) and always-generated `mapping.xlsx` export, committed
- 19:52: Brief updated again to specify highlight-to-mask auto-propagates to every matching occurrence of a highlighted term (not just the one instance clicked), committed
- 20:33: Full MVP built — backend (docx parse/build, regex+glossary detection, AES-256-GCM mapping encryption, xlsx export, single-zip finalize endpoint, unmask endpoint) and frontend (upload → preview/highlight-to-mask → glossary → encrypt & download; separate unmask tab) — verified end-to-end via real HTTP calls and live browser interaction, two real bugs found and fixed (Chrome multi-download blocking, missing CORS `exposedHeaders`), committed

### Prompts
1. "run ai os skill"
2. "You are my OS consultant, consult me on this idea. GOAL: 1. Ingest requirement document (docx/pdf) 2. Detect & mask sensitive company info (client names, codenames, IPs, etc) 3. Hantar masked text kat Anthropic API → generate Low Level Design (LLD) doc 4. Unmask result → output final LLD dengan real data, siap format docx. Consult me on how to do it? from what aku nampak, mcm kena separate 2 things. 1 is an app to ingest document and do masking, 1 lagi is the web/app to send masked text to Anthropic API to generate LLD doc"
3. "masking app is good. generative app is good. but what if i come up with another use cases to create another generative app but for a different document format?"
4. "for generative app, i am CONFIRMED that i will add more new and different template to change into also at later time. take this into consideration. after masking, user should be allowed to download the file and not continue for 2nd app also"
5. "Lets make it into 2 separate apps and 2 separate project. Easier for me to monitor. expectation is to ease user to setup only MASKING APP instead of forced to setup both app"
6. "On selected text: > Frontend: React — React should be coupled with TS as default decision"
7. "Please add that during the masked data preview -> should allow user to highlight which data to mask that automatically store the information into an excel which Token will be mapped to which actual Information"
8. "masking app always generate excel if anything is masked (even 1 item). in the excel file should contain the actual value and the masked value. this is to ease for mapping later on"
9. "proceed with the plan. build the project. start with masking project"
10. "Highlight-to-mask —> what happens if i saw a keyword that i wanted to mask, then i highlighted it, how about the same keyword that exist in the same document?"
11. "all good for now. will test it and update. run session log skill for both project and store accordingly"

### MD files touched
- Read: `AI-CONSULTING-PATTERNS.md` — read by ai-os skill at kickoff
- Read: `DECISIONS.md`, `POSTMORTEMS.md` — read by ai-os skill before recommending the architecture
- Read: `PROJECTS.md` — read by ai-os skill for de-duplication check
- Modified: `PROJECTS.md` — added masking-app row at kickoff; updated status/notes after MVP build
- Created: `NEW_PROJECT.md` (masking-app) — created by ai-os skill kickoff with the locked brief
- Modified: `NEW_PROJECT.md` (masking-app) — updated twice during plan mode (highlight-to-mask + mapping.xlsx, then auto-propagation clarification), per user instruction
- Modified/Created: `~/.claude/plans/you-are-my-os-jiggly-pond.md` — plan file built incrementally across several plan-mode rounds (architecture, template system, download decoupling, React+TS pairing, highlight-to-mask, mapping.xlsx)
- Modified: `SESSION-LOG.md` — created by session-log skill

### Summary
Consulted as OS-engineer on a new idea: mask sensitive data out of client requirement docs locally before sending anything to Anthropic, generate an LLD, then unmask the result. Interviewed to a locked brief; recommended and confirmed a trust-boundary split into two fully separate projects (masking-app never calls any external API; generation-app never sees real data or the decryption key), connected only via downloadable files (no forced same-sitting continuation). Iterated the brief through several rounds of user feedback: highlight-to-mask as an additive safety net on top of regex/glossary auto-detection, an always-generated plaintext `mapping.xlsx` export (accepted trade-off vs. the encrypted `mapping.enc.json`), React always paired with TypeScript, and — after a follow-up question — confirmed that highlighting one instance of a term must auto-propagate to mask every other occurrence of that term in the document (no partial masking).

Then built masking-app's MVP: Node/TS + Express backend (mammoth/docx for docx read/write, regex + glossary detection, AES-256-GCM mapping encryption via Node `crypto`, `exceljs` for the xlsx export, a single-zip `/api/mask/finalize` endpoint, and a `/api/unmask` endpoint that rejects wrong/corrupted passphrases rather than silently producing garbage), and a React/TS frontend (upload → preview with auto-detected highlights → manual highlight-to-mask via the DOM Selection API with all-occurrence propagation → glossary management → passphrase → download; a separate unmask tab). Verified via real HTTP calls (curl) and live browser interaction driven through claude-in-chrome (not just unit tests) — including a JS-driven Selection API workaround after pixel-coordinate clicks proved unreliable for text selection in the automation environment. Two real bugs were found and fixed during live verification: Chrome's multi-download protection was silently dropping 2 of 3 auto-triggered downloads (fixed by bundling all outputs into one zip via `jszip`), and the masked-item count always showed 0 in the UI because a custom response header wasn't exposed cross-origin (fixed by adding `cors({ exposedHeaders: [...] })`). Committed to masking-app's own git repo (not yet pushed to GitHub).

### Notes
- The user's uploaded LLD template file was itself pre-redacted by them (filename `LLD__Sample__MASKEDRIDER.docx`) before sharing it — consistent behavior with the app's own purpose.
- generation-app's build (same session, later) is logged separately in generation-app's own `SESSION-LOG.md`.
- Not yet pushed to GitHub — pending user decision.
