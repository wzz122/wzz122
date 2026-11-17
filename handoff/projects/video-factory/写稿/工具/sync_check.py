# -*- coding: utf-8 -*-
"""字幕同步核对（模型部分，单进程）：无提示转写成片音轨 → 每条字幕的首字实际开口时间 vs 字幕 t0。
   用法：mac-heavy-job.py -- python3 sync_check.py 成片.mp4 storyboard.json 输出.json"""
import sys, os, re, json, difflib, subprocess
sys.path.insert(0, os.path.expanduser('~/Desktop/视频工厂/engine'))
from align import load_pcm
import numpy as np, mlx_whisper, imageio_ffmpeg
video, sbf, outf = sys.argv[1:4]
wav = outf + '.16k.wav'
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', wav], check=True)
w, sr = load_pcm(wav)
r = mlx_whisper.transcribe(w.astype(np.float32), path_or_hf_repo='mlx-community/whisper-large-v3-turbo', language='zh',
                           word_timestamps=True, condition_on_previous_text=False)
norm = lambda s: re.sub(r'[^\w]', '', s)
CN = '零一二三四五六七八九'; n2c = lambda s: re.sub(r'\d', lambda m: CN[int(m.group())], s)
chars = []
for seg in r['segments']:
    for x in seg.get('words') or []:
        t = n2c(norm(x['word']))
        for k, c in enumerate(t): chars.append((c, x['start'] + (x['end'] - x['start']) * k / len(t)))
asr = ''.join(c for c, _ in chars)
sb = json.load(open(sbf)); beats = [b for b in sb['beats'] if b.get('say')]
script, spans = '', []
for b in beats:
    a = len(script); script += n2c(norm(b['say'])); spans.append((a, len(script)))
m = {}
for i, j, n in difflib.SequenceMatcher(None, script, asr, autojunk=False).get_matching_blocks():
    for k in range(n): m[i + k] = j + k
out = []
for b, (a, e) in zip(beats, spans):
    hit = next((m[k] for k in range(a, min(e, a + 4)) if k in m), None)   # 前 4 个字里第一个对上的
    off = next((k - a for k in range(a, min(e, a + 4)) if k in m), None)
    onset = chars[hit][1] - 0.0 if hit is not None else None
    out.append({'say': b['say'], 't0': round(b['t0'], 2), 't1': round(b['t1'], 2), 'asr_onset': round(onset, 2) if onset is not None else None,
                'first_matched_char_offset': off, 'delta': round(b['t0'] - onset, 2) if onset is not None and off == 0 else None})
json.dump({'n': len(out), 'beats': out}, open(outf, 'w'), ensure_ascii=False, indent=1)
d = [x['delta'] for x in out if x['delta'] is not None]
print('beats', len(out), 'measured', len(d), 'median|Δ|', round(float(np.median(np.abs(d))), 3), 'max late', max(d), 'max early', min(d),
      '>0.4s:', [(x['say'][:12], x['delta']) for x in out if x['delta'] is not None and abs(x['delta']) > 0.4])
