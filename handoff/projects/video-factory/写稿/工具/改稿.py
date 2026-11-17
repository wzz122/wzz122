#!/usr/bin/env python3
"""改稿页：把稿件的旁白摆成一页纯文字，直接在浏览器里改，自动存回稿件 .md。

用法：
  python3 工具/改稿.py 成稿/xxx.md          # 打开这份稿
  python3 工具/改稿.py                      # 不给文件：打开 成稿/ 里最近改过的那份稿
  python3 工具/改稿.py 成稿/xxx.md --no-open --port 8766

- 页面只显示章名和旁白；版式行、大标题、注释不显示，存盘时原样保留在原位置。
- 每一段对应稿件里的一屏，段内一行就是一句字幕。改完停一秒自动保存。
- 第一次保存前，把原稿备份成「xxx.改稿前备份.md」（已有备份就不再覆盖）。
- 视频工厂 1-我的文案/ 里有同名文件的，一并更新。
- **建议模式**（2026-10-12）：同目录有「xxx.建议.json」时，助手的修改建议显示在右边，
  用户逐条选「替换 / 插到后面 / 插入新段 / 删掉 / 忽略」，建议框里的字也能先改再用。
  建议文件由 `python3 工具/生成建议.py 用户版.md 新版.md` 生成。
- 只在本机 127.0.0.1 上开服务；关掉终端窗口或按 Ctrl+C 就停。
"""
import json, re, sys, threading, webbrowser, shutil
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = Path(__file__).resolve().parent.parent
FACTORY = Path.home() / 'Desktop' / '视频工厂' / '1-我的文案'
ATTACH = ('-音乐表', '-素材清单', '-画面任务', '-Codex复核', '-大纲', '-事实锁记录', '-纯文案', '备份')


def pick_latest():
    cands = [p for p in (ROOT / '成稿').glob('*.md') if not any(a in p.stem for a in ATTACH)]
    if not cands:
        sys.exit('成稿/ 里没有稿件')
    return max(cands, key=lambda p: p.stat().st_mtime)


def is_narration(s):
    s = s.strip()
    return bool(s) and not s.startswith(('#', '[', '@', '>', '<!--', '---')) and s != '---'


def parse(text):
    """返回 (head, screens)。head 是第一个 ## 之前的原文；
    screens 是 [{'chapter': 章名或None, 'raw': [行...]}]，raw 是这一屏的原始行（不含分隔的 ---）。"""
    lines = text.split('\n')
    i = 0
    head = []
    while i < len(lines) and not lines[i].startswith('## '):
        head.append(lines[i]); i += 1
    screens, cur, chap = [], None, None
    in_comment = False
    for l in lines[i:]:
        if not in_comment and l.startswith('## '):
            if cur: screens.append(cur)
            chap = l[3:].strip()
            cur = {'chapter': chap, 'raw': [], 'chapter_line': l}
            continue
        if not in_comment and l.strip() == '---':
            if cur: screens.append(cur)
            cur = {'chapter': None, 'raw': []}
            continue
        if cur is None:
            cur = {'chapter': None, 'raw': []}
        cur['raw'].append(l)
        if '<!--' in l and '-->' not in l.split('<!--', 1)[1]:
            in_comment = True
        elif in_comment and '-->' in l:
            in_comment = False
    if cur: screens.append(cur)
    # 标出每屏哪些行是旁白（注释里的不算）
    for sc in screens:
        flags, inc = [], False
        for l in sc['raw']:
            if inc:
                flags.append(False)
                if '-->' in l: inc = False
                continue
            if l.strip().startswith('<!--'):
                flags.append(False)
                if '-->' not in l: inc = True
                continue
            flags.append(is_narration(l))
        sc['flags'] = flags
        sc['narration'] = [l for l, f in zip(sc['raw'], flags) if f]
        sc['title'] = next((l[2:].strip() for l in sc['raw'] if l.startswith('# ')), '')
    return '\n'.join(head), screens


