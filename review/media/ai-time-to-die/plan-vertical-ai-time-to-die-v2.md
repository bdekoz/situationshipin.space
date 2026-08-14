# ai-time-to-die — proposed vertical v2 synthesis

Status: `PHASE-6-V2-SYNTHESIS 2026-08-14; draft-9 KEEP (bdekoz/situationshipin.space#28)`

## Decision summary

Draft 9 of the 57-second ai-time-to-die vertical episode was reviewed with a
**KEEP** (issue #28).  This document is the Phase 6 v2 synthesis: it turns
the measured draft-1..9 work into staging, gates, estimates, pilot options,
and orchestration for producing full episodes.  The companion
devastation-pacific-house-style special-topics record is
`proposed_vertical_v2.pdf`.

## What the nine drafts measured

The episode template is 8 segments / 57 s at 1080x1920@24:

| Segment | Duration | Executor | Measured local wall time (draft-4..9) |
|---|---|---|---|
| Title lead-in | 2 s | ffmpeg drawtext | ~5 s |
| T4 audit interjection | 3 s each (3 places) | pdftoppm + izzi + ffmpeg, 3 pages/s | ~30 s per interjection |
| T1a canonical (masked) | 20 s | MediaPipe FaceLandmarker + wild masks + ffmpeg | ~2.5 min (detection + 480 mask frames) |
| T2 codex cards + izzi bullets | 8 s | izzi vector overlay (Atkinson Mono, red-on-white 20 pt) | ~2-3 min (192 overlay frames) |
| T1b canonical (masked) | 10 s | same as T1a | ~1 min (240 mask frames) |
| T5 | 8 s | draft-1 HLT stand-in; provider version gated | ~30 s (HLT) / provider-gated |
| Audio mix | 57 s | canonical zf_xiaoyi remap + HLT + shinkansen bed | ~30 s |
| **Whole episode** | **57 s** | local pipeline | **~3-5 min measured** (draft-9: ~0.1 min audio-only remux) |

Provider spend measured across the round: **350 credits** total (110 for the
t5 here-lies-love 720p render, 240 for the t6 DTLA 1080p-requested render).
Both provider jobs returned below the requested resolution (496x864 and
1280x720), so the tiling workaround was abandoned; draft-9 T5 reuses the
here-lies-trouble pilot with its original audio.

Voice remap measured: MeanVC2 (Kokoro targets) converts ~30 s of canonical
dialogue in ~1-2 min on CPU; the selected voice is **zf_xiaoyi (V29)**,
Mandarin female, KEEP (issue #27).

## Corpus bound on episode count

The canonical source, `Blade.Runner.Final-Cut.4k-cut-4-1080p.1.mkv`, is
**79.0 s** (cut-5 is 16.0 s, camera-tracking style only).  Each episode
consumes 30 s of canonical source (T1a 20 s + T1b 10 s), so the canonical
corpus bounds the series to **2-3 episodes** before new canonical or
provider material is added.  This replaces the earlier open-ended episode
assumption with a measured bound.

## Staging and gates

| Gate | Decision | Default / status |
|---|---|---|
| G1 scope | Episode template + naming | Accepted (draft-1 plan) |
| G2 render bound | 57 s, 8 segments, 1080x1920@24 | Measured; KEEP at draft-9 |
| G3 publication | Portal publish | `PROJECT-APPROVED`; full-motion video + audio/image references live |
| G4 human review | KEEP / KEEP-PARTS / REVISE / REJECT | **KEEP on draft-9 (issue #28)** |
| G5 provider spend | New T5 episodes | Default: reuse HLT stand-in (zero spend); authorize per render (110-240 credits measured) |
| G6 voice remap | Female voice for canonical | **zf_xiaoyi (V29) KEEP (issue #27)**; wired into draft-9 |
| G7 portal classes | New review classes | Audio + image-reference media landed 2026-08-14 |
| G8 v2 doc + PDF | This synthesis + special-topics record | This round |

## Pilot options

### Pilot 1 — one episode (recommended default)

- Deliverable: `ai-time-to-die-episode-01` (57 s), draft-9 pipeline.
- Measured cost: ~5 min local render, zero provider spend (HLT T5),
  zf_xiaoyi canonical remap local.
- Time to completion: ~30-45 min including verification and portal publish.

### Pilot 1-3 — three episodes

- Episodes 1-3; episode 2 and 3 require additional canonical material
  (cut-4 is nearly consumed by two episodes) or provider-gated T5 scenes.
- Measured cost: ~15 min render, orchestrated; provider T5 optional per
  episode at 110-240 credits each if authorized.
- Time to completion: ~1.5-2 h plus human review cycles.

### Full series

- Bounded by canonical corpus at 2-3 episodes unless new source is added.
- A 3-episode series is the measured ceiling for the current seed corpus.

## Orchestration over rizal/ord/eureka

- **rizal** — control plane: repository, receipts, review publication,
  orchestration dispatch, and gate records.
- **ord** — worker node: izzi/ffmpeg segment renders (T1 masks, T2/T3
  overlays, T4 interjections, concat/encode).  Segments are independent and
  parallelizable across episodes.
- **eureka** — worker node: MeanVC2 voice conversion (canonical remap) and
  Higgs TTS when authorized; the voice venv lives there.
- **Provider (Seedance)** — external, gated G5; never default.

## Expense and time estimates

| Item | Measured unit cost | Series of 3 episodes |
|---|---|---|
| Local render | $0, ~5 min/episode | ~15 min |
| Provider T5 (if authorized) | 110-240 credits per 10 s render | 330-720 credits |
| Voice remap | $0, ~2 min/30 s canonical | local |
| Publication | $0 | portal + validator |
| Human review | gate rounds | 1-3 rounds |

Total series cost: **$0 local + 0-720 provider credits**, with a default of
zero provider spend (HLT T5 reuse).  Time to completion for the 3-episode
series: **~1.5-2 h render + review cycles**.

## Risks and open items

- Provider resolution cap persists (1080p requested, 720p/496x864 returned).
- PGS subtitle burn for canonical segments is still `NOT-BURNED` (bitmap
  track, no local burn path).
- WASM byte-parity for `izzi-svg-text-overlay.h` not yet verified.
- Portal payload budget is 80 MiB; full-motion video reviews accumulate and
  will need periodic pruning or a higher bound.
- The reference image set (guilloche/moire/surface-tension, 26 webp items)
  is live on the portal for precise example citation during reviews.
