// 无浏览器的组件状态回归：验证绝对时间/逆向 seek；不能代替真实 DOM 布局或导出审图。
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const T=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx={window:{CHARTS:{}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(T,'工程/engine/fx.js'),'utf8'),ctx);
const types=ctx.window.FX.types;
function leaf(){return {style:{},attr:{},getAttribute(k){return this.attr[k]},setAttribute(k,v){this.attr[k]=v},getTotalLength(){return 500}}}
function tree(kind,s){
 const all={};const n=leaf();n.firstChild=leaf();
 if(kind==='chaptercard'){all['.cc-note']=s.keywords.map(leaf);all['.cc-name']=[leaf()];}
 if(kind==='recapwall'){for(const k of ['.rw-camera','.rw-conclusion'])all[k]=[leaf()];all['.rw-card']=Array.from({length:s.count},leaf);all['.rw-line']=s.focus.map(leaf);}
 if(kind==='circle')all['.ci-path']=[leaf()];
 if(kind==='quotecard'){
  all['.qc-c']=Array.from({length:s.segs.reduce((a,g)=>a+[...g.text].length,0)},leaf);all['.qc-caret']=[leaf()];
  for(const ch of all['.qc-c']){ch.after=()=>{};ch.before=()=>{};}
 }
 n.querySelector=k=>all[k]?.[0];n.querySelectorAll=k=>all[k]||[];
 return {n,all,state:()=>JSON.stringify({outer:n.style,first:n.firstChild.style,nodes:Object.fromEntries(Object.entries(all).map(([k,ns])=>[k,ns.map(n=>({style:n.style,attr:n.attr}))]))})};
}
const specs=[
 {type:'chaptercard',id:'a',x:150,y:150,w:1620,h:650,delay:.1,no:3,name:'转折',keywords:['起点','选择','转折','突破'],stagger:.35,titleAt:1.65},
 {type:'recapwall',id:'b',x:150,y:185,w:1620,h:675,delay:0,count:32,zoom:2.4,zoomDur:2.4,lineDur:.5,
 images:['file:///test1.jpg','file:///test2.jpg','file:///test3.jpg','file:///test4.jpg'],focus:[{tile:4,at:2.65},{tile:13,at:3.55},{tile:18,at:4.45},{tile:27,at:5.35}],conclusion:'突破来自一次次选择'},
 {type:'circle',id:'c',x:0,y:0,w:1920,h:1008,delay:1,rect:[200,320,500,70],shape:'strike',strokes:2,dur:.8},
 {type:'quotecard',id:'d',x:300,y:650,w:1100,delay:.3,size:44,over:'video',segs:[{text:'世界第一',at:1,cps:3},{text:'的距离',at:2.5,times:[2.5,2.8,3.2]}]}
];
const result=[];
for(const s of specs){
 const f=types[s.type];assert(f);const html=f.build(s);assert(!/KEYWORD|backdrop-filter/.test(html));
 const tr=tree(s.type,s),forward=[];
 for(let i=0;i<240;i++){f.update(tr.n,s,1,0,{lt:i/30,sceneDur:8});forward[i]=tr.state();}
 for(let i=239;i>=0;i--){f.update(tr.n,s,1,0,{lt:i/30,sceneDur:8});assert.equal(tr.state(),forward[i],`${s.type} reverse frame ${i}`);}
 // 随机 seek、重新 build、相同绝对时刻必须一致。
 const random=tree(s.type,s);
 for(const i of [239,17,0,155,65,239,2,80,0]){f.update(random.n,s,1,0,{lt:i/30,sceneDur:8});assert.equal(random.state(),forward[i],`${s.type} random seek ${i}`);}
 assert(f.win(s,8).every(([a,b])=>b>=a));
 result.push({component:s.type,forward_frames:240,reverse_frames:240,random_seeks:9,passed:true});
}
const V=path.join(T,'../样片/_模板自测-2026-10-10-章卡回顾墙/画面v6/自测');
fs.writeFileSync(path.join(V,'动画状态回归.json'),JSON.stringify({results:result,scope:'无浏览器的状态回归，不代表 DOM 布局、实际帧渲染或视觉验收'},null,2));console.log(JSON.stringify(result));