def rebuild(head, screens, new_texts):
    out = [head] if head else []
    first = True
    for sc, txt in zip(screens, new_texts):
        new_lines = [x.rstrip() for x in txt.replace('\r', '').split('\n') if x.strip()]
        body, inserted = [], False
        old_n = sum(sc['flags'])
        if old_n and len(new_lines) == old_n:
            # 行数没变：逐行原位替换，空行和注释的位置都不动
            it = iter(new_lines)
            body = [next(it) if f else l for l, f in zip(sc['raw'], sc['flags'])]
            inserted = True
        else:
            for l, f in zip(sc['raw'], sc['flags']):
                if f:
                    if not inserted:
                        body.extend(new_lines); inserted = True
                    continue
                body.append(l)
        if not inserted and new_lines:
            # 原来没有旁白：插在末尾的空行之前
            while body and not body[-1].strip(): body.pop()
            body.extend(new_lines)
            body.append('')
        if sc.get('chapter_line'):
            out.append(sc['chapter_line'])
        elif not first:
            out.append('---')
        out.extend(body)
        first = False
    text = '\n'.join(out)
    return text if text.endswith('\n') else text + '\n'


def count_chars(texts):
    return sum(len(re.sub(r'[\s，。、：；？！「」『』（）《》“”…—,.:;?!()\-]', '', t)) for t in texts)




def serialize(head, screens):
    out = [head] if head else []
    for i, sc in enumerate(screens):
        if sc.get('chapter_line'):
            out.append(sc['chapter_line'])
        elif i > 0 or head:
            out.append('---') if i > 0 else None
        out.extend(sc['raw'])
    text = '\n'.join(x for x in out if x is not None)
    return text if text.endswith('\n') else text + '\n'


def screen_from_raw(raw_lines):
    """把一段原始行（可带 ## 章名行）做成 screen。"""
    lines = list(raw_lines)
    ch = None
    if lines and lines[0].startswith('## '):
        ch = lines.pop(0)
    _, scs = parse('## X\n' + '\n'.join(lines))
    sc = scs[0]
    sc.pop('chapter_line', None)
    sc['chapter'] = ch[3:].strip() if ch else None
    if ch:
        sc['chapter_line'] = ch
    if not sc['raw'] or sc['raw'][-1].strip():
        sc['raw'].append('')
    return sc


def sugg_path(src):
    return src.with_name(src.stem + '.建议.json')


def load_sugg(src):
    p = sugg_path(src)
    if not p.exists():
        return []
    return json.loads(p.read_text(encoding='utf-8')).get('suggestions', [])


def save_sugg(src, items):
    sugg_path(src).write_text(json.dumps({'suggestions': items}, ensure_ascii=False, indent=1), encoding='utf-8')


def narration_of(raw):
    _, scs = parse('## X\n' + '\n'.join(l for l in raw if not l.startswith('## ')))
    return '\n'.join(x.strip() for x in scs[0]['narration']) if scs else ''


def title_of(raw):
    return next((l[2:].strip() for l in raw if l.startswith('# ')), '')


