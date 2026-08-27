# Spell-Check Overlay — Implementation Spec

**Status:** Finalized — ready to build
**Goal:** A keyboard-triggered overlay where you type a word (or short phrase) you're unsure how to spell and get back the correct spelling — replacing the "switch to Google" habit. The native macOS/WebKit spellcheck (NSSpellChecker) isn't good enough on hard/phonetic misspellings, so the primary backend is Google's correction via SerpApi, with NSSpellChecker kept only as an offline fallback.

---

## 1. Backend decision

Primary backend: **SerpApi's Google Spell Check** (https://serpapi.com/spell-check).

**Why** (options evaluated in conversation):

| Option | Quality | Verdict |
|---|---|---|
| WebKit native spellcheck | decent, not great | What we have now — the thing we're replacing |
| macOS `NSSpellChecker` (`guesses`) | good on simple typos, weak on phonetic/multi-error | Same engine as WebKit; kept as **offline fallback only** |
| Datamuse `sp=` | **poor** — empirically failed `recieve`→`receive` | Rejected (tested) |
| API Ninjas spellcheck | Hunspell-class = same tier as NSSpellChecker | Rejected — won't fix the complaint |
| Offline `nspell` (Hunspell) | good on typos, weak on phonetic disasters | Rejected — NSSpellChecker already covers the offline case without shipping a dictionary |
| LLM (Claude Haiku) | Google-or-better | Strong alternative; not chosen (adds a provider + key + cost) |
| **SerpApi Google spell-check** | **Google (best available)** | **Chosen** — it *is* Google's "Did you mean" |

The appeal: it returns Google's actual correction, which nails phonetic disasters (`sikologee`→`psychology`) that every dictionary-based option misses. Verified in testing that NSSpellChecker gets `sikologee`→`sinology` (wrong) — hence Google primary, NSSpellChecker fallback.

---

## 2. How SerpApi's spell-check works (research findings)

**Spell Check is a first-class, documented SerpApi feature** (dedicated doc page, structured response field). It is **served by the Google Search engine endpoint** — there is no stand-alone spellcheck endpoint; "Spell Check" is one of ~60 result *sections* of the Google Search API. Practical consequence: **each lookup is one Google Search request = one search credit**.

- **Endpoint:** `https://serpapi.com/search.json`
- **Engine:** `engine=google_light` (see below) — falls back to `engine=google` if `google_light` is found not to populate `search_information` at build time
- **Key param:** `q` = the word/phrase to check
- **Optional params:** `hl=en` (language), `gl=us` (country)
- **Auth:** `api_key` param — SerpApi account key (see §6)

### Engine choice — `engine=google_light`
SerpApi documents Spell Check under both the Google Search API and the **Google Light Search API** (`engine=google_light`). We only need the `search_information` object, so the Light engine returns a smaller/faster payload. **Build-time check:** confirm `google_light` responses actually contain `search_information.spelling_fix` / `showing_results_for`. If not, switch the one constant in `src/bun/spellcheck.ts` to `engine=google`. Whether `google_light` costs fewer credits is a nice-to-have, not blocking (free tier is sufficient either way).

### Response shape

The correction lives in `search_information`:

| Field | Meaning |
|---|---|
| `spelling_fix` | The suggested correction ("Did you mean?") |
| `showing_results_for` | The query Google auto-corrected to |
| `spelling_fix_type` | Correction type (e.g. "without quotes") |
| `query_displayed` | The original query as typed |
| `organic_results_state` | Explains the spelling scenario |

Example (query `coffeee`):

```json
{ "search_information": { "query_displayed": "coffeee", "spelling_fix": "coffee", "showing_results_for": "coffee" } }
```

**Multiple suggestions come back newline-separated** in `spelling_fix` — split on `\n`:

```json
// query: "gggggreen"
{ "search_information": { "spelling_fix": "gg green\ng green\ngo green" } }
```

### Parsing rules (implemented in `src/bun/spellcheck.ts`)

