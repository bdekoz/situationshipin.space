#!/usr/bin/env node
// Publish the transcription-enrichment E1 and E2 artifacts for human review.
//
// E1: the Final Draft 13 enrichment of the canonical here-lies-trouble
// transcript (FDX, Fountain, rendered PDF, provenance JSON).
// E2: the production-fit assessment (fit markdown, fit JSON, needs data form)
// against the May 2026 network needs document.
//
// Usage:
//   node scripts/publish-enrichment-review.mjs \
//     --izzi-commit <40-hex> \
//     --transcript-path /home/bkoz/src/izzi/...txt \
//     --e1-dir /home/bkoz/src/izzi/outputs/transcription-enrichment/here-lies-trouble \
//     --e2-dir /home/bkoz/src/izzi/resources.static/production-fit

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewManifest, renderReviewPage } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const E1_DIR = "review/media/transcription-enrichment/here-lies-trouble-final-draft";
const E2_DIR = "review/media/production-fit";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function argumentsMap(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) values[key] = true;
    else { values[key] = next; index += 1; }
  }
  return values;
}

async function copyInto(source, targetDir, name) {
  const target = join(repositoryRoot, targetDir, name);
  await mkdir(join(repositoryRoot, targetDir), { recursive: true });
  await copyFile(source, target);
  return target.slice(repositoryRoot.length + 1);
}

async function writeReviewPage(item) {
  const pageDir = join(repositoryRoot, "review", item.artifact_id);
  await mkdir(pageDir, { recursive: true });
  await writeFile(join(pageDir, "index.html"), renderReviewPage(item));
  await writeFile(join(pageDir, "manifest.json"), renderReviewManifest(item));
}

