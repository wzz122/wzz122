from pathlib import Path
import importlib.util, json, sys, shutil
T=Path(__file__).resolve().parents[1];V=T.parent/'样片/_模板自测-2026-10-10-章卡回顾墙/画面v6'
for rel in ['v6lib.py','总装v6.py','工程/engine/fx.js','工程/engine/stage.css','v6lib-接口说明.md']:
 shutil.copy2(T/rel,V/rel)
sys.path.insert(0,str(V));import v6lib as l
sp=importlib.util.spec_from_file_location('assembly',V/'总装v6.py');a=importlib.util.module_from_spec(sp);sp.loader.exec_module(a)
results=[]
def rejects(label,fn,cls=ValueError,contains=None):
 try:fn()
 except cls as ex:
  if contains:assert contains in str(ex),(label,str(ex))
  results.append(dict(test=label,passed=True,error=str(ex)));return
 raise AssertionError(label+' 没报错')
l.begin('S01',chapter_mark=False)
rejects('不足三个关键词',lambda:l.chaptercard(1,'起点',['一个','两个']))
rejects('关键词过长',lambda:l.chaptercard(1,'起点',['超过八个字的关键词一','二','三']))
rejects('章卡停留太短',lambda:l.chaptercard(1,'起点',['一','二','三'],hold=.5))
e=l.chaptercard(1,'起点',['一','二','三','四']);assert len(l._S().sfx)==4
l.begin('S02',chapter_mark=False)
fake=l._S().add('videocard',460,150,1000,470,at=0)
q=l.quotecard(over=fake,segs=[dict(text='世界第一的距离',at=1,end=3)],ja='1位を狙える射程距離',who='中文转述',size=44)
assert q['y']==634 and q['y']+q['h']<=870 and q.get('rot',0)==0 and q['over']==fake['id']
rejects('压入字幕带',lambda:l.quotecard(over=dict(fake,y=650),text_='一句话',size=44))
rejects('视频引语超宽',lambda:l.quotecard(over=fake,text_='太长的引语'*30))
rejects('逐字时刻数量不符',lambda:l.quotecard(over=fake,segs=[dict(text='三个字',at=1,times=[1,2])]))
rejects('字符时刻倒序',lambda:l.quotecard(over=fake,segs=[dict(text='三个字',at=1,times=[1,3,2])]))
l.begin('S04',chapter_mark=False)
rejects('删除线笔数非法',lambda:l.circle(rect=[200,300,300,50],shape='strike',strokes=3))
x=l.circle(rect=[200,300,300,50],shape='strike',strokes=2,dur=.8,sfx='marker');assert x['dur']==.8 and l._S().sfx[-1]['at']==0
l.begin('S05',chapter_mark=False)
rejects('回顾墙缺来源 mp4',lambda:l.recapwall([('不存在',1)]*4,'结论',focus=[0,1,2,3]),FileNotFoundError,'缺 mp4')
rejects('回顾墙抽自身',lambda:l.recapwall([('S05',1)]*4,'结论',focus=[0,1,2,3]))
rejects('回顾墙焦点重复',lambda:l.recapwall([('S01',1)]*4,'结论',focus=[0,0,2,3]))
# 隔离夹具来自旧自测渲染，只查接口/依赖，不声称新画面已渲染。
fixture=V/'自测/接缝隔离/镜头';l.CACHE_DIR=fixture
rejects('抽帧时间出界',lambda:l.grab('S01',[99],cache=fixture))
e=l.recapwall([('S01',2),('S02',3.5),('S03',4.5),('S04',4)],'突破来自一次次选择',focus=[0,1,2,3]);assert e['count']==32 and len(e['images'])==4
man=json.loads((fixture/'manifest.json').read_text());assert a.seam_plan(man,[])=={}
for label,config in [('首镜头',[{'镜头':'S01','秒':.25}]),('镜头重复',[{'镜头':'S03','秒':.25}]*2),('未知镜头',[{'镜头':'没有','秒':.25}]),('时长NaN',[{'镜头':'S03','秒':float('nan')}]),('零时长',[{'镜头':'S03','秒':0}]),('负时长',[{'镜头':'S03','秒':-.1}]),('超过一秒',[{'镜头':'S03','秒':1.1}])]:
 rejects('接缝'+label,lambda config=config:a.seam_plan(man,config))
assert a.seam_plan(man,[{'镜头':'S03','秒':.25}])=={'S03':8}
l._SHOTS.clear();l._CUR=None
sb=l.build_storyboard(out_dir=V/'自测/接缝隔离/分镜-隔离')
assert sb['beats']==l._AUD['beats'];assert sum(l.frames_of(s) for s in sb['scenes'])==900
results.append(dict(test='完整分镜时间不变、回顾依赖与组件事件登记',passed=True,frames=900,sfx=len(sb['sfx_events'])))
(V/'自测/接口回归.json').write_text(json.dumps(results,ensure_ascii=False,indent=1));print('接口回归通过',len(results),'项')