1. If `search_information.spelling_fix` present → `suggestions = spelling_fix.split("\n")`.
2. Else if `showing_results_for` present and differs (case-insensitively) from `query_displayed` → `suggestions = [showing_results_for]` (Google silently auto-corrected).
3. Else → `suggestions = []` (spelling is fine).
4. Post-process every list: `trim()` each, drop empties, dedupe, drop any entry equal case-insensitively to the input. Preserve order (SerpApi returns them ranked).
5. `corrected = suggestions.length > 0`.

### Consequences of it being a full search

1. **One lookup = one search credit.** Not a cheap micro-call.
2. **Check on submit (Enter) only** — never per-keystroke. Latency is a real Google round-trip (~1–3s); debounced live checking would burn credits and feel laggy.
3. We parse only `search_information` and discard the organic results.

### Pricing — CONFIRMED: Free tier is sufficient

Per the user's dashboard, the **Free plan ($0/mo)** covers this:
- **250 searches / month**, **50 throughput / hour**
- Includes ZeroTrace Mode (SerpApi doesn't log/retain the query — privacy plus).

Usage is only a few checks per entry, so 250/mo is comfortable and 50/hr is a non-issue. **No paid plan needed.**

---

## 3. Resolved decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Usage volume | A few checks/entry — within free tier. |
| 2 | Budget / plan | Free plan ($0/mo, 250/mo). Needs API key in `spellcheck.json` (§6). |
| 3 | List vs single answer | **Pick-list when >1 suggestion, single result otherwise.** Top item pre-selected; ↑/↓ to move, Enter to take. |
| 4 | Action on a selected result | **Insert at the Quill caret if an editor is focused; otherwise copy to clipboard.** Overlay states which happened. |
| 5 | Keyboard shortcut | **⌘⇧;** (Cmd + Shift + Semicolon). Not ⌘X (Cut), not ⌘F (search). |
| 6 | Offline / no-credits / API-error fallback | **Fall back to NSSpellChecker guesses** via a bundled compiled Swift helper. Results labelled as degraded ("macOS suggestions"). If the fallback also yields nothing usable → show an error, keep the overlay open. |
| 7 | Input scope | **Single word or short phrase** (e.g. "Filet Mignot" → "Filet Mignon"). Passed verbatim to `q`. Hard cap 80 chars; longer input is rejected in the overlay before any RPC call. |
| 8 | Pre-fill from editor selection | **No — overlay always opens empty.** (No Quill selection introspection.) |

---

## 4. Architecture fit

### Networking constraint
The renderer runs in system WebKit under a CSP that blocks external hosts — **it cannot `fetch()` SerpApi directly.** The request goes through the **bun** process via a new RPC channel (same reason `compressImage` and S3 live in bun). Not optional.

### New RPC channel — the standard 4-file pattern

A **request** (await-able) channel `spellCheck`:

```ts
// shared/types.ts
export type SpellCheckResult =
  | { status: "ok"; source: "google" | "local"; input: string; suggestions: string[]; corrected: boolean }
  | { status: "unavailable"; reason: string };
```

- `status: "ok", corrected: false, suggestions: []` → overlay shows "looks correct".
- `status: "ok", source: "local"` → overlay shows the list but labelled "macOS suggestions (offline)".
- `status: "unavailable"` → `handleError` with `reason`; overlay stays open for retry.

Wiring (per `CLAUDE.md`):

| File | Change |
|---|---|
| `interface.d.ts` | `spellCheck: (input: string) => Promise<SpellCheckResult>` on the global |
| `src/mainview/index.ts` | webview shim → `window.spellCheck` |
| `shared/rpc-schema.ts` | `requests.spellCheck: { args: [string]; return: SpellCheckResult }` |
| `src/bun/index.ts` | handler → delegates to `src/bun/spellcheck.ts` |

### `src/bun/spellcheck.ts` (new module — mirrors `src/bun/image.ts` / `files.ts`)

```
spellCheck(input: string): Promise<SpellCheckResult>
  1. normalize: input.trim().replace(/\s+/g, " "); if empty → { unavailable, "empty" }
     (renderer already guards, this is defense-in-depth)
  2. if length > 80 → { unavailable, "too long" }
  3. key = getSerpApiKey()   // reads spellcheck.json, returns string | null
  4. if key present:
       GET https://serpapi.com/search.json
           ?engine=google_light&q=<input>&hl=en&gl=us&api_key=<key>
       - AbortController, 6s timeout
       - offline (fetch throws), non-2xx, body.error present, JSON parse failure → log + fall through to step 5
         (no explicit connectivity pre-check — a thrown fetch is the offline signal)
       - else parse per §2 rules → { ok, source: "google", input, suggestions, corrected }
  5. fallback: run the bundled helper (spawnSync, arg = input, 3s timeout)
       - stdout non-empty  → { ok, source: "local", input, suggestions: stdout.split("\n"), corrected: true }
       - stdout empty, exit 0 → { ok, source: "local", input, suggestions: [], corrected: false }
       - helper missing / errors → { unavailable, "spell-check unavailable (offline, and macOS fallback failed)" }
```

- Uses `logger` from `src/bun/logger.ts` — never `console.*`.
- No caching in v1 (volume is tiny; a stale cache is a worse bug than a spare credit).

### Offline fallback — bundled Swift helper

`NSSpellChecker` has no usable CLI. Ship a tiny compiled helper so **no Swift toolchain is required on the end-user machine** (`swiftc` at build time produces a self-contained mach-O linking system AppKit; verified ~53 KB, <40 ms warm).

- **Source:** `native/spellcheck-helper.swift`
  - Arg 1 = the word/phrase.
  - Call `NSSpellChecker.shared.checkSpelling(ofString:startingAt:)` first. If `range.location == NSNotFound` → print nothing, exit 0 (input is correctly spelled).
  - Else print `guesses(forWordRange:in:language:"en":inSpellDocumentWithTag:0)` joined by `\n`, exit 0.
  - (Needed because `guesses` alone returns candidates even for correct words — verified: `"hello"` → `he'll, cello, jello, …`.)
- **Build:** new script `build:helper` → `swiftc -O -o build/spellcheck-helper native/spellcheck-helper.swift`, added to `build:assets` chain in `package.json`.
- **Bundle:** add to `electrobun.config.ts` `copy` block → `"build/spellcheck-helper": "resources/spellcheck-helper"`.
- **Runtime path resolution:** ⚠️ *the one open implementation detail* — confirm how the electrobun bun bundle resolves a co-packaged resource path (check for an `Electrobun`/`Utils` resource-dir API, else derive from `process.execPath`). Resolve during the build ticket; everything else here is settled.
- **`build/` is gitignored** — the helper is a regenerated artifact like `renderer.js`.

### Renderer overlay — `renderer/src/components/spell-overlay.ts` (new)

- Centered floating input, command-palette style (reuse the visual language of `find-bar.ts`; look at `renderer/src/components/find-bar.ts:28` for the keydown pattern).
- **Open:** ⌘⇧; — registered in `renderer/src/main.ts` global keydown handler (alongside the zoom handler at `main.ts:19`). `e.preventDefault()`. Must fire even while Quill is focused.
- **Close:** Esc, or click outside. Restores focus to whatever had it before (so an in-progress entry edit isn't disrupted).
- Always opens **empty**.
- Reject > 80 chars locally (inline hint, no RPC).
- **On Enter in the input:** call `window.spellCheck(value)`, show a spinner (~1–3 s).
- **Result render:**
  - `corrected: false` → "“{input}” looks correct." + Esc to dismiss.
  - 1 suggestion → show it big, Enter to take.
  - >1 → ranked list, top pre-selected, ↑/↓ to move, Enter to take.
  - `source: "local"` → small muted label "macOS suggestions · offline".
- **On take (Enter on a suggestion):**
  - If a Quill editor instance is currently focused → insert the text at the caret via the Quill API (`quill.insertText(range.index, word)`); let the normal dirty-check / nav-guard flow register the change (do **not** `clearNavGuard` — this is a real edit).
  - Else → `navigator.clipboard.writeText(word)`; toast "Copied".
  - Close the overlay either way.
- **Errors:** `handleError(err, msg?)` from `renderer/lib/error-handler.ts` — never `console.error`. `status: "unavailable"` → `handleError(new Error(reason))`, keep overlay open.
- Must not interfere with the always-mounted `#view-list` (it's a fixed-position layer, `display` toggled; no route change).

### Editor-focus detection
The overlay needs "is a Quill editor focused right now?". `quill-editor.ts` already tracks its instances for the ⌘F handler (`quill-editor.ts:174`) — expose the active instance (module-level `activeEditor: QuillEditor | null`, set on `selection-change`/focus, cleared on teardown) and read it from the overlay. Reuses the existing idempotent-teardown guard.

---

## 5. Config / key storage — `spellcheck.json`

**Not** `config.json`: `src/bun/cloudsync/aws-connection.ts:114` writes `config.json` with a full `JSON.stringify(config)` on every AWS credential save — it would clobber an unrelated key. Use a dedicated file:

- **Path:** `userData/spellcheck.json` (`USER_DATA_PATH`, same dir as `config.json`).
- **Shape:** `{ "serpApiKey": "..." }`
- **Gitignored** — add `spellcheck.json` to `.gitignore` alongside the `config.json` convention.
- `getSerpApiKey()` in `src/bun/spellcheck.ts`: `existsSync` → `JSON.parse` → return `parsed.serpApiKey` if a non-empty string, else `null`. Never throws.
- No key ever reaches the renderer or the repo. No UI to set it in v1 — the user drops the file in by hand (same as the original AWS bootstrap).

---

## 6. End-to-end flow

```
⌘⇧;  → overlay opens (empty) → type "sikologee" → Enter
  → window.spellCheck("sikologee")                     (renderer → bun RPC)
  → bun: GET serpapi.com/search.json?engine=google_light&q=sikologee&api_key=…
       ├─ ok   → parse search_information → suggestions ["psychology"]
       └─ fail → build/spellcheck-helper "sikologee" → ["sinology"] (source:"local")
  → overlay shows "psychology"  → Enter
       ├─ Quill focused → insertText at caret
       └─ else          → clipboard + "Copied" toast
  → overlay closes
```

---

## 7. Build / task checklist

- [ ] **S1** — `native/spellcheck-helper.swift` + `build:helper` script + `build:assets` chain + `electrobun.config.ts` copy entry. Resolve the runtime resource path (§4). Verify: `swiftc` build succeeds, `./build/spellcheck-helper "recieve"` → `receive`, `./build/spellcheck-helper "hello"` → empty.
- [ ] **S2** — `shared/types.ts` `SpellCheckResult` + `src/bun/spellcheck.ts` (`getSerpApiKey`, `spellCheck`, SerpApi fetch, parse rules, helper fallback). Build-time: confirm `engine=google_light` populates `search_information`; else switch to `engine=google`.
- [ ] **S3** — RPC 4-file wiring (`interface.d.ts`, `src/mainview/index.ts`, `shared/rpc-schema.ts`, `src/bun/index.ts`).
- [ ] **S4** — Expose active `QuillEditor` instance from `quill-editor.ts`.
- [ ] **S5** — `renderer/src/components/spell-overlay.ts` + ⌘⇧; registration in `main.ts` + close/focus-restore + result UI + take (insert vs copy) + error handling.
- [ ] **S6** — `.gitignore`: add `spellcheck.json`. Drop the real key into `userData/spellcheck.json` for manual testing.
- [ ] **S7** — `/code-health` per `CLAUDE.md` post-implementation rule. Update `CLAUDE.md` (new RPC channel, new bun module, new renderer component, `spellcheck.json`, `build:helper`).

---

## 8. Non-goals (out of scope for now)
- Inline red-squiggle checking across the whole entry (this overlay is on-demand).
- Grammar checking.
- Replacing the existing FTS search (`⌘F`).
- A settings UI for the SerpApi key (hand-placed file in v1).
- Caching / rate-limit accounting (volume too low to matter).