async function main() {
  const values = argumentsMap(process.argv.slice(2));
  const izziCommit = values["izzi-commit"];
  const transcriptPath = values["transcript-path"];
  const e1Dir = values["e1-dir"] ? resolve(values["e1-dir"]) : null;
  const e2Dir = values["e2-dir"] ? resolve(values["e2-dir"]) : null;
  if (!izziCommit || !/^[0-9a-f]{40}$/.test(izziCommit)
      || !transcriptPath || !e1Dir || !e2Dir) {
    console.error(
      "usage: node scripts/publish-enrichment-review.mjs "
      + "--izzi-commit <40-hex> --transcript-path <file> "
      + "--e1-dir <dir> --e2-dir <dir>"
    );
    process.exitCode = 1;
    return;
  }

  const transcriptBuffer = await readFile(transcriptPath);
  const transcriptHash = sha256(transcriptBuffer);

  const stem = "here-lies-trouble-canonical-source-transcript.20260818.final-draft";
  const e1Files = await Promise.all([
    copyInto(join(e1Dir, stem + ".pdf"), E1_DIR, stem + ".pdf"),
    copyInto(join(e1Dir, stem + ".fdx"), E1_DIR, stem + ".fdx"),
    copyInto(join(e1Dir, stem + ".fountain"), E1_DIR, stem + ".fountain"),
    copyInto(join(e1Dir, stem + ".provenance.json"), E1_DIR, stem + ".provenance.json"),
  ]);
  const e1Pdf = await readFile(join(e1Dir, stem + ".pdf"));

  const fitMd = await copyInto(
    join(e2Dir, "here-lies-trouble-production-fit.md"), E2_DIR,
    "here-lies-trouble-production-fit.md");
  const fitJson = await copyInto(
    join(e2Dir, "here-lies-trouble-production-fit.json"), E2_DIR,
    "here-lies-trouble-production-fit.json");
  const needsJson = await copyInto(
    join(e2Dir, "2026-05-production-needs.json"), E2_DIR,
    "2026-05-production-needs.json");
  const fitBuffer = await readFile(join(e2Dir, "here-lies-trouble-production-fit.md"));

  const e1Item = {
    artifact_id: "here-lies-trouble-final-draft-enrichment",
    title: "Here Lies Trouble — Final Draft 13 enrichment",
    description:
      "Format-only enrichment of the canonical source transcript into a "
      + "Final Draft 13 screenplay: SPEAKER 1-6 dialogue, verbatim text, "
      + "two candidate styles — interpolated FDX (rendered Courier PDF) and "
      + "Fountain open screenplay markup — plus a provenance sidecar. "
      + "Reviewers pick the preferred style.",
    alt: "Final Draft 13 screenplay enrichment of the here-lies-trouble canonical transcript.",
    family: "here-lies-trouble-final-draft",
    generation_class: "transcript-enrichment",
    feedback_round: "transcription-enrichment-e1",
    media_kind: "plan",
    plan_stage: "PLAN-DRAFT",
    review_scope: "TRANSCRIPTION-ENRICHMENT-E1",
    review_mode: "output",
    source_path:
      `izzi ${izziCommit} review/media/audio-transcript/`
      + "here-lies-trouble-canonical-source-transcript.20260818.txt",
    source_sha256: sha256(e1Pdf),
    source_derivation: {
      path: "here-lies-trouble-canonical-source-transcript.20260818.txt",
      sha256: transcriptHash,
      relation: "verbatim input transcript",
    },
    published_path: e1Files[0],
    sha256: sha256(e1Pdf),
    bytes: e1Pdf.byteLength,
    format: "pdf",
    plan_links: [
      { label: "Open FDX — interpolated style", path: e1Files[1] },
      { label: "Open Fountain — open screenplay markup", path: e1Files[2] },
      { label: "Open provenance JSON", path: e1Files[3] },
    ],
    technical_state: "FDX-SUBSET-V1-FROM-CANONICAL-TRANSCRIPT",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "planning",
    added_at: new Date().toISOString(),
  };

  const e2Item = {
    artifact_id: "here-lies-trouble-production-fit",
    title: "Here Lies Trouble — production fit assessment",
    description:
      "May 2026 network needs vs the enriched transcript: per-house fit "
      + "verdicts, matched categories, and no-fly conflicts.",
    alt: "Production-fit assessment for the here-lies-trouble enriched transcript.",
    family: "production-fit",
    generation_class: "production-fit",
    feedback_round: "transcription-enrichment-e2",
    media_kind: "plan",
    plan_stage: "PLAN-DRAFT",
    review_scope: "TRANSCRIPTION-ENRICHMENT-E2",
    review_mode: "output",
    source_path:
      `izzi ${izziCommit} resources.rizal/final-draft/network_needs_202605.pdf`,
    source_sha256: sha256(fitBuffer),
    source_derivation: {
      path: "network_needs_202605.pdf",
      sha256: "ed33fbb419cd034a3be88df778f6cb89a9c5c3b0402578ea44f84d94b96057ce",
      relation: "needs data-form source PDF",
    },
    published_path: fitMd,
    sha256: sha256(fitBuffer),
    bytes: fitBuffer.byteLength,
    format: "markdown",
    plan_links: [
      { label: "Open fit JSON", path: fitJson },
      { label: "Open needs data form", path: needsJson },
    ],
    technical_state: "V1-DEEPSEEK-FIT-ASSESSMENT",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "planning",
    added_at: new Date().toISOString(),
  };

  await writeReviewPage(e1Item);
  await writeReviewPage(e2Item);

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const ids = new Set([e1Item.artifact_id, e2Item.artifact_id]);
  catalog.items = catalog.items.filter((entry) => !ids.has(entry.artifact_id));
  catalog.items.push(e1Item, e2Item);
  catalog.items.sort((left, right) =>
    String(right.added_at || "").localeCompare(String(left.added_at || "")));
  catalog.generated_at = new Date().toISOString();
  catalog.source_commit = izziCommit;
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    status: "PUBLISHED",
    izzi_commit: izziCommit,
    items: [
      { artifact_id: e1Item.artifact_id, url: `https://situationshipin.space/review/${e1Item.artifact_id}/` },
      { artifact_id: e2Item.artifact_id, url: `https://situationshipin.space/review/${e2Item.artifact_id}/` },
    ],
  }, null, 2));
}

await main();
