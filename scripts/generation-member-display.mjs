// Shared title/description/source mapping for the izzi-generation-20260814
// reference-image members. Used by build-generation-index.mjs (index links)
// and rebuild-review-pages.mjs (member review pages) so both stay in sync.

export function memberDisplay(name) {
  if (name.startsWith("guilloche-v4-") && name.endsWith("-grid")) {
    const kind = name.slice("guilloche-v4-".length, -"-grid".length);
    const title = `Guilloche v4 grid — ${kind}`;
    const source = `outputs/review/feedback/visual/guilloche/round-05/static/${name}.png`;
    return {
      title,
      description: `${title} from the make-check reference image set (guilloche/moire/surface tension). Source: ${source}. WebP q82 review copy flattened on black.`,
      source,
    };
  }
  if (name === "moire-v1-category-grid") {
    const title = "Moire v1 category grid";
    const source = `outputs/ad-hoc/moire.v1/${name}.png`;
    return {
      title,
      description: `${title} from the make-check reference image set (guilloche/moire/surface tension). Source: ${source}. WebP q82 review copy flattened on black.`,
      source,
    };
  }
  if (name === "surface-tension-v1-category-grid") {
    const title = "Surface tension v1 category grid";
    const source = `outputs/ad-hoc/surface-tension.v1/${name}.png`;
    return {
      title,
      description: `${title} from the make-check reference image set (guilloche/moire/surface tension). Source: ${source}. WebP q82 review copy flattened on black.`,
      source,
    };
  }
  if (name === "danmaku-v1-category-grid") {
    const title = "Danmaku v1 category grid";
    const source = `outputs/ad-hoc/danmu.v1/${name}.png`;
    return {
      title,
      description: `${title} from the make-check reference image set (danmaku text overlay). Source: ${source}. WebP q82 review copy flattened on black.`,
      source,
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
      source,
    };
  }
  return { title: name, description: "", source: "" };
}
