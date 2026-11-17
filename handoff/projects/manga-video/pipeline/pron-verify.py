#!/usr/bin/env python3
"""读音核对：配音文件逐句检查「读成了哪个音、哪个声调」。
用法：python3 pipeline/pron-verify.py episodes/<期名> [--chars 缝铺] [--all]   （外面套 mac-heavy-job，一次只跑一个）
做法：
  1. Whisper 带时间戳转写，把听到的字和稿子的字按不带声调的拼音对齐 → 音节读错（báo / bó、děi / dé）在这里露出来。
  2. 对要查的字（config/pron-overrides.json 的 risky 字 + words 里的词），取那个字时间段里的音高曲线，判断走势
     （升 = 第二声，降 = 第四声，高平 = 第一声，低 = 第三声），和稿子要求的声调比 → 声调读错（féng / fèng）在这里露出来。
输出 episodes/<期名>/pron-verify.json 和 pron-verify.md。音高判断会有误报（轻读、连读、句尾），标出来的要再看音高数值或重配。"""
import json, re, sys, difflib
from pathlib import Path
import numpy as np, parselmouth, mlx_whisper
from pypinyin import pinyin, Style

ROOT = Path(__file__).resolve().parent.parent
ep = Path(sys.argv[1]).resolve()
cfg = json.load(open(ROOT / 'config/pron-overrides.json'))
only = set(sys.argv[sys.argv.index('--chars') + 1]) if '--chars' in sys.argv else None
RISKY = only or set(cfg['risky'])
WORDS = {k: v.split() for k, v in cfg['words'].items()}
keys = sorted(WORDS, key=len, reverse=True)
HAN = re.compile(r'[一-鿿]')
py3 = lambda s: [p[0] for p in pinyin(s, style=Style.TONE3, neutral_tone_with_five=True)]
bare = lambda p: re.sub(r'\d', '', p).replace('v', 'u')

def expected(text):
    """稿子每个汉字的拼音：words 里的词用指定读音，其余用 pypinyin 整句判断。"""
    chars = [c for c in text if HAN.match(c)]
    s = ''.join(chars); py = py3(s); forced = [False] * len(s)
    i = 0
    while i < len(s):
        k = next((k for k in keys if s.startswith(k, i)), None)
        if k:
            for j, p in enumerate(WORDS[k]): py[i + j] = p; forced[i + j] = True
            i += len(k)
        else: i += 1
    return chars, py, forced

def contour(snd_pitch, t0, t1):
    t, f = snd_pitch
    m = (t >= t0) & (t <= t1) & (f > 0)
    return f[m]

script = json.load(open(ep / 'script.json'))
out = []
for si, seg in enumerate(script):
    for li, l in enumerate(seg['lines']):
        chars, py, forced = expected(l['tts'])
        want = [i for i, c in enumerate(chars) if c in RISKY or forced[i]]
        if not want and '--all' not in sys.argv: continue
        f = ep / 'lines' / f's{si:02d}_l{li:02d}.wav'
        r = mlx_whisper.transcribe(str(f), path_or_hf_repo='mlx-community/whisper-large-v3-turbo', language='zh', initial_prompt='以下是普通话的句子。', word_timestamps=True)
        heard = []
        for sg in r['segments']:
            for w in sg.get('words', []):
                cs = [c for c in w['word'] if HAN.match(c)]
                for k, c in enumerate(cs):
                    d = (w['end'] - w['start']) / len(cs)
                    heard.append((c, w['start'] + k * d, w['start'] + (k + 1) * d))
        hp = [bare(p) for p in py3(''.join(c for c, _, _ in heard))] if heard else []
        ep_ = [bare(p) for p in py]
        sm = difflib.SequenceMatcher(None, ep_, hp, autojunk=False)
        amap = {}
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == 'equal':
                for k in range(i2 - i1): amap[i1 + k] = j1 + k
            elif tag == 'replace' and i2 - i1 == j2 - j1:
                for k in range(i2 - i1): amap[i1 + k] = -(j1 + k) - 1   # 对上了位置，但音节不同
        snd = parselmouth.Sound(str(f)); p = snd.to_pitch(time_step=0.01, pitch_floor=70 if l['speaker'] == 'gyudon' else 120, pitch_ceiling=450 if l['speaker'] == 'gyudon' else 650)
        tf = (p.xs(), p.selected_array['frequency'])
        voiced = tf[1][tf[1] > 0]; med = np.median(voiced) if len(voiced) else 200
        st = lambda hz: 12 * np.log2(hz / med)
        for i in want:
            rec = {'id': f.stem, 'char': chars[i], 'ctx': ''.join(chars[max(0, i - 3):i + 3]), 'want': py[i], 'forced': forced[i]}
            j = amap.get(i)
            if j is None: rec['flag'] = '没对上（转写里找不到这个字的位置）'; out.append(rec); continue
            if j < 0:
                j = -j - 1; rec['heard'] = heard[j][0]; rec['heard_py'] = hp[j]
                if heard[j][0] != chars[i]: rec['flag'] = f'音节不同：听成「{heard[j][0]}」({hp[j]})'   # 转写出的是同一个字时，读音差别只是程序对多音字的猜测，不算
            c, t0, t1 = heard[j]; rec['t'] = round(t0, 2)
            hz = contour(tf, t0 - 0.02, t1 + 0.02)
            if len(hz) >= 4:
                s = st(hz); n = len(s); a, b = np.mean(s[:max(2, n // 3)]), np.mean(s[-max(2, n // 3):])
                rec['st'] = [round(float(x), 1) for x in s[::max(1, n // 6)]][:7]; rec['slope'] = round(float(b - a), 1); rec['level'] = round(float(np.mean(s)), 1)
                tone = int(py[i][-1]) if py[i][-1].isdigit() else 5
                sl = rec['slope']
                drop = float(np.max(s[:max(2, 2 * n // 3)]) - np.mean(s[-max(2, n // 4):]))   # 从前段最高点到尾巴掉了多少
                rise = float(np.mean(s[-max(2, n // 4):]) - np.min(s[:max(2, 2 * n // 3)]))
                rec['drop'] = round(drop, 1); rec['rise'] = round(rise, 1)
                add = lambda m: rec.__setitem__('flag', (rec.get('flag', '') + ' ' + m).strip())
                if tone == 4 and drop < 2.5: add('声调：要第四声（降），没听到明显下降')
                if tone == 2 and (rise < 1.0 or drop > 5): add('声调：要第二声（升），没听到上升')
                if tone == 1 and (drop > 5 or rec['level'] < -3): add('声调：要第一声（高平），听起来偏低或起伏大')
                if tone == 3 and rec['level'] > 4: add('声调：要第三声（低），听起来偏高')
            else: rec['note'] = '音高太少（轻读或清音），声调没法判断'
            out.append(rec)
        print(f.stem, len(want), flush=True)
json.dump(out, open(ep / 'pron-verify.json', 'w'), ensure_ascii=False, indent=1)
bad = [r for r in out if r.get('flag')]
md = [f'# {ep.name} 读音核对', '', f'查了 {len(out)} 个字，标出 {len(bad)} 个。', '', '| 句 | 字 | 上下文 | 要读 | 问题 | 音高走势（半音） |', '|---|---|---|---|---|---|']
md += [f"| {r['id']} | {r['char']} | {r['ctx']} | {r['want']} | {r['flag'].strip()} | {r.get('st', '')} |" for r in bad]
open(ep / 'pron-verify.md', 'w').write('\n'.join(md) + '\n')
print(f'查了 {len(out)} 个字，标出 {len(bad)} 个 → pron-verify.md')
