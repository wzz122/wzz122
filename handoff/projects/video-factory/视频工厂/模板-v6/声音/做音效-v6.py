# -*- coding: utf-8 -*-
"""v6 音效库（2026-10-07 从 T009 大阪USJ v6 固化，每期通用）：全部程序合成（numpy + scipy 滤波），不用任何采样，没有版权问题。
输出 48 kHz、16 bit、单声道 WAV（总装时按需摆声像）。峰值都指「混音前」，旁白峰值约 0 dBFS。
固定随机种子，重跑结果完全一样。

用法：python3 做音效-v6.py [输出目录]      默认输出到本文件旁边的 音效/
同目录还会写一份 音效清单.json（文件名、时长、峰值、RMS、用途），说明见 音效/说明.md。

清单（变体轮流用，避免机关枪感）：
  pop-1/2/3.wav        弹字。正弦 1500→700 Hz 35 ms 内下滑 + 1 ms 咔嗒；三个变体音高 −150/0/+150 音分。峰值 −24
  tick-1/2/3.wav       数字滚动单下，极轻。3.0/3.2/3.5 kHz 短促衰减 + 高通噪声。峰值 −30
  tick-滚动-1.2s.wav   数字滚动整串：间隔 40→120 ms 渐慢，最后落一下「叮」。峰值 −28
  叮-落定.wav          数字落定：1760/2640/3520 Hz 三分音，0.25 s 衰减。峰值 −24
  快门.wav             记者会/截图定格：两下机械咔嚓（2.2 kHz、1.7 kHz 谐振）+ 120 Hz 短咚。峰值 −18
  快门-连拍.wav        三连拍（「向媒体举报」一类场景）。峰值 −19
  纸张翻动-1/2.wav     新闻/文件截图入场：4–5 个颗粒噪声爆发、间隔渐密 + 结尾纸面轻拍。峰值 −20
  纸张滑入.wav         图版卡、证据卡滑入：1–6 kHz 摩擦噪声 0.4 s + 落定轻拍。峰值 −22
  hit-轻.wav           集中线/拟声字/轻冲击：60→34 Hz 下滑 + 140 Hz 冲击层 + 低通噪声爆破 + 2 ms 咔嗒 + 短混响尾。峰值 −18
  hit-重.wav           关键数字/世界第一：同上但更长更厚，混响 1.2 s。峰值 −13
  riser-1.2s.wav       过门铺垫：带通噪声 400→7000 Hz 上扫 + 三根失谐锯齿 110→440 Hz，颤音 4→16 Hz，结尾 10 ms 硬切。峰值 −18
  riser-1.5s.wav       同上，1.5 秒。峰值 −18
放置提示：riser 的结尾要对准冲击点（放置时间 = 冲击点 − riser 时长）；hit 的起点就是冲击点。

2026-10-07 重档修复（质检：hit-重 92% 能量在 20–60 Hz、盖章 96% 在 120 Hz 以下，手机外放听不到；见文末一节）：
  hit-重 / hit-轻 / 盖章-两下：原声当低频层（38 Hz 高通再降 4.5 dB）+ 中高频冲击层（主体 150 Hz–3 kHz，2–5 kHz 咔/啪），
    按 K 加权瞬时响度对齐（hit-重、盖章与原文件一样响；hit-轻 提到中档上限附近）。300 Hz 高通后只降 1–3 dB（原来降 12–15 dB）。
  新增 吼-嗷呜.wav（S27「嗷呜！」卡通吼声，中频）、轻拍-三下.wav（S06「哒哒哒——」三下快速轻拍）。
  新层用单独的随机源，其他音效重跑后逐字节不变。
"""
import json, os, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
here = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '音效')
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(20261007)
manifest = []


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def bp(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], btype='band', fs=SR, output='sos')
    return sosfilt(sos, x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype='high', fs=SR, output='sos'), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype='low', fs=SR, output='sos'), x)


def reso(x, f, q=12):
    """窄带谐振（模拟机械件、木头的共鸣）。"""
    bw = f / q
    return bp(x, max(20, f - bw / 2), min(SR / 2 - 100, f + bw / 2), order=2)


