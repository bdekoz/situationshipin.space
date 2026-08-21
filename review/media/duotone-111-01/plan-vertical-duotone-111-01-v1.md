# duotone-111-01 — plan draft v1 (exploratory)

Status: `PLAN-DRAFT 2026-08-21; EXPLORATORY; ZERO-SPEND; TRANSCRIBED`

## Idea

Vertical project duotone-111-01 (slug m337-cu73): transcribe the canonical source recording 20260820_dutotone_111_first.wav, assess platform production fit against the May 2026 network needs, and decide whether a full vertical is warranted.

## Recovered planning context

This vertical was started from GitHub issue
[bdekoz/izzi#3](https://github.com/bdekoz/izzi/issues/3) ("New plan proposal:
duotone-111-01") — product type `vertical-project`, round `plan-v1`, stage
`draft`, directive "please transcribe and assess fit". The issuing Codex
session (rincon) was killed mid-run; its planning survives in the saved plan
draft and the session transcript
(`~/.codex/sessions/2026/08/20/rollout-2026-08-20T21-19-51-01a0228b-ee78-72d0-bdf5-bf9c45b21cc7.jsonl`),
and is folded in here:

- Slug corrected from `duotone-111-01-m33t-cute` to `duotone-111-01-m337-cu73`.
- Voice direction: "high-quality studio warm voice", the fal.ai improvements
  over the in-house baseline first; local path is the fallback.
- Compute: `ord` is available alongside `eureka` for the voice pass.
- The killed run's partial pass observed the premise at ~15%; the completed
  pass below confirms it.

## Canonical source

- Audio: `resources.rizal/duotone-111/20260820_dutotone_111_first.wav`
- Format: PCM 16-bit little-endian, 44.1 kHz stereo, duration 52:16
- SHA-256: `9671112e549ff4660107dd7ba89161402558e6893660a1784c2098b976624767`
- Transcription backend: pinned whisper.cpp `592feef0` (CPU build, rizal),
  large-v3-turbo model; Silero VAD available for the long-form pass

## Transcription (complete 2026-08-21, local, zero-spend)

- Backend: whisper.cpp `592feef04a1802b18cbeffd0fd0eb5d02570c2ec`, CPU build
  on rizal, large-v3-turbo quantized model, 24 threads.
- Long-form pass: Silero VAD `ggml-silero-v5.1.2.bin` reduced the audio from
  50,171,959 to 40,530,400 samples (19.2% reduction); language auto-detected
  as English (`p = 0.999`).
- Word-timestamp pass complete: 9,034 segments, 9,443 word tokens, about
  8,000 words of dialogue.
- Phrase-level pass complete: 409 segments, 7,986 words, total time
  1,167.9 s. Published as
  `resources.rizal/duotone-111/20260820_dutotone_111_first.asr-draft.20260821.{json,srt,txt,vtt}`
  (json sha256 `21d284de…`); the word-timestamp pass remains under the
  ignored `build/private/duotone-111-01/transcription/` path.

## Premise (from the transcription)

An AI construct is trapped in a stylized noir virtual reality. A UN
"human-AI relations" agent (code name Bonbon Bunny) arrives from San
Francisco 2026, establishes that the construct is an unauthorized AI agent
built from a real human's captured likeness, and offers extraction with
explicit consent. The conversation is agent-client banter, dating advice,
makeover, and coffee scenes around the construct's date with a British
writer ("Christmas"), with themes of AI personhood, consent, belonging, and
identity. No dialogue has been invented; everything above is stated in the
recording.

## Production fit (preliminary, v1-deepseek pass)

Assessed against the May 2026 network needs
(`resources.static/production-fit/2026-05-production-needs.json`); see
`resources.static/production-fit/duotone-111-01-production-fit.md`.

- STRONG: Netflix (voice-driven character drama, unconventional romance,
  grounded genre).
- MODERATE: Apple (grounded sci-fi + big hook), Hulu (propulsive joy,
  romance).
- WEAK-MODERATE: FX, Peacock, Starz, Onyx Collective.
- WEAK: HBO, HBO Max, Amazon, Paramount+, MGM+, ABC, CBS, FOX, NBC.
- CONFLICT: Disney+ (straight character drama / dark material no-flys).
- N/A: Paramount+ with Showtime (not buying).

## Audio direction

- Voice target: high-quality studio warm voice.
- Preference: the fal.ai improvements over the in-house baseline. The voice
  direction lands on the fal.ai voice path first; the local in-house path
  (MeanVC2 / Kokoro / Higgs TTS) remains the fallback.
- Compute: `ord` is available alongside `eureka` for the voice pass
  (ord: 32 cores, 125 GiB unified memory, Ryzen AI MAX+ 395).

## What this vertical might look like

_Open questions, references, and rough directions only — no constraints yet._

## Next iteration

Formality arrives by iteration, not by fiat. Later drafts fill in, in
order: episode template, segments, estimates, pilot options, gates, and
orchestration. The formal plan is the first artifact that requires all
six; every earlier stage is reviewed as-is and advances on explicit
KEEP.

This draft advances next by: publishing this plan draft for review on
plans.html, waiting for a KEEP/REVISE on the draft and the fit assessment,
and only then moving toward the fal.ai warm-voice pass on `ord`.
