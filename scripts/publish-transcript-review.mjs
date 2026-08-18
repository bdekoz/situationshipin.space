#!/usr/bin/env node
// Publish the canonical source transcript for audio-plan review (W3 of the
// workflow-v2 round). The two seed-audio-corpus transcripts are concatenated
// verbatim into one review container with structural dividers; no evidence
// text is rewritten. Approving this document on the portal makes it the
// "canonical source edited" text that gates modified-voice production.
//
// Usage:
//   node scripts/publish-transcript-review.mjs \
//     --izzi-commit <40-hex> --transcripts-dir <dir>

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const ARTIFACT_ID = "here-lies-trouble-canonical-source-transcript";
const MEDIA_DIR = "review/media/audio-transcript";
const PUBLISHED_FILE = "here-lies-trouble-canonical-source-transcript.20260818.txt";
const PARTS = [
  { file: "here-lies-trouble-1.20260415.txt", label: "canonical recording 1" },
  { file: "here-lies-trouble-2.20260415.txt", label: "canonical recording 2" },
];

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

async function main() {
  const values = argumentsMap(process.argv.slice(2));
  const izziCommit = values["izzi-commit"];
  const transcriptsDir = values["transcripts-dir"]
    ? resolve(values["transcripts-dir"]) : null;
  if (!izziCommit || !/^[0-9a-f]{40}$/.test(izziCommit) || !transcriptsDir) {
    console.error(
      "usage: node scripts/publish-transcript-review.mjs "
      + "--izzi-commit <40-hex> --transcripts-dir <dir>"
    );
    process.exitCode = 1;
    return;
  }

  const sections = [];
  for (const part of PARTS) {
    const text = await readFile(join(transcriptsDir, part.file), "utf8");
    sections.push(
      `===== ${part.file} (${part.label}) =====\n${text.trimEnd()}\n`
    );
  }
  const container = sections.join("\n") + "\n";
  const mediaPath = join(MEDIA_DIR, PUBLISHED_FILE);
  await mkdir(join(repositoryRoot, MEDIA_DIR), { recursive: true });
  await writeFile(join(repositoryRoot, mediaPath), container, "utf8");
  const containerHash = sha256(Buffer.from(container, "utf8"));

  const item = {
    artifact_id: ARTIFACT_ID,
    title: "Here Lies Trouble — canonical source transcript",
    description:
      "Canonical source transcript of the two seed recordings, presented for "
      + "audio-plan review. Approval on the portal makes this text the "
      + "canonical source edited that gates modified-voice production.",
    alt: "Transcript review document for the here-lies-trouble audio track.",
    family: "here-lies-trouble-audio",
    generation_class: "audio-transcript",
    feedback_round: "workflow-v2-audio-plan",
    media_kind: "plan",
    plan_stage: "PLAN-DRAFT",
    review_scope: "WORKFLOW-V2-TRANSCRIPT",
    review_mode: "output",
    source_path:
      `izzi ${izziCommit} resources.static/here-lies-trouble/seed-audio-corpus/`
      + "here-lies-trouble-{1,2}.20260415.txt",
    source_sha256: containerHash,
    published_path: mediaPath,
    sha256: containerHash,
    bytes: Buffer.byteLength(container, "utf8"),
    format: "txt",
    technical_state: "VERBATIM-CONTAINER-FROM-CANONICAL-TRANSCRIPTS",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "planning",
    added_at: new Date().toISOString(),
  };

  const pageDir = join(repositoryRoot, "review", ARTIFACT_ID);
  await mkdir(pageDir, { recursive: true });
  await writeFile(join(pageDir, "index.html"), renderReviewPage(item));
  await writeFile(join(pageDir, "manifest.json"), renderReviewManifest(item));

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  catalog.items = catalog.items.filter((entry) => entry.artifact_id !== ARTIFACT_ID);
  catalog.items.push(item);
  catalog.items.sort((left, right) =>
    String(right.added_at || "").localeCompare(String(left.added_at || "")));
  catalog.generated_at = new Date().toISOString();
  catalog.source_commit = izziCommit;
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    status: "PUBLISHED",
    artifact_id: ARTIFACT_ID,
    izzi_commit: izziCommit,
    review_url: `https://situationshipin.space/review/${ARTIFACT_ID}/`,
    transcript_sha256: containerHash,
  }, null, 2));
}

await main();