def apply_sugg(head, screens, items, sid, action, text):
    """按用户的选择应用一条建议，返回 (screens, items)。"""
    it = next((x for x in items if x['id'] == sid), None)
    if it is None:
        raise ValueError('这条建议已经处理过了，请刷新页面')
    at = it['at']
    rest = [x for x in items if x['id'] != sid]
    new_lines = [x.rstrip() for x in (text or '').replace('\r', '').split('\n') if x.strip()]
    if action == 'ignore':
        return screens, rest
    if it['type'] == 'replace' and action in ('replace', 'append'):
        sc = screens[at]
        cur = [l.strip() for l in sc['narration']]
        if action == 'append':
            texts = ['\n'.join(x.strip() for x in s['narration']) for s in screens]
            texts[at] = '\n'.join(cur + new_lines)
            screens = parse(rebuild(head, screens, texts))[1]
        else:
            new_sc = screen_from_raw(it['raw'])
            if it.get('chapter_line'):
                new_sc['chapter_line'] = it['chapter_line']; new_sc['chapter'] = it['chapter_line'][3:].strip()
            elif it.get('chapter_line') == '':
                new_sc.pop('chapter_line', None); new_sc['chapter'] = None
            elif sc.get('chapter_line'):
                new_sc['chapter_line'] = sc['chapter_line']; new_sc['chapter'] = sc['chapter']
            else:
                new_sc.pop('chapter_line', None); new_sc['chapter'] = None
            screens = screens[:at] + [new_sc] + screens[at + 1:]
            texts = ['\n'.join(x.strip() for x in s['narration']) for s in screens]
            texts[at] = '\n'.join(new_lines)
            screens = parse(rebuild(head, screens, texts))[1]
        return screens, rest
    if it['type'] == 'insert' and action == 'insert':
        new_sc = screen_from_raw(it['raw'])
        if at == 0 and screens and screens[0].get('chapter_line') and not new_sc.get('chapter_line'):
            # 插在最前面又不带章名：把原来的章名挪到新段上
            new_sc['chapter_line'] = screens[0]['chapter_line']; new_sc['chapter'] = screens[0]['chapter']
            screens[0] = dict(screens[0]); screens[0].pop('chapter_line'); screens[0]['chapter'] = None
        screens = screens[:at] + [new_sc] + screens[at:]
        texts = ['\n'.join(x.strip() for x in s['narration']) for s in screens]
        texts[at] = '\n'.join(new_lines)
        screens = parse(rebuild(head, screens, texts))[1]
        for x in rest:
            if x['at'] > at or (x['at'] == at and x['type'] in ('replace', 'delete')) or (x['at'] == at and x['type'] == 'insert' and x.get('order', 0) > it.get('order', 0)):
                x['at'] += 1
        return screens, rest
    if it['type'] == 'delete' and action == 'delete':
        sc = screens[at]
        if sc.get('chapter_line') and not it.get('drop_chapter') and at + 1 < len(screens) and not screens[at + 1].get('chapter_line'):
            screens[at + 1] = dict(screens[at + 1]); screens[at + 1]['chapter_line'] = sc['chapter_line']; screens[at + 1]['chapter'] = sc['chapter']
        screens = screens[:at] + screens[at + 1:]
        rest = [x for x in rest if not (x['at'] == at and x['type'] in ('replace', 'delete'))]
        for x in rest:
            if x['at'] > at:
                x['at'] -= 1
        return parse(serialize(head, screens))[1], rest
    raise ValueError('不认识的操作')


