#!/usr/bin/env python3
"""把谷歌文档读回来的文本（Drive read_file_content 的 fileContent）还原成视频工厂格式 .md。
约定（上传时用的格式）：## 章节名 / 【画面标题】xxx → # xxx / 灰色 [版式]、@ 小标、--- 原样。
用法：python3 工具/谷歌文档回读.py 回读.txt 输出.md"""
import re, sys
src, dst = sys.argv[1], sys.argv[2]
t = open(src, encoding='utf-8').read()
out = []; started = False
for raw in t.split('\n'):
    l = raw.strip()
    if not l: continue
    l = re.sub(r'\\([\[\]\-\>\&\*\_\#\.\!\(\)])', r'\1', l)            # 去掉 markdown 转义
    if not started:                                                    # 跳过开头的「怎么改」说明
        if l.startswith('# '): started = True
        else: continue
    m = re.match(r'^(#{1,2})\s+\*\*(.+)\*\*$', l)
    if m: l = f"{m.group(1)} {m.group(2)}"
    m = re.match(r'^\*\*【画面标题】(.+?)\*\*$', l) or re.match(r'^【画面标题】(.+)$', l)
    if m: l = '# ' + m.group(1).strip()
    l = re.sub(r'\*\*(.+?)\*\*', r'\1', l) if not l.startswith('#') else l   # 正文里残留的加粗
    out.append(l)
# 在章节、换屏后补空行，和原稿排版接近
res = []
for l in out:
    if l.startswith('## ') and res: res.append('')
    res.append(l)
open(dst, 'w', encoding='utf-8').write('\n'.join(res) + '\n')
print(f"ok {dst}  {len(out)} 行")
