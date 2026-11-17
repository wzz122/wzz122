#!/usr/bin/env python3
"""每章自查合成图（AI 片流程第 6 节，2026-10-23）：渲染完一章后，出一张「按时间对齐」的大图给 Claude 读图挑错。
每行 16 秒，从上到下五条轨：
  ① 时间刻度 + 镜头分界（红竖线 + 镜头号）
  ② 每秒一张缩略图（取自 镜头/ 里最新渲好的镜头 mp4）；画面连续 ≥ 4 秒几乎不变时，下面画橙条「静止 N 秒」
  ③ 旁白波形（项目.json「旁白」；没有就跳过）
  ④ 逐句字幕（storyboard-audio.json 的 beats，按 t0–t1 摆）
  ⑤ 音效事件（工程/.work/sfx_events.json，三角 + 名字）
只用 ffmpeg + numpy + Pillow，不跑模型、不联网。

用法（在 画面v6/ 里，或把目录当第一个参数）：
  python3 质检/章节自查图.py                     全部章，每章一张
  python3 质检/章节自查图.py --章 2               只出第 2 章
  python3 质检/章节自查图.py --镜头 S06-S10       只出这几个镜头（不按章）
  python3 质检/章节自查图.py 画面v6目录 --行秒 12  每行 12 秒
产出：画面v6/自测/章节自查/第N章-章名.png，并在终端打印自动发现的问题和读图清单。
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('dir', nargs='?', default='.')
ap.add_argument('--章', dest='chap', type=int, default=None)
ap.add_argument('--镜头', dest='shots', default=None, help='如 S06-S10 或 S06,S08')
ap.add_argument('--行秒', dest='row_secs', type=float, default=16.0)
ap.add_argument('--静止秒', dest='still_secs', type=float, default=4.0)
ap.add_argument('--出', dest='out', default=None, help='输出目录（默认 画面v6/自测/章节自查）')
args = ap.parse_args()

V6 = Path(args.dir).resolve()
if not (V6 / '项目.json').exists() and (V6 / '画面v6' / '项目.json').exists():
    V6 = V6 / '画面v6'
P = json.loads((V6 / '项目.json').read_text(encoding='utf-8'))
SB = json.loads((V6 / P.get('时间轴', '工程/.work/storyboard-audio.json')).read_text(encoding='utf-8'))
MAN_P = V6 / '镜头' / 'manifest.json'
SFX_P = V6 / '工程' / '.work' / 'sfx_events.json'
NAR_P = V6 / P.get('旁白', '声音/旁白.wav')
FF = subprocess.check_output([sys.executable, '-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], text=True).strip()
OUT = Path(args.out).resolve() if args.out else V6 / '自测' / '章节自查'
OUT.mkdir(parents=True, exist_ok=True)

FONT_P = next((f for f in ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/STHeiti Medium.ttc',
                           '/System/Library/Fonts/Hiragino Sans GB.ttc'] if Path(f).exists()), None)
font = lambda n: ImageFont.truetype(FONT_P, n) if FONT_P else ImageFont.load_default()
F11, F13, F15, F22 = font(11), font(13), font(15), font(22)

scenes = SB['scenes']
beats = SB.get('beats', [])
sid_idx = {s['stable_id']: i for i, s in enumerate(scenes)}

# 镜头 mp4：优先 manifest.json，没有就取 镜头/ 里该镜头最新的 mp4
files = {}
if MAN_P.exists():
    for it in json.loads(MAN_P.read_text(encoding='utf-8')):
        if Path(it['file']).exists():
            files[it['id']] = Path(it['file'])
for s in scenes:
    if s['stable_id'] not in files:
        c = sorted((V6 / '镜头').glob(f"{s['stable_id']}-*.mp4"), key=lambda p: p.stat().st_mtime)
        if c:
            files[s['stable_id']] = c[-1]

sfx = json.loads(SFX_P.read_text(encoding='utf-8')) if SFX_P.exists() else []
if isinstance(sfx, dict):
    sfx = sfx.get('events', [])


def pick_groups():
    if args.shots:
        ids = []
        for part in args.shots.split(','):
            m = re.fullmatch(r'(S\w+?)-(S\w+)', part.strip())
            if m:
                a, b = sid_idx[m.group(1)], sid_idx[m.group(2)]
                ids += [scenes[i]['stable_id'] for i in range(a, b + 1)]
            else:
                ids.append(part.strip())
        return [(f'镜头{ids[0]}-{ids[-1]}', ids)]
    groups = {}
    for s in scenes:
        groups.setdefault(s['no'], []).append(s['stable_id'])
    names = P.get('章名', {})
    out = []
    for no, ids in groups.items():
        if args.chap is not None and no != args.chap:
            continue
        nm = names.get(str(no)) or scenes[sid_idx[ids[0]]]['chapter']
        out.append((f'第{no}章-{nm}', ids))
    return out


def probe_for(sid, step, pw=384, ph=202):
    """静止检测用：每 step 秒一张灰度小图（比缩略图大，打一个字也能看出来）。"""
    f = files.get(sid)
    if not f:
        return []
    raw = subprocess.run([FF, '-v', 'error', '-ss', f'{step / 2:.3f}', '-i', str(f), '-vf', f'fps=1/{step},scale={pw}:{ph},format=gray',
                          '-f', 'rawvideo', '-'], capture_output=True).stdout
    return [np.frombuffer(raw[k * pw * ph:(k + 1) * pw * ph], np.uint8).reshape(ph, pw).astype(np.float32) for k in range(len(raw) // (pw * ph))]


def changed(a, b, bx=16, by=8):
    """分块比：任何一块平均差 > 0.6 就算画面变了（局部打字、画线都算）。"""
    h, w = a.shape
    d = np.abs(a - b)[:h // by * by, :w // bx * bx].reshape(by, h // by, bx, w // bx).mean(axis=(1, 3))
    return float(d.max()) > .6


def thumbs_for(sid, step, tw, th):
    """镜头内每 step 秒一张（取每格中点），返回 [(全片秒, Image)]。"""
    s = scenes[sid_idx[sid]]
    f = files.get(sid)
    dur = s['t1'] - s['t0']
    n = max(1, int(np.ceil(dur / step - 1e-6)))
    if not f:
        return [(s['t0'] + (k + .5) * step, None, s['t1']) for k in range(n)]
    raw = subprocess.run([FF, '-v', 'error', '-ss', f'{step / 2:.3f}', '-i', str(f), '-vf', f'fps=1/{step},scale={tw}:{th}',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
    sz = tw * th * 3
    frames = [Image.frombytes('RGB', (tw, th), raw[k * sz:(k + 1) * sz]) for k in range(len(raw) // sz)]
    # 取整造成末尾少一帧时沿用最后一帧（只有完全没渲染的镜头才标红）
    return [(s['t0'] + (k + .5) * step, frames[min(k, len(frames) - 1)] if frames else None, s['t1']) for k in range(n)]


def narration(t0, t1, sr=4000):
    if not NAR_P.exists():
        return None
    raw = subprocess.run([FF, '-v', 'error', '-ss', f'{t0:.3f}', '-t', f'{t1 - t0:.3f}', '-i', str(NAR_P), '-ac', '1', '-ar', str(sr),
                          '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32), sr


ROW_S = args.row_secs
STEP = 1.0
TW, TH = 128, 67
PXS = TW / STEP                     # 每秒多少像素
L = 70                              # 左边留给行号时间
H_TICK, H_THUMB, H_STILL, H_WAVE, H_SUB, H_SFX, GAP = 26, TH, 12, 44, 46, 30, 18
ROW_H = H_TICK + H_THUMB + H_STILL + H_WAVE + H_SUB + H_SFX + GAP
COL = dict(bg=(250, 248, 242), ink=(30, 28, 24), mute=(150, 145, 135), red=(190, 50, 40), ora=(235, 140, 30),
           wave=(60, 100, 160), sub=(232, 226, 210), sfx=(50, 120, 90), grid=(220, 214, 200))

report_all = []
for title, ids in pick_groups():
    T0 = scenes[sid_idx[ids[0]]]['t0']
    T1 = scenes[sid_idx[ids[-1]]]['t1']
    th, arr = [], []
    for sid in ids:
        tt = thumbs_for(sid, STEP, TW, TH)
        pr = probe_for(sid, STEP)
        th += tt
        arr += [(t, pr[min(k, len(pr) - 1)] if pr else None) for k, (t, _, _) in enumerate(tt)]
    # 静止检测：相邻两秒的画面分块比较，一块都没变才算静止（跨镜头的接缝照样比较）
    still, run = [], None
    for k in range(1, len(arr)):
        a, b = arr[k - 1][1], arr[k][1]
        same = a is not None and b is not None and not changed(a, b)
        if same and run is None:
            run = arr[k - 1][0] - STEP / 2
        if (not same or k == len(arr) - 1) and run is not None:
            end = (arr[k][0] if same else arr[k - 1][0]) + STEP / 2
            if end - run >= args.still_secs:
                still.append((run, end))
            run = None
    nar = narration(T0, T1)
    rows = int(np.ceil((T1 - T0) / ROW_S))
    W = int(L + ROW_S * PXS + 20)
    Himg = 60 + rows * ROW_H
    img = Image.new('RGB', (W, Himg), COL['bg'])
    d = ImageDraw.Draw(img)
    d.text((16, 16), f'{P.get("期名", "")} · {title} · {T0:.1f}–{T1:.1f} 秒（{T1 - T0:.1f} 秒，镜头 {ids[0]}–{ids[-1]}）', font=F22, fill=COL['ink'])
    X = lambda t: L + (t - T0 - r * ROW_S) * PXS
    findings = []
    for r in range(rows):
        y0 = 60 + r * ROW_H
        rt0, rt1 = T0 + r * ROW_S, min(T1, T0 + (r + 1) * ROW_S)
        d.text((8, y0 + H_TICK + 20), f'{int(rt0 // 60)}:{rt0 % 60:04.1f}', font=F13, fill=COL['mute'])
        # ① 刻度
        s = int(np.ceil(rt0))
        while s <= rt1:
            x = X(s)
            d.line([(x, y0 + 14), (x, y0 + H_TICK)], fill=COL['grid'] if s % 4 else COL['mute'], width=1)
            if s % 4 == 0:
                d.text((x + 2, y0), f'{int(s // 60)}:{s % 60:02d}', font=F11, fill=COL['mute'])
            s += 1
        # ② 缩略图
        yT = y0 + H_TICK
        xr = int(L + (rt1 - rt0) * PXS)                       # 跨行的那一张两行各画一半
        for t, im, te in th:
            a = t - STEP / 2
            if a + STEP > rt0 + 1e-6 and a < rt1 - 1e-6:
                x = int(round(X(a)))
                c0, c1 = max(0, L - x), min(TW, xr - x, int(round((te - a) * PXS)))   # 镜头最后不足一秒的那张截到镜头结尾
                if c1 <= c0:
                    continue
                if im is not None:
                    img.paste(im.crop((c0, 0, c1, TH)), (x + c0, yT))
                else:
                    d.rectangle([x + c0, yT, x + c1 - 1, yT + TH - 1], fill=(200, 60, 60))
                    d.text((x + c0 + 6, yT + 24), '未渲染', font=F13, fill='white')
        for a, b in still:
            if b > rt0 and a < rt1:
                xa, xb = X(max(a, rt0)), X(min(b, rt1))
                d.rectangle([xa, yT + TH + 2, xb, yT + TH + H_STILL - 2], fill=COL['ora'])
                d.text((xa + 4, yT + TH - 14), f'静止 {b - a:.0f}s', font=F11, fill=COL['ora'])
        # 镜头分界
        for sid in ids:
            sc = scenes[sid_idx[sid]]
            if rt0 <= sc['t0'] < rt1:
                x = X(sc['t0'])
                d.line([(x, y0 + 8), (x, y0 + ROW_H - GAP)], fill=COL['red'], width=2)
                d.text((x + 3, y0 + 10), sid, font=F13, fill=COL['red'])
        # ③ 旁白波形
        yW = yT + TH + H_STILL
        if nar is not None:
            wav, sr = nar
            for px in range(int((rt1 - rt0) * PXS)):
                a = int(((rt0 - T0) + px / PXS) * sr)
                b = int(((rt0 - T0) + (px + 1) / PXS) * sr)
                seg = wav[a:b]
                if len(seg):
                    amp = float(np.abs(seg).max())
                    hh = min(1.0, amp * 1.6) * (H_WAVE / 2 - 2)
                    d.line([(L + px, yW + H_WAVE / 2 - hh), (L + px, yW + H_WAVE / 2 + hh)], fill=COL['wave'])
        else:
            d.text((L, yW + 12), '（没有旁白音频）', font=F13, fill=COL['mute'])
        # ④ 字幕
        yS = yW + H_WAVE
        for k, bt in enumerate(beats):
            if bt['t1'] > rt0 and bt['t0'] < rt1 and T0 - .01 <= bt['t0'] < T1:
                xa, xb = X(max(bt['t0'], rt0)), X(min(bt['t1'], rt1))
                yy = yS + (k % 2) * 22
                d.rectangle([xa, yy + 1, xb, yy + 20], fill=COL['sub'])
                txt, maxw = f"{k + 1} {bt['say']}", xb - xa - 4
                while txt and d.textlength(txt, font=F15) > maxw:
                    txt = txt[:-1]
                d.text((xa + 3, yy + 2), txt, font=F15, fill=COL['ink'])
        # ⑤ 音效
        yF = yS + H_SUB
        for ev in sfx:
            t = ev.get('t', ev.get('at'))
            if rt0 <= t < rt1 and T0 <= t < T1:
                x = X(t)
                d.polygon([(x - 5, yF + 2), (x + 5, yF + 2), (x, yF + 11)], fill=COL['sfx'])
                d.text((x + 6, yF + 1), ev['kind'], font=F11, fill=COL['sfx'])
    for a, b in still:
        findings.append(f'画面静止 {b - a:.1f} 秒：{a:.1f}–{b:.1f}（全片秒）——加小变化或缩短')
    missing = [sid for sid in ids if sid not in files]
    if missing:
        findings.append('还没渲染的镜头：' + ' '.join(missing))
    nm = re.sub(r'[\\/:*?"<>|\s]+', '_', title)
    p = OUT / f'{nm}.png'
    img.save(p)
    report_all.append((p, findings))

print('读图清单（逐项看）：仿真界面/代码字读得清 · 术语大字和旁白念到那个词对齐（±0.3 秒）· 线稿一次只加一个元素 · '
      '一屏只有一个强调色 · 没有压到字幕带和出处条 · 录屏角标有工具名/版本/日期 · 没有超过 4 秒的空档')
for p, fs in report_all:
    print(f'\n{p}')
    for f in fs or ['自动检查：没发现问题']:
        print('  - ' + f)
