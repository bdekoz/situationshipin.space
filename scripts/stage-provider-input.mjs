#!/usr/bin/env node
// Changes this checkout only. The caller commits, pushes, and verifies Pages.
import { spawnSync } from "node:child_process";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { MANIFEST, PREFIX, noSymlinks, publishedPath, readManifest, stageAsset, beginSubmission, attachTask, finishAsset, expirePrepared } from "./provider-staging.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = "data/build-manifest.json";

async function optionalRead(path) {
  try { return await readFile(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export function validateSite(site) {
  for (const script of ["update-build-manifest.mjs", "check-review-site.mjs"]) {
    const result = spawnSync(process.execPath, [resolve(site, "scripts", script)], { cwd: site, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`${script} failed:\n${result.stderr || result.stdout || result.error}`);
  }
}

// A failed hash, expiry, site-budget or catalog check restores the public tree.
// Private archive writes are retained: they are exact, content-addressed copies.
export async function changeStaging(site, command, options, validate = validateSite) {
  const operations = { stage: stageAsset, submit: beginSubmission, attach: attachTask, finish: finishAsset, expire: expirePrepared };
  if (!operations[command]) throw new Error("Choose stage, submit, attach, finish or expire");
  const lockPath = resolve(site, ".provider-staging.lock");
  const lock = await open(lockPath, "wx");
  const snapshots = new Map();
  let started = false;
  try {
    const manifest = await readManifest(site);
    const paths = new Set([MANIFEST, BUILD]);
    for (const asset of manifest.assets.filter(a => a.state === "active")) {
      publishedPath(site, asset.path);
      paths.add(asset.path);
    }
    if (command === "stage") {
      const extension = /\.[^./]+$/.exec(options.source || "")?.[0].toLowerCase() || "";
      const path = `${PREFIX}${options.owner}/${options.id}${extension}`;
      publishedPath(site, path);
      paths.add(path);
    }
    for (const path of paths) {
      await noSymlinks(site, resolve(site, path));
      snapshots.set(path, await optionalRead(resolve(site, path)));
    }
    started = true;
    const result = await operations[command](site, options);
    await validate(site);
    const assets = Array.isArray(result) ? result : [result];
    const changedPaths = [];
    for (const [path, before] of snapshots) {
      const after = await optionalRead(resolve(site, path));
      if (before === null ? after !== null : after === null || !before.equals(after)) changedPaths.push(path);
    }
    return { command, assets, changed_paths: changedPaths };
  } catch (error) {
    for (const [path, bytes] of started ? snapshots : []) {
      const target = resolve(site, path);
      if (bytes === null) {
        try { await unlink(target); } catch (cause) { if (cause.code !== "ENOENT") throw cause; }
      } else {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
      }
    }
    throw error;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    source: { type: "string" }, id: { type: "string" }, owner: { type: "string" },
    purpose: { type: "string" }, job: { type: "string" }, "archive-root": { type: "string" },
    "ttl-hours": { type: "string" }, "task-id": { type: "string" }, status: { type: "string" },
    reason: { type: "string" }, "idempotency-key": { type: "string" }, help: { type: "boolean" }
  }});
  if (values.help) {
    console.log(`Usage: node scripts/stage-provider-input.mjs <command> [options]
  stage  --source FILE --id SLUG --owner SLUG --purpose TEXT --job ID --archive-root DIR [--ttl-hours 24]
  submit --id SLUG --idempotency-key KEY   (before calling the provider)
  attach --id SLUG --task-id PROVIDER_ID
  finish --id SLUG --status completed|failed|cancelled --archive-root DIR [--reason TEXT]
  expire --archive-root DIR

Archive must be outside this site. Expire only removes unused, expired inputs.
Submitting/submitted jobs require a terminal status; timeouts do not authorize removal.
Every change regenerates the build manifest and validates the full site.
Commit and push the returned changed_paths, then verify the deployed URLs.`);
    return;
  }
  if (positionals.length !== 1) throw new Error("Specify one command; see --help");
  const result = await changeStaging(root, positionals[0], {
    source: values.source && resolve(values.source), id: values.id, owner: values.owner,
    purpose: values.purpose, jobId: values.job, archiveRoot: values["archive-root"] && resolve(values["archive-root"]),
    ttlHours: values["ttl-hours"] === undefined ? 24 : Number(values["ttl-hours"]),
    taskId: values["task-id"], idempotencyKey: values["idempotency-key"], status: values.status, reason: values.reason
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[FAIL] ${error.message}`); process.exitCode = 1; });
}
