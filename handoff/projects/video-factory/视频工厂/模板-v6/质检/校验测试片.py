# -*- coding: utf-8 -*-
"""校验 总装v6 的输出（只用 ffmpeg + numpy，不跑模型）：
  1 响度：ebur128 综合响度、真峰、LRA；
  2 音乐确实存在：silencedetect −50 dB / 0.3 s，成片 vs 同一段纯旁白（v5 没配乐时句间全是静音段）；
  3 音效时刻：对拼接记录里每个放进去的音效，用原 wav 做匹配滤波（归一化互相关），在成片音轨里找它真正出现的位置，和计划起点比。
用法：python3 质检/校验测试片.py 成片或测试片.mp4 拼接记录-v6.json
（模板版：旁白路径取拼接记录里的 narration；总装用了 --start 时按记录里的 start_s 对齐。）"""
import json, re, subprocess, sys
from pathlib import Path
import numpy as np
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe(); SR = 48000
mp4, recp = Path(sys.argv[1]), Path(sys.argv[2])
rec = json.loads(recp.read_text())
T = rec['video']['duration']
S = float(rec['video'].get('start_s') or 0.0)            # 测试片从全片第 S 秒起（总装 --start）
NARR = rec.get('narration')
if not NARR:                                             # 旧记录没写旁白路径：按 项目.json 找
    _pj = Path(__file__).resolve().parent.parent / '项目.json'
    _P = json.loads(_pj.read_text(encoding='utf-8')) if _pj.exists() else {}
    _n = Path(_P.get('旁白', '声音/旁白.wav')).expanduser()
    NARR = str(_n if _n.is_absolute() else _pj.parent / _n)
SFX = Path(rec['sfx']['library'])


def ff(args):
    return subprocess.run([FF, '-hide_banner', '-nostats'] + args, capture_output=True, text=True).stderr


def decode(p, ch, t=None):
    a = [FF, '-v', 'error', '-i', str(p), '-vn'] + (['-t', str(t)] if t else []) + ['-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-']
    return np.frombuffer(subprocess.run(a, capture_output=True).stdout, np.float32).reshape(-1, ch).astype(np.float64)


ok = True
# 1 响度
e = ff(['-i', str(mp4), '-af', 'ebur128=peak=true', '-f', 'null', '-'])
I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', e)[-1]); TP = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', e)[-1])
LRA = float(re.findall(r'LRA:\s+(-?[\d.]+) LU', e)[-1])
print(f'[响度] {I:.2f} LUFS（目标 −14±0.5）  真峰 {TP:.2f} dBTP（≤ −1.5）  LRA {LRA:.1f} LU', '通过' if abs(I + 14) <= .5 and TP <= -1.5 else '不通过')
ok &= abs(I + 14) <= .5 and TP <= -1.5

# 2 静音段（音乐在不在）
def silences(p, extra=()):
    e = ff(list(extra) + ['-i', str(p), '-t', str(T), '-vn', '-af', 'silencedetect=n=-50dB:d=0.3', '-f', 'null', '-'])
    st = [float(x) for x in re.findall(r'silence_start: (-?[\d.]+)', e)]
    en = [float(x) for x in re.findall(r'silence_end: (-?[\d.]+)', e)]
    return list(zip(st, en + [T] * (len(st) - len(en))))
s_out, s_narr = silences(mp4), silences(NARR, ['-ss', f'{S:.3f}'])
print(f'[音乐] silencedetect −50 dB/0.3 s：成片 {len(s_out)} 段（{sum(b - a for a, b in s_out):.1f} 秒）{s_out}；'
      f'同段纯旁白 {len(s_narr)} 段（{sum(b - a for a, b in s_narr):.1f} 秒）')
planned = rec['bgm'].get('no_music_spans', [])
print(f'        拼接记录：音乐覆盖 {rec["music_coverage"]:.1%}，无乐区段 {planned}；段落 {rec["bgm"]["sections"]}')
if len(s_narr) <= len(s_out):
    print('        （这一段纯旁白本身静音段很少，「音乐在不在」主要看拼接记录的覆盖率）')
ok &= len(s_out) <= 1 and rec['music_coverage'] >= .85

# 3 音效时刻（匹配滤波）：用每个音效最有能量的 0.2 秒去对；成片里看峰值是否显著（z ≥ 5），分轨里应几乎完全吻合
out = decode(mp4, 2)
stem = Path(rec.get('stems', {}).get('音效', '')) if rec.get('stems') else None
st = decode(stem, 2)[:len(out)] if stem and stem.is_file() else None


