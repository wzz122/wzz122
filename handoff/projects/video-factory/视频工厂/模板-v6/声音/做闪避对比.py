# -*- coding: utf-8 -*-
"""60 秒闪避对比样：同一段旁白（本期旁白，只读）+ 同一段配乐，只改人声出现时音乐压低多少：7 dB / 3 dB / 不压。
只用 numpy + ffmpeg（解码），不跑模型。

做法（三个版本完全相同，只有压低量不同）：
  1. 旁白：项目.json「旁白」截取 [起点, 起点+60 s]，先用前瞻限幅把峰值压到 −6.5 dBFS（USJ D-声音审视 1.5 的建议）。
  2. 配乐：从配乐文件的 [曲目偏移] 开始取 60 s，40 Hz 高通，整体对齐到基础电平（默认 −36 LUFS，可用第 4 个参数改），
     开头 1.5 s 淡入，结尾 3 s 淡出。
  3. 闪避：旁白 20 ms 窗 RMS 高于 −45 dBFS 视为「在说话」，保持 250 ms；压低包络起 80 ms、放 600 ms。
  4. 混音后线性增益到 −14 LUFS，再过一个 −1.5 dBFS 的前瞻限幅（防真峰过线）。
输出：闪避对比/闪避-压7dB.wav、闪避-压3dB.wav、闪避-不压.wav 和 闪避对比/说明.md（附实测：说话时音乐比人声低多少）。
用法：python3 做闪避对比.py 配乐文件 [旁白起点秒=0] [曲目偏移秒=0] [配乐基础 LUFS=-36]
"""
import os, subprocess, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, lfilter

SR = 48000
import imageio_ffmpeg, json
FF = imageio_ffmpeg.get_ffmpeg_exe()
here = os.path.dirname(os.path.abspath(__file__))
_pj = os.path.join(os.path.dirname(here), '项目.json')                 # 画面v6/项目.json
_P = json.load(open(_pj, encoding='utf-8')) if os.path.exists(_pj) else {}
NARR = os.path.expanduser(_P.get('旁白', '声音/旁白.wav'))              # 只读
if not os.path.isabs(NARR):
    NARR = os.path.join(os.path.dirname(here), NARR)
music_path = sys.argv[1]
n_t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
m_t0 = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
BASE = float(sys.argv[4]) if len(sys.argv) > 4 else -36.0   # 配乐基础电平：让「压 3 dB」版说话时约低 20 dB（技能 05：从低约 20 dB 起试、默认轻压 3–4 dB）
DUR = 60.0
out = os.path.join(here, '闪避对比'); os.makedirs(out, exist_ok=True)


def load(path, t0, dur, ch):
    cmd = [FF, '-v', 'error', '-ss', str(t0), '-t', str(dur), '-i', path, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-']
    a = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32).astype(np.float64)
    a = a.reshape(-1, ch)
    n = int(SR * dur)
    if len(a) < n: a = np.vstack([a, np.zeros((n - len(a), ch))])
    return a[:n]


def kweight(x):
    # ITU-R BS.1770 K 加权（48 kHz 系数）
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]; a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]; a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x):
    """积分响度（带 −70 绝对门限和 −10 相对门限），x 形状 (n, ch)。"""
    y = kweight(x); blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([np.sum(np.mean(y[i:i + blk] ** 2, axis=0)) for i in range(0, len(y) - blk + 1, hop)])
    l = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[l > -70]
    if not len(g): return -99.0
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g2 = ms[(l > -70) & (l > rel)]
    return -0.691 + 10 * np.log10(np.mean(g2))


def limiter(x, ceil_db, look=0.005, rel=0.08):
    """前瞻峰值限幅：所有声道共用增益。"""
    ceil = 10 ** (ceil_db / 20)
    pk = np.max(np.abs(x), axis=1)
    g = np.minimum(1.0, ceil / (pk + 1e-12))
    L = int(look * SR)
    # 前瞻：取未来 L 个样本里的最小增益
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(g, size=2 * L + 1, origin=0)
    # 释放平滑（只让增益慢慢回升）
    a = np.exp(-1 / (rel * SR)); sm = np.empty_like(g); cur = 1.0
    for i, v in enumerate(g):
        cur = v if v < cur else a * cur + (1 - a) * v
        sm[i] = cur
    return x * sm[:, None]


