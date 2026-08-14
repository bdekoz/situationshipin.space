# ai-time-to-die — proposed vertical v3 plan (episodes 01–03 + corpus bound)

Recorded: 2026-08-14 America/Los_Angeles
Status: `PLAN-VERTICAL-V3; AWAITING-APPROVAL; NOT-SHARED`

This is the working production plan for the ai-time-to-die vertical
(implemented project id `time-to-die-ai`; display name `ai-time-to-die`).
It supersedes
[`proposed_vertical_v2.md`](proposed_vertical_v2.md) and the
[`proposal_vertical_v3.md`](proposal_vertical_v3.md) walkthrough summary for
current planning. The plan-vertical review artifact for this document is
published on situationshipin.space; a `KEEP` on it unlocks production.

## Corpus definition

The canonical source is the single seed-video cut in the project corpus
(`resources/time-to-die-ai/seed-video-corpus/`):

| Source | Duration | Role |
| --- | ---: | --- |
| `Blade.Runner.Final-Cut.4k-cut-4-1080p.1.mkv` | 79.0 s | Canonical source for T1a/T1b windows |
| `Blade.Runner.Final-Cut.4k-cut-5-1080p.1.mkv` | 16.0 s | Camera-tracking style reference for the vertical conversion |

Each episode consumes 30 s of canonical source (T1a 20 s + T1b 10 s), so the
canonical corpus bounds the series to **2–3 episodes** before new canonical
or provider material is added. Episode 01 and 02 are distinct canonical
episodes; episode 03 is a documented callback plus a gated provider location
(Koreatown night-market scene), recorded as such rather than claiming new
canonical coverage.

## Episode template (measured, draft-9)

The locked template is **8 segments / 57 s at 1080×1920@24**, with a 2 s
title lead-in per episode:

| Segment | Duration | Executor | Measured local wall time (draft-4..9) |
| --- | ---: | --- | ---: |
| Title lead-in | 2 s | ffmpeg drawtext | ~5 s |
| T4 audit interjection | 3 s each (3 places) | pdftoppm + izzi + ffmpeg, 3 pages/s | ~30 s per interjection |
| T1a canonical (masked) | 20 s | MediaPipe FaceLandmarker + wild masks + ffmpeg | ~2.5 min (detection + 480 mask frames) |
| T2 codex cards + izzi bullets | 8 s | izzi vector overlay (Atkinson Mono, red-on-white 20 pt) | ~2–3 min (192 overlay frames) |
| T1b canonical (masked) | 10 s | same as T1a | ~1 min (240 mask frames) |
| T5 | 8 s | draft-1 HLT stand-in; provider version gated | ~30 s (HLT) / provider-gated |
| Audio mix | 57 s | canonical zf_xiaoyi remap + HLT + shinkansen bed | ~30 s |
| **Whole episode** | **57 s** | local pipeline | **~3–5 min measured** (draft-9: ~0.1 min audio-only remux) |

## Draft-loop history (drafts 1–9, portal review vocabulary)

The episode template was locked through nine attempted renders, each
published as an immutable portal artifact and reviewed via a GitHub issue on
`bdekoz/situationshipin.space`:

