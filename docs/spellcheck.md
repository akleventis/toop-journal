# Spell-Check Overlay — Research & Implementation Plan

**Status:** Proposal / awaiting decisions
**Goal:** A keyboard-triggered overlay where you type a word you're unsure how to spell and get back the correct spelling — replacing the "switch to Google" habit. The native macOS/WebKit spellcheck (NSSpellChecker) isn't good enough on hard/phonetic misspellings.

---

## 1. Decision so far

Chosen backend: **SerpApi's Google Spell Check** (https://serpapi.com/spell-check).

**Why we landed here** (options evaluated in conversation):

| Option | Quality | Verdict |
|---|---|---|
| WebKit native spellcheck | decent, not great | What we have now — the thing we're replacing |
| macOS `NSSpellChecker` (`guesses`) | good on simple typos, weak on phonetic/multi-error | Same engine as WebKit; already rejected |
| Datamuse `sp=` | **poor** — empirically failed `recieve`→`receive`, whiffed on phonetic | Rejected (tested) |
| API Ninjas spellcheck | Hunspell-class = same tier as NSSpellChecker | Rejected — won't fix the complaint |
| Offline `nspell` (Hunspell) | good on typos, weak on phonetic disasters | Free/local fallback, but not Google-quality |
| LLM (Claude Haiku) | Google-or-better | Strong alternative; cheaper/faster; not chosen |
| **SerpApi Google spell-check** | **Google (best available)** | **Chosen** — it *is* Google's "Did you mean" |

The appeal: it returns Google's actual correction, which nails phonetic disasters (`sikologee`→`psychology`) that every dictionary-based option misses.

---

## 2. How SerpApi's spell-check actually works (research findings)

**Spell Check is a first-class, documented SerpApi feature** (dedicated doc page, structured response field, even a companion "Grammar Check"). It is **served by the Google Search engine endpoint** — there is no separate stand-alone spellcheck endpoint you hit in isolation; "Spell Check" is one of ~60 result *sections* of the Google Search API (alongside Organic Results, Knowledge Graph, etc.). Practical consequence: **each lookup is one Google Search request = one search credit** (see cost note below).

- **Endpoint:** `https://serpapi.com/search.json?engine=google` (default engine is `google`)
- **Key param:** `q` = the word/phrase to check
- **Optional params:** `hl` (language, e.g. `en`), `gl` (country, e.g. `us`)
- **Auth:** requires a SerpApi **API key** (`api_key` param). Account signup required.

### Lighter engine option — `engine=google_light`
SerpApi documents Spell Check under **both** the Google Search API *and* the **Google Light Search API** (`engine=google_light`). Since we only need the `search_information` object (not organic results, ads, knowledge graph, etc.), the Light engine should return a smaller/faster payload for the same correction. **To confirm:** whether `google_light` also costs fewer credits, or just runs faster. Likely the better engine for this use case either way.

### Response shape

The correction lives in the `search_information` object:

| Field | Meaning |
|---|---|
| `spelling_fix` | The suggested correction ("Did you mean?") |
| `showing_results_for` | The query Google auto-corrected to |
| `spelling_fix_type` | Correction type (e.g. "without quotes") |
| `query_displayed` | The original query as typed |
| `organic_results_state` | Explains the spelling scenario |

Example (query `coffeee`):

```json
{
  "search_information": {
    "query_displayed": "coffeee",
    "spelling_fix": "coffee",
    "showing_results_for": "coffee"
  }
}
```

**Multiple suggestions come back newline-separated.** When Google offers several "Did you mean" candidates, `spelling_fix` is a single string with `\n` between them — split on newline to get the list:

```json
// query: "gggggreen"
{ "search_information": { "spelling_fix": "gg green\ng green\ngo green" } }
```

So the overlay **can** show a ranked pick-list, not just one answer. Parsing: `spelling_fix.split("\n")`.

### Consequences of it being a full search (these drive the open questions below)

1. **One lookup = one search credit.** Spell Check rides on a Google Search request, so it's not a cheap micro-call. This is the single biggest cost factor. (`google_light` may reduce this — to verify.)
2. **Can return one *or several* suggestions** (`spelling_fix`, newline-separated — see above). So a pick-list UX is supported; we're not forced into a single-answer UI.
3. **If the word is already correct, there is no `spelling_fix` field.** We treat "no fix present" as "spelling is fine."
4. **Latency is a real round-trip to Google via SerpApi** — typically ~1–3s, noticeably slower than a local check. Implication: **check on submit (Enter), never per-keystroke** — debounced live checking would burn credits and feel laggy.
5. Response also contains a full page of organic search results we don't need — we parse only `search_information` and discard the rest.

