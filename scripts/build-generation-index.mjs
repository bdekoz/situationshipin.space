#!/usr/bin/env node
// Build the static index page for an izzi generation group.
//
// Reads the catalog, collects every item in the requested family, and writes
// an HTML index under review/media/<family>/ that links each member to its
// individual review page. The index is the published artifact of the group's
// catalog entry (media_kind "index").
//
//   node scripts/build-generation-index.mjs \
//     --family izzi-generation-20260814 \
//     --title "Izzi Generation 20260814" \
//     --description "..." \
//     --members-json <izzi reference-set manifest.json> \
//     [--out review/media/<family>/<artifact>.index.html]

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

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

function renderIndex({ title, description, members, generationCommit }) {
  const rows = members
    .map((item) => {
      const id = item.artifact_id.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const reviewUrl = `../../${id}/`;
      const thumb = `../../${item.published_path.replace(/^review\//, "")}`;
      return [
        `<li class="pass">`,
        `<a class="thumb" href="${reviewUrl}"><img src="${escape(thumb)}" alt="" loading="lazy" decoding="async"></a>`,
        `<div class="pass-body">`,
        `<h3><a href="${reviewUrl}">${escape(item.title)}</a></h3>`,
        `<p>${escape(item.description || "")}</p>`,
        `<p class="meta">${escape(item.artifact_id)}</p>`,
        `</div>`,
        `</li>`,
      ].join("\n");
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="description" content="${escape(description)}">
    <title>${escape(title)} — situationshipin.space</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#fcfbf7;color:#14171a;line-height:1.45}
      main{max-width:72rem;margin:auto;padding:2rem 1rem 5rem}
      h1{font-size:1.6rem;margin:0 0 .4rem}
      .sub{color:#4d565d;margin:0 0 1.5rem}
      ul.passes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem}
      li.pass{display:grid;grid-template-columns:6rem minmax(0,1fr);gap:.8rem;align-items:start;background:#f5f6f4;border:1px solid #9da8af;padding:.8rem}
      .thumb img{display:block;width:6rem;height:auto;border:1px solid #9da8af}
      li.pass h3{margin:0 0 .25rem;font-size:1rem}
      li.pass p{margin:0 0 .25rem;color:#4d565d;font-size:.85rem}
      .meta{font-family:ui-monospace,monospace;font-size:.72rem;overflow-wrap:anywhere}
      a{color:#173a55}
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">← Review catalog</a></p>
      <h1>${escape(title)}</h1>
      <p class="sub">${escape(description)}</p>
      ${generationCommit ? `<p class="sub">Izzi generation commit: <code>${escape(generationCommit)}</code> · ${members.length} pass${members.length === 1 ? "" : "es"}</p>` : ""}
      <ul class="passes">
${rows}
      </ul>
    </main>
  </body>
</html>
`;
}

function memberDisplay(name) {
  if (name.startsWith("guilloche-v4-") && name.endsWith("-grid")) {
    const kind = name.slice("guilloche-v4-".length, -"-grid".length);
    const title = `Guilloche v4 grid — ${kind}`;
    return {
      title,
      description: `${title} from the make-check reference image set (guilloche/moire/surface tension). Source: outputs/review/feedback/visual/guilloche/round-05/static/${name}.png. WebP q82 review copy flattened on black.`,
    };
  }
  if (name === "moire-v1-category-grid") {
    const title = "Moire v1 category grid";
    return {
      title,
      description: `${title} from the make-check reference image set (guilloche/moire/surface tension). Source: outputs/ad-hoc/moire.v1/${name}.png. WebP q82 review copy flattened on black.`,
    };
  }
  if (name === "surface-tension-v1-category-grid") {
    const title = "Surface tension v1 category grid";
    return {
      title,
      description: `${title} from the make-check reference image set (guilloche/moire/surface tension). Source: outputs/ad-hoc/surface-tension.v1/${name}.png. WebP q82 review copy flattened on black.`,
    };
  }
  const plate = /^(moire|surface-tension)-(\d{2})-(.+)$/.exec(name);
  if (plate) {
    const family = plate[1] === "moire" ? "Moire" : "Surface tension";
    const number = plate[2];
    const human = plate[3].replace(/-/g, " ");
    const title = `${family} v1 plate ${number} — ${human}`;
    const source = `outputs/ad-hoc/${plate[1]}.v1/png/${name}.png`;
    return {
      title,
      description: `${title} from the make-check reference image set (guilloche/moire/surface tension). Source: ${source}. WebP q82 review copy flattened on black.`,
    };
  }
  return { title: name, description: "" };
}

function membersFromReferenceSet(referenceSet) {
  const members = Array.isArray(referenceSet.members)
    ? referenceSet.members
    : referenceSet;
  return members
    .map((member) => {
      const name = member.name || member.artifact_id;
      const display = memberDisplay(name);
      return {
        artifact_id: `reference-image-${name}`,
        title: display.title,
        description: display.description,
        published_path: `review/reference-images/guilloche-moire-surface/${name}.webp`,
        generation_commit: referenceSet.generation_commit,
      };
    })
    .sort((left, right) =>
      String(left.artifact_id).localeCompare(String(right.artifact_id))
    );
}

async function main() {
  const values = argumentsMap(process.argv.slice(2));
  const family = values.family;
  const title = values.title;
  const description = values.description;
  if (!family || !title || !description) {
    console.error("usage: node scripts/build-generation-index.mjs --family <family> --title <title> --description <text> [--out <path>]");
    process.exitCode = 1;
    return;
  }
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  let members;
  let generationCommit = null;
  if (values["members-json"]) {
    const referenceSet = JSON.parse(
      await readFile(resolve(values["members-json"]), "utf8")
    );
    members = membersFromReferenceSet(referenceSet);
    generationCommit = referenceSet.generation_commit || null;
  } else {
    members = catalog.items
      .filter((item) => item.family === family)
      .sort((left, right) =>
        String(left.artifact_id).localeCompare(String(right.artifact_id))
      );
    generationCommit = members[0]?.generation_commit || null;
  }
  if (!members.length) {
    console.error(`[FAIL] no catalog items found for family ${family}`);
    process.exitCode = 1;
    return;
  }
  const out = values.out
    ? resolve(values.out)
    : join(repositoryRoot, "review/media", family, `${family}.index.html`);
  const html = renderIndex({ title, description, members, generationCommit });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, "utf8");
  console.log(JSON.stringify({
    status: "INDEX-BUILT",
    family,
    member_count: members.length,
    path: out.replace(`${repositoryRoot}/`, ""),
    members: members.map((item) => item.artifact_id)
  }, null, 2));
}

await main();
