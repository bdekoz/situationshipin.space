# Audit Usage Blackout — plan draft v1 (exploratory)

Status: `PLAN-DRAFT 2026-08-19; EXPLORATORY; ZERO-SPEND`

Provenance: proposed through `situationshipin.space/plans.html`;
[GitHub issue #2](https://github.com/bdekoz/izzi/issues/2), approved
2026-08-18. Product type `short`, plan-v1, draft stage.

## Idea

Chronological audit-usage report pages as a 1080p portrait blackout short
with shinkansen ambience.

## Proposal description (verbatim from the issue)

- 1080p portrait (9:16)
- 1 channel

Project resources:

`/home/bkoz/src/izzi/resources.rizal/audit-usage/*.pdf`

Generate a short via the following:

- Proceed chronologically through the reports, with the first report at the
  beginning (`audit-usage-2026-08-06-1315-PT.pdf`) and
  `audit-usage-2026-08-18*.pdf` at the end.
- For all `*.pdf` report files in the folder:
  - drop all pages to PNG files that fit the width of the frame;
  - center vertically;
  - use the randoma11y color in the document to letterbox any gap between
    the page and the rest of the frame;
  - at the end of the report pdf, insert a 3 second black frame spacer.
- Start with a 3 second black frame spacer.
- There is no title card.
- Audio samples from `20190914-shinkansen-1.wav` and
  `20190914-shinkansen-2.wav`, repeated if necessary.

## Short form

- Resolution: 1080p portrait (9:16, 1080×1920)
- Channels: 1, portrait
- Output: exactly one video file
- Title card: none

## Verified inputs

Ten reports in `resources.rizal/audit-usage/`, chronological order, with
measured page counts (`pdfinfo`):

| Report | Pages |
| --- | ---: |
| audit-usage-2026-08-06-1315-PT.pdf | 7 |
| audit-usage-2026-08-06-1538-PT.pdf | 11 |
| audit-usage-2026-08-07-0930-PT.pdf | 12 |
| audit-usage-2026-08-07-1152-PT.pdf | 16 |
| audit-usage-2026-08-07-2329-PT.pdf | 19 |
| audit-usage-2026-08-09-0711-PT.pdf | 14 |
| audit-usage-2026-08-10-0838-PT.pdf | 14 |
| audit-usage-2026-08-11-0428-PT.pdf | 14 |
| audit-usage-2026-08-16-1830-PT.pdf | 19 |
| audit-usage-2026-08-18-1657-PT.pdf | 19 |
| **Total** | **145** |

Audio inputs (`ffprobe`):

| File | Duration |
| --- | ---: |
| 20190914-shinkansen-1.wav | 22.06 s |
| 20190914-shinkansen-2.wav | 21.38 s |
| **Pair** | **43.44 s** |

## Total-time estimate

The proposal fixes the spacers but not the per-page hold time, so the hold
time is the one planning parameter. Structure: a 3 s black opener, then for
each of the ten reports its pages in order followed by a 3 s black spacer
(11 spacers total = 33 s), and no title card.

`total = 33 s + 145 pages × hold`

| Hold per page | Pages | Spacers | Total |
| ---: | ---: | ---: | ---: |
| 1.0 s (default) | 145.0 s | 33 s | **178.0 s (2:58)** |
| 1.5 s | 217.5 s | 33 s | 250.5 s (4:10) |
| 2.0 s | 290.0 s | 33 s | 323.0 s (5:23) |
| 3.0 s | 435.0 s | 33 s | 468.0 s (7:48) |

Default is 1.0 s per page, matching the 1 s/page audit-usage interjection
convention already used in the time-to-die vertical. A denser, glitchier
read favors the default; a legibility-first read favors 2–3 s per page.
This is the human gate on the estimate; the plan computes every value from
the measured inputs once the hold is chosen.

Audio coverage at the default: 178.0 s needs
`ceil(178.0 / 43.44) = 5` plays of the 43.44 s shinkansen pair
(217.2 s of source), trimmed/faded to the 178.0 s timeline — "repeat if
necessary" is satisfied without gaps.

## Next iteration

Formality arrives by iteration, not by fiat. The next draft locks the
per-page hold (default 1.0 s), the randoma11y letterbox color, the
page-fit policy, and the audio loop/fade, then adds render orchestration.
The formal plan is the first artifact that requires the full contract;
every earlier stage is reviewed as-is and advances on explicit KEEP.
