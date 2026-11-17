#!/usr/bin/env node
// Publish the existing full local film and its exact Stage-5 records.
// The large video is uploaded separately as a versioned GitHub release asset.
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {renderReviewPage,renderReviewManifest} from "./review-page.mjs";
import {validateExternalMedia,validateReleaseReceipt} from "./review-media.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const args=Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>process.argv.slice(2+i*2,4+i*2)));
if(args["--approve"]!=="PROJECT-APPROVED") throw new Error("Existing-film publication requires explicit project-owner approval");
const izzi=resolve(args["--izzi-root"]),packet=resolve(args["--packet"]),commit=args["--izzi-commit"];
if(!/^[0-9a-f]{40}$/.test(commit||""))throw new Error("Pass the committed Izzi source revision");
const id="here-lies-trouble-local-full-20261117", media="review/media/hlt-local-full-20261117";
const source="outputs/here-lies-trouble/local-rendering-stage-5-full-20261101/delivery/episode-v1/complete-clean.mp4";
const sourceDir=dirname(source);
const hash=b=>createHash("sha256").update(b).digest("hex");
const receipt=JSON.parse(await readFile(join(packet,"release-asset.json"),"utf8"));
const probe=JSON.parse(await readFile(join(packet,"proxy-probe.json"),"utf8"));
const video=probe.streams.find(s=>s.codec_type==="video");
if(video.width!==720||video.height!==1280||video.nb_frames!=="75729"||video.r_frame_rate!=="24/1"
  || Math.abs(Number(probe.format.duration)-3155.375)>.05)throw new Error("Unexpected complete-film proxy metadata");
const delivery=JSON.parse(await readFile(join(izzi,sourceDir,"delivery-validation.json"),"utf8"));
if(receipt.source_sha256!==delivery.movies["complete-clean.mp4"].sha256)throw new Error("Wrong source film");
const now=new Date().toISOString();
await mkdir(join(root,media),{recursive:true});
async function publish(name,bytes){
  const path=`${media}/${name}`;await writeFile(join(root,path),bytes);
  return {path,bytes:bytes.length,sha256:hash(bytes)};
}
const assets=[];
for(const name of ["release-asset.json","encoding-verification.json","proxy-probe.json","captions.vtt"]){assets.push(await publish(name,await readFile(join(packet,name))));}
const poster=await publish("poster.jpg",await readFile(join(izzi,sourceDir,"poster.jpg")));
const dims=JSON.parse(execFileSync("ffprobe",["-v","error","-show_entries","stream=width,height","-of","json",join(root,poster.path)],{encoding:"utf8"})).streams[0];
assets.push({...poster,width:dims.width,height:dims.height});
assets.push(await publish("source-delivery-validation.json",Buffer.from(JSON.stringify(delivery,null,2)+"\n")));
const common={review_mode:"output",human_review_state:"UNREVIEWED",baseline_state:"NOT-PROMOTED",generation_state:"CURRENT",generation_commit:commit,added_at:now};
const film={...common,artifact_id:id,title:"Here Lies Trouble — complete local MOSS film (52:35)",
  description:"The latest complete local film: 52:35, 24 fps. MOSS appearance, saved poses and SAM masks, authored CPU animation, and the original four-voice dialogue. Review gait, gaze, mouth timing, scenery continuity and the full conversation. Opening-v7 is approved; full-film human review remains open. This 720p review copy preserves every frame and the source AAC audio; English subtitles are available in the player.",
  family:"here-lies-trouble-local-film",generation_class:"complete-local-film-review",feedback_round:"local-stage5-full-20261117",review_category:"proofs",review_scope:"COMPLETE-LOCAL-FILM",
  media_kind:"video",format:"mp4",published_path:receipt.url,sha256:receipt.sha256,bytes:receipt.bytes,
  width:720,height:1280,duration_seconds:3155.375,frame_count:75729,fps:24,alt:"Complete local Here Lies Trouble film with four animal characters walking through illustrated Runyon terrain.",
  source_path:source,source_sha256:receipt.source_sha256,source_media:{path:source,sha256:receipt.source_sha256,bytes:delivery.movies["complete-clean.mp4"].bytes,duration_seconds:3155.375,width:1080,height:1920,published:false},
  external_media:{provider:"github-release",release_tag:receipt.release_tag,asset_id:receipt.asset_id,receipt_path:`${media}/release-asset.json`},
  poster:poster.path,caption_track:`${media}/captions.vtt`,review_assets:assets,technical_state:"COMPLETE-LOCAL-FILM-REVIEW-PROXY-VERIFIED",
  review_publication:{decision:"APPROVED",scope:"EXISTING-ARTIFACT-REVIEW",authority:"Explicit project-owner request",approved_on:"2026-11-17",instruction:'ok https://situationshipin.space/proofs.html is missing the current top-of-tree 55 minute latest render using the local MOSS loRA pipeline. Can you put that up for review please?',artifact_id:id,source_sha256:receipt.source_sha256,proxy_sha256:receipt.sha256,creative_acceptance:false,further_production_authorized:false}
};
validateExternalMedia(film);validateReleaseReceipt(film,receipt);