def fade(x, a=0.002, r=0.01):
    n = len(x); y = x.copy()
    na, nr = int(SR * a), int(SR * r)
    if na: y[:na] *= np.linspace(0, 1, na)
    if nr: y[-nr:] *= np.linspace(1, 0, nr)
    return y


def chirp(f0, f1, dur, tau=None, curve='exp'):
    """频率从 f0 滑到 f1；tau 给定时按指数趋近，否则线性/指数插值整段。"""
    t = t_axis(dur)
    if tau:
        f = f1 + (f0 - f1) * np.exp(-t / tau)
    elif curve == 'exp':
        f = f0 * (f1 / f0) ** (t / dur)
    else:
        f = f0 + (f1 - f0) * t / dur
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def reverb_tail(x, rt=0.8, wet_db=-18, lpf=5000):
    """指数衰减噪声当冲激响应，卷积出房间尾巴。"""
    ir_t = t_axis(rt * 1.2)
    ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t / (rt / 6.9))
    ir = lp(ir, lpf)
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    wet = fftconvolve(x, ir)[:len(x) + len(ir_t)]
    dry = np.concatenate([x, np.zeros(len(wet) - len(x))])
    return dry + wet * 10 ** (wet_db / 20) * (np.max(np.abs(x)) / (np.max(np.abs(wet)) + 1e-9)) * 4


