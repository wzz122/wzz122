# -*- coding: utf-8 -*-
"""模板-v6 实拍：从 v6 时间轴里删掉若干个镜头（连同它们的句子和那段旁白），后面的镜头整体前移。
用法：python3 实拍/删镜头.py S43 [S12 …]（在 画面v6/ 里跑）。原文件先备份成 *.删镜头前.*（重跑从备份开始，不会叠加）。
例：311 期用户要求去掉片尾反问（S43）。注意：重跑 加喘气.py 之后要再跑一次本脚本；改了时间轴 = 相关镜头重渲。"""
import json, shutil, sys, wave
from pathlib import Path
import numpy as np
V6 = Path.cwd() if (Path.cwd() / '项目.json').exists() else Path(__file__).resolve().parent.parent
FPS, SR = 30, 48000
drop = set(sys.argv[1:])
if not drop:
    sys.exit(__doc__)
tlp, wvp = V6 / '工程/.work/storyboard-audio.json', V6 / '声音/旁白.wav'
for p in (tlp, wvp):
    bak = p.with_name(p.stem + '.删镜头前' + p.suffix)
    if not bak.exists():
        shutil.copy2(p, bak)
    shutil.copy2(bak, p)
tl = json.loads(tlp.read_text())
with wave.open(str(wvp)) as w:
    a = np.frombuffer(w.readframes(w.getnframes()), '<i2').copy()
ids = [s['stable_id'] for s in tl['scenes']]
miss = drop - set(ids)
if miss:
    sys.exit(f'时间轴里没有：{sorted(miss)}')
keep_sc, keep_b, pieces, shift = [], [], [], 0.0
newidx = {}
for i, sc in enumerate(tl['scenes']):
    f0, f1 = round(sc['t0'] * FPS), round(sc['t1'] * FPS)
    if sc['stable_id'] in drop:
        shift += (f1 - f0) / FPS
        continue
    pieces.append(a[f0 * (SR // FPS):f1 * (SR // FPS)])
    newidx[i] = len(keep_sc)
    keep_sc.append(dict(sc, t0=round(sc['t0'] - shift, 6), t1=round(sc['t1'] - shift, 6)))
shift = 0.0; dropped_before = {}
acc = 0.0
for i, sc in enumerate(tl['scenes']):
    dropped_before[i] = acc
    if sc['stable_id'] in drop:
        acc += (round(sc['t1'] * FPS) - round(sc['t0'] * FPS)) / FPS
for b in tl['beats']:
    if b['scene'] in newidx:
        d = dropped_before[b['scene']]
        keep_b.append(dict(b, scene=newidx[b['scene']], t0=round(b['t0'] - d, 6), t1=round(b['t1'] - d, 6)))
tl['scenes'], tl['beats'] = keep_sc, keep_b
tl['meta']['duration'] = round(keep_sc[-1]['t1'], 6)
tl['meta'].setdefault('删除镜头', []).extend(sorted(drop))
a = np.concatenate(pieces) if pieces else a[:0]
tot = sum(round(s['t1'] * FPS) - round(s['t0'] * FPS) for s in keep_sc)
assert tot == round(tl['meta']['duration'] * FPS), (tot, tl['meta']['duration'] * FPS)
tlp.write_text(json.dumps(tl, ensure_ascii=False, indent=1))
with wave.open(str(wvp), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.tobytes())
print(f'删掉 {sorted(drop)}；总长 {tl["meta"]["duration"]:.2f} 秒（{tot} 帧），旁白 {len(a) / SR:.2f} 秒。被删镜头的脚本挪到 镜头脚本/_停用/，项目.json 配乐分段的起止镜头要检查')
