# -*- coding: utf-8 -*-
"""读音审计·模型部分（一个进程、一次加载、逐章串行）。
   用法：/usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- python3 pron_transcribe.py 输出目录 章1.mp3:稿1.txt 章2.mp3:稿2.txt …
   每章输出 chN.json：
     zh  无提示中文转写（逐字时间）
     ja  日语转写（文本）
     lid 每 3 秒窗口（步长 1.5 秒）的日语/中文概率
     diff 与稿子逐字对齐后的不一致片段（附时间）
   只做转写和比对，不下结论；判断交给文字层面的复核。"""
import sys, os, re, json, difflib
sys.path.insert(0, os.path.expanduser('~/Desktop/视频工厂/engine'))
from align import load_pcm
import numpy as np
import mlx_whisper
import mlx.core as mx
from mlx_whisper.load_models import load_model
from mlx_whisper.audio import log_mel_spectrogram, pad_or_trim, N_SAMPLES, N_FRAMES
from mlx_whisper.decoding import detect_language

REPO = 'mlx-community/whisper-large-v3-turbo'
out_dir = sys.argv[1]; os.makedirs(out_dir, exist_ok=True)
pairs = [a.split(':', 1) for a in sys.argv[2:]]
model = load_model(REPO)                     # 语言识别用；transcribe 内部有缓存，同一进程只加载一次
norm = lambda s: re.sub(r'[^\w]', '', s)
CN = '零一二三四五六七八九'
def num2cn(s):                               # 阿拉伯数字 → 逐位中文，减少「7/七」之类的假差异
    return re.sub(r'\d', lambda m: CN[int(m.group())], s)

for audio, txt in pairs:
    name = os.path.splitext(os.path.basename(audio))[0]
    w, sr = load_pcm(audio); w = w.astype(np.float32)
    r = mlx_whisper.transcribe(w, path_or_hf_repo=REPO, language='zh', word_timestamps=True,
                               condition_on_previous_text=False)
    chars = []
    for seg in r['segments']:
        for x in seg.get('words') or []:
            t = norm(x['word'])
            for k, c in enumerate(t):
                chars.append([c, round(x['start'] + (x['end'] - x['start']) * k / len(t), 2)])
    rj = mlx_whisper.transcribe(w, path_or_hf_repo=REPO, language='ja', condition_on_previous_text=False)
    lid = []
    for s0 in np.arange(0, max(0.1, len(w) / sr - 1.5), 1.5):
        seg = mx.array(w[int(s0 * sr):int((s0 + 3) * sr)])
        mel = pad_or_trim(log_mel_spectrogram(seg, n_mels=model.dims.n_mels, padding=N_SAMPLES), N_FRAMES, axis=-2).astype(mx.float16)
        _, p = detect_language(model, mel); p = p if isinstance(p, dict) else p[0]
        lid.append([round(float(s0), 1), round(float(p.get('ja', 0)), 3), round(float(p.get('zh', 0)), 3)])
    ref = num2cn(norm(open(txt).read())); asr = num2cn(''.join(c for c, _ in chars))
    sm = difflib.SequenceMatcher(None, ref, asr, autojunk=False)
    diff = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == 'equal': continue
        t = chars[min(j1, len(chars) - 1)][1] if chars else 0
        diff.append({'t': t, 'op': op, 'script': ref[i1:i2], 'heard': asr[j1:j2],
                     'context_script': ref[max(0, i1 - 6):i2 + 6], 'context_heard': asr[max(0, j1 - 6):j2 + 6]})
    acc = sum(b.size for b in sm.get_matching_blocks()) / max(1, len(ref))
    json.dump({'audio': audio, 'script_file': txt, 'duration': round(len(w) / sr, 2), 'char_accuracy': round(acc, 4),
               'zh_text': r['text'], 'ja_text': rj['text'], 'lid': lid, 'diff': diff},
              open(f'{out_dir}/{name}.json', 'w'), ensure_ascii=False, indent=1)
    print(name, 'acc', round(acc, 3), 'diff', len(diff), 'max P(ja)', max(x[1] for x in lid) if lid else None, flush=True)