PAGE = r'''<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>改稿</title>
<style>
:root{--bg:#f7f4ee;--ink:#1f1e1c;--mute:#8a857c;--line:#e6e0d4;--acc:#b8322a;--sug:#eef4ec;--sugline:#b9d3b3;--del:#f8e9e6}
@media (prefers-color-scheme:dark){:root{--bg:#1c1b19;--ink:#ece9e3;--mute:#8f8a82;--line:#34322e;--acc:#ff7a6e;--sug:#1f2a1f;--sugline:#3c5a3a;--del:#3a2422}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:var(--fs,24px)/1.85 "PingFang SC","Hiragino Sans GB","Noto Sans SC",sans-serif}
main{width:min(1600px,96vw);margin:0 auto;padding:24px 12px 120px}
h1{font-size:1.3em;line-height:1.4;margin:0 0 4px}
.bar{position:sticky;top:0;background:var(--bg);padding:8px 0;font-size:14px;color:var(--mute);border-bottom:1px solid var(--line);z-index:2;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.bar .ok{color:#3a7d44}.bar .err{color:var(--acc)}
.bar .sz{margin-left:auto;display:flex;gap:6px}
button{font:inherit;font-size:14px;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:6px;padding:2px 10px;cursor:pointer}
button.pri{background:var(--acc);color:#fff;border-color:var(--acc)}
h2{font-size:.75em;color:var(--acc);margin:1.6em 0 .2em;letter-spacing:.05em}
.row{display:grid;grid-template-columns:1fr;gap:20px}
.has .row{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}
@media (max-width:900px){.has .row{grid-template-columns:1fr}}
textarea{display:block;width:100%;border:0;background:transparent;color:inherit;font:inherit;resize:none;overflow:hidden;padding:6px 0 14px;margin:0;outline:none}
.main textarea{border-bottom:1px dashed var(--line)}
.main textarea:focus{background:rgba(184,50,42,.04)}
.ph{color:var(--mute);font-size:.6em;padding:10px 0;border-bottom:1px dashed var(--line)}
.card{background:var(--sug);border:1px solid var(--sugline);border-radius:10px;padding:8px 14px 10px;margin:6px 0}
.card.del{background:var(--del)}
.card .k{font-size:13px;color:var(--mute);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.card .k b{color:var(--ink);font-weight:600}
.card textarea{font-size:.92em;padding:4px 0 6px}
.card .btns{display:flex;gap:6px;flex-wrap:wrap}
.card .chg{font-size:.78em;line-height:1.6;margin:4px 0 6px}.card .chg div{padding:1px 6px;border-left:3px solid var(--sugline);margin:2px 0}.card .chg .rm{color:var(--mute);text-decoration:line-through;border-left-color:var(--acc)}
.card details summary{font-size:13px;color:var(--mute);cursor:pointer}
.legend{font-size:13px;color:var(--mute)}
</style></head><body><main>
<h1 id="t"></h1>
<div class="bar"><span id="st">读取中…</span><span id="cnt"></span><span id="sc" class="legend"></span><span class="sz">字号 <button id="dn">小一点</button><button id="up">大一点</button></span></div>
<div id="doc"></div>
</main><script>
const doc=document.getElementById('doc'),st=document.getElementById('st'),cnt=document.getElementById('cnt');
let timer=null,areas=[];
let fs=24;try{fs=parseInt(localStorage.getItem('gaigao-fs'))||24}catch(e){}
function fit(a){a.style.height='0px';a.style.height=a.scrollHeight+'px'}
function setfs(v){fs=Math.max(16,Math.min(40,v));document.documentElement.style.setProperty('--fs',fs+'px');try{localStorage.setItem('gaigao-fs',fs)}catch(e){}document.querySelectorAll('textarea').forEach(fit)}
setfs(fs);document.getElementById('up').onclick=()=>setfs(fs+2);document.getElementById('dn').onclick=()=>setfs(fs-2);
function chars(){return areas.reduce((n,a)=>n+a.value.replace(/[\s，。、：；？！「」『』（）《》“”…—,.:;?!()\-]/g,'').length,0)}
function upd(){const n=chars();cnt.textContent=n+' 字 · 配音后约 '+(n/280).toFixed(1)+' 分钟'}
async function save(){
  clearTimeout(timer);timer=null;st.textContent='保存中…';st.className='';
  try{const r=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:areas.map(a=>a.value)})});
    const j=await r.json(); if(!j.ok) throw new Error(j.error||'保存失败');
    st.textContent='已保存 '+new Date().toLocaleTimeString();st.className='ok';
  }catch(e){st.textContent='没保存上：'+e.message;st.className='err'}
}
function changed(){upd();st.textContent='有改动，停一下就保存';st.className='';clearTimeout(timer);timer=setTimeout(save,1000)}
async function apply(id,action,text){
  if(timer) await save();
  st.textContent='处理中…';
  const r=await fetch('/api/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action,text})});
  const j=await r.json(); if(!j.ok){st.textContent='没处理成：'+j.error;st.className='err';return}
  const y=window.scrollY; await load(); window.scrollTo(0,y); st.textContent='已处理并保存 '+new Date().toLocaleTimeString();st.className='ok';
}
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function card(s,base){
  const c=el('div','card'+(s.type==='delete'?' del':''));
  const k=el('div','k');
  const lab={replace:'建议改成',insert:'建议在这里插入新的一段',delete:'建议删掉左边这一段'}[s.type];
  k.appendChild(el('b',null,lab)); if(s.title) k.appendChild(el('span',null,'画面标题：'+s.title)); if(s.note) k.appendChild(el('span',null,s.note));
  c.appendChild(k);
  let ta=null;
  if(s.type==='replace'&&base!=null){
    const bl=base.split('\n').map(x=>x.trim()).filter(Boolean),nl=s.text.split('\n').map(x=>x.trim()).filter(Boolean);
    const add=nl.filter(x=>!bl.includes(x)),rm=bl.filter(x=>!nl.includes(x));
    const chg=el('div','chg');
    if(!add.length&&!rm.length)chg.appendChild(el('div',null,'旁白没变，只改了画面或章名'));
    rm.forEach(x=>chg.appendChild(el('div','rm',x)));add.forEach(x=>chg.appendChild(el('div',null,x)));
    c.appendChild(chg);
    const det=document.createElement('details');det.appendChild(el('summary',null,'看整段建议、先改再用'));
    ta=el('textarea');ta.value=s.text;ta.spellcheck=false;ta.addEventListener('input',()=>fit(ta));det.appendChild(ta);
    det.addEventListener('toggle',()=>fit(ta));c.appendChild(det);
  } else if(s.type!=='delete'){ta=el('textarea');ta.value=s.text;ta.spellcheck=false;ta.addEventListener('input',()=>fit(ta));c.appendChild(ta)}
  const b=el('div','btns');
  const add=(t,act,pri)=>{const x=el('button',pri?'pri':null,t);x.onclick=()=>apply(s.id,act,ta?ta.value:'');b.appendChild(x)};
  if(s.type==='replace'){add('替换','replace',1);add('插到后面','append')}
  if(s.type==='insert'){add('插入','insert',1)}
  if(s.type==='delete'){add('删掉','delete',1)}
  add('忽略','ignore');
  c.appendChild(b);
  return c;
}
async function load(){
  const d=await (await fetch('/api/doc')).json();
  document.getElementById('t').textContent=d.title;document.title='改稿 · '+d.title;
  doc.innerHTML='';areas=[];
  const sug=d.suggestions||[];
  document.body.classList.toggle('has',sug.length>0);
  document.getElementById('sc').textContent=sug.length?('右边还有 '+sug.length+' 条建议待处理'):'';
  const ins=i=>sug.filter(s=>s.type==='insert'&&s.at===i).sort((a,b)=>(a.order||0)-(b.order||0));
  const pend=(i)=>{ins(i).forEach(s=>{const r=el('div','row');if(s.chapter){const h=el('h2',null,s.chapter+'（新章）');doc.appendChild(h)}r.appendChild(el('div','ph','（这里可以插入新的一段）'));r.appendChild(card(s));doc.appendChild(r)})};
  d.screens.forEach((s,i)=>{
    pend(i);
    if(s.chapter){doc.appendChild(el('h2',null,s.chapter))}
    const r=el('div','row');const m=el('div','main');
    const a=el('textarea');a.value=s.text;a.spellcheck=false;a.addEventListener('input',()=>{fit(a);changed()});
    m.appendChild(a);areas.push(a);r.appendChild(m);
    const side=el('div','side');sug.filter(x=>x.type!=='insert'&&x.at===i).forEach(x=>side.appendChild(card(x,s.text)));r.appendChild(side);
    doc.appendChild(r);
  });
  pend(d.screens.length);
  document.querySelectorAll('textarea').forEach(fit);requestAnimationFrame(()=>document.querySelectorAll('textarea').forEach(fit));
  upd();if(!st.className)st.textContent='直接改，停一秒自动保存';
}
load();
window.addEventListener('resize',()=>document.querySelectorAll('textarea').forEach(fit));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)document.querySelectorAll('textarea').forEach(fit)});
if(document.fonts)document.fonts.ready.then(()=>document.querySelectorAll('textarea').forEach(fit));
</script></body></html>'''


