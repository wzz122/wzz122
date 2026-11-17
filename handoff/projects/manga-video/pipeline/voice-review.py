#!/usr/bin/env python3
"""配音评审（只用本机）：每一句都查，不只查多音字。
用法：/usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- python3 pipeline/voice-review.py episodes/<期名> [--only s03_l15,s05_l02]
查四件事：
  1. 读音：Whisper 转写和配音文本按不带声调的拼音逐字比，列出读成别的音、多出来的字、漏掉的字。
  2. 停顿：句子中间的停顿落在哪两个字之间。不在标点上的停顿（词中间断开）、标点上过长的停顿都标出来。
  3. 接缝：每句句首、句尾的空白，加上构建时的句间间隔，算出实际听到的间隔；太紧或太松的标出来。
  4. 语速：每句每秒几个字，和同一个角色的中位数差太多的标出来。
输出 episodes/<期名>/voice-review.json 和 voice-review.md。查不出的：声调是否自然、音色、情绪。"""
import json, re, sys, difflib, wave
from pathlib import Path
import numpy as np, mlx_whisper
from pypinyin import pinyin, Style

ep = Path(sys.argv[1]).resolve()
only = set(sys.argv[sys.argv.index('--only') + 1].split(',')) if '--only' in sys.argv else None
HAN = re.compile(r'[一-鿿]')
PUNCT = set('，。？！：；、,.?!:;…—')
DIG = dict(zip('0123456789', '零一二三四五六七八九'))
bare = lambda s: [re.sub(r'\d', '', p[0]).replace('v', 'u') for p in pinyin(s, style=Style.TONE3, neutral_tone_with_five=True)]
GAP_SAME, GAP_SWAP = 0.32, 0.48

def units(text):
    """文本 → [(字或字母串, 后面是否紧跟标点)]。英文单词算一个单位。"""
    out = []
    for m in re.finditer(r'[一-鿿]|[A-Za-z]+|[0-9]|[^\s]', text):
        tok = m.group()
        if HAN.match(tok) or tok.isalnum(): out.append([DIG.get(tok, tok), False])
        elif tok in PUNCT and out: out[-1][1] = True
    return out
key = lambda u: bare(u)[0] if HAN.match(u) else u.lower()

