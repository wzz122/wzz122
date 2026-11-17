#!/usr/bin/env python3
"""多音字检查：配音前把稿子里的多音字找出来、定读音，生成给 MiniMax 的读音指定（pronunciation_dict.tone）。
用法：python3 pipeline/pron.py episodes/<期名>
  读 script.json（先跑 tts-episode.mjs --dry），写 episodes/<期名>/pron.json（每句要带的读音指定）和 pron-report.md（逐词清单，给人看）。
规则：
  - config/pron-overrides.json 的 words：词 → 拼音（带声调数字，空格分开），所有期通用，最长匹配优先。这里的词一律指定读音。
  - config/pron-overrides.json 的 risky：容易读错的多音字。稿子里出现这些字、又没被 words 盖住时，在报告里列成「待确认」，
    这些词不指定读音（程序猜的会错）；人看过报告，容易读错的补进 words 再跑一遍。
  - 一、不 的变调，的、了、着 这类轻声不指定，交给配音模型自己处理。
退出码 2 = 还有「待确认」没处理（加 --ok 表示已经看过，照常生成）。"""
import json, re, sys
from pathlib import Path
import jieba
from pypinyin import pinyin, Style, load_phrases_dict

ROOT = Path(__file__).resolve().parent.parent
ep = Path(sys.argv[1]).resolve()
cfg = json.load(open(ROOT / 'config/pron-overrides.json'))
WORDS = {k: v.split() for k, v in cfg['words'].items()}
RISKY = set(cfg['risky'])
for w, py in WORDS.items():
    assert len(w) == len(py), f'{w} 的拼音个数不对：{py}'
    jieba.add_word(w, freq=10 ** 7)
keys = sorted(WORDS, key=len, reverse=True)
num = lambda s: [p[0] for p in pinyin(s, style=Style.TONE3, neutral_tone_with_five=True)]
fmt = lambda py: ''.join(f'({p})' for p in py)

def split(text):
    """先按 words 里的词切（最长优先），剩下的交给 jieba。"""
    out, i = [], 0
    while i < len(text):
        hit = next((k for k in keys if text.startswith(k, i)), None)
        if hit: out.append((hit, True)); i += len(hit); continue
        j = i + 1
        while j < len(text) and not any(text.startswith(k, j) for k in keys): j += 1
        out += [(w, False) for w in jieba.cut(text[i:j])]
        i = j
    return out

script = json.load(open(ep / 'script.json'))
per_line, forced, todo = {}, {}, {}
for si, seg in enumerate(script):
    for li, l in enumerate(seg['lines']):
        ent = []
        for w, fixed in split(l['tts']):
            if not re.search(r'[一-鿿]', w): continue
            if fixed:
                ent.append(f'{w}/{fmt(WORDS[w])}'); forced.setdefault(w, (WORDS[w], []))[1].append(f's{si:02d}_l{li:02d}')
            elif RISKY & set(w):
                # 单字词带上前后文容易错，读音按整句的判断取
                py = num(w)   # 只进报告，不指定：程序猜的读音会错，还会打乱变调
                todo.setdefault(w, (py, []))[1].append(f's{si:02d}_l{li:02d}')
        if ent: per_line[f's{si:02d}_l{li:02d}'] = sorted(set(ent))
json.dump(per_line, open(ep / 'pron.json', 'w'), ensure_ascii=False, indent=1)
rep = [f'# {ep.name} 多音字清单', '', f'已指定读音的词 {len(forced)} 个；待确认 {len(todo)} 个。', '', '## 待确认（含容易读错的字，读音是程序猜的，错的补进 config/pron-overrides.json 的 words）', '', '| 词 | 程序给的读音 | 出现在 |', '|---|---|---|']
rep += [f'| {w} | {" ".join(py)} | {", ".join(ids[:4])}{" …" if len(ids) > 4 else ""} |' for w, (py, ids) in sorted(todo.items())]
rep += ['', '## 已指定', '', '| 词 | 读音 | 出现在 |', '|---|---|---|']
rep += [f'| {w} | {" ".join(py)} | {", ".join(ids[:4])}{" …" if len(ids) > 4 else ""} |' for w, (py, ids) in sorted(forced.items())]
open(ep / 'pron-report.md', 'w').write('\n'.join(rep) + '\n')
print(f'已指定 {len(forced)} 个词，待确认 {len(todo)} 个 → {ep.name}/pron-report.md')
sys.exit(2 if todo and '--ok' not in sys.argv else 0)
