# Agent — Knowledge Layer & AI Assistant

Source of truth for the build. A structured knowledge layer + a semantic layer over 3000+ journal
entries, queried by a tool-calling agent that answers questions with cited, linked entries.

---

## Overview (plain-language)

**What this is.** A chat window in the app where you can ask about your own journal — "when did I
first meet X," "how was I feeling when Y happened" — and get an answer with links to the real
entries it's based on.

**Why no training is needed for the core.** The AI doesn't "learn" your life. A background job (the
**crawl**) reads every entry once, using another AI model, and pulls out facts — who's mentioned,
what happened, how you felt — into plain database tables. Separately, it turns entry text into
"meaning fingerprints" (vectors) so you can search by what something *means*, not just the exact
words. When you ask a question, the chat agent looks things up in those tables/vectors and quotes
real entries, like a research assistant with a filing cabinet — not a model that memorized your
diary. Actually *training* (fine-tuning) a model is a separate, optional, later feature (**M8**),
for a different goal: making it *sound like you* on hypothetical questions your journal never
answers ("I left my wallet at home, what do I do"). Even that gets tried the cheap way first
(showing the model examples) before any real training happens.

**The four ways it looks things up**: exact facts in tables → meaning search over entry text →
old-fashioned keyword search → reading a raw entry for a quote. It picks whichever fits the
question.

**It never guesses.** If it's not sure of something — during the background crawl or a live
conversation — it either says so or writes the question down to ask you later. Uncertain facts
never get written into the tables.

**It runs on your Mac, stays off until you open it, and only your extracted facts sync between
devices** — your journal entries already synced before any of this existed; the AI layer adds one
more small synced file plus a local, unsynced search index that rebuilds itself.

The rest of this doc is the technical reference for building it.

---

## Glossary

- **nidus** — local semantic/vector search store (Rust). Powers Layer 2.
- **wdpkr** — semantic code search CLI. Dev tool only, searches this repo's own source, not journal content.
- **Ollama** — runs LLMs locally on your Mac. Default provider for every model role.
- **Vercel AI SDK (`ai`)** — TS library for streaming, structured output, and tool-calling across providers.
- **MLX-LM** — Apple's local fine-tuning toolkit. Trains M8's voice model.
- **whisper.cpp** — fast local speech-to-text. For the deferred audio extension.
- **Coqui XTTS-v2 / OpenVoice** — voice-cloning text-to-speech. Deferred, undecided audio-output extension.
- **BAML** — DSL for reliable structured LLM extraction. Candidate for the crawl runner.
- **Promptfoo** — TS-native LLM eval framework. Candidate for retrieval/provider/voice evaluation.
- **Kuzu** — embedded graph database. Deferred fallback if flat SQL tables prove insufficient.
- **Khoj** — open-source, self-hostable personal AI assistant (search/chat over your own notes, local LLM support). Reference only, not integrated.

---

## Decisions

| Decision | Why |
|---|---|
| Hybrid model provider, pluggable per role (`embed`/`crawl`/`reasoning`/`chat`/`voice`) — Ollama default, any OpenAI-compatible/Anthropic endpoint swappable. | Local-only available now, not locked out of a stronger model later. |
| Retrieval must be evidence-gated in code, never left to model judgment. | A local model can't be trusted to self-filter a noisy context window. |
| Nothing under `/agent` is eager — no process/model/index starts before first navigation there. | Feature used rarely; no idle cost. |
| `knowledge.db` + nidus's data dir sync together as one single-writer snapshot bundle. | LLM extraction isn't deterministic and Q&A doesn't self-propagate — independent per-device crawls diverge. `key_sentences` vectors are derived from `knowledge.db`, so the two must move together. |
| UI: vanilla TS/DOM, matching `renderer/src/views/`. | Fastest to build with existing tooling; no React infra to add. |
| Streaming chat over the existing RPC push channel (`messages`, fire-and-forget). | No new transport needed. |
| wdpkr is dev-tooling only, against this repo's own source — never touches journal content. | Confirmed scope. |
| One unified chat, not separate fact/persona tabs — evidence gate applies per-claim, not per-mode. | A factual assertion needs a citation; advice doesn't. |
| Voice (M8) via fine-tuning, not just prompting — independent of provider-swapping. | Fine-tuning teaches style, retrieval still owns every fact, regardless of which provider is configured. |

---

## wdpkr (dev tool only, out of scope otherwise)

