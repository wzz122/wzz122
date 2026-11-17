# 外语配音逐句核查：Whisper 转写 vs 配音文本，按相似度排序列出可疑句。一个进程串行处理多期，模型只加载一次。
# 用法：/usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- python3 pipeline/dub-audit.py episodes/<期名>:ko episodes/<期名>:vi … [--dir test-own]
# 产物：episodes/<期名>/dub/<语言>/audit.json（相似度从低到高）
import json, re, sys, difflib, unicodedata
from pathlib import Path
import mlx_whisper

folder = sys.argv[sys.argv.index('--dir') + 1] if '--dir' in sys.argv else 'lines'
norm = lambda t: re.sub(r'[\W_]', '', unicodedata.normalize('NFC', t)).lower()
for job in [a for a in sys.argv[1:] if ':' in a]:
    ep, lang = job.split(':')
    ep = Path(ep)
    rows = [r.split('\t') for r in (ep/'dub'/f'{lang}.tsv').read_text().strip().split('\n')[1:]]
    out = []
    for n, cast, sub, *tts in rows:
        f = ep/'dub'/lang/folder/f'{int(n):03d}.wav'
        if not f.exists():
            continue
        said = (tts[0] if tts and tts[0] else sub).strip()
        r = mlx_whisper.transcribe(str(f), path_or_hf_repo='mlx-community/whisper-large-v3-turbo', language=lang)
        ratio = round(difflib.SequenceMatcher(None, norm(said), norm(r['text'])).ratio(), 3)
        out.append({'n': int(n), 'cast': cast, 'ratio': ratio, 'tts': said, 'heard': r['text'].strip()})
        print(ep.name, lang, n, ratio, flush=True)
    out.sort(key=lambda x: x['ratio'])
    (ep/'dub'/lang/('audit.json' if folder == 'lines' else f'audit-{folder}.json')).write_text(json.dumps(out, ensure_ascii=False, indent=1))
    if out:
        print(f'== {ep.name} {lang}：{len(out)} 句，平均相似度 {sum(x["ratio"] for x in out)/len(out):.3f}，低于 0.8 的 {sum(x["ratio"] < 0.8 for x in out)} 句', flush=True)
