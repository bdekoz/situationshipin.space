#!/usr/bin/env node
// Publish a refreshed izzi make-check generation group.
//
// Re-runs the make-check generation snapshot through the portal: copies the
// WebP review copies, refreshes the member-review proxy hashes, rebuilds the
// group index, and updates the catalog entry's generation commit and state.
//
//   node scripts/publish-make-check-generation.mjs \
//     --commit <40-hex izzi commit> \
//     --reference-set /path/to/izzi/outputs/reference-image-sets/guilloche-moire-surface \
//     [--family izzi-generation-20260814] \
//     [--dry-run]

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");

function argumentsMap(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      continue;
    }
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      values[key] = true;
    } else {
      values[key] = next;
      index += 1;
    }
  }
  return values;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function readMemberPage(name) {
  const reviewId = `reference-image-${name}`;
  const dir = join(repositoryRoot, "review", reviewId);
  const html = await readFile(join(dir, "index.html"), "utf8");
  const mediaMatch = /<img src="\/review\/([^"]+\.webp)"/.exec(html);
  const mediaDirectory = mediaMatch
    ? join("review", dirname(mediaMatch[1]))
    : "review/reference-images/guilloche-moire-surface";
  return { reviewId, dir, html, mediaDirectory };
}

function refreshMemberHashes(html, webpSha256) {
  return html
    .replace(/Proxy SHA-256: [0-9a-f]{64}/, `Proxy SHA-256: ${webpSha256}`)
    .replace(
      /Canonical source SHA-256: [0-9a-f]{64}/,
      `Canonical source SHA-256: ${webpSha256}`
    );
}

async function main() {
  const values = argumentsMap(process.argv.slice(2));
  const commit = values.commit;
  const referenceSet = values["reference-set"]
    ? resolve(values["reference-set"])
    : null;
  const family = values.family || "izzi-generation-20260814";
  const dryRun = Boolean(values["dry-run"]);
  if (!commit || !/^[0-9a-f]{40}$/.test(commit)) {
    console.error(
      "usage: node scripts/publish-make-check-generation.mjs --commit <40-hex> --reference-set <dir> [--family <id>] [--dry-run]"
    );
    process.exitCode = 1;
    return;
  }
  if (!referenceSet) {
    console.error("[FAIL] --reference-set directory is required");
    process.exitCode = 1;
    return;
  }

  const meta = JSON.parse(await readFile(join(referenceSet, "meta.json"), "utf8"));
  const members = meta.map((member) => ({
    name: member.name,
    bytes: member.bytes,
    sha256: member.sha256,
    width: member.width,
    height: member.height,
  }));
  if (members.length !== 27) {
    console.error(`[FAIL] expected 27 reference members, observed ${members.length}`);
    process.exitCode = 1;
    return;
  }

  const updatedPages = [];
  for (const member of members) {
    const source = join(referenceSet, `${member.name}.webp`);
    const sourceBytes = await readFile(source);
    const observed = sha256(sourceBytes);
    if (observed !== member.sha256) {
      console.error(`[FAIL] ${member.name}.webp hash mismatch`);
      process.exitCode = 1;
      return;
    }
    const page = await readMemberPage(member.name);
    if (!page.mediaDirectory) {
      console.error(`[FAIL] cannot locate media directory for ${member.name}`);
      process.exitCode = 1;
      return;
    }
    if (dryRun) {
      updatedPages.push({ ...page, member, webpSha256: observed });
      continue;
    }
    const mediaPath = join(repositoryRoot, page.mediaDirectory, `${member.name}.webp`);
    await mkdir(dirname(mediaPath), { recursive: true });
    await copyFile(source, mediaPath);
    const refreshed = refreshMemberHashes(page.html, observed);
    await writeFile(join(page.dir, "index.html"), refreshed, "utf8");
    updatedPages.push({ ...page, member, webpSha256: observed });
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const entry = catalog.items.find((item) => item.artifact_id === family);
  if (!entry) {
    console.error(`[FAIL] no catalog entry for ${family}`);
    process.exitCode = 1;
    return;
  }

  const indexOut = join(
    repositoryRoot,
    "review/media",
    family,
    `${family}.index.html`
  );
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const runFile = promisify(execFile);
  const manifestPath = join(referenceSet, "manifest.json");
  const builderArgs = [
    "scripts/build-generation-index.mjs",
    "--family",
    family,
    "--title",
    entry.title,
    "--description",
    entry.description,
    "--members-json",
    manifestPath,
  ];
  if (dryRun) {
    builderArgs.push("--out", join("/tmp", `${family}.index.dry-run.html`));
  }
  await runFile("node", builderArgs, { cwd: repositoryRoot });

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          status: "DRY-RUN",
          commit,
          family,
          member_count: members.length,
          pages: updatedPages.map((page) => page.reviewId),
        },
        null,
        2
      )
    );
    return;
  }

  const indexBytes = await readFile(indexOut);
  entry.generation_commit = commit;
  entry.generation_state = "CURRENT";
  entry.sha256 = sha256(indexBytes);
  entry.bytes = indexBytes.length;
  entry.added_at = new Date().toISOString();
  entry.index_members = members.map((member) => `reference-image-${member.name}`);
  catalog.generated_at = new Date().toISOString();
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        status: "GENERATION-REFRESHED",
        commit,
        family,
        member_count: members.length,
        index_sha256: entry.sha256,
        index_bytes: entry.bytes,
        pages: updatedPages.map((page) => page.reviewId),
      },
      null,
      2
    )
  );
}

await main();
