"""浏览器不可用时也能验证接缝处理；这里使用旧渲染作为隔离夹具，不代表新组件已画面验收。"""
from pathlib import Path
import importlib.util, json, shutil, sys
T=Path(__file__).resolve().parents[1]
V=T.parent/'样片/_模板自测-2026-10-10-章卡回顾墙/画面v6'
for rel in ['v6lib.py','总装v6.py','README.md','v6lib-接口说明.md','工程/engine/fx.js','工程/engine/stage.css','工程/分段渲染.mjs']:
 shutil.copy2(T/rel,V/rel)
sys.path.insert(0,str(V));import v6lib as lib
sp=importlib.util.spec_from_file_location('assembly',V/'总装v6.py');a=importlib.util.module_from_spec(sp);sp.loader.exec_module(a)
base=T.parent/'样片/_模板自测-2026-10-07/画面v6/镜头'
old={r['id']:r for r in json.loads((base/'manifest.json').read_text())}
fixture=V/'自测/接缝隔离/镜头';fixture.mkdir(parents=True,exist_ok=True)
manifest=[]
for sc,oldid in zip(lib._AUD['scenes'],['S19','S20','S37','S19','S20']):
 sid=sc['stable_id'];n=lib.frames_of(sc);f=fixture/f'{sid}-旧镜头夹具.mp4'
 src=base/Path(old[oldid]['file']).name
 a.run_heavy([a.FF,'-y','-v','error','-i',src,'-an','-frames:v',n,'-c:v','libx264','-preset','veryfast','-crf','18','-threads','3',
              '-x264-params','keyint=15:min-keyint=15:scenecut=0:bframes=0:open-gop=0','-pix_fmt','yuv420p','-r','30',
              '-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-video_track_timescale','30000',f],sid+' 旧镜头夹具')
 assert a.probe_video(f)['frames']==n,(sid,n)
 manifest.append(dict(id=sid,file=str(f),frames=n))
(fixture/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=1))
shots=[dict(r) for r in manifest]
work=V/'自测/接缝隔离';parts,records=a.seam_parts(shots,manifest,a.seam_plan(manifest,[{'镜头':'S03','秒':.25}]),work)
for name,items in [('硬切',shots),('淡化',parts)]:
 cf=work/(name+'.txt');cf.write_text(''.join("file '"+r['file'].replace("'","'\\''")+"'\n" for r in items))
 out=work/(name+'.mp4');a.run([a.FF,'-y','-v','error','-f','concat','-safe','0','-i',cf,'-an','-c','copy',out],name+' 串接')
 assert a.probe_video(out)['frames']==900
 def hashes(path):
  raw=a.media_run([a.FF,'-v','error','-i',path,'-an','-f','framemd5','-'],'逐帧 MD5').stdout
  return [ln.split(',')[-1].strip() for ln in raw.splitlines() if ln and not ln.startswith('#')]
 if name=='硬切':before=hashes(out)
 else:after=hashes(out)
start=round(lib._AUD['scenes'][2]['t0']*30);k=records[0]['encoded_frames'];n=records[0]['blend_frames']
assert len(before)==len(after)==900
outside=[i for i in range(900) if not start<=i<start+k]
assert all(before[i]==after[i] for i in outside),'非接缝帧发生改变'
# 解码逐帧比对：前镜、后镜复制尾段都与硬切帧逐字节相同。
paths=[]
# grab() 用镜头命名规则；建立明确的新目录别名。
for name in ['硬切','淡化']:
 shutil.copy2(work/(name+'.mp4'),work/(name+'-核对.mp4'))
 paths+=lib.grab(name,[(start-1)/30,start/30,(start+3)/30,(start+n-1)/30,(start+k)/30],cache=work,out_dir=work/'抽帧',prefix=name)
lib.contact(paths,work/'对照-接缝.jpg',cols=5,width=480)
report=dict(frames_before=900,frames_after=900,start_frame=start,seams=records,unchanged_decoded_frames=len(outside),
            changed_frames=[i for i in range(900) if before[i]!=after[i]],
            caveat='旧渲染夹具，只验证接缝；新组件实际渲染因沙箱阻塞，未验收')
(work/'帧数核对.json').write_text(json.dumps(report,ensure_ascii=False,indent=1))
print(json.dumps(report,ensure_ascii=False))