def envelope(f):
    w = wave.open(str(f)); sr = w.getframerate(); x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    hop = sr // 100; n = len(x) // hop
    rms = np.sqrt((x[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(rms); loud = np.percentile(db, 95)
    quiet = db < loud - 38
    idx = np.where(~quiet)[0]
    if not len(idx): return n / 100, 0, 0, []
    first, last = idx[0], idx[-1]; pauses = []; s0 = -1
    for i in range(first, last + 1):
        if quiet[i]:
            if s0 < 0: s0 = i
        elif s0 >= 0:
            if i - s0 >= 12: pauses.append((s0 / 100, i / 100))
            s0 = -1
    return n / 100, first / 100, (n - 1 - last) / 100, pauses

script = json.load(open(ep / 'script.json'))
rows = []
for si, seg in enumerate(script):
    for li, l in enumerate(seg['lines']):
        k = f's{si:02d}_l{li:02d}'
        if only and k not in only: continue
        f = ep / 'lines' / f'{k}.wav'
        dur, lead, trail, pauses = envelope(f)
        U = units(l['tts']); ek = [key(u) for u, _ in U]
        r = mlx_whisper.transcribe(str(f), path_or_hf_repo='mlx-community/whisper-large-v3-turbo', language='zh', initial_prompt='以下是普通话的句子。', word_timestamps=True, condition_on_previous_text=False)
        H = []
        for sg in r['segments']:
            for w in sg.get('words', []):
                us = [u for u, _ in units(w['word'])]
                for j, u in enumerate(us):
                    d = (w['end'] - w['start']) / len(us); H.append((u, w['start'] + j * d, w['start'] + (j + 1) * d))
        hk = [key(u) for u, _, _ in H]
        sm = difflib.SequenceMatcher(None, ek, hk, autojunk=False); amap = {}; diffs = []
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == 'equal':
                for q in range(i2 - i1): amap[j1 + q] = i1 + q
            else:
                a = ''.join(u for u, _ in U[i1:i2]); b = ''.join(u for u, _, _ in H[j1:j2])
                ctx = ''.join(u for u, _ in U[max(0, i1 - 3):i2 + 3])
                NUM = set('零一二三四五六七八九十百千万点分之两')
                if a.lower() == b.lower() or (set(a) <= NUM and set(b) <= NUM) or (a == '儿' and not b): continue   # 数字写法、大小写、儿化不算
                diffs.append({'kind': {'replace': '读成别的音', 'delete': '漏了', 'insert': '多出'}[tag], 'want': a, 'heard': b, 'ctx': ctx, 't': round(H[j1][1], 2) if j1 < len(H) else None})
        odd = []
        for p0, p1 in pauses:
            mid = (p0 + p1) / 2
            before = [j for j, h in enumerate(H) if (h[1] + h[2]) / 2 < mid]
            j = before[-1] if before else None
            i = amap.get(j) if j is not None else None
            if i is None:   # 往前找最近一个对上的字
                jj = j
                while jj is not None and jj >= 0 and jj not in amap: jj -= 1
                i = amap.get(jj) if jj is not None and jj >= 0 else None
            at_punct = any(U[q][1] for q in range(max(0, i - 1), min(len(U), i + 2))) if i is not None else None   # 对齐有一个字的误差，前后一个字有标点都算停在标点上
            where = (''.join(u for u, _ in U[max(0, i - 3):i + 1]) + '｜' + ''.join(u for u, _ in U[i + 1:i + 4])) if i is not None else '?'
            d = round(p1 - p0, 2)
            if at_punct is False and d >= 0.2: odd.append({'t': round(p0, 2), 'len': d, 'where': where, 'why': '停在没有标点的地方'})
            elif at_punct and d >= 0.75: odd.append({'t': round(p0, 2), 'len': d, 'where': where, 'why': '标点处停得太久'})
        n = len(U); speech = dur - lead - trail - sum(b - a for a, b in pauses)
        rows.append({'id': k, 'speaker': l['speaker'], 'tts': l['tts'], 'heard': r['text'].strip(), 'dur': round(dur, 2), 'lead': round(lead, 2), 'trail': round(trail, 2), 'rate': round(n / max(speech, 0.1), 2), 'n': n, 'diffs': diffs, 'pauses': odd, 'ends_punct': l['tts'].strip()[-1] in PUNCT})
        print(k, len(diffs), len(odd), flush=True)

# 接缝和语速
med = {s: float(np.median([r['rate'] for r in rows if r['speaker'] == s and r['n'] >= 6] or [0])) for s in {r['speaker'] for r in rows}}
for a, b in zip(rows, rows[1:]):
    if a['id'][:3] != b['id'][:3]: continue
    b['gap'] = round(a['trail'] + (GAP_SAME if a['speaker'] == b['speaker'] else GAP_SWAP) + b['lead'], 2)
for r in rows:
    r['flags'] = []
    if r['n'] >= 6 and med[r['speaker']] and abs(r['rate'] / med[r['speaker']] - 1) > 0.22: r['flags'].append(f"语速 {r['rate']} 字/秒（这个角色中位数 {med[r['speaker']]:.2f}）")
    if 'gap' in r and r['gap'] < 0.38: r['flags'].append(f"和上一句接得太紧：实际间隔 {r['gap']} 秒")
    if 'gap' in r and r['gap'] > 1.0: r['flags'].append(f"和上一句隔得太久：实际间隔 {r['gap']} 秒")
if not only: json.dump(rows, open(ep / 'voice-review.json', 'w'), ensure_ascii=False, indent=1)
bad = [r for r in rows if r['diffs'] or r['pauses'] or r['flags']]
md = [f'# {ep.name} 配音评审（本机）', '', f'查了 {len(rows)} 句，有标记的 {len(bad)} 句。语速中位数：' + '、'.join(f'{s} {v:.2f} 字/秒' for s, v in med.items()), '']
gaps = [r['gap'] for r in rows if 'gap' in r]
if gaps: md += [f'句间实际间隔：最短 {min(gaps)}、中位 {float(np.median(gaps)):.2f}、最长 {max(gaps)} 秒', '']
for r in bad:
    md += [f"## {r['id']}（{r['speaker']}）", f"- 稿：{r['tts']}", f"- 听：{r['heard']}"]
    md += [f"- 读音 · {d['kind']}：要「{d['want']}」听到「{d['heard']}」（…{d['ctx']}…，{d['t']} 秒）" for d in r['diffs']]
    md += [f"- 停顿 · {p['why']}：{p['where']}，{p['len']} 秒（{p['t']} 秒处）" for p in r['pauses']]
    md += [f'- {x}' for x in r['flags']] + ['']
out = ep / ('voice-review.md' if not only else 'voice-review-recheck.md')
out.write_text('\n'.join(md) + '\n')
print(f'查了 {len(rows)} 句，有标记 {len(bad)} 句 → {out.name}')