def save(name, x, peak_db, use):
    x = np.asarray(x, dtype=np.float64)
    x = x - np.mean(x)
    if peak_db is None:                                   # 2026-10-07：按响度对齐好的数组，保持绝对电平，只记实际峰值
        peak_db = round(float(20 * np.log10(np.max(np.abs(x)) + 1e-12)), 1)
    else:
        x = x / (np.max(np.abs(x)) + 1e-12) * 10 ** (peak_db / 20)
    # 去掉尾部低于峰值 −60 dB 的空尾巴，再补 20 ms 淡出
    above = np.nonzero(np.abs(x) > np.max(np.abs(x)) * 1e-3)[0]
    if len(above):
        end = min(len(x), above[-1] + int(0.02 * SR)); x = x[:end]
        nf = min(len(x) // 4, int(0.02 * SR)); x[-nf:] *= np.linspace(1, 0, nf)
    with wave.open(os.path.join(out, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
    rms = 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
    manifest.append({'file': name, 'dur_s': round(len(x) / SR, 3), 'peak_dbfs': peak_db,
                     'rms_db': round(rms, 1), 'use': use})


# ---------- pop 弹字 ----------
def pop(cents=0):
    k = 2 ** (cents / 1200)
    dur = 0.09; t = t_axis(dur)
    body = chirp(1500 * k, 700 * k, dur, tau=0.012)
    env = np.minimum(1, t / 0.002) * np.exp(-t / 0.030)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.0006) * 0.5
    sub = np.sin(2 * np.pi * 220 * k * t) * np.exp(-t / 0.015) * 0.25   # 一点「肉」，外放不发尖
    return fade(body * env + click + sub, 0.001, 0.008)


for i, c in enumerate([-150, 0, 150], 1):
    save(f'pop-{i}.wav', pop(c), -24, '弹字出现时刻 +0.05 s；三个变体轮流用；声像跟弹字位置 ±30%')


# ---------- tick 数字滚动 ----------
def tick(f=3200, gain=1.0):
    dur = 0.012; t = t_axis(dur)
    tone = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.002)
    nz = hp(rng.standard_normal(len(t)), 4000) * np.exp(-t / 0.0008) * 0.35
    return fade((tone + nz) * gain, 0.0003, 0.002)


for i, f in enumerate([3000, 3200, 3500], 1):
    save(f'tick-{i}.wav', tick(f), -30, '数字/柱子长出来的单下嘀嗒，极轻；连发时自己排间隔或用 tick-滚动')


def ding(dur=0.4):
    t = t_axis(dur)
    x = (np.sin(2 * np.pi * 1760 * t) * np.exp(-t / 0.25) +
         0.5 * np.sin(2 * np.pi * 2640 * t) * np.exp(-t / 0.16) +
         0.3 * np.sin(2 * np.pi * 3520 * t) * np.exp(-t / 0.10))
    return fade(x, 0.001, 0.03)


def tick_roll(total=1.2):
    n = int(SR * total); y = np.zeros(n)
    pos, gap, i = 0.0, 0.040, 0
    freqs = [3000, 3200, 3500]
    ding_at = total - 0.40
    while pos < ding_at - 0.05:
        s = int(pos * SR); tk = tick(freqs[i % 3], 0.85 + 0.15 * rng.random())
        y[s:s + len(tk)] += tk[:max(0, n - s)]
        i += 1; pos += gap
        gap = min(0.120, gap * 1.13)                       # 越来越慢
    d = ding(); s = int(ding_at * SR)
    y[s:s + len(d)] += d[:n - s] * 1.6
    return fade(y, 0.001, 0.02)


save('tick-滚动-1.2s.wav', tick_roll(), -28, '数字滚动整串（40→120 ms 渐慢）+ 落定叮；结尾的叮对准数字落定')
save('叮-落定.wav', ding(), -24, '数字落定、柱子到顶的一声叮；可单独用')


# ---------- 快门 ----------
def shutter_one():
    dur = 0.16; t = t_axis(dur); n = len(t)
    def clack(f, at):
        x = np.zeros(n); s = int(at * SR)
        burst = hp(rng.standard_normal(int(0.003 * SR)), 3000)
        imp = np.zeros(n); imp[s:s + len(burst)] = burst
        x = imp * 0.3 + reso(imp, f, q=10) * 8
        e = np.zeros(n); e[s:] = np.exp(-(t[s:] - at) / 0.008)
        return x * np.maximum(e, (t >= at) * (t < at + 0.003))
    x = clack(2200, 0.002) + clack(1700, 0.047) * 0.8
    thump = np.sin(2 * np.pi * 120 * t) * np.exp(-t / 0.015) * 0.35
    return fade(x + thump, 0.0005, 0.01)


save('快门.wav', shutter_one(), -18, '记者会截图、照片定格、截图入场（相机感）')
burst = np.zeros(int(SR * 0.62))
for k, at in enumerate([0.0, 0.2, 0.4]):
    s1 = shutter_one() * (1 - 0.1 * k); s = int(at * SR)
    burst[s:s + len(s1)] += s1
save('快门-连拍.wav', burst, -19, '三连拍：曝光、向媒体举报一类')


# ---------- 纸张翻动 / 滑入 ----------
def page_flip(seed_shift=0, n_grains=5):
    r = np.random.default_rng(777 + seed_shift)
    dur = 0.38; n = int(SR * dur); y = np.zeros(n)
    pos = 0.0; gap = 0.085
    for g in range(n_grains):
        L = r.uniform(0.015, 0.040); lo = r.uniform(1500, 3500); hi = lo * r.uniform(1.6, 2.2)
        gt = t_axis(L)
        grain = bp(r.standard_normal(len(gt)), lo, min(hi, 9000)) * np.sin(np.pi * gt / L) ** 2
        grain *= 0.6 + 0.4 * g / n_grains
        s = int(pos * SR); y[s:s + len(grain)] += grain[:max(0, n - s)]
        pos += gap; gap *= 0.72
    # 结尾纸面拍击
    st = t_axis(0.06)
    slap = bp(r.standard_normal(len(st)), 200, 600) * np.exp(-st / 0.012) * 1.6
    s = int(min(pos + 0.01, dur - 0.065) * SR); y[s:s + len(slap)] += slap
    return fade(y, 0.002, 0.02)


save('纸张翻动-1.wav', page_flip(0), -20, '新闻截图、文件原件入场；声像轻微从左到右')
save('纸张翻动-2.wav', page_flip(5, 4), -20, '同上的变体，与 -1 轮流')


def paper_slide(dur=0.48):
    t = t_axis(dur); n = len(t)
    nz = bp(rng.standard_normal(n), 1000, 6000)
    am = 1 + 0.45 * np.sin(2 * np.pi * (35 + 25 * t / dur) * t + rng.random() * 6)   # 摩擦纹理
    env = np.sin(np.pi * np.minimum(1, t / (dur - 0.08))) ** 1.5 * (t < dur - 0.08)
    body = nz * am * env
    tap_t = t_axis(0.05)
    tap = (bp(rng.standard_normal(len(tap_t)), 400, 900) * np.exp(-tap_t / 0.010) * 1.4 +
           np.sin(2 * np.pi * 150 * tap_t) * np.exp(-tap_t / 0.012) * 0.9)
    s = int((dur - 0.075) * SR); body[s:s + len(tap)] += tap[:n - s]
    return fade(body, 0.004, 0.015)


save('纸张滑入.wav', paper_slide(), -22, '图版卡、证据卡、格子纸卡片滑入并落定（落定点在 0.40 s 左右）')


# ---------- hit 冲击 ----------
def hit(heavy=False):
    dur = 1.6 if heavy else 1.1; t = t_axis(dur); n = len(t)
    sub = chirp(62 if heavy else 60, 32 if heavy else 34, dur, tau=0.18) * np.exp(-t / (0.42 if heavy else 0.28))
    punch = np.sin(2 * np.pi * (150 if heavy else 140) * t) * np.exp(-t / 0.045) * 0.55   # 手机外放也听得到
    crack = lp(rng.standard_normal(n), 1200) * np.exp(-t / 0.040) * (0.9 if heavy else 0.6)
    click = bp(rng.standard_normal(n), 3000, 6000) * np.exp(-t / 0.0007) * 0.5
    x = sub * 1.0 + punch + crack + click
    x = fade(x, 0.0008, 0.05)
    x = reverb_tail(x, rt=1.2 if heavy else 0.7, wet_db=-16 if heavy else -18, lpf=3500)
    x = hp(x, 28)
    return fade(x, 0.0005, 0.08)


_hit_l_raw = hit(False)          # 2026-10-07：原 hit-轻 / hit-重 只取数组当「低频层」（保持共用 rng 的抽取顺序，其他音效逐字节不变），
_hit_h_raw = hit(True)           # 文件在文末「重档修复」一节按新设计写出


# ---------- riser 过门 ----------
def riser(dur):
    n = int(SR * dur); t = np.arange(n) / SR; p = t / dur
    # ① 时变带通噪声（STFT 重叠相加），中心 400→7000 Hz，带宽逐渐收窄
    win_n, hop = 1024, 256; win = np.hanning(win_n)
    src = rng.standard_normal(n + win_n); y = np.zeros(n + win_n)
    freqs = np.fft.rfftfreq(win_n, 1 / SR)
    for s in range(0, n, hop):
        q = s / n; fc = 400 * (7000 / 400) ** q; bw = 0.9 - 0.5 * q
        g = np.exp(-0.5 * (np.log(np.maximum(freqs, 1) / fc) / bw) ** 2)
        y[s:s + win_n] += np.fft.irfft(np.fft.rfft(src[s:s + win_n] * win) * g) * win
    noise = y[:n] / (np.max(np.abs(y[:n])) + 1e-9)
    # ② 三根失谐锯齿（加法合成 8 次谐波，避免混叠），110→440 Hz
    f = 110 * 4 ** (p ** 1.6)
    tones = np.zeros(n)
    for det in (-0.6, 0.0, 0.7):
        ph = 2 * np.pi * np.cumsum(f * 2 ** (det / 12 / 4)) / SR
        for h in range(1, 9):
            tones += np.sin(h * ph) / h * (0.8 ** (h - 1))
    tones = lp(tones / 3, 2500)
    trem_rate = 4 + 12 * p ** 1.5
    trem = 0.75 + 0.25 * np.sin(2 * np.pi * np.cumsum(trem_rate) / SR)
    env = p ** 2.5
    x = (noise * 1.0 + tones / (np.max(np.abs(tones)) + 1e-9) * 0.45 * trem) * env
    x = hp(x, 60)
    x[-int(0.010 * SR):] *= np.linspace(1, 0, int(0.010 * SR))   # 10 ms 硬切
    x[:int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR))
    return x


