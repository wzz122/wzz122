"""只建新自测期，旧样片只读。首次渲染来源，再渲染依赖它们的回顾墙。"""
from pathlib import Path
import importlib.util, json, shutil, sys, wave, bisect
T = Path(__file__).resolve().parents[1]
ROOT = T.parent
D = ROOT/'样片/_模板自测-2026-10-10-章卡回顾墙'
V = D/'画面v6'
if V.exists():
    raise RuntimeError('自测期已经存在，请在该期继续验证，不覆盖')
sp=importlib.util.spec_from_file_location('new',T/'新建一期.py');mod=importlib.util.module_from_spec(sp);sp.loader.exec_module(mod)
V.mkdir(parents=True)
for d in mod.SUBDIRS: (V/d).mkdir(parents=True,exist_ok=True)
mod.copy_template(V,False)
old=ROOT/'样片/_模板自测-2026-10-07/画面v6'
a=json.loads((old/'工程/.work/storyboard-audio.json').read_text())
cuts=[0,4.5,8.5,14.5,22,30]
names=['冲向世界第一','冲向世界第一','从危机走向复苏','改变经营方式','回到最初的问题']
scenes=[]
for i in range(5):
    scenes.append(dict(stable_id=f'S{i+1:02}',chapter=names[i],no=i+1,t0=cuts[i],t1=cuts[i+1],x=0,y=0,
                       camera=dict(cx=960,cy=504,zoom=1),camEnd=dict(cx=960,cy=504,zoom=1),elements=[]))
beats=[dict(b,scene=min(4,bisect.bisect_right(cuts,b['t0'])-1),t1=min(30,b['t1'])) for b in a['beats'] if b['t0']<30]
aud=dict(meta=dict(a['meta'],duration=30,series='大阪USJ',title='从危机走向复苏',revision='v6'),scenes=scenes,beats=beats)
(V/'工程/.work/storyboard-audio.json').write_text(json.dumps(aud,ensure_ascii=False,indent=1))
with wave.open(str(old/'声音/旁白.wav'),'rb') as src:
    params=src.getparams(); raw=src.readframes(round(30*src.getframerate()))
with wave.open(str(V/'声音/旁白.wav'),'wb') as dst:
    dst.setparams(params);dst.writeframes(raw)
shutil.copy2(old/'声音/配乐-M1-开场到开园.mp3',V/'声音/配乐-M1.mp3')
video=Path.home()/'Desktop/写稿/资料/2026-10-大阪USJ/素材/视频/片段/USJ-V17b-MBS-市长-1位を狙える射程距離.mp4'
shutil.copy2(video,V/'素材/市长会见.mp4')
shutil.copy2(old/'素材/帧/S37-3-2014城堡全景蓝天.png',V/'素材/乐园.png')
project={'期名':D.name,'片名':'从危机走向复苏','时间轴':'工程/.work/storyboard-audio.json','旁白':'声音/旁白.wav',
 '成片输出':'自测/总装测试/测试-30s.mp4','素材目录':['素材'],'视频目录':['素材'],
 '章名':{str(i+1):n for i,n in enumerate(names)},'章卡':{'S03':['开园','危机','转折']},'接缝淡化':[{'镜头':'S03','秒':.25}],
 '导航':[{'标签':'起点','起镜头':'S01'},{'标签':'转折','起镜头':'S03'},{'标签':'回顾','起镜头':'S05'}],
 '配乐':{'闪避dB':3,'分段':[{'名':'M1','曲子':'配乐-M1.mp3','起镜头':'S01','止镜头':'S05','对齐':'开头','比人声低dB':20}]}}
(V/'项目.json').write_text(json.dumps(project,ensure_ascii=False,indent=1))
scripts={
'S01':"""begin('S01', source='资料：大阪 USJ 既有证据卡', chapter_mark=False)
chaptercard(1,'冲向世界第一',['开园','危机','转折','新项目'])
""",
'S02':"""begin('S02', source='来源：MBS（每日放送）｜大阪市长会见', chapter_mark=False)
v=videocard('市长会见.mp4',x=460,y=150,w=1000,h=470,t_in=0,t_out=3.7,rot=0,tape=['tl','tr'],sfx='paper')
quotecard(over=v, size=44, segs=[{'text':'已经到了能瞄准世界第一的距离','at':1.27,'end':3.48}],
          ja='1位を狙える射程距離',who='横山英幸｜大阪市长（中文转述）',at=.45,sfx='paper')
sound('type',1.27)
""",
'S03':"""begin('S03', source='资料：大阪 USJ 既有证据卡', chapter_mark=False)
chaptercard(3,'从危机走向复苏',hold=2.6)
photocard('乐园.png',x=210,y=240,w=940,h=520,at=2.8,rot=0,sfx='paper')
text('从开园危机\\n到重新出发',x=1200,y=370,w=540,size=52,at=3.5)
""",
'S04':"""begin('S04','改变经营方式',source='资料：大阪 USJ 既有证据卡')
photocard('乐园.png',x=170,y=230,w=920,h=530,rot=0,sfx='paper')
panel('只靠降价',x=1160,y=280,w=560,h=180,rot=0,sfx='paper')
circle(rect=[1196,324,350,68],shape='strike',strokes=2,at=1.2,dur=.8,sfx='marker')
note('重新打造招牌项目',x=1160,y=550,w=560,size=36,at=3,sfx='paper')
text('新的选择，新的起点',x=1160,y=720,w=560,size=34,at=5.2)
""",
'S05':"""begin('S05','回到最初的问题',source='资料：本片前文画面')
recapwall([('S01',2),('S02',3.5),('S03',4.5),('S04',4)],'突破来自一次次选择',focus=[0,1,2,3])
"""}
for sid,body in scripts.items():
    (V/f'镜头脚本/{sid}.py').write_text('from v6lib import *\ndef build():\n'+''.join('    '+line+'\n' for line in body.splitlines()))
# 初次构建只载入来源镜头，回顾墙必须等这些 mp4 存在。
sys.path.insert(0,str(V)); import v6lib
v6lib.build_storyboard(['S01','S02','S03','S04'])
print(V)
