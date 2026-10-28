# situationshipin.space

Public GitHub Pages canary for reviewing a bounded, paginated selection of
[Izzi](https://github.com/bdekoz/izzi) visual artifacts and human-selected
aesthetic references.

The site is static. Draft feedback stays in browser `localStorage` until the
reviewer downloads JSON or explicitly opens a public GitHub issue draft. The
site contains no account token, analytics, autoplay, source audio, or source
MKV episodes. Selected large MKVs remain inspectable through derived ten-frame
filmstrips and independently reviewable numbered thumbnails.

Aesthetic-reference collections use compact public derivatives rather than
source originals. Reviewers can classify each reference as positive, negative,
held, or excluded evidence, then return a hash-bound JSON review package or
prepare a public issue with a suggested Codex handoff prompt.

## Local preview

Serve the repository root over HTTP so the browser can fetch the JSON catalog:

```sh
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/`.

Validate the bounded public payload locally:

```sh
node scripts/check-review-site.mjs
```

After intentionally changing the catalog or portal code, refresh the measured
build receipt and rerun the checker:

```sh
node scripts/update-build-manifest.mjs
node scripts/check-review-site.mjs
```

## Workflow diagrams and local models

[Open the diagram index](https://situationshipin.space/review/workflow-v2-diagram-index/)
for four views: hardware/software, compute resources, Baseline v1 and the
Workflow v2 loop. Each has PNG, zoomable SVG and editable Mermaid downloads.
The original two review URLs remain stable. The October 27 inventory places
both DeepSeek V4 Flash (`ds4` / ROCm, on demand) and `ornith-1.5:35b`
(Ollama) on eureka, sharing its 96 GiB GPU allocation.

Edit the four tagged Mermaid blocks in Izzi's `docs/workflows.md`. Their
hardware/model evidence is
`resources.static/workflows/local-model-inventory.20261027.json`; the
accepted August hardware/software map remains a historical snapshot in
`docs/development/sessions/20260817.fal.ai_stage_2.md`, section 5.2.1.

Render using Mermaid 11.16.1 / CLI 11.16.0 with the installed Chrome browser:
the three layouts revised for issues #78–#80 use explicit SVG coordinates
and librsvg/Pycairo PNG export. This preserves equal workflow boxes,
rectangular hosts arranged in a triangle, and the architecture's combined
local-media group and three hosted choices. The per-diagram configurations
record the layout; the Mermaid blocks supply labels and connections.

```sh
workflow_tools=$(mktemp -d)
PUPPETEER_SKIP_DOWNLOAD=1 npm install --prefix "$workflow_tools" \
  @mermaid-js/mermaid-cli@11.16.0 mermaid@11.16.1 puppeteer@24.16.0
python3 /home/bkoz/src/izzi/scripts/render-workflow-diagrams.py \
  --mmdc "$workflow_tools/node_modules/.bin/mmdc" --update-doc-images
```

After committing the source, prepare this site's bounded publication:

```sh
node scripts/publish-workflow-diagrams.mjs \
  --izzi-commit <40-hex-source-commit> \
  --diagrams-dir /home/bkoz/src/izzi/outputs/workflows-v2/20261027-review-80
node scripts/update-build-manifest.mjs
node scripts/check-review-site.mjs
```

The publisher verifies every render-packet file against its receipt before
copying it. Downloads live under `review/media/workflow-v2-diagrams/`;
Mermaid sources use `.mermaid.txt` URLs and download as `.mmd` files. The
index also links the inventory, render receipt, render configuration and
commit-pinned editable documentation. Updated diagrams await human review.

## Here Lies Trouble — current Stage 4 review

[Open the review package](https://situationshipin.space/review/here-lies-trouble-stage-4/).
It includes the complete **103-second** Stage 4 allocation, the canonical
`here-lies-trouble.20261026.fourth-draft.txt` and fresh PDF, Fountain and FDX
exports, plus the October 26 format-fit, production-breakdown and
production-details documents. All 191 screenplay turns are retained.
The three Markdown downloads preserve their source bytes; readable web
versions resolve published links and label unavailable working files as
local archive references.

This is the complete rendered Stage 4 sequence, covering turns 1–9. The
full episode audio is 52:35.375; the remaining episode picture has not been
produced. Terrain is accepted; reciprocal gaze and speaking mouths remain
unfinished. Publication for review does not mark these requirements accepted.

The browser video retains all 2,472 frames at 24 fps, resized to 720×1280,
with the original AAC packets copied unchanged. Its 14.8 MiB size fits the
existing 16 MiB object limit. The native 1080×1920 master stays in Izzi.

To reproduce the proxy (FFmpeg) and package (Python Markdown, ReportLab and
Liberation Mono required), choose a temporary output directory:

```sh
hlt_work=$(mktemp -d)
hlt_video=/home/bkoz/src/izzi/outputs/here-lies-trouble/stage-4-20261026-option-b-v3/review/here-lies-trouble-stage-4-103s.mp4
ffmpeg -y -i "$hlt_video" -map 0:v:0 \
  -vf scale=720:1280:flags=lanczos -c:v libx264 -preset medium \
  -b:v 1020k -pix_fmt yuv420p -threads 4 \
  -pass 1 -passlogfile "$hlt_work/pass" -an -f null /dev/null
ffmpeg -y -i "$hlt_video" -map 0:v:0 -map 0:a:0 \
  -vf scale=720:1280:flags=lanczos -c:v libx264 -preset medium \
  -b:v 1020k -pix_fmt yuv420p -threads 4 \
  -pass 2 -passlogfile "$hlt_work/pass" -c:a copy -movflags +faststart \
  "$hlt_work/stage-4.review.mp4"
python3 scripts/publish-hlt-stage4.py --approve PROJECT-APPROVED \
  --izzi-root /home/bkoz/src/izzi --video-proxy "$hlt_work/stage-4.review.mp4"
node --test scripts/review-publication-approval.test.mjs
node scripts/update-build-manifest.mjs
node scripts/check-review-site.mjs
```

The publisher checks the frozen source hashes, full duration/frame count and
AAC packet identity. It records every published asset's hash. The FDX is a
Final Draft XML script subset, round-tripped against every source turn; it
has not been tested in the Final Draft desktop application.

The owner's October 27 request explicitly authorizes review publication of
this existing video. Its catalog grant binds the artifact ID and both media
hashes. The August visual-styling/audio production gates retain their existing
decisions; this review grant authorizes neither creative acceptance nor new
production. The validator rejects reuse of the grant for changed media.

Before this publication, the site validator already reported 19 unrelated
provider-input findings. The package adds no new findings. Those existing
files are outside this publication's scope.

## Hamonshū V2 source categories

| Review packet | Inspected scans | Graphic water crops | Text-only exclusions |
| --- | ---: | ---: | --- |
| [Book 1](https://situationshipin.space/review/hamonshu-v2-book1/) | 29 | 165 | Scan 002 |
| [Book 2](https://situationshipin.space/review/hamonshu-v2-book2/) | 28 | 154 | None |
| [Book 3](https://situationshipin.space/review/hamonshu-v2-book3/) | 29 | 156 | Scan 028 |

The 475 graphic water forms have neutral book/scan/segment filenames and no
assigned categories. Reviewers name their own groups, add notes, and download
a JSON file for each book. Drafts stay in that browser, separately for each
book; loading a review replaces its current draft. Return the file to Benjamin
for applying the categories in Izzi. Synthesis waits for human category review.

Each packet includes 1600-pixel review JPEGs, 28 source-location overlays, and
seven contact sheets. Writing examples are excluded. Full-resolution PNG crops
remain local in Izzi. The crop plan, source hashes, masks, and preview hashes
travel with each packet; categories are tied to that exact book and crop plan.
Book 2 includes cross-gutter compositions and overlapping samples. Book 3
includes folded water-pattern ribbons and two masked scroll designs.

Rebuild from a verified Izzi crop packet (Python and Pillow required):

```sh
python3 scripts/publish-hamonshu-crops.py --volume 2 \
  --izzi-root /home/bkoz/src/izzi --izzi-commit <40-hex-source-commit>
node scripts/update-build-manifest.mjs
node scripts/check-review-site.mjs
```

Use `--volume 1`, `2`, or `3`; the default is Book 1. Publishing one volume
preserves the other books and their draft identities. The publisher writes
this checkout; commit and push to deploy. Supporting assets are included in
the same 192 MiB site payload limit as catalog images, with a 16 MiB per-file
limit. In Izzi, `scripts/apply-hamonshu-categories.py` selects the book from the
returned JSON and previews folder moves; `--apply` performs the selected review.
It rejects a mismatched book or crop plan, even with a directory override.
Different reviewers' files are reviewed separately before choosing categories.

## Publishing a new video proof

Put a video up for review with one approval-gated command. The canonical
source stays private; the script publishes a bounded `.mp4` proxy (site
policy: ≤ 16 MiB, no MKVs in the Pages tree):

```sh
node scripts/publish-video-proof.mjs \
  --approve PROJECT-APPROVED \
  --source outputs/.../cut-v1.review.mp4 \
  --source-path outputs/review/feedback/visual/.../cut-v1.review.mp4 \
  --artifact-id hlt-episode-01-cut-v1 \
  --title "Here Lies Trouble — Episode 1 — cut v1" \
  --description "What the reviewer should look at" \
  --family here-lies-trouble \
  --generation-class episode-master \
  --feedback-round neon-addict-stage-01-v2 \
  --review-scope EPISODE-01-MASTER
```

The command validates the approval gate and proxy size, computes the SHA-256
and dimensions, adds or updates the catalog entry, generates the exact review
page and manifest, refreshes the build receipt, and runs the site validator.
Use `--dry-run` to preview the plan, or pass `--render-proxy` with an `.mkv`
source to render the 360×640 proxy with ffmpeg. After the script succeeds,
commit and push the portal repository.

## Publishing a new plan review

Put a vertical production plan up for review with one approval-gated
command. Plans are reviewed as documents (markdown, plus an optional
special-topics PDF), and validation is graduated by plan stage so the first
draft stays cheap:

- `--stage draft` — exploratory starter markdown; provenance and payload
  bounds only.
- `--stage vertical` — requires template, segments, estimates, pilot
  options, and gates in the plan content.
- `--stage formal` — adds orchestration, and a PDF variant must carry a PASS
  special-topics house-style check recorded via `--checks`.

```sh
node scripts/publish-plan-proof.mjs \
  --approve PROJECT-APPROVED \
  --source docs/development/<vertical>/proposal_vertical_v2.md \
  --source-path docs/development/<vertical>/proposal_vertical_v2.md \
  --artifact-id plan-vertical-<slug>-v2 \
  --title "<Vertical> — proposed vertical v2" \
  --description "What the plan reviewer should confirm" \
  --family <family> \
  --feedback-round plan-v2 \
  --stage vertical \
  --pdf docs/development/<vertical>/proposed_vertical_v2.pdf \
  --checks docs/development/<vertical>/plan-vertical-checks.json
```

Use `--dry-run` to preview the plan. A `KEEP` on the formal plan unlocks the
draft loop for that vertical; a `KEEP` on an earlier stage advances the plan,
never production.

## Published payload policy

Only allowlisted thumbnails, filmstrips, compact proofs, bounded plan
documents (markdown/PDF), and metadata belong in the Pages tree. Each artifact
in `data/review-items.json` carries its Izzi source path, byte size,
dimensions, and SHA-256. Full episode media requires a separate storage, cost,
privacy, and publication decision.

Technical publication does not imply human acceptance or baseline promotion.
