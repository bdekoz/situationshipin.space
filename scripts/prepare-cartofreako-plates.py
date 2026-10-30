#!/usr/bin/env python3
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import hashlib,json,subprocess
import argparse
parser=argparse.ArgumentParser(description='Create bounded lossless review images from the verified Cartofreako delivery.')
parser.add_argument('--cartofreako-root',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
ROOT=args.cartofreako_root.resolve()
SOURCE=ROOT/'output/setouchi-triennale-2028'
OUT=args.output.resolve();OUT.mkdir(parents=True,exist_ok=True)
plan=json.loads((SOURCE/'sources/generation-plan.json').read_text())
manifest=json.loads((SOURCE/'manifest.json').read_text())
files={entry['path']:entry for entry in manifest['files']}
commit=subprocess.check_output(['git','-C',str(ROOT),'rev-parse','HEAD'],text=True).strip()
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def render(job):
    ordinal,plate,scope=job
    stem=plate['stem'];suffix='-authagraph-44-19.052559'+('-japan' if scope=='japan' else '')
    source=SOURCE/'plates'/scope/'png'/(stem+suffix+'.png')
    relative=str(source.relative_to(SOURCE));record=files[relative]
    assert digest(source)==record['sha256'],relative
    base=OUT/scope;base.mkdir(exist_ok=True)
    full=base/(stem+'.webp');thumb=base/(stem+'.thumb.webp')
    with Image.open(source) as image:
        original_size=list(image.size)
        if image.mode=='RGBA':
            white=Image.new('RGBA',image.size,'white');white.alpha_composite(image);image=white.convert('RGB')
        else:image=image.convert('RGB')
        image.thumbnail((3840,3840),Image.Resampling.LANCZOS)
        size=list(image.size);image.save(full,format='WEBP',lossless=True,method=4)
        image.thumbnail((960,960),Image.Resampling.LANCZOS)
        thumb_size=list(image.size);image.save(thumb,format='WEBP',lossless=True,method=4)
    result={'ordinal':ordinal,'stem':stem,'title':plate['title'],'note':plate['note'],'scope':scope,
        'source_path':'output/setouchi-triennale-2028/'+relative,'source_sha256':record['sha256'],
        'source_bytes':record['bytes'],'source_dimensions':original_size,
        'file':str(full.relative_to(OUT)),'sha256':digest(full),'bytes':full.stat().st_size,'dimensions':size,
        'thumbnail':{'file':str(thumb.relative_to(OUT)),'sha256':digest(thumb),'bytes':thumb.stat().st_size,'dimensions':thumb_size}}
    print(scope,stem,round(result['bytes']/1024),'KiB',flush=True)
    return result
jobs=[(i+1,plate,scope) for i,plate in enumerate(plan['plates']) for scope in ('world','japan')]
with ThreadPoolExecutor(max_workers=2) as executor:plates=list(executor.map(render,jobs))
result={'schema_version':'cartofreako-plate-review-1','source_repository':'bdekoz/cartofreako','source_commit':commit,
    'source_delivery':'output/setouchi-triennale-2028','source_delivery_manifest_sha256':digest(SOURCE/'manifest.json'),
    'generation_instant':plan['instant'],'world_count':38,'japan_count':38,
    'review_image_encoding':'3840-pixel longest side; lossless WebP; Lanczos downsample from 300 dpi PNG masters',
    'plates':plates}
(OUT/'plates.json').write_text(json.dumps(result,indent=2)+'\n')
total=sum(p['bytes']+p['thumbnail']['bytes'] for p in plates)
print('Complete:',len(plates),'plates;',round(total/1024**2,2),'MiB',flush=True)