save('riser-1.2s.wav', riser(1.2), -18, '过门铺垫；结尾对准冲击点（放在冲击点前 1.2 s）')
save('riser-1.5s.wav', riser(1.5), -18, '过门铺垫；结尾对准冲击点（放在冲击点前 1.5 s）')

# ---------- 技能 05 音效清单（2026-10-07 补）里的三种 ----------
def stamp_hit(press=True):
    """「咔」= 印章碰纸（短促、偏亮）；「嗒」= 压实（低频闷响 + 纸面拍击）。"""
    dur = 0.35; t = t_axis(dur); n = len(t)
    if press:
        f = 72 - 26 * np.minimum(1, t / 0.18)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.07)
        slap = lp(rng.standard_normal(n), 2500) * np.exp(-t / 0.009) * 0.8
        squish = bp(rng.standard_normal(n), 300, 900) * np.exp(-t / 0.03) * 0.25   # 墨印挤压
        x = body + slap + squish
    else:
        body = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.02) * 0.5
        tap = bp(rng.standard_normal(n), 900, 4000) * np.exp(-t / 0.006)
        x = body + tap
    return fade(x, 0.0005, 0.02)


st = np.zeros(int(SR * 0.62))
k1 = stamp_hit(False); st[:len(k1)] += k1 * 0.55
k2 = stamp_hit(True); s = int(0.22 * SR); st[s:s + len(k2)] += k2
_stamp2_raw = reverb_tail(st, rt=0.35, wet_db=-20, lpf=4000)   # 2026-10-07：只取数组当低频层，文件在文末写


