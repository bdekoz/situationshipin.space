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

## Hamonshū V2 Book 1 categories

[Open the crop review](https://situationshipin.space/review/hamonshu-v2-book1/).
The 165 graphic water forms have neutral scan/segment filenames and no assigned
categories. Reviewers name their own groups, add notes, and download a single
JSON file. Drafts stay in that browser; loading a review replaces its current
draft. Return the file to Benjamin for applying the categories in Izzi.

The packet includes 1600-pixel review JPEGs, 28 source-location overlays, and
seven contact sheets. Scan 002 is excluded as writing/blank. Full-resolution
PNG crops remain local in Izzi. The crop plan, source hashes, masks, and preview
hashes travel with the packet; categories are tied to that exact crop plan.

Rebuild from a verified Izzi crop packet (Python and Pillow required):

```sh
python3 scripts/publish-hamonshu-crops.py \
  --izzi-root /home/bkoz/src/izzi --izzi-commit <40-hex-source-commit>
node scripts/update-build-manifest.mjs
node scripts/check-review-site.mjs
```

The publisher writes this checkout; commit and push to deploy. Supporting
assets are included in the same 96 MiB site payload limit as catalog images.
In Izzi, `scripts/apply-hamonshu-categories.py` validates returned JSON and
previews folder moves; `--apply` performs the explicitly selected review.
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
