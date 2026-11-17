# -*- coding: utf-8 -*-
"""本地配乐（2026-10-20，备用）：用 MusicGen（Meta，本地、免费）按文字描述生成纯器乐。
为什么要有它：MiniMax Music 生成的「纯器乐」常混进人声（311 期第一轮 6 版废了 5 版）；MusicGen 只会出器乐，没有人声问题。
代价：音质和编曲比 MiniMax 弱、生成慢（M4 + 加速，small 约 12 秒音乐 / 分钟）。所以定位是**备用**：MiniMax 两轮都带人声时用它补，或者做测试片的临时配乐。
人耳没听过的曲子不进成片终版——交付时列进「只需人工」。

用法：python3 工具/本地配乐.py "calm solo piano with soft cello, slow, documentary underscore, no drums" 90 -o 声音/配乐-M2-本地.wav [--模型 small|medium]
  长曲按 30 秒一块生成，后一块用前一块最后 10 秒当提示续写，块间 2 秒交叉淡化。
  提示词用英文（MusicGen 只懂英文）；写清乐器、速度、情绪、「no drums / no vocals」。
模型任务：直接跑（Bash 钩子自动套内存锁）；用 ~/.venvs/av（脚本会自己切过去）。首次下载 small 约 1.2 GB、medium 约 6 GB。
"""
import os, sys
from pathlib import Path

VENV = Path.home() / '.venvs/av/bin/python'
if Path(sys.executable).resolve() != VENV.resolve() and VENV.exists():
    os.execv(str(VENV), [str(VENV)] + sys.argv)

import argparse  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
import torch  # noqa: E402
from transformers import AutoProcessor, MusicgenForConditionalGeneration  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('提示词'); ap.add_argument('秒', type=float); ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--模型', default='small', choices=['small', 'medium'])
    a = ap.parse_args()
    name = f'facebook/musicgen-{a.模型}'
    proc = AutoProcessor.from_pretrained(name)
    m = MusicgenForConditionalGeneration.from_pretrained(name)
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
    m = m.to(dev)
    sr = m.config.audio_encoder.sampling_rate
    block, keep, fade = 30.0, 10.0, 2.0
    out, prev = np.zeros(0, np.float32), None
    while len(out) / sr < a.秒:
        if prev is None:
            inp = proc(text=[a.提示词], padding=True, return_tensors='pt').to(dev)
            new_sec = block
        else:
            inp = proc(text=[a.提示词], audio=[prev], sampling_rate=sr, padding=True, return_tensors='pt').to(dev)
            new_sec = block - keep
        gen = m.generate(**inp, max_new_tokens=int(block * 50), do_sample=True, guidance_scale=3.0)
        w = gen[0, 0].float().cpu().numpy()
        if prev is not None:
            w = w[int(keep * sr):]                      # 去掉作为提示的那 10 秒
        if len(out) and len(w) > fade * sr:
            n = int(fade * sr); r = np.linspace(0, 1, n, dtype=np.float32)
            out[-n:] = out[-n:] * (1 - r) + w[:n] * r
            out = np.concatenate([out, w[n:]])
        else:
            out = np.concatenate([out, w])
        prev = out[-int(keep * sr):]
        print(f'已生成 {len(out) / sr:.1f} / {a.秒:.0f} 秒', flush=True)
    out = out[:int(a.秒 * sr)]
    n = int(3 * sr); out[-n:] *= np.linspace(1, 0, n, dtype=np.float32)
    peak = float(np.abs(out).max() + 1e-9); out *= 0.8 / peak
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    sf.write(a.out, out, sr)
    print('写好', a.out, f'{len(out) / sr:.1f} 秒，{sr} Hz')


if __name__ == '__main__':
    main()
