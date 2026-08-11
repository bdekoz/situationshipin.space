# situationshipin.space

Public GitHub Pages canary for reviewing a deliberately small selection of
[Izzi](https://github.com/bdekoz/izzi) visual artifacts.

The site is static. Draft feedback stays in browser `localStorage` until the
reviewer downloads JSON or explicitly opens a public GitHub issue draft. The
site contains no account token, analytics, autoplay, source audio, or source
MKV episodes. Selected large MKVs remain inspectable through derived ten-frame
filmstrips and independently reviewable numbered thumbnails.

## Local preview

Serve the repository root over HTTP so the browser can fetch the JSON catalog:

```sh
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/`.

## Published payload policy

Only allowlisted thumbnails, filmstrips, compact proofs, and metadata belong in
the Pages tree. Each artifact in `data/review-items.json` carries its Izzi
source path, byte size, dimensions, and SHA-256. Full episode media requires a
separate storage, cost, privacy, and publication decision.

Technical publication does not imply human acceptance or baseline promotion.
