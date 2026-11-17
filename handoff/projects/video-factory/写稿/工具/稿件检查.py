#!/usr/bin/env python3
"""交稿前的稿件自查（视频工厂格式 .md）。只做文字统计和配音/画面风险检查，不跑模型。
用法：python3 工具/稿件检查.py 成稿/xxx.md
硬错误（退出码 1）：旁白里有日文假名。其余为提示。"""
import re, sys, collections
f = sys.argv[1]
src = open(f, encoding='utf-8').read()
# <!-- … --> 注释不念、不算旁白：单行、多行都去掉，换成同样多的换行，报告里的行号不变（2026-10-07）
src = re.sub(r'<!--[\s\S]*?-->', lambda m: '\n' * (len(m.group(0).splitlines()) - 1), src)
lines = src.splitlines()
PUNCT = r'[，。、：；？！「」『』（）《》""''\s]'
nar, screens, chapters = [], [], 0
cur = None
for n, l in enumerate(lines, 1):
    s = l.strip()
    if not s: continue
    if n == 1 and s.startswith('# '): continue          # 视频标题
    if s.startswith('## '): chapters += 1; cur = None; continue   # 章节名只显示在右上角，不念
    if s.startswith('# ') and n > 1:
        if cur is None or cur['has_head']:
            cur = {'head': s[2:], 'layout': None, 'has_head': True, 'say': 0, 'line': n}; screens.append(cur)
        else: cur['head'] = s[2:]; cur['has_head'] = True
        continue
    if s.startswith('['):
        if cur is None or cur['has_head'] and cur['say']:
            cur = {'head': '', 'layout': None, 'has_head': False, 'say': 0, 'line': n}; screens.append(cur)
        cur['layout'] = re.match(r'\[(.+?)\]', s).group(1); continue
    if s == '---': cur = None; continue
    if s.startswith(('> ', '@ ')): continue
    if cur is None: cur = {'head': '', 'layout': None, 'has_head': False, 'say': 0, 'line': n}; screens.append(cur)
    cur['say'] += 1; nar.append((n, s))
txt = ''.join(t for _, t in nar)
chars = len(re.sub(PUNCT, '', txt))
print(f"章 {chapters} · 屏 {len(screens)} · 旁白 {len(nar)} 行 · {chars} 字（不含标点）· 估算旁白 {chars / 4.7 / 60:.1f} 分钟"
      f"（MiniMax gou 1.15 倍实测 4.7 字/秒，311 期；还没算喘气点和章卡；想听节奏可先跑 试听配音.py 免费出一条 Kokoro 试听稿）")
bare = [s for s in screens if not s['layout']]
print(f"只有大标题+旁白的屏：{len(bare)}/{len(screens)}（{100 * len(bare) / max(1, len(screens)):.0f}%，目标 ≤10%）")
for s in bare: print(f"   第 {s['line']} 行  {s['head']}")
lay = collections.Counter(s['layout'] for s in screens if s['layout'])
print("版式分布：", dict(lay))
big = [s for s in screens if s['say'] > 7]
if big: print("一屏超过 7 句旁白：", [(s['line'], s['say']) for s in big])
hard = 0
kana = [(n, t) for n, t in nar if re.search(r'[぀-ヿ]', t)]
if kana: hard = 1; print("❌ 旁白含日文假名（配音会被判成日语）："); [print(f"   {n}: {t}") for n, t in kana]
ex = [(n, t) for n, t in nar if '！' in t or '!' in t]
if ex: print("感叹号：", [n for n, _ in ex])
par = [(n, t) for n, t in nar if re.search(r'[（(].+?[)）]', t)]
if par: print("旁白里有括号（配音会念出来或跳过）："); [print(f"   {n}: {t}") for n, t in par]
latin = collections.Counter(w for _, t in nar for w in re.findall(r'[A-Za-z]{2,}', t))
if latin: print("旁白里的字母词（首次出现要解释，配音可能逐字母念）：", dict(latin))
long = [(n, t) for n, t in nar if len(t) > 26]
if long: print(f"超过 26 字的行（{len(long)}）："); [print(f"   {n}: {len(t)} {t}") for n, t in long]
meta = ['这支片子', '先说结论', '接下来我们', '后面会用', '下面是三个', '记住这一点', '先把结论', '已经解释清楚']
hit = [(n, t) for n, t in nar if any(m in t for m in meta)]
if hit: print("疑似元话语（谈论片子本身，见语言规范 9.2）："); [print(f"   {n}: {t}") for n, t in hit]
weak = ['其实', '可以说', '某种程度上', '不得不说', '众所周知', '毫无疑问', '非常', '十分', '极其', '相当', '值得我们深思']
wc = collections.Counter(w for _, t in nar for w in weak if w in t)
if wc: print("删词表命中（语言规范第二节）：", dict(wc))
est = [(n, t) for n, t in nar if re.search(r'\d', t) and not re.search(r'粗算|推算|假设|大约|约|左右|估', t) and re.search(r'万|%|倍', t)]
print(f"带数字但没有「约/粗算/假设」字样的行：{len(est)}（逐条对证据卡，推算值必须标出）")
sys.exit(hard)