def locate(sig, clip, start, rad=.3):
    s0 = int(start * SR)
    lo, hi = max(0, s0 - int(rad * SR)), min(len(sig), s0 + int(rad * SR) + len(clip))
    seg = sig[lo:hi]
    c = np.correlate(seg, clip, 'valid')
    e2 = np.convolve(seg ** 2, np.ones(len(clip)), 'valid')
    ncc = c / (np.sqrt(e2 * (clip ** 2).sum()) + 1e-12)
    k = int(np.argmax(ncc))
    far = np.r_[ncc[:max(0, k - 240)], ncc[k + 240:]]
    z = (ncc[k] - np.median(far)) / (1.4826 * np.median(np.abs(far - np.median(far))) + 1e-9) if len(far) > 50 else 0.0
    return (lo + k) / SR - start, float(ncc[k]), float(z)


res = []
cut = []
for d in rec['sfx']['detail']:
    if not d['file'] or not d['file'].endswith('.wav'):
        continue
    if d['start'] < S - 1e-6:                                   # 测试片（--start）开头截掉了这个音效的前一段：对不上是正常的，不算
        cut.append(f"{d['t']:.2f}s {d['kind']}")
        continue
    full = decode(SFX / d['file'], 1)[:, 0]
    w = int(.2 * SR)
    if len(full) > w:                                            # 最有能量的 0.2 秒
        cs = np.r_[0, np.cumsum(full ** 2)]
        i0 = int(np.argmax(cs[w:] - cs[:-w]))
    else:
        i0, w = 0, len(full)
    clip = full[i0:i0 + w]
    p = d['pan']; gl, gr = np.sqrt(2) * np.cos((p + 1) * np.pi / 4), np.sqrt(2) * np.sin((p + 1) * np.pi / 4)
    exp_t = d['start'] - S + i0 / SR                          # 记录里是全片时间，测试片要减去起点
    e_o, n_o, z_o = locate(out[:, 0] * gl + out[:, 1] * gr, clip, exp_t)
    e_s, n_s = (locate(st[:, 0] * gl + st[:, 1] * gr, clip, exp_t)[:2]) if st is not None else (None, None)
    res.append(dict(t=d['t'], kind=d['kind'], file=d['file'], tier=d['tier'], rel=d['level_rel_voice'], err_ms=round(e_o * 1000, 1),
                    ncc=round(n_o, 2), z=round(z_o, 1), stem_err_ms=None if e_s is None else round(e_s * 1000, 1),
                    stem_ncc=None if n_s is None else round(n_s, 2)))
hear = [r for r in res if abs(r['err_ms']) <= 10 and r['z'] >= 5]
stem_ok = [r for r in res if r['stem_err_ms'] is not None and abs(r['stem_err_ms']) <= 1 and r['stem_ncc'] >= .9]
print(f'[音效] 成片音轨里在计划时刻 ±10 ms 内显著找到 {len(hear)}/{len(res)} 个；音效分轨里 ±1 ms 吻合 {len(stem_ok)}/{len(res)} 个；'
      f'放入 {rec["sfx_count"]}，事件 {rec["sfx_events"]}（{rec["sfx"]["count_check"]}）')
for r in res:
    tag = '成片里听得出' if r in hear else '被旁白盖住（轻档本来就很轻）' if r['tier'] == '轻' or r['rel'] < -10 else '成片里没找到'
    print(f"   {r['t']:7.2f}s {r['kind']:14s} {r['file']:18s} {r['tier']} 比旁白 {r['rel']:+6.1f} LU  成片偏差 {r['err_ms']:+6.1f} ms z={r['z']:5.1f}"
          f"  分轨偏差 {r['stem_err_ms']} ms 相关 {r['stem_ncc']}  {tag}")
ok &= (st is None or len(stem_ok) == len(res)) and all(r in hear for r in res if r['tier'] != '轻' and r['rel'] >= -10)
if st is None:
    print('        （总装没加 --stems，跳过分轨逐条吻合检查）')
if cut:
    print('[不查] 测试片开头截掉了一部分的音效：', cut)
print('[跳过]', [(x['t'], x['kind'], x['reason']) for x in rec['sfx']['skipped']])
print('[降档]', [(x['t'], x['kind'], x['downgrade']) for x in rec['sfx']['downgraded']])
print('总评：', '通过' if ok else '不通过')