Configured against this repo's own source, for code search while building this feature. Never
touches journal content; nothing below depends on it.

```bash
wdpkr init
wdpkr config set store.provider nidus
wdpkr config set store.nidus.path ~/.local/share/wdpkr/toop-journal
wdpkr config init      # needs ANTHROPIC_API_KEY + VOYAGE_API_KEY, or an Ollama embedder
wdpkr index --full
```

---

## Retrieval: four layers + the honesty guardrail

FTS5 + dumping raw entries into a model fails two ways: no structured facts (can't do date-range
arithmetic like "what portion of my life was I in the military"), and no semantic recall (can't
match "how did I feel about X" — no keyword to match, it's a meaning question).

```
Layer 1 — Structured knowledge (SQLite, pre-built)   exact facts, cheapest when it has an answer
Layer 2 — Semantic recall (nidus, pre-built)         meaning match over entries + key sentences
Layer 3 — FTS5 (existing)                            keyword fallback
Layer 4 — Raw entries (existing)                     verbatim quotes/evidence, any time
```

Tools, not a pipeline — the agent picks per question. A date lookup goes straight to Layer 4;
"who was I in 2021" starts at Layer 1 then reads via Layer 4; "how did I feel when we broke up"
goes straight to Layer 2.

**Layer 2 is evidence-gated in code.** `search_semantic` enforces a `min_score` floor
(`SearchOpts.min_score`) and returns *no hits* below it, not weak hits — a local model is too easy
to steer wrong with a loosely-relevant dump.

**Guardrail, enforced at two moments**: the crawl never writes an uncertain fact to a table (it
queues a question instead); the chat agent never answers below the evidence bar (it says so, or
queues a question). Same check both times, not two rules that can drift apart. Both moments write
to `open_questions_t` (below) — an ongoing queue, not one-time setup. The live chat agent can also
raise a question mid-conversation. Answering one later triggers a **targeted** re-resolution (just
the affected rows), not a full re-crawl.

```
open_questions_t
  id, source ('crawl'|'chat'), crawl_type, question, context,
  related_ids (JSON array, grows over time), answer, skipped,
  resolved_by ('user'|'context'), answered_at, sort_rank
```

Dedup before insert (cheap nidus similarity check against existing open questions) — otherwise the
same ambiguity gets raised repeatedly across a large corpus.

**`write_question(question, context, related_entry_id, sort_rank)` is the only write tool ever
exposed to any model** — crawl or chat. All other writes are runner/db code, never model-callable.

---

## nidus (semantic layer)

One local store per device, path `~/Library/Application Support/com.bookoftoop.app/{dev,stable}/nidus/`.
Syncs as part of the knowledge snapshot bundle (below) — not rebuilt independently per device,
since re-embedding 3000+ entries per device is real cost and independent rebuilds risk drifting
from `knowledge.db`.

- `entries` collection — one vector per entry, embedding of `toSearchText(content)` (reuse FTS5's
  stripped text, don't re-derive).
- `key_sentences` collection — one vector per extracted key sentence from `entry_metadata_t`.

One embedding dimension for both, fixed by the configured embed provider. Switching embed
providers means re-embedding both collections from scratch — nidus pins dimension at creation.

Lazy: `nidus serve` spawns on first `/agent`-scoped RPC call (`agent:ensure-ready`), never at app
launch. `@duckedup/nidus` JS client talks to it over `http://127.0.0.1:<port>`.

---

## Knowledge sync — one single-writer snapshot bundle

`knowledge.db` and nidus's data dir travel together under one version marker, because
`key_sentences` vectors are derived from `knowledge.db` and the two must stay consistent with each
other, not just individually current. No concurrent-writer problem (nothing hand-edits either), so
a snapshot is enough — none of the entries' tombstone-log complexity.

- **Publish** (after any crawl pass): upload in order — (1) tar nidus's dir → `knowledge/nidus.tar`,
  (2) `knowledge.db` → `knowledge/knowledge.db`, (3) `knowledge/version.json` (`{lastModified}`)
  **last**. Order matters: an interrupted publish never leaves the version marker pointing at a
  partial bundle.
- **Pull** on `agent:ensure-ready`, *before* spawning `nidus serve`: if remote is newer, replace
  both local copies, then spawn.
- **Taking a nidus snapshot mid-write needs no coordination** — leans on nidus's own crash safety
  (a torn tail recovers on open); a snapshot mid-write is just an ordinary "crash" to the receiver.
- **Last-write-wins, deliberately.** Two devices crawling before either syncs → later publish wins,
  loser's output silently discarded. Safe because the whole bundle is reconstructable.
- Side benefit: `open_questions_t` lives in `knowledge.db`, so Q&A answers now carry across devices.

---

## Model capability & provider config

Capability varies sharply by role — matters because a weaker local model is the biggest risk here:

- **Per-entry extraction** — best fit for local models. Bounded failure (flagged low-confidence or
  corrected next pass, never reaches the user directly). Low risk.
- **Reasoning pass** (alias detection, cross-entry patterns) — harder, but bounded: worst case is a
  redundant question, never a corrupted table. Moderate risk, low cost.
- **Live chat / tool use / refusal discipline** — highest stakes. Smaller local models are more
  compliant/eager to answer than frontier models — the opposite of what "raise, don't hallucinate"
  needs. Mitigated by the evidence gate being enforced in code, not model judgment.

```ts
type ModelRole = "embed" | "crawl" | "reasoning" | "chat" | "voice";
type AgentProviderConfig = Record<ModelRole, OllamaModel | AnthropicModel | OpenAiCompatModel>;
```

`voice` is unused until M8 — `chat` alone does both tool-calling and generation until then; M8
narrows `chat` to orchestration and adds `voice` for final synthesis. All roles default to Ollama.
`reasoning` and `chat` are the first knobs to revisit if quality disappoints pre-M8.

**Library: Vercel AI SDK** (`ai`, MIT). `streamText` for token streaming over the existing RPC push
pattern. `generateObject` (Zod schema in, typed JSON out) replaces manual JSON-parse-and-retry —
the direct fix for "the model occasionally produces malformed JSON." Provider-agnostic tool-calling
for the retrieval loop. Providers: `@ai-sdk/anthropic`, `@ai-sdk/openai`, Ollama via its
OpenAI-compatible endpoint. Config stored in `config.json` under `userData`, like AWS creds.

**Not using**: LangChain.js/LlamaIndex.TS (heavier than needed — same reasoning nidus itself was
built on). MCP for the in-app agent (earns its keep for *external* agents like wdpkr/Claude Code;
here the agent and nidus are in-process, so calling the JS SDK directly as a tool function is
simpler and easier to evidence-gate).

---

## Tooling reference

| Tool | Helps with | Why |
|---|---|---|
| BAML (Boundary ML) | `crawl-runner.ts` | TS-compatible DSL for reliable structured extraction — worth evaluating against `generateObject` given 17 tables of repetitive extraction schemas. |
| Promptfoo | M5 eval, M7 provider comparison, M8 voice grading | TS-native, config-driven LLM eval — one tool for all three instead of three scripts. |
| whisper.cpp | Deferred audio extension | Metal-accelerated local Whisper port — the pick if that extension gets built. |
| WhisperX / pyannote-audio | Deferred audio extension, multi-person only | Speaker diarization before a transcript becomes training data. |
| Khoj (project) | Reference only | Similar local-first personal-notes AI — worth skimming prompt design, not adopting. |

**Deferred** — revisit only if `people_t`/`relationships_t`/`mentions_t`'s SQL joins prove
insufficient for real multi-hop questions once this is in use: **Kuzu** (embedded graph DB, single
file, no server — unlike the Neo4j-style engine declined below) as a replacement for those tables.

**Not recommending**: a server-based graph engine (Neo4j etc.), Dedupe.io/Splink for entity
resolution (the open-questions queue already fits), LangChain.js/LlamaIndex.TS.

---

## Structured knowledge tables (Layer 1)

Live in `knowledge.db` — a separate SQLite file from `journal.db`. Both sync, via different
mechanisms (entries: per-row tombstone log; knowledge: whole-file snapshot) — that's why they stay
separate files, not because only one syncs.

`crawl_state_t`, `people_t`, `mentions_t`, `relationships_t`, `locations_t`, `life_periods_t`,
`life_chapters_t`, `milestones_t`, `work_career_t`, `health_t`, `hobbies_activities_t`,
`recurring_themes_t`, `beliefs_values_t`, `social_t`, `knowledge_conflicts_t`, `entry_metadata_t`,
plus `open_questions_t` — **17 tables total**.

`entry_metadata_t.key_sentences` is also the source for nidus's `key_sentences` collection — every
write re-upserts those rows into nidus, keyed `{entry_id}#{index}`.

---

## Crawl architecture

- **Pass 1 (blind)** — raw entries → tables, low-confidence flagged, no guessing, resumable via
  `last_processed_entry_id`.
- **Reasoning pass** — reads all tables, writes only `open_questions_t`.
- **Q&A** — user answers.
- **Pass 2 (informed)** — re-run with answers as ground truth.
- **Pass 3+ (verification)** — refines tables only, no raw entries, on demand.

Schemas are Zod, passed to `generateObject` — not free-text JSON parsed defensively. Each
`prompts/*.ts` exports `{ schema, prompt }`; `crawl-runner.ts` is generic over both. Incremental
crawls can raise new open questions too, not just the initial pass. `entry_metadata_t` writes also
upsert nidus's `key_sentences`. First-ever crawl waits for first `/agent` navigation, same as
everything else lazy. Crawl model comes from the configured provider, not a hardcoded model name —
recheck current Ollama options at build time.

---

## Retrieval-quality eval

Don't trust M4's answers or widen the brain (M6+) without formally validating Layer 2 first.
Building M4 before this is fine — using it informally is how you find real eval questions — but
M4 existing isn't the same as M4 validated. Method borrowed from `wdpkr-core/src/eval/` (not
reusable directly, Rust vs TS):

1. ~30–50 real questions, each with known-correct entry id(s).
2. Script recall@k against `search_semantic`; check `min_score` isn't dropping true positives or
   letting weak matches through.
3. Tune `min_score`/embed model against this before the chat agent goes live.

---

## Agent tools

```
lookup_person(name)                 → Layer 1
get_life_period(date)               → Layer 1
get_milestones(date_range?)         → Layer 1
search_entry_metadata(filters)      → Layer 1 — topic/emotion/activity/date-range/flags
search_semantic(query, min_score?)  → Layer 2 — nidus, entries + key_sentences
search_journal(query)               → Layer 3 — FTS5, fallback
get_entries_by_ids(ids[])           → Layer 4 — evidence pull, last step before quoting
write_question(question, context, related_entry_id, sort_rank)  → the only write tool
```

All read-only except `write_question`, enforced in code.

---

## File layout

```
src/bun/agent/
  index.ts                # RPC handlers
  provider.ts              # per-role AgentProviderConfig + AI SDK client construction
  nidus-process.ts          # lazy spawn/health-check of `nidus serve`
  knowledge-db.ts            # knowledge.db connection + CRUD
  knowledge-sync.ts          # snapshot push/pull (single-writer, LWW)
  crawl/
    crawl-runner.ts          # generic: schema + prompt in, rows out, resumable
    reasoning-pass.ts         # write_question the only write tool
    prompts/                  # people.ts, metadata.ts, locations.ts, work.ts, health.ts,
                               # hobbies.ts, social.ts, relationships.ts, milestones.ts,
                               # themes.ts, beliefs.ts, life-chapters.ts
  knowledge-tools.ts          # agent tool set, AI SDK tool defs

shared/rpc-schema.ts          # extend AppRPC: agent:* channels

renderer/src/views/agent/
  index.ts, chat.ts (vanilla DOM, streamed), setup.ts (first-crawl progress), qa.ts (review screen)
```

```
agent:ensure-ready      request  spawn nidus if needed, pull knowledge.db if newer, readiness
agent:crawl-status      request  crawl_state_t for all crawl types
agent:crawl-progress    message  live progress push
agent:start-crawl       request  trigger initial/forced re-crawl
agent:get-questions     request  unresolved open_questions_t
agent:answer-question   request  write answer, targeted re-resolution
agent:skip-question     request  set skipped=1
agent:chat-send         request  send message, start streamed response
agent:chat-token        message  one token/chunk
agent:chat-done         message  response complete + cited entry ids
```

---

## Development workflow (nidus-modeled, spec-driven, parallel)

How tickets get built, not what gets built. Modeled on nidus's own `.claude/skills/nidus/`
(`lanes/spec.md` + `lanes/implement.md`).

1. **Research** — pick a ticket. `wdpkr search` (once T0 is done) stands in for nidus's own
   fixed-lens research fan-out — not worth rebuilding for a one-person project.
2. **Scope gate, before any blueprint file exists.** One `AskUserQuestion`: understanding + any
   shape-defining decision. Nidus's reasoning: once written, "what should this be" quietly becomes
   "is this wrong." Skip only if there's genuinely nothing to ask.
3. **Write blueprints — never delegated.** One `BLUEPRINT-<ticket>.md` per directory touched (e.g.
   T15 touches `src/bun/agent/` and `renderer/src/views/agent/` — two), each self-contained: files,
   exact code patterns (path + line range), acceptance criteria, verify commands. One root
   `BLUEPRINT-<ticket>.md` naming every sub-spec, phases (ordered groups — same phase parallel,
   next phase waits), verify commands.
4. **Plan gate** — second approval, over the drafted blueprints: approve/refine/reject.
5. **Implement** — one `Agent` call per sub-blueprint, `isolation: "worktree"`, launched together
   in one message, Sonnet effort. Each agent sees only its own sub-spec — the real token-saving
   mechanic.
6. **Merge/verify/review stay on the orchestrating session, never delegated** (nidus's rule
   verbatim). Apply each diff by hand, build once, typecheck once. `/code-review` covers review.
7. **Ship.**

Not adopted from nidus: beads for ticket tracking (nidus's own rule forbids markdown checklists;
kept here anyway — a full issue tracker is overhead for one person), multi-ticket bundling (this
doc's tickets are already scoped small), noho's hard line-count carving rule (keep the instinct,
not the number).

---

## Tickets

Small enough for one or two sittings, self-contained enough to resume cold. **M4 is the point this
stops being a spec and becomes a usable assistant.**

### M0 — Dev environment (optional, not blocking)
- [ ] **T0** — `wdpkr init` + `wdpkr config set store.provider nidus` against this repo.
- [ ] **T0.5** — Build `.claude/skills/toop-dev/`: scope gate → blueprints (root + per-directory,
      phases/verify block) → plan gate → parallel `Agent` calls (`isolation: "worktree"`) → merge
      by hand. Depends on T0. See Development workflow above.

### M1 — Foundations
- [ ] **T1** — `provider.ts`: per-role `AgentProviderConfig`, all default Ollama, stored in
      `config.json`.
- [ ] **T2** — `knowledge-db.ts`: `knowledge.db`, all 17 tables up front, CRUD added incrementally.
- [ ] **T3** — `knowledge-sync.ts`: publish (nidus dir → `knowledge.db` → `version.json`, in that
      order) and pull. Test against near-empty data first.
- [ ] **T4** — `nidus-process.ts`: lazy spawn, wired *after* T3's pull. Create `entries` +
      `key_sentences` collections.

### M2 — First real data: people + entry metadata
- [ ] **T5** — `crawl-runner.ts`: generic, Zod schema + prompt in, rows out, resumable.
- [ ] **T6** — `prompts/people.ts` (pass 1, blind) → `mentions_t`. No aliasing yet.
- [ ] **T7** — `prompts/metadata.ts` → `entry_metadata_t`, re-upserts `key_sentences` into nidus.
- [ ] **T8** — Embed `toSearchText(content)` into nidus's `entries` collection.

### M3 — Reasoning pass + open-questions loop
- [ ] **T9** — `reasoning-pass.ts`: reads `mentions_t` in aggregate, `write_question` only write.
      Test: does it flag "Alex" (34x) / "Yeezy" (127x) as likely-same-person?
- [ ] **T10** — `open_questions_t` + get/answer/skip RPC, with dedup-before-insert.
- [ ] **T11** — `qa.ts` review screen.
- [ ] **T12** — Pass 2 (informed re-crawl) → `people_t` populated with canonical names/aliases.

### M4 — First usable agent (real v1 milestone)
- [ ] **T13** — `knowledge-tools.ts`: `lookup_person`, `search_entry_metadata`, `search_semantic`,
      `get_entries_by_ids`, `search_journal`, `write_question`. (`get_life_period`/`get_milestones`
      land later in T24.)
- [ ] **T14** — Evidence gate: `min_score` floor → no hits below it; chat hard-stops on no evidence
      across all layers. Own ticket — this is the load-bearing guardrail.
- [ ] **T15** — `chat.ts` + chat RPC — streamed, cited entries linked.
- [ ] **T16** — `agent:ensure-ready` end to end + `setup.ts` cold-start screen.

Test at this point: "when was the first time I met Yeezy and what did we do," "how was I feeling
when X happened."

### M5 — Prove it before trusting it further
- [ ] **T17** — Eval harness: 30–50 questions, recall@k against `search_semantic`.
- [ ] **T18** — Tune `min_score`/embed model against T17. Don't build M6 on an unvalidated Layer 2.

### M6 — Widen the brain
- [ ] **T19** — `locations.ts` + `life_periods.ts`.
- [ ] **T20** — `work.ts`, `health.ts`, `hobbies.ts`, `social.ts`.
- [ ] **T21** — `relationships.ts` + `milestones.ts`.
- [ ] **T22** — `themes.ts` + `beliefs.ts`.
- [ ] **T23** — `life-chapters.ts` (synthesis, last — reads all finalized tables).
- [ ] **T24** — Add `get_life_period`/`get_milestones` to tools, wire into chat.

### M7 — Ongoing enrichment
- [ ] **T25** — Verification passes (pass 3+) + UI trigger.
- [ ] **T26** — Incremental crawl on every `/agent` open (entries newer than `crawled_at`,
      re-publish snapshot). Before this, crawls are manually triggered.
- [ ] **T27** — Swap `reasoning`/`chat` to a cloud provider, compare quality vs. Ollama baseline.

### M8 — Voice: fine-tune a model on your own writing

Different problem from M1–M7 (factual, cited) — this is situational/advice questions with no
literal precedent ("I left X at home, what do I do"), aiming for a response that sounds like you.
Text only — no audio yet (see below). Fine-tuning teaches *voice*, never replaces retrieval: a
model fine-tuned on your journal will fabricate specific "memories" in your exact voice, more
convincing and more wrong than a generic hallucination. Two-stage pipeline: `chat` role
(tool-calling, unchanged) gathers facts + analogous moments; `voice` role (the fine-tune) writes
only the final response, never tool-calls — this also sidesteps fine-tuning degrading tool-calling
reliability. Evidence gate becomes **per-claim**: a specific factual assertion still needs a
citation; advice/reasoning doesn't, but states whether it's echoing a real parallel or extrapolating.

- [ ] **T27.5** — Spike: in-context style transfer (retrieved analogous moments as prompt
      examples), no training. Gauge how far this gets before investing further.
- [ ] **T28** — Data prep: `entry_metadata_t` (`decisions_made`, `key_sentences`,
      `questions_asked`, `emotions`) + raw text → (situation, response) training pairs.
- [ ] **T29** — MLX-LM locally, small LoRA fine-tune on a sample end to end.
- [ ] **T30** — Full fine-tune, qualitative eval against held-out entries.
- [ ] **T31** — Convert to GGUF, serve via Ollama as the `voice` role.
- [ ] **T32** — Wire the two-stage pipeline (`chat` gathers → `voice` synthesizes).
- [ ] **T33** — Per-claim evidence gating in the synthesis step.
- [ ] **T34** — Decide a re-fine-tune cadence (manual, on-demand).

Depends on M2 (data), M4 (orchestrator), ideally M5 (validated retrieval) — sequenced last since
it's the least certain and most expensive to iterate.

**Open**: nidus vectors sync (cheap to rebuild); the trained GGUF is not cheap to rebuild per
device. Whether it joins the sync bundle or stays single-device is undecided — left open until M8
is actually being built.

---

## Voice extension: audio (deferred, not scheduled, no tickets)

M8 above is text only — trained on journal writing. This is a separate, later idea: audio as a
*second* data source and *second* output modality. Nothing here is scheduled or has tickets; it
plugs into M8 without changing anything upstream of it.

- **Input** — record + transcribe with **whisper.cpp**, feed transcripts into T28 alongside journal
  text. Spoken language may be better training material than journal prose.
- **Output** (separate, also undecided) — voice-cloned speech via **Coqui XTTS-v2** or
  **OpenVoice**, both local. A pure bolt-on at the very end of the pipeline: text response in,
  audio out. Touches nothing upstream of T31.
- **Worth knowing before committing**: continuous recording is a much bigger commitment than
  journaling, and multi-person audio raises recording-consent law (varies by state).

---

## Watch-outs

- Model is read-only everywhere except `write_question` — enforced in code.
- `knowledge.db` stays a separate file from `journal.db` — different sync mechanisms, not "one
  syncs, one doesn't."
- `knowledge_conflicts_t` (interpersonal conflicts) ≠ cloud-sync conflicts in `cloudsync/` — naming
  collision risk.
- Switching embed providers = full nidus re-embed of both collections.
- Publish order is load-bearing: nidus dir → `knowledge.db` → `version.json`. Don't reorder.
- `write_question` dedup matters at this scale, or the same ambiguity gets raised repeatedly.
- Pass 2 overwrites pass 1 per table — idempotent, safe to re-run.
- Embedded/word-counted text is always stripped plain text (`toSearchText`), never raw HTML.