def main():
    args = [a for a in sys.argv[1:]]
    no_open = '--no-open' in args
    port = 8765
    if '--port' in args:
        port = int(args[args.index('--port') + 1])
    files = [a for a in args if a.endswith('.md')]
    src = Path(files[0]).expanduser() if files else pick_latest()
    if not src.is_absolute():
        src = (Path.cwd() / src).resolve()
    if not src.exists():
        sys.exit(f'找不到 {src}')
    lock = threading.Lock()
    state = {'backed': False}

    def load():
        text = src.read_text(encoding='utf-8')
        head, screens = parse(text)
        title = next((l[2:].strip() for l in head.split('\n') if l.startswith('# ')), src.stem)
        return head, screens, title

    def write(new):
        bak = src.with_name(src.stem + '.改稿前备份.md')
        if not state['backed'] and not bak.exists():
            shutil.copy2(src, bak)
        state['backed'] = True
        src.write_text(new, encoding='utf-8')
        mirror = FACTORY / src.name
        if mirror.exists() and mirror.resolve() != src.resolve():
            mirror.write_text(new, encoding='utf-8')

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def send(self, code, body, ctype):
            b = body.encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', ctype + '; charset=utf-8')
            self.send_header('Content-Length', str(len(b)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers(); self.wfile.write(b)

        def do_GET(self):
            if self.path == '/':
                return self.send(200, PAGE, 'text/html')
            if self.path == '/api/doc':
                head, screens, title = load()
                sug = []
                for x in load_sugg(src):
                    y = {k: x.get(k) for k in ('id', 'type', 'at', 'order', 'note')}
                    raw = x.get('raw') or []
                    y['text'] = narration_of(raw) if raw else ''
                    y['title'] = title_of(raw) if raw else ''
                    y['chapter'] = raw[0][3:].strip() if raw and raw[0].startswith('## ') else None
                    sug.append(y)
                data = {'title': title, 'suggestions': sug, 'screens': [
                    {'chapter': s['chapter'], 'text': '\n'.join(x.strip() for x in s['narration'])} for s in screens]}
                return self.send(200, json.dumps(data, ensure_ascii=False), 'application/json')
            self.send(404, 'not found', 'text/plain')

        def do_POST(self):
            try:
                n = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(n).decode('utf-8'))
                with lock:
                    head, screens, _ = load()
                    if self.path == '/api/save':
                        texts = body['texts']
                        if len(texts) != len(screens):
                            raise ValueError('稿件结构在别处被改过，请刷新页面再改')
                        write(rebuild(head, screens, texts))
                        return self.send(200, json.dumps({'ok': True, 'chars': count_chars(texts)}), 'application/json')
                    if self.path == '/api/apply':
                        items = load_sugg(src)
                        screens2, items2 = apply_sugg(head, screens, items, body['id'], body['action'], body.get('text', ''))
                        if screens2 is not screens:
                            write(serialize(head, screens2))
                        save_sugg(src, items2)
                        return self.send(200, json.dumps({'ok': True}), 'application/json')
                return self.send(404, 'not found', 'text/plain')
            except Exception as e:
                self.send(200, json.dumps({'ok': False, 'error': str(e)}, ensure_ascii=False), 'application/json')

    for p in range(port, port + 20):
        try:
            srv = ThreadingHTTPServer(('127.0.0.1', p), H); port = p; break
        except OSError:
            continue
    else:
        sys.exit('没有空闲端口')
    url = f'http://127.0.0.1:{port}/'
    print(f'改稿页：{url}\n稿件：{src}\n改完直接关掉网页即可；要停服务就关掉这个窗口或按 Ctrl+C。', flush=True)
    if not no_open:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
