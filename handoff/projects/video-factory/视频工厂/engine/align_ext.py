# -*- coding: utf-8 -*-
"""外部旁白对齐：python3 align_ext.py 录音.wav sents.json out.json [换屏句序号.json] [换屏停顿秒数]
sents.json 是字幕句子列表；输出每句的 {t0, t1}（秒，相对录音开头）。
给了「换屏句序号」时：在每次换屏前补停顿——原本停顿不足 target 秒的，在原停顿中间补齐；
补过停顿的整条录音写到 out.json 的 voice 字段（48k 单声道 wav），时间轴同步后移。"""
import sys, json, os, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from align import align, load_pcm
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
audio, sents_f, out_f = sys.argv[1:4]
scene_f = sys.argv[4] if len(sys.argv) > 4 else None
target = float(sys.argv[5]) if len(sys.argv) > 5 else 0.8
sents = json.load(open(sents_f, encoding='utf-8'))
wav16 = out_f + '.16k.wav'
subprocess.run([FF, '-y', '-v', 'error', '-i', audio, '-ar', '16000', '-ac', '1', wav16], check=True)
w, sr = load_pcm(wav16)
# 外部配音语速快、句内有换气停顿：只在 whisper 边界前 0.6 秒/后 0.25 秒内找静音，免得起点跳到句中逗号后
res, asr_t, head = align(wav16, sents, snap_back=0.6, snap_fwd=0.25)
dur = len(w) / sr
res[-1]['t1'] = max(res[-1]['t1'], round(dur - 0.05, 2))
os.remove(wav16)
out = {'duration': round(dur, 3), 'lines': res}

if scene_f:
    starts = json.load(open(scene_f))
    # 能量曲线（10ms），用来量「开口前已经停了多久」
    h = sr // 100
    e = np.array([np.sqrt(np.mean(w[i:i + h] ** 2)) for i in range(0, len(w) - h, h)])
    thr = np.percentile(e, 20) * 3
    inserts = []                                     # (插入点秒, 补多少秒, 原停顿秒)
    for k in starts:
        t0 = res[k]['t0']
        j = min(len(e) - 1, int((t0 + 0.12) * 100))  # 从开口稍后往回找最近的一段静音
        while j > 0 and e[j] >= thr and j > int((t0 - 0.3) * 100): j -= 1
        end = j
        while j > 0 and e[j] < thr: j -= 1
        have = (end - j) / 100 if e[end] < thr else 0.0
        gap = round(max(0.0, target - have), 2)
        if gap <= 0: continue
        p = (j + end) / 200 if have > 0.05 else max(0.0, t0 - 0.02)   # 有停顿就插在停顿中间，否则插在开口前
        inserts.append((p, gap, have))
    # 按 48k 原录音拼接：原音段 + 静音 + 原音段 …（切点在静音里；没有静音时加 8ms 淡入淡出防爆音）
    SR = 48000
    raw = subprocess.run([FF, '-v', 'error', '-i', audio, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).copy()
    parts, last, f = [], 0, int(0.008 * SR)
    for p, gap, have in inserts:
        c = int(p * SR)
        seg = x[last:c].copy()
        if have <= 0.05 and len(seg) > f: seg[-f:] *= np.linspace(1, 0, f)
        parts += [seg, np.zeros(int(gap * SR), np.float32)]
        last = c
    tailseg = x[last:].copy()
    parts.append(tailseg)
    y = np.concatenate(parts)
    voice = out_f.replace('.json', '') + '.padded.wav'
    subprocess.run([FF, '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'pcm_s16le', voice], input=np.clip(y, -1, 1).astype(np.float32).tobytes(), check=True)
    def shift(t): return round(t + sum(g for p, g, _ in inserts if p <= t + 1e-6), 3)
    for r in res: r['t0'], r['t1'] = shift(r['t0']), shift(r['t1'])
    out.update({'duration': round(len(y) / SR, 3), 'lines': res, 'voice': voice,
                'scene_gaps': [{'at': round(p, 2), 'added': g, 'had': h_} for p, g, h_ in inserts]})
    print(f'换屏停顿：{len(starts)} 处换屏，补了 {len(inserts)} 处，共 +{sum(g for _, g, _ in inserts):.1f}s')

json.dump(out, open(out_f, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'对齐 {len(res)} 句，录音 {out["duration"]:.1f}s，识别耗时 {asr_t:.1f}s')