const docs=[
  {id:"here-lies-trouble-local-stage5-record-20261117",file:"20261030.local_rendering_exploration_stage_5.md",title:"Here Lies Trouble — Stage 5 production and revision record",description:"The current Stage 5 record, including October revisions, approved opening-v7 and November 1 complete-episode delivery. Earlier instructions and findings remain dated history; full-length review is open."},
  {id:"here-lies-trouble-local-stage5-workflow-20261117",file:"20261030.local_rendering_exploration_stage_5_durable_workflow.md",title:"Here Lies Trouble — Stage 5 durable workflow and full delivery",description:"Current local-production software, frozen assets, exact audio/captions, 257-segment full-film delivery, restart recipe and remaining human review. Hardware observations retain their original dates."},
];
const linkMap=Object.fromEntries(docs.map(d=>[join(izzi,"docs/development/sessions",d.file),`/${media}/${d.file.replace(/\.md$/,".html")}`]));
linkMap[join(izzi,source)]=`/review/${id}/`;
linkMap[join(izzi,sourceDir,"complete-captioned.mp4")]=`/review/${id}/`;
linkMap[join(izzi,sourceDir,"index.html")]=`/review/${id}/`;
const tracked=execFileSync("git",["-C",izzi,"ls-tree","-r","--name-only",commit],{encoding:"utf8"}).trim().split("\n");
const records=[film];
for(const doc of docs){
  const sourcePath=`docs/development/sessions/${doc.file}`;
  const original=execFileSync("git",["-C",izzi,"show",`${commit}:${sourcePath}`]);
  if(hash(await readFile(join(izzi,sourcePath)))!==hash(original))throw new Error(`Uncommitted document: ${sourcePath}`);
  const originalAsset=await publish(doc.file,original);
  const input={markdown:original.toString(),source:join(izzi,sourcePath),izzi,commit,tracked,linkMap};
  const html=execFileSync("python3",["-c",`
import json,sys,html,re
from pathlib import Path
from urllib.parse import urlsplit,unquote,quote
import markdown
j=json.load(sys.stdin); tracked=set(j['tracked'])
body=markdown.markdown(j['markdown'],extensions=['extra','toc','sane_lists'])
def rewrite(m):
 url,label=html.unescape(m.group(1)),m.group(2); parts=urlsplit(url)
 if parts.scheme or url.startswith(('#','//')): return m.group(0)
 path=(Path(j['source']).parent/unquote(parts.path)).resolve(); key=str(path)
 fragment='#'+parts.fragment if parts.fragment else ''
 if key in j['linkMap']: target=j['linkMap'][key]+fragment
 else:
  try: rel=str(path.relative_to(j['izzi']))
  except ValueError: rel=''
  if rel not in tracked: return '<span>'+label+' <small>(local archive)</small></span>'
  target='https://github.com/bdekoz/izzi/blob/'+j['commit']+'/'+quote(rel)+fragment
 return '<a href="'+html.escape(target,quote=True)+'">'+label+'</a>'
print(re.sub(r'<a href="([^\"]+)">(.*?)</a>',rewrite,body,flags=re.S))
`],{input:JSON.stringify(input),encoding:"utf8"});
  const readable=await publish(doc.file.replace(/\.md$/,".html"),Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${doc.title}</title><style>body{max-width:70rem;margin:auto;padding:1.5rem;font:17px/1.6 system-ui;color:#172d40;background:#fcfbf7;overflow-wrap:anywhere}pre{overflow:auto;padding:1rem;background:#eee}table{display:block;overflow:auto;border-collapse:collapse}td,th{border:1px solid #aaa;padding:.4rem}a{color:#173a55}</style><p><a href="/plans.html">Plans</a> · <a href="/review/${id}/">Complete film review</a> · <a href="/${originalAsset.path}">Original Markdown</a></p><p>Published November 17 from the current committed Stage 5 record. References marked “local archive” remain in production storage.</p>${html}</html>`));
  records.push({...common,artifact_id:doc.id,title:doc.title,description:doc.description,alt:doc.title,family:"here-lies-trouble-local-plans",generation_class:"production-document-review",feedback_round:"local-stage5-full-20261117",review_category:"planning",review_scope:"LOCAL-STAGE5-PRODUCTION-RECORD",media_kind:"plan",plan_stage:"PLAN-DRAFT",format:"markdown",published_path:originalAsset.path,sha256:originalAsset.sha256,bytes:originalAsset.bytes,source_path:sourcePath,source_sha256:originalAsset.sha256,plan_html:readable.path,review_assets:[readable],plan_links:[{label:"Complete local film",path:`review/${id}/`}],technical_state:"COMMITTED-SOURCE-AND-PUBLISHED-LINKS-VERIFIED"});
}
const links=`<p><a href="/plans.html">Current plans</a> · ${docs.map(d=>`<a href="/review/${d.id}/">${d.title.replace("Here Lies Trouble — ","")}</a>`).join(" · ")} · <a href="/review/here-lies-trouble-stage-4/">Earlier 1:43 provider sequence</a></p>`;
for(const item of records){
  const directory=join(root,"review",item.artifact_id);await mkdir(directory,{recursive:true});
  let html=renderReviewPage(item);
  if(item===film)html=html.replace('<section class="review-media"',links+'<section class="review-media"');
  await writeFile(join(directory,"index.html"),html);await writeFile(join(directory,"manifest.json"),renderReviewManifest(item));
}
const catalogPath=join(root,"data/review-items.json"),catalog=JSON.parse(await readFile(catalogPath,"utf8"));
const ids=new Set(records.map(i=>i.artifact_id));catalog.items=catalog.items.filter(i=>!ids.has(i.artifact_id)).concat(records);catalog.generated_at=now;
await writeFile(catalogPath,JSON.stringify(catalog,null,2)+"\n");
console.log(JSON.stringify({status:"PREPARED",film_url:`https://situationshipin.space/review/${id}/`,records:records.map(i=>i.artifact_id)}));