### Pricing — CONFIRMED: Free tier is sufficient

Per the user's dashboard, the **Free plan ($0/mo)** covers this use case:
- **250 searches / month**
- **50 throughput / hour**
- Includes ZeroTrace Mode (SerpApi doesn't log/retain the query — a privacy plus).

Usage is only "a few searches per entry," so 250/mo is comfortably enough and 50/hr is a non-issue. **No paid plan needed.** Still open: whether `engine=google_light` costs fewer credits than `engine=google` (§ Lighter engine option) — nice-to-have, not blocking.

---

## 3. How it fits this codebase

### Networking constraint
The renderer runs in system WebKit under a CSP that blocks external hosts. **The renderer cannot `fetch()` SerpApi directly.** The request must go through the **bun** process via an RPC channel (same reason `compressImage` and S3 live in bun). This is not optional.

### New RPC channel — the standard 4-file pattern
Per `CLAUDE.md`, a new channel touches:
1. `interface.d.ts` — global type
2. `src/mainview/index.ts` — webview shim (`window.*` global)
3. `shared/rpc-schema.ts` — typed contract (`AppRPC`)
4. `src/bun/index.ts` — handler wiring

Proposed: a **request** (await-able) channel, e.g. `spellCheck(word: string) → { fix: string | null }`, with the actual `fetch` to SerpApi living in a new `src/bun/spellcheck.ts` module (mirrors `src/bun/image.ts` / `src/bun/files.ts`).

### API key storage
Follow the existing AWS-credentials pattern: keys live in **`config.json` at `userData/config.json`**, which is **already gitignored and never committed**. The SerpApi key would be a new field there. No key ever touches the renderer or the repo.

### Renderer overlay module
- New component, e.g. `renderer/src/components/spell-overlay.ts`.
- A centered, floating input (command-palette style). Opens on a keyboard shortcut, closes on Esc.
- On Enter: call `window.spellCheck(word)`, show a spinner (~1–3s), then render the result.
- Errors via `handleError()` (`renderer/lib/error-handler.ts`) — never `console.error`.
- Must respect the nav-guard / not interfere with the always-mounted `#view-list`.

### Keyboard shortcut
`⌘X` is **Cut** — can't use it. Open candidates: `⌘'`, `⌘⇧;`, `⌘⇧K`. (`⌘F` is already taken by search.)

---

## 4. Proposed flow

```
[⌘-shortcut] → overlay opens → type "sikologee" → Enter
   → window.spellCheck("sikologee")  (renderer → bun RPC)
   → bun: GET serpapi.com/search?engine=google&q=sikologee&api_key=...
   → parse search_information.spelling_fix → "psychology"
   → overlay shows: "psychology"  →  [Enter to insert / copy]  or  "looks correct"
```

---

## 5. Open questions (need your answers before building)

1. ✅ **RESOLVED — Usage volume.** Only a few checks per entry; well within the free tier's 250/mo.

2. ✅ **RESOLVED — Budget / plan.** Free plan ($0/mo, 250 searches/mo) is sufficient. Still need: your API key added to `config.json` (see §3), and — nice-to-have — confirm whether `google_light` is cheaper per credit.

3. **List or single answer in the UI?** SerpApi *can* return multiple suggestions (newline-separated), but often returns just one. Do you want the overlay to always show a pick-list when several come back, or just take the top suggestion and show that one? (Both are easy — it's a UI preference.)

4. **What happens on a selected result — insert at cursor, or copy to clipboard?** i.e. after it shows "psychology," pressing Enter should either drop it into your entry at the Quill cursor, or copy it so you paste manually.

5. **Which keyboard shortcut?** Preference among `⌘'`, `⌘⇧;`, `⌘⇧K` (or name another). Not `⌘X` (Cut) or `⌘F` (search).

6. **Fallback when offline / out of credits / API errors?** Options: (a) show an error and stop, (b) silently fall back to the local macOS `NSSpellChecker` guesses, (c) fall back to offline `nspell`. Recommendation: (b) or (a) — cheap and simple.

7. **Word-only, or short phrases too?** Scope to a single word (simplest), or allow checking a few words at once? Google handles phrases, but it widens the UX.

8. **Trigger context:** should the shortcut also pre-fill the overlay with the **currently selected text / word under the cursor** in the editor, or always start empty? Pre-filling is a nice touch but more work.

---

## 6. Non-goals / explicitly out of scope (for now)
- Inline red-squiggle checking across the whole entry (this overlay is on-demand, single-word).
- Grammar checking.
- Replacing the existing FTS search (`⌘F`).
