# -*- coding: utf-8 -*-
"""模板-v6 实拍：在 v6 时间轴里加「喘气点」（实拍满屏、无旁白的几秒）——在指定镜头的开头或结尾插入静音，整条旁白和后面所有镜头、句子同步后移。
只做整帧（1/30 秒）插入，镜头边界仍在帧上；核对各镜头帧数之和 = 总帧数。原文件先备份成 *.加喘气前.*，重跑时从备份开始（不会叠加）。
用法：python3 实拍/加喘气.py 画面v6目录 实拍/喘气.json   （在 画面v6/ 里：python3 实拍/加喘气.py . 实拍/喘气.json）
只加在照片/实拍满屏镜头上（纸面图解镜头停几秒会显得卡住）；章开头 3 秒常用来放章卡。重跑 加喘气 之后，删镜头.py 要再跑一次。
喘气.json：[{"镜头": "S01", "前": 3.0}, {"镜头": "S20", "后": 3.0}, …]（秒，按帧取整）"""
import json, shutil, sys, wave
from pathlib import Path
import numpy as np

FPS, SR = 30, 48000
SPF = SR // FPS
V6 = Path(sys.argv[1]).resolve()
plan = json.loads(Path(sys.argv[2]).read_text())
tlp = V6 / '工程/.work/storyboard-audio.json'
wvp = V6 / '声音/旁白.wav'
for p in (tlp, wvp):
    bak = p.with_name(p.stem + '.加喘气前' + p.suffix)
    if not bak.exists():
        shutil.copy2(p, bak)
    shutil.copy2(bak, p)
tl = json.loads(tlp.read_text())
with wave.open(str(wvp)) as w:
    assert w.getframerate() == SR and w.getnchannels() == 1 and w.getsampwidth() == 2
    a = np.frombuffer(w.readframes(w.getnframes()), '<i2').copy()
ids = [s['stable_id'] for s in tl['scenes']]
ins = []   # (插入点秒, 帧数, 镜头序号, 前/后)
for x in plan:
    i = ids.index(x['镜头'])
    sc = tl['scenes'][i]
    if x.get('前'):
        ins.append((sc['t0'], round(x['前'] * FPS), i, '前'))
    if x.get('后'):
        ins.append((sc['t1'], round(x['后'] * FPS), i, '后'))
ins.sort(key=lambda z: (z[0], z[3] == '前'))
# 从后往前插，前面的时间不受影响
for t, nf, i, side in sorted(ins, key=lambda z: -z[0]):
    d = nf / FPS
    at = round(t * FPS) * SPF
    a = np.concatenate([a[:at], np.zeros(nf * SPF, '<i2'), a[at:]])
    for j, sc in enumerate(tl['scenes']):
        if side == '前':
            # 插在镜头 i 开头：镜头 i 的 t1 后移，t0 不动（多出的几秒属于镜头 i），之后的镜头整体后移
            if j == i:
                sc['t1'] += d
            elif j > i:
                sc['t0'] += d; sc['t1'] += d
        else:
            # 插在镜头 i 结尾：镜头 i 的 t1 后移，之后的镜头后移
            if j == i:
                sc['t1'] += d
            elif j > i:
                sc['t0'] += d; sc['t1'] += d
    for b in tl['beats']:
        if side == '前' and b['scene'] >= i:
            b['t0'] += d; b['t1'] += d
        elif side == '后' and b['scene'] > i:
            b['t0'] += d; b['t1'] += d
    tl['meta']['duration'] += d
for sc in tl['scenes']:
    sc['t0'] = round(sc['t0'], 6); sc['t1'] = round(sc['t1'], 6)
for b in tl['beats']:
    b['t0'] = round(b['t0'], 6); b['t1'] = round(b['t1'], 6)
tl['meta']['duration'] = round(tl['meta']['duration'], 6)
tl['meta']['喘气点'] = plan
tot = sum(round(s['t1'] * FPS) - round(s['t0'] * FPS) for s in tl['scenes'])
assert tot == round(tl['meta']['duration'] * FPS), (tot, tl['meta']['duration'] * FPS)
assert abs(len(a) / SR - tl['meta']['duration']) < 0.05, (len(a) / SR, tl['meta']['duration'])
tlp.write_text(json.dumps(tl, ensure_ascii=False, indent=1))
with wave.open(str(wvp), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.tobytes())
print(f'加了 {len(ins)} 处，共 {sum(z[1] for z in ins) / FPS:.1f} 秒；总长 {tl["meta"]["duration"]:.2f} 秒（{tot} 帧）')
