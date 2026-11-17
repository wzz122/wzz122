#!/usr/bin/env python3
"""把视频工厂格式的稿件 .md 转成好读的网页（同名 .html），并用浏览器打开。
用法：python3 工具/稿件网页.py 成稿/xxx.md [--no-open]"""
import re, html, sys, subprocess
src = sys.argv[1]
lines = open(src, encoding='utf-8').read().splitlines()
def hl(t):
    t = html.escape(t)
    t = re.sub(r'==(.+?)==', r'<mark>\1</mark>', t)
    return re.sub(r'\*\*(.+?)\*\*', r'<b class="red">\1</b>', t)
out = []; title = sub = ''; chap = 0; inscr = False; nar = 0
def close():
    global inscr
    if inscr: out.append('</div>'); inscr = False
for l in lines:
    s = l.strip()
    if not s: continue
    if s.startswith('# ') and not title: title = s[2:]; continue
    if s.startswith('> ') and not sub: sub = s[2:]; continue
    if s.startswith('## '):
        close(); chap += 1
        out.append(f'<h2 id="c{chap}"><span>第{chap}章</span>{hl(s[3:])}</h2>'); continue
    if s == '---': close(); continue
    if not inscr: out.append('<div class="screen">'); inscr = True
    if s.startswith('@ '): out.append(f'<div class="kicker">{hl(s[2:])}</div>')
    elif s.startswith('# '): out.append(f'<div class="big">{hl(s[2:])}</div>')
    elif s.startswith('['):
        m = re.match(r'\[(.+?)\]\s*(.*)', s)
        out.append(f'<div class="layout"><span>{html.escape(m.group(1))}</span>{hl(m.group(2))}</div>')
    else:
        nar += len(re.sub(r'[，。、：；？「」（）《》\s]', '', s)); out.append(f'<p>{hl(s)}</p>')
close()
toc = ''.join(f'<a href="#c{i}">{i}</a>' for i in range(1, chap + 1))
css = '''
:root{--bg:#f6f3ec;--card:#fff;--ink:#222;--mute:#777;--acc:#b8322a;--mark:#ffe58a;--line:#e4ded2}
@media (prefers-color-scheme:dark){:root{--bg:#1b1a18;--card:#262522;--ink:#eee;--mute:#999;--acc:#ff7a6e;--mark:#6b5a12;--line:#3a3833}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.75 "PingFang SC","Hiragino Sans GB",sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:28px;line-height:1.35;margin:8px 0}.sub{color:var(--mute)}.meta{color:var(--mute);font-size:14px;margin:8px 0 20px}
nav{position:sticky;top:0;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line);z-index:2}
nav a{display:inline-block;margin:2px 6px 2px 0;padding:2px 10px;border:1px solid var(--line);border-radius:12px;color:var(--ink);text-decoration:none;font-size:14px}
h2{margin:40px 0 12px;font-size:22px}h2 span{display:inline-block;font-size:13px;color:#fff;background:var(--acc);border-radius:4px;padding:1px 8px;margin-right:10px;vertical-align:middle}
.screen{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 18px;margin:12px 0}
.kicker{font-size:12px;letter-spacing:.15em;color:var(--mute)}.big{font-size:20px;font-weight:700;margin:2px 0 8px}
.layout{font-size:14px;color:var(--mute);background:var(--bg);border-radius:6px;padding:6px 10px;margin-bottom:8px;word-break:break-all}
.layout span{color:var(--acc);font-weight:600;margin-right:8px}p{margin:2px 0}mark{background:var(--mark);color:inherit;padding:0 2px}.red{color:var(--acc)}'''
page = (f'<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{html.escape(title[:20])}</title><style>{css}</style></head><body><main><h1>{hl(title)}</h1><div class="sub">{hl(sub)}</div>'
        f'<div class="meta">{chap} 章 · 旁白约 {nar} 字 · 估算约 {nar/4.2/60:.1f} 分钟（4.2 字/秒）｜灰色块是画面版式，不念；黄色是大标题高亮</div>'
        f'<nav>章节 {toc}</nav>{"".join(out)}</main></body></html>')
dst = re.sub(r'\.md$', '.html', src)
open(dst, 'w', encoding='utf-8').write(page)
print(dst, chap, nar)
if '--no-open' not in sys.argv: subprocess.run(['open', dst])