def film_noise(dur=1.0):
    t = t_axis(dur); n = len(t)
    hiss = hp(rng.standard_normal(n), 300) * 0.35
    crackle = np.zeros(n)
    for _ in range(int(dur * 45)):                                    # 每秒约 45 个灰尘爆点
        s = rng.integers(0, n - 200); L = rng.integers(20, 120)
        crackle[s:s + L] += rng.standard_normal(L) * np.exp(-np.arange(L) / (L / 4)) * rng.uniform(0.5, 2.5)
    flutter = 1 + 0.2 * np.sin(2 * np.pi * 24 * t)                    # 24 格放映的轻微抖动
    env = np.minimum(1, t / 0.08) * np.minimum(1, (dur - t) / 0.25)
    return (hiss * flutter + bp(crackle, 800, 9000)) * env


save('胶片噪声.wav', film_noise(), -12, '技能 05：进年份、档案段，约 1 s 宽频噪声（比旁白峰值低约 2 dB 起试）；每 10 分钟 ≤ 1 次')


def low_dong(dur=0.45):
    t = t_axis(dur)
    x = (np.sin(2 * np.pi * np.cumsum(90 - 35 * np.minimum(1, t / 0.15)) / SR) * np.exp(-t / 0.09) +
         0.35 * np.sin(2 * np.pi * 260 * t) * np.exp(-t / 0.03))
    return fade(x, 0.001, 0.05)


save('咚-低频.wav', low_dong(), -10, '技能 05：核心概念第一次亮相、片尾的低频「咚」（50–300 Hz，偏响）；全片 1–2 次')


# =====================================================================
# 2026-10-07 重档修复（质检：hit-重 92% 能量在 20–60 Hz，hit-轻 72%，盖章 96% 在 120 Hz 以下 → 手机外放几乎听不到）
#   原来的声音保留当「低频层」，但 38 Hz 高通（4 阶）再降 4.5 dB；另加一层中高频冲击：
#     主体 150 Hz–3 kHz：音高下滑的「咚」（软饱和出谐波）+ 带共鸣峰的噪声拍击（纸板/木头质感）；
#     2–5 kHz：短促的「咔/啪」。
#   新层只用单独的随机源 rng_fix，上面所有音效逐字节不变。整体按 K 加权 400 ms 瞬时响度对齐：
#     hit-重、盖章与原文件一样响（总装的分档上限照旧起作用），hit-轻 提到中档上限附近。
#   另做两个新声：吼-嗷呜.wav（S27「嗷呜！」，元音 a→u 的卡通吼声，能量在 300 Hz–3 kHz）、
#     轻拍-三下.wav（S06「哒哒哒——」，0.12 秒一下的三下轻拍）。
# =====================================================================
rng_fix = np.random.default_rng(20261008)
_KB1, _KA1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
_KB2, _KA2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]