narr = load(NARR, n_t0, DUR, 1)[:, 0]
narr = limiter(narr[:, None], -6.5)[:, 0]
mus = load(music_path, m_t0, DUR, 2)
mus = sosfilt(butter(2, 40, btype='high', fs=SR, output='sos'), mus, axis=0)
mus *= 10 ** ((BASE - lufs(mus)) / 20)
t = np.arange(len(mus)) / SR
fade = np.minimum(1, t / 1.5) * np.minimum(1, (DUR - t) / 3.0)
mus *= fade[:, None]

# 说话检测 → 闪避包络（0=不压，1=压满）
win = int(0.02 * SR)
rms = np.sqrt(np.convolve(narr ** 2, np.ones(win) / win, mode='same'))
talk = (20 * np.log10(rms + 1e-9) > -45).astype(float)
hold = int(0.25 * SR)
from scipy.ndimage import maximum_filter1d
talk = maximum_filter1d(talk, size=hold, origin=-(hold // 2) + 0)   # 说完再保持 250 ms
aa, ar = np.exp(-1 / (0.08 * SR)), np.exp(-1 / (0.6 * SR))
env = np.empty_like(talk); cur = 0.0
for i, v in enumerate(talk):
    cur = aa * cur + (1 - aa) * v if v > cur else ar * cur + (1 - ar) * v
    env[i] = cur

narr_st = np.repeat(narr[:, None], 2, axis=1)
speech_mask = talk > 0.5
lines = []
for duck, name in [(7, '闪避-压7dB.wav'), (3, '闪避-压3dB.wav'), (0, '闪避-不压.wav')]:
    g = 10 ** (-duck * env / 20)
    m = mus * g[:, None]
    mix = narr_st + m
    gain = 10 ** ((-14 - lufs(mix)) / 20)
    mix = limiter(mix * gain, -1.5)
    with wave.open(os.path.join(out, name), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(mix, -1, 1) * 32767).astype('<i2').tobytes())
    # 实测：说话片段里，人声和音乐各自的响度（同样 K 加权）
    v_l = lufs(narr_st[speech_mask]); m_l = lufs(m[speech_mask])
    gap_l = lufs(m[~speech_mask]) if (~speech_mask).sum() > SR else float('nan')
    lines.append(f'| {name} | {duck} dB | {v_l - m_l:.1f} dB | {lufs(mix):.1f} LUFS | {20*np.log10(np.max(np.abs(mix))):.1f} dBFS |')
    print(name, 'speech gap', round(v_l - m_l, 1), 'music in pauses LUFS', round(gap_l, 1))

doc = f"""# 60 秒闪避对比样（{_P.get('期名', '本期')}）

- 旁白：`{NARR}` 的 {n_t0:.1f}–{n_t0 + DUR:.1f} 秒（只读，没改）。峰值先限到 −6.5 dBFS。
- 配乐：`{os.path.basename(music_path)}` 从 {m_t0:.1f} 秒起取 60 秒；40 Hz 高通；基础电平 {BASE:g} LUFS（三版相同，只差闪避量）；开头 1.5 s 淡入、结尾 3 s 淡出。
- 闪避：旁白 20 ms RMS > −45 dBFS 算「在说话」，保持 250 ms；起 80 ms、放 600 ms。三个版本只有压低量不同。
- 成品：混音后线性增益到 −14 LUFS，再 −1.5 dBFS 前瞻限幅。48 kHz 立体声 WAV。
- 生成：`python3 ../做闪避对比.py {os.path.basename(music_path)} {n_t0:g} {m_t0:g} {BASE:g}`

| 文件 | 说话时压低 | 说话时音乐比人声低（实测） | 整体响度 | 峰值 |
|---|---|---|---|---|
""" + '\n'.join(lines) + """

参考：技能要求说话时音乐比人声低约 20 dB；D-声音审视建议 17–21 dB。v5 的句间停顿只有 0.25 秒左右，所以压得越多，停顿处音乐「一抽一抽」的感觉越明显；不压则音乐全程稳定但更容易和字打架。基础电平按技能 05「从低约 20 dB 起试、默认轻压 3–4 dB」取，所以「压 3 dB」版就是默认方案。请人耳比较后定一个值，写进 `项目.json` 的 `配乐.闪避dB`（不压填 0）。
"""
open(os.path.join(out, '说明.md'), 'w', encoding='utf-8').write(doc)
print(doc)