| Round | Decision / issue | Key change that round |
| --- | --- | --- |
| Draft 1 | REVISE (#18) | Initial attempted render; five timecode-specific findings |
| Draft 2 | REVISE (round 2) | Fit-page T4 at 3 pages/s, face/eye/mouth detection triangle masks, OCR line scroll, A/V state machine, tiling forensics ("cat has two tails") |
| Drafts 3–6 | REVISE loop | Bullet text orientation fix (glyph y-flip), full-height lanes, audit usage, wild 50% opacity masks, draft-1 HLT T5 stand-in |
| Draft 7 | REVISE (#25) | "Almost perfect" visuals; text still top-half only, audio wrong |
| Draft 8 | REVISE (#26 + #25) | Two-region OCR bullet text (BOC-9956 top / BOC-9942 bottom, y 3..1849), canonical source audio during T1a/T1b with shinkansen bed elsewhere, PGS subtitles NOT-BURNED |
| Draft 9 | **KEEP (#28)** | Audio-only remux of byte-identical draft-8 video; episode template locked |

Supporting decisions: voice selection **zf_xiaoyi (V29) KEEP (#27)** from the
29-voice Kokoro female stock bank; audio layout #26 (canonical segments carry
the voice-remapped dialogue, HLT T5 carries its original audio, shinkansen
bed everywhere else).

## Pilot plans (credits and time)

### Pilot 1 — episode 01 (recommended default)

- Deliverable: `ai-time-to-die-episode-01` master (57 s, draft-9 pipeline).
- Measured cost: ~5 min local render, zero provider spend (HLT T5 stand-in),
  zf_xiaoyi canonical remap local.
- Time to completion: ~30–45 min including verification and portal publish.

### Pilot 1–3 — episodes 01–03

- Episodes 01–02 use the canonical corpus; episode 03 is the documented
  callback + provider-gated Koreatown night-market scene.
- Measured cost: ~15 min orchestrated render; provider T5 optional per
  episode at 110–240 credits each when authorized.
- Time to completion: ~1.5–2 h plus human review cycles.

### Full series

- Bounded by the canonical corpus at **2–3 episodes** unless new canonical
  or provider material is added.
- A 3-episode series is the measured ceiling for the current seed corpus.

### Provider spend measured (round total)

| Item | Credits | Delivered geometry |
| --- | ---: | --- |
| t5 here-lies-love 720p render | 110 | below-720 (496×864 observed on the 720p-request path) |
| t6 DTLA 1080p-requested render | 240 | 720×1280 |
| Episode-3 provider location (Koreatown) | 240 | 720×1280 |
| **Round total** | **590** | resolution cap persists (requested 1080p → 720×1280; requested 720p → 496×864) |

Tiling was abandoned; the accepted draft-1 HLT stand-in is the default T5,
and provider episodes are contain-fit compositions, never tiled.

## Production pipeline and orchestration

- **rizal** — control plane: repository, receipts, review publication,
  orchestration dispatch, and gate records.
- **ord** — worker node: izzi/ffmpeg segment renders (T1 masks, T2/T3
  overlays, T4 interjections, concat/encode). Segments are independent and
  parallelizable across episodes.
- **eureka** — worker node: MeanVC2 voice conversion (canonical remap) and
  Higgs TTS when authorized; the voice venv lives there.
- **Provider (Seedance)** — external, gated G5; never default.

Per-segment executors are listed in the episode template table; the draft-9
renderer (`scripts/render-time-to-die-draft8.py` pipeline with the draft-9
audio-only remux) is the production baseline.

## Gates and authority

| Gate | Decision | Current state / default |
| --- | --- | --- |
| G1 scope | Episode template + naming | Accepted (draft-1 plan) |
| G2 render bound | 57 s, 8 segments, 1080×1920@24 | Measured; KEEP at draft-9 (#28) |
| G3 publication | Portal publish | `PROJECT-APPROVED`; full-motion video + audio/image references live |
| G4 human review | KEEP / KEEP-PARTS / REVISE / REJECT | Episodes 01–03 published, **awaiting G4**; never auto-promote |
| G5 provider spend | New T5 episodes | Default: reuse HLT stand-in (zero spend); authorize per render (110–240 credits measured) |
| G6 voice remap | Female voice for canonical | **zf_xiaoyi (V29) KEEP (#27)**; wired into the production pipeline |
| G7 portal classes | New review classes | Audio + image-reference landed; plan-vertical class live (v3 is its formal plan) |
| G8 v2/v3 synthesis + PDF | This record | v2 done; v3 = this document + special-topics PDF |

## Status report — episodes 01–03 (2026-08-14)

- Episode masters 01–03 rendered, verified, and published as full-motion
  `episode-master` reviews on situationshipin.space; live and awaiting G4.
- Portal payload: 96 MiB cap; ~86 MiB used; full-motion reviews accumulate and
  will need periodic pruning or a per-series planned bound.
- Reference sets live on the portal: 29-voice Kokoro female audio bank and
  26-image guilloche/moire/surface-tension reference set.
- Draft-9 was a ~0.1 min audio-only remux because the video was byte-identical
  to draft-8 (deterministic reuse recorded as a legitimate accelerator).

## Risks and open items

- **Provider resolution cap persists** (1080p requested, 720×1280 or
  496×864 returned). Plan for contain-fit composition; never tiling.
- **PGS subtitle burn** remains `NOT-BURNED` (bitmap track, no local burn
  path); policy is burn-if-possible-else-skip, recorded per episode.
- **WASM byte-parity** for `izzi-svg-text-overlay.h` not yet verified.
- **Portal payload budget** grows with full-motion reviews; plan per series,
  not reactively.
- **Custom accents** (Asian-American, Southern) require human reference
  recordings; Kokoro stock voices are sufficient for production selection.
- **Higgs TTS** remains gated; MeanVC2 is the production voice path.

## Definition of done (v3)

- `proposed_vertical_v3.md` reviewed via the plan-vertical class on
  situationshipin.space; a formal-stage `KEEP` unlocks production.
- `proposed_vertical_v3.pdf` (devastation-pacific-house-style special-topics,
  coda-share) present with special-topics + coda-share checkers PASS in
  source and PDF modes.
- No provider spend at plan stage; `baseline_state` remains `NOT-PROMOTED`
  until an explicit episode `KEEP` (G4).

## Evidence anchors

- Draft loop: `draft-2.md`, `draft-8.md`, `explore_futures.20260813.md` in
  this directory; renderers `scripts/render-time-to-die-draft*.py`.
- Portal reviews: issues #18–#28 on `bdekoz/situationshipin.space`.
- Voice: 29-voice audio bank review pages; zf_xiaoyi KEEP #27.
- Reference set: 26-image guilloche/moire/surface-tension review pages.
- Dyad records: `examples.rizal/local-objects/dyads/` (Phase 6 and draft-loop
  snapshots); draft-9 KEEP mirrored in
  `examples.rizal/local-objects/legacy/izzi-docs-training-conversion-2026-08-12/decisions/`.