def mmax(x):
    """K 加权 400 ms 瞬时响度最大值（LUFS，单声道），和总装v6 的 momentary_max 同一算法。"""
    from scipy.signal import lfilter
    y = lfilter(_KB2, _KA2, lfilter(_KB1, _KA1, np.r_[np.asarray(x, np.float64), np.zeros(int(.4 * SR))])) ** 2
    c = np.r_[0, np.cumsum(y)]; b = int(.4 * SR)
    m = (c[b:] - c[:-b])[::SR // 100] / b
    return float(-0.691 + 10 * np.log10(m.max() + 1e-15))


def like_saved(x, peak_db):
    """原 save() 的电平：去直流 + 峰值归一（还原原文件的绝对电平，当低频层）。"""
    x = np.asarray(x, np.float64); x = x - np.mean(x)
    return x / (np.max(np.abs(x)) + 1e-12) * 10 ** (peak_db / 20)


def reverb_fix(x, rt=0.4, wet_db=-20, lpf=5000):
    """同 reverb_tail，只是用 rng_fix。"""
    ir_t = t_axis(rt * 1.2)
    ir = rng_fix.standard_normal(len(ir_t)) * np.exp(-ir_t / (rt / 6.9))
    ir = lp(ir, lpf); ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    wet = fftconvolve(x, ir)[:len(x) + len(ir_t)]
    dry = np.concatenate([x, np.zeros(len(wet) - len(x))])
    return dry + wet * 10 ** (wet_db / 20) * (np.max(np.abs(x)) / (np.max(np.abs(wet)) + 1e-9)) * 4


def impact(dur=0.5, f0=300, f1=150, tau_f=0.025, tone_decay=0.09, drive=2.0, nz=(250, 2500), res=(350, 700, 1300),
           nz_decay=0.06, snap=(2000, 5000), snap_decay=0.008, w_tone=1.0, w_nz=1.0, w_snap=0.5):
    """中高频冲击层：音高下滑的咚（软饱和）+ 共鸣噪声拍击 + 2–5 kHz 咔。三部分各自按 RMS 归一后按权重相加。"""
    t = t_axis(dur); n = len(t)
    f = f1 + (f0 - f1) * np.exp(-t / tau_f)
    tone = np.tanh(drive * np.sin(2 * np.pi * np.cumsum(f) / SR)) / np.tanh(drive)
    tone *= np.exp(-t / tone_decay) * np.minimum(1, t / 0.0008)
    z = rng_fix.standard_normal(n)
    body = bp(z, nz[0], nz[1]) + sum(reso(z, fr, q=6) * 2.0 for fr in res)
    body *= np.exp(-t / nz_decay) * np.minimum(1, t / 0.0012)
    sn = bp(rng_fix.standard_normal(n), snap[0], snap[1]) * np.exp(-t / snap_decay) * np.minimum(1, t / 0.0004)
    rms = lambda a: np.sqrt(np.mean(a[:int(0.1 * SR)] ** 2)) + 1e-12
    return w_tone * tone / rms(tone) + w_nz * body / rms(body) + w_snap * sn / rms(sn)


def fit_mix(low, mid, target, at=0):
    """low + k·mid，k 用二分法取到「整体瞬时响度最大值 = target LUFS」。mid 从 at 秒处放入。"""
    n = max(len(low), int(at * SR) + len(mid))
    L = np.zeros(n); L[:len(low)] = low
    M = np.zeros(n); s0 = int(at * SR); M[s0:s0 + len(mid)] = mid
    lo, hi = 1e-6, 10.0
    for _ in range(60):
        k = np.sqrt(lo * hi)
        if mmax(L + k * M) > target:
            hi = k
        else:
            lo = k
    return L + np.sqrt(lo * hi) * M


def lowlayer(raw, old_peak_db, low_db=-4.5):
    """原声当低频层：还原原文件电平 → 38 Hz 高通（4 阶）→ 再降 low_db。"""
    return hp(like_saved(raw, old_peak_db), 38, order=4) * 10 ** (low_db / 20)


# hit-重：和原文件一样响（原文件瞬时响度最大值），低频层 −4.5 dB，中高频层补足
_old_h = like_saved(_hit_h_raw, -13)
_mid_h = reverb_fix(impact(0.6, f0=300, f1=150, tau_f=0.025, tone_decay=0.095, drive=2.2, nz=(250, 2600), res=(330, 690, 1350),
                           nz_decay=0.07, snap=(2000, 5000), snap_decay=0.009, w_tone=1.0, w_nz=1.1, w_snap=0.55), rt=0.6, wet_db=-20, lpf=4500)
_new_h = fit_mix(lowlayer(_hit_h_raw, -13), _mid_h, mmax(_old_h))
save('hit-重.wav', fade(hp(_new_h, 30), 0.0005, 0.08), None,
     '关键数字、世界第一等大节点；全片 ≤ 6 次（2026-10-07 重做：低频层 38 Hz 高通再降 4.5 dB，加 150 Hz–3 kHz 冲击和 2–5 kHz 咔，手机外放也听得到）')

# hit-轻：中档（原文件太轻，旁白 −11 LU）→ 提到约 −28 LUFS（总装中档上限 −27.4 附近）
_mid_l = reverb_fix(impact(0.45, f0=380, f1=190, tau_f=0.02, tone_decay=0.065, drive=2.0, nz=(350, 3000), res=(450, 900, 1700),
                           nz_decay=0.045, snap=(2400, 5000), snap_decay=0.007, w_tone=1.0, w_nz=1.0, w_snap=0.5), rt=0.45, wet_db=-21, lpf=5000)
_new_l = fit_mix(lowlayer(_hit_l_raw, -18), _mid_l, -28.0)
save('hit-轻.wav', fade(hp(_new_l, 30), 0.0005, 0.06), None,
     '集中线、拟声字、普通节点冲击（2026-10-07 重做：加中高频冲击层，低频层 38 Hz 高通再降 4.5 dB）')

# 盖章-两下：「咔」（0 s，印章碰纸，偏亮）+「嗒」（0.22 s，压实：木头闷响 + 纸面啪），和原文件一样响
_ka = impact(0.25, f0=520, f1=380, tau_f=0.01, tone_decay=0.025, drive=1.6, nz=(900, 4500), res=(1500, 2600),
             nz_decay=0.014, snap=(2500, 5000), snap_decay=0.004, w_tone=0.5, w_nz=1.0, w_snap=0.7)
_da = impact(0.4, f0=260, f1=170, tau_f=0.018, tone_decay=0.06, drive=2.0, nz=(220, 2200), res=(300, 620, 1150),
             nz_decay=0.045, snap=(2000, 4800), snap_decay=0.008, w_tone=1.0, w_nz=1.1, w_snap=0.6)
_mid_s = np.zeros(int(0.22 * SR) + len(_da)); _mid_s[:len(_ka)] += _ka * 0.45; _mid_s[int(0.22 * SR):] += _da
_mid_s = reverb_fix(_mid_s, rt=0.32, wet_db=-21, lpf=4500)
_old_s = like_saved(_stamp2_raw, -13)
_new_s = fit_mix(lowlayer(_stamp2_raw, -13), _mid_s, mmax(_old_s))
save('盖章-两下.wav', fade(hp(_new_s, 30), 0.0005, 0.03), None,
     '「咔、嗒」两下盖章（相隔 0.22 s）：第二下「嗒」对准印章落定帧，放置时间 = 落定帧 − 0.22 s（2026-10-07 重做：加中高频层）')


# 吼-嗷呜：卡通吼声，元音 a → o → u（共振峰随时间移动），基频 140→185→112 Hz，带 33 Hz 粗糙调制
def growl(dur=0.72):
    n = int(SR * dur); t = np.arange(n) / SR
    jit = lp(rng_fix.standard_normal(n), 12); jit /= np.max(np.abs(jit)) + 1e-9
    f0 = np.interp(t, [0, .10, .32, dur], [140, 185, 150, 112]) * (1 + 0.03 * jit)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    src = sum(np.sin(h * ph) / h ** 0.85 for h in range(1, 30))
    src *= 1 + 0.38 * np.sin(2 * np.pi * 33 * t + 2 * jit)                 # 嗓子里的「颤」（growl）
    src = src / np.max(np.abs(src)) + bp(rng_fix.standard_normal(n), 500, 4000) * 0.12   # 一点气声
    F = lambda tc: (np.interp(tc, [0, .16, .42, dur], [780, 760, 340, 320]),            # F1：a → u
                    np.interp(tc, [0, .16, .42, dur], [1250, 1200, 820, 780]),          # F2
                    np.interp(tc, [0, .16, .42, dur], [2600, 2550, 2350, 2300]))        # F3
    win_n, hop = 1024, 256; win = np.hanning(win_n)
    pad = np.r_[src, np.zeros(win_n)]; y = np.zeros(n + win_n)
    fr = np.fft.rfftfreq(win_n, 1 / SR); lf = np.log(np.maximum(fr, 20))
    for s0 in range(0, n, hop):
        f1_, f2_, f3_ = F((s0 + win_n / 2) / SR)
        env = (1.0 * np.exp(-0.5 * ((lf - np.log(f1_)) / .16) ** 2) + .7 * np.exp(-0.5 * ((lf - np.log(f2_)) / .14) ** 2) +
               .35 * np.exp(-0.5 * ((lf - np.log(f3_)) / .12) ** 2) + .02)
        y[s0:s0 + win_n] += np.fft.irfft(np.fft.rfft(pad[s0:s0 + win_n] * win) * env) * win
    y = y[:n]
    amp = np.minimum(1, t / 0.035) * np.interp(t, [0, .1, .3, .5, dur], [1, .95, .8, .7, 0]) ** 1.2
    y = np.tanh(1.6 * y / (np.max(np.abs(y)) + 1e-9) * amp) 
    return hp(fade(y, 0.002, 0.04), 120)


save('吼-嗷呜.wav', fit_mix(np.zeros(1), reverb_fix(growl(), rt=0.35, wet_db=-22, lpf=5000), -28.5), None,
     'S27「嗷呜！」拟声字：卡通吼声（元音 a→u，能量 300 Hz–3 kHz），中档；2026-10-07 新做')


# 轻拍-三下：0.12 秒一下的三下轻拍（S06「哒哒哒——」），每下：230 Hz 敲击 + 0.5–2.5 kHz 拍击 + 3–6 kHz 轻咔
def pat(k=1.0, dur=0.1):
    t = t_axis(dur); n = len(t)
    body = np.sin(2 * np.pi * 230 * k * t) * np.exp(-t / 0.018) * 0.55
    z = rng_fix.standard_normal(n)
    knock = (bp(z, 500, 2500) * 0.9 + reso(z, 1100 * k, q=5) * 2.0) * np.exp(-t / 0.011) * np.minimum(1, t / 0.0008)
    click = bp(rng_fix.standard_normal(n), 3000, 6000) * np.exp(-t / 0.0015) * 0.35
    x = body / (np.max(np.abs(body)) + 1e-9) * 0.6 + knock / (np.max(np.abs(knock)) + 1e-9) + click / (np.max(np.abs(click)) + 1e-9) * 0.3
    return fade(x, 0.0005, 0.02)


_p3 = np.zeros(int(0.36 * SR))
for _i, (_at, _k, _g) in enumerate([(0.0, 1.0, 1.0), (0.12, 1.06, 0.85), (0.24, 0.97, 0.92)]):
    _pp = pat(_k) * _g; _s = int(_at * SR); _p3[_s:_s + len(_pp)] += _pp[:len(_p3) - _s]
save('轻拍-三下.wav', fit_mix(np.zeros(1), reverb_fix(_p3, rt=0.25, wet_db=-24, lpf=6000), -30.5), None,
     'S06「哒哒哒——」：0.12 秒一下的三下快速轻拍（人群跑进来），中档；2026-10-07 新做')


# 做音效.py 出的嗖、盖章也登记进清单（若已存在）
for nm, use in [('嗖.wav', '章节过门、推近（做音效.py 生成，峰值 −16）'), ('盖章.wav', '画面盖章（做音效.py 生成，峰值 −13）')]:
    p = os.path.join(out, nm)
    if os.path.exists(p):
        with wave.open(p) as w:
            a = np.frombuffer(w.readframes(w.getnframes()), '<i2') / 32768
        manifest.append({'file': nm, 'dur_s': round(len(a) / SR, 3),
                         'peak_dbfs': round(20 * np.log10(np.max(np.abs(a)) + 1e-12), 1),
                         'rms_db': round(20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-12), 1), 'use': use})

json.dump(manifest, open(os.path.join(out, '音效清单.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for m in manifest:
    print(f"{m['file']:<18} {m['dur_s']:>6.3f}s  峰值 {m['peak_dbfs']:>6} dBFS  RMS {m['rms_db']:>6} dB  {m['use']}")
