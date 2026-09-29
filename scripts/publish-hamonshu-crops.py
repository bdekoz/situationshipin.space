#!/usr/bin/env python3
"""Build a book's water-form review packet from Izzi's verified source crops.

Requires Pillow. Writes this checkout only; commit/push publishes the result.
Full-resolution PNGs stay in Izzi. No categories are inferred or preassigned.
"""

import argparse
from datetime import datetime, timezone
from hashlib import sha256
from html import escape
import json
from pathlib import Path
import re
import shutil

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def page(title, content, script=''):
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{escape(title)} · situationshipin.space</title>'
            '<link rel="stylesheet" href="/assets/css/hamonshu-crops.css">'
            f'{script}</head><body>{content}</body></html>\n')


def file_record(path):
    record = {'path': path.relative_to(ROOT).as_posix(),
              'bytes': path.stat().st_size, 'sha256': digest(path)}
    if path.suffix == '.jpg':
        with Image.open(path) as image:
            record.update(width=image.width, height=image.height, format='jpg')
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--izzi-root', type=Path, required=True)
    parser.add_argument('--izzi-commit', required=True)
    parser.add_argument('--volume', type=int, choices=(1, 2, 3), default=1)
    args = parser.parse_args()
    if not re.fullmatch('[0-9a-f]{40}', args.izzi_commit):
        parser.error('--izzi-commit must be a full 40-character commit hash')
    izzi = args.izzi_root.resolve()
    volume = args.volume
    ROUND = f'hamonshu-v2-book{volume}-20260929'
    INDEX_ID = f'hamonshu-v2-book{volume}'
    PUBLIC = Path('review') / INDEX_ID
    CROP_ROOT = Path(f'resources.rizal/hamonshu/hamonshu_{volume}.crops')
    PLAN_PATH = Path(f'docs/generative_patterns/hamonshu-book-{volume}-crops.json')
    local = izzi / CROP_ROOT
    manifest = json.loads((local / 'manifest.json').read_text())
    plan = json.loads((izzi / PLAN_PATH).read_text())
    count = sum(len(scan.get('boxes', [])) for scan in plan['scans'])
    masked = sum(len(scan.get('polygons', {})) for scan in plan['scans'])
    identifiers = [crop['id'] for crop in manifest['crops']]
    if (manifest['schema'] != 'izzi.hamonshu-crop-review/1'
            or plan['volume'] != volume or manifest['volume'] != volume
            or len(identifiers) != count or len(set(identifiers)) != count
            or any(not re.fullmatch(rf'hamonshu_{volume}-[0-9]{{3}}[a-z]+', name)
                   for name in identifiers)
            or manifest['plan_sha256'] != digest(izzi / PLAN_PATH)):
        raise ValueError(f'Unexpected Book {volume} crop packet or changed crop plan')
    # Validate all inputs before writing anything in the publication tree.
    for source in plan['scans']:
        path = izzi / plan['source_directory'] / f'hamonshu_{volume}-{source["scan"]:03}.png'
        if digest(path) != source['source_sha256']:
            raise ValueError(f'Source scan changed: {path.name}')
    for crop in manifest['crops']:
        path = (local / crop['file']).resolve()
        if not path.is_relative_to(local) or digest(path) != crop['sha256']:
            raise ValueError(f'Crop changed or is outside the packet: {crop["id"]}')

    out = ROOT / PUBLIC
    for subdir in ['', 'images', 'pages', 'sheets']:
        (out / subdir).mkdir(parents=True, exist_ok=True)
    packet = {'schema': 'izzi.hamonshu-public-review/1', 'volume': volume,
              'plan_sha256': manifest['plan_sha256'], 'source_commit': args.izzi_commit,
              'plan': 'crop-plan.json', 'categories_assigned': False,
              'proxy_description': 'JPEG, at most 1600 pixels per edge, quality 90. '
                                   'Transparent crop regions are shown on neutral paper color.',
              'crops': []}
    catalog_path = ROOT / 'data/review-items.json'
    catalog = json.loads(catalog_path.read_text())
    prior = {item['artifact_id']: item for item in catalog['items']}
    now = datetime.now(timezone.utc).isoformat()
    items, cards, members = [], [], []
    for crop in manifest['crops']:
        name = crop['id']
        source_path = local / crop['file']
        proxy_path = out / 'images' / f'{name}.jpg'
        with Image.open(source_path) as image:
            image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            if image.mode == 'RGBA':
                background = Image.new('RGB', image.size, '#eee8dc')
                background.paste(image, mask=image.getchannel('A'))
                image = background
            else:
                image = image.convert('RGB')
            image.save(proxy_path, quality=90, optimize=True, progressive=True)
        proxy = file_record(proxy_path)
        record = {k: v for k, v in crop.items() if k not in ('file', 'category')}
        record['source_scan_sha256'] = next(s['source_sha256'] for s in plan['scans'] if s['scan'] == crop['scan'])
        record['proxy'] = proxy
        packet['crops'].append(record)
        artifact_id = f'{INDEX_ID}-{name.removeprefix(f"hamonshu_{volume}-")}'
        members.append(artifact_id)
        item = {
            'artifact_id': artifact_id, 'title': f'Hamonshū Book {volume} · {name}.png',
            'description': f'{crop["note"]} Name categories in the Book {volume} crop gallery.',
            'alt': f'Water ornament from Book {volume}, scan {crop["scan"]:03}, crop {name}.',
            'family': ROUND, 'generation_class': 'style-processing', 'feedback_round': ROUND,
            'media_kind': 'image-reference', 'review_category': 'style-processing',
            'review_scope': f'HAMONSHU-V2-BOOK{volume}-CATEGORIES', 'review_mode': 'output',
            'source_path': (CROP_ROOT / crop['file']).as_posix(), 'source_state': 'HOST-LOCAL',
            'source_image': {'path': (CROP_ROOT / crop['file']).as_posix(),
                             'sha256': crop['sha256'], 'bytes': source_path.stat().st_size,
                             'width': crop['size'][0], 'height': crop['size'][1],
                             'format': 'png', 'published': False},
            'published_path': proxy['path'], 'sha256': proxy['sha256'], 'bytes': proxy['bytes'],
            'width': proxy['width'], 'height': proxy['height'], 'format': 'jpg',
            'generation_commit': args.izzi_commit, 'generation_state': 'CURRENT',
            'technical_state': 'DERIVATIVE-VERIFIED', 'human_review_state': 'UNREVIEWED',
            'baseline_state': 'NOT-PROMOTED', 'added_at': prior.get(artifact_id, {}).get('added_at', now)
        }
        items.append(item)
        detail = ROOT / 'review' / artifact_id
        detail.mkdir(exist_ok=True)
        detail.joinpath('index.html').write_text(page(item['title'],
            f'<main class="single"><h1>{escape(name)}.png</h1>'
            f'<p>{escape(crop["note"])}</p><p><a href="/{PUBLIC}/#{name}">'
            f'Name a category in the Book {volume} gallery</a></p>'
            f'<a href="/{proxy["path"]}"><img src="/{proxy["path"]}" alt="{escape(item["alt"])}"></a>'
            f'<p><a href="/{PUBLIC}/pages.html#scan-{crop["scan"]:03}">Locate on original scan</a></p>'
            f'<p class="quiet">Review JPEG: {proxy["width"]} × {proxy["height"]}. '
            f'Original crop: {crop["size"][0]} × {crop["size"][1]}, retained locally.</p>'
            '<p><a href="manifest.json">Crop provenance</a></p></main>'))
        write_json(detail / 'manifest.json', record)
        cards.append(
            f'<article class="crop" id="{name}" data-id="{name}" data-scan="{crop["scan"]}">'
            f'<a class="picture" href="images/{name}.jpg" target="_blank" rel="noopener">'
            f'<img loading="lazy" src="images/{name}.jpg" alt="{escape(item["alt"])}" '
            f'width="{proxy["width"]}" height="{proxy["height"]}"></a>'
            f'<h2>{name}.png</h2><p class="note">{escape(crop["note"])}</p>'
            f'<label for="category-{name}">Category name</label><input id="category-{name}" '
            'class="category-name" list="category-names" maxlength="120" placeholder="Your category" autocomplete="off">'
            '<details><summary>Review notes</summary>'
            f'<label for="note-{name}">Notes about this crop</label>'
            f'<textarea class="review-note" id="note-{name}" maxlength="2000"></textarea></details>'
            f'<p class="links"><a href="images/{name}.jpg" target="_blank" rel="noopener">Larger preview ↗</a>'
            f'<a href="pages.html#scan-{crop["scan"]:03}">Scan {crop["scan"]:03}</a></p></article>')

    write_json(out / 'manifest.json', packet)
    shutil.copyfile(izzi / PLAN_PATH, out / 'crop-plan.json')
    scan_options = ''.join(f'<option value="{scan["scan"]}">{scan["scan"]:03}</option>'
                           for scan in plan['scans'] if scan.get('boxes'))
    data = json.dumps(packet, ensure_ascii=False).replace('<', '\\u003c')
    book_links = ''.join(f'<a href="/review/hamonshu-v2-book{n}/">Book {n}</a>'
                         for n in (1, 2, 3) if n != volume)
    content = (
        '<header><nav><a href="/style.html">← Style review</a><a href="pages.html">Scan locations</a>'
        f'<a href="sheets.html">Contact sheets</a>{book_links}</nav><h1>Hamonshū · Book {volume}</h1>'
        f'<div class="intro"><p>{count} graphic water forms, ready for your categories. '
        'Writing examples are excluded. Open any crop for a larger view; use the scan links to check its boundaries.</p>'
        '<p>Choose your own category names. Reuse a name to group similar forms, and leave a note where a crop needs revision. '
        'Nothing has been categorized yet.</p></div></header>'
        '<section class="workspace" aria-label="Review draft"><p id="progress" aria-live="polite"></p>'
        '<label for="reviewer">Your name (optional)</label><input id="reviewer" maxlength="200" autocomplete="name">'
        '<div class="actions"><button id="download" type="button">Download classifications</button>'
        '<label class="file-button secondary">Load saved classifications<input id="import" type="file" accept=".json,application/json"></label></div>'
        '<p class="quiet">Drafts save in this browser only. Download the JSON file and send it back to Benjamin '
        'to group the original images. Loading a saved file replaces the category names and notes in this browser.</p>'
        '<output id="status" role="status"></output></section>'
        '<div class="controls"><label>Find<input id="find" type="search" placeholder="Filename, form or note"></label>'
        f'<label>Source scan<select id="scan"><option value="">All scans</option>{scan_options}</select></label>'
        '<label>Category<select id="category-filter"><option value="">All categories</option></select></label>'
        '<output id="count" aria-live="polite"></output></div><datalist id="category-names"></datalist>'
        '<noscript><p>Enable JavaScript to save category names and export your review. Images and scan links still work.</p></noscript>'
        '<main class="cards">' + ''.join(cards) + '</main>'
        '<footer><p>Previews are JPEGs up to 1600 pixels per edge. Full-resolution PNG crops retain the original scan pixels. '
        f'{masked} masked crops show omitted labels or neighboring regions on a neutral paper color. '
        'No linework has been reconstructed.</p><p><a href="manifest.json">Crop provenance</a> · '
        '<a href="crop-plan.json">Selections and exclusions</a></p></footer>'
        f'<script id="crop-data" type="application/json">{data}</script>')
    (out / 'index.html').write_text(page(f'Hamonshū Book {volume} · categorize water forms', content,
                                        '<script src="/assets/js/hamonshu-crops.js" defer></script>'))

    articles = []
    for scan in plan['scans']:
        n = scan['scan']
        selected = [c for c in manifest['crops'] if c['scan'] == n]
        links = ''.join(f'<a href="index.html#{c["id"]}">{c["id"]}</a>' for c in selected)
        if selected:
            filename = f'scan-{n:03}.jpg'
            shutil.copyfile(local / '_review/pages' / filename, out / 'pages' / filename)
            body = (f'<a href="pages/{filename}"><img src="pages/{filename}" loading="lazy" '
                    f'alt="Original scan {n:03} with labeled crop boundaries"></a><nav>{links}</nav>')
        else:
            body = f'<p>Excluded: {escape(scan["exclude"])}</p>'
        articles.append(f'<article id="scan-{n:03}"><h2>Scan {n:03} · {len(selected)} crops</h2>{body}</article>')
    (out / 'pages.html').write_text(page(f'Book {volume} · scan locations',
        '<header><a href="index.html">← Back to categories</a><h1>Scan locations</h1>'
        '<p>Letters mark the selected water regions and match the filename suffixes. '
        'These views give page context; writing is excluded from the crops.</p></header>'
        '<main class="pages">' + ''.join(articles) + '</main>'))
    sheets = []
    for source in sorted((local / '_review/sheets').glob('sheet-*.jpg')):
        shutil.copyfile(source, out / 'sheets' / source.name)
        sheets.append(f'<article><a href="sheets/{source.name}"><img loading="lazy" '
                      f'src="sheets/{source.name}" alt="{source.stem}"></a></article>')
    (out / 'sheets.html').write_text(page(f'Book {volume} · contact sheets',
        '<header><a href="index.html">← Back to categories</a><h1>Contact sheets</h1></header>'
        '<main class="pages">' + ''.join(sheets) + '</main>'))
    index = file_record(out / 'index.html')
    assets = [file_record(p) for p in sorted(out.rglob('*')) if p.is_file()
              and p != out / 'index.html' and p.parent != out / 'images']
    items.insert(0, {
        'artifact_id': INDEX_ID, 'title': f'Hamonshū V2 · Book {volume} · name the water-form categories',
        'description': f'{count} manually segmented water forms. Enter your category names and notes, '
                       'then download a review JSON file. Scan locations and contact sheets included.',
        'alt': f'Book {volume} water forms for human categorization.', 'family': ROUND,
        'generation_class': 'style-processing-index', 'feedback_round': ROUND,
        'media_kind': 'index', 'review_category': 'style-processing', 'review_mode': 'output',
        'review_scope': f'HAMONSHU-V2-BOOK{volume}-CATEGORIES', 'source_path': PLAN_PATH.as_posix(),
        'published_path': index['path'], 'sha256': index['sha256'], 'bytes': index['bytes'], 'format': 'html',
        'generation_commit': args.izzi_commit, 'generation_state': 'CURRENT', 'index_members': members,
        'review_assets': assets, 'technical_state': 'DERIVATIVE-VERIFIED',
        'human_review_state': 'UNREVIEWED', 'baseline_state': 'NOT-PROMOTED',
        'added_at': prior.get(INDEX_ID, {}).get('added_at', now)
    })
    catalog['items'] = items + [item for item in catalog['items'] if item['family'] != ROUND]
    catalog['source_commit'] = args.izzi_commit
    catalog['generated_at'] = now
    write_json(catalog_path, catalog)
    print(json.dumps({'status': 'BUILT-LOCALLY', 'crops': len(members), 'supporting_assets': len(assets),
                      'new_payload_bytes': sum(i['bytes'] for i in items) + sum(a['bytes'] for a in assets),
                      'review_url': f'https://situationshipin.space/{PUBLIC}/'}, indent=2))


if __name__ == '__main__':
    main()
