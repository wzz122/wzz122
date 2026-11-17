# -*- coding: utf-8 -*-
"""试听配音（2026-10-20）：用本地 Kokoro（免费、不联网生成）把稿子念一遍，出一条试听稿 + 每章估时，花 MiniMax 积分之前先听节奏、对画面。
不是成片配音：音色和停顿跟 MiniMax gou 不一样，成片仍用 MiniMax（语速 1.15）。

用法：python3 工具/试听配音.py 成稿/xxx.md [-o 输出目录] [--音色 zf_001] [--语速 1.2]
输出：<目录>/试听.wav（全片）、<目录>/chNN.wav（每章）、<目录>/估时.json（每章字数、Kokoro 实长、按 MiniMax 1.15 实测 4.7 字/秒的估时）
实测（2026-10-20，311 期引子 93 字，含句间 0.35 秒停顿）：Kokoro 语速 1.0 → 23.9 秒，1.2 → 20.9 秒；MiniMax 1.15 估 19.8 秒。
     默认语速 1.2，试听稿长度接近 MiniMax 成片。可懂度好（whisper 回听基本无错字）。模型 hexgrad/Kokoro-82M-v1.1-zh（首次自动下载约 330 MB）。
模型任务：直接跑（Bash 钩子自动套内存锁，自己再包 mac-heavy-job 会死锁）。用 ~/.venvs/av 的 Python 跑（脚本会自己切过去）。
"""
import json, os, re, sys
from pathlib import Path

VENV = Path.home() / '.venvs/av/bin/python'
if Path(sys.executable).resolve() != VENV.resolve() and VENV.exists():
    os.execv(str(VENV), [str(VENV)] + sys.argv)

import argparse  # noqa: E402
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

ZH = re.compile(r'[一-鿿0-9A-Za-z]')


def narration(md):
    """按 视频工厂 稿件格式取旁白：去掉注释、#/@/[/>/--- 行；按 ## 分章。"""
    t = re.sub(r'<!--.*?-->', '', Path(md).read_text(encoding='utf-8'), flags=re.S)
    chs, cur = [], None
    for ln in t.split('\n'):
        s = ln.strip()
        if s.startswith('## '):
            cur = dict(title=s[3:].strip(), lines=[]); chs.append(cur); continue
        if not s or s[0] in '#@[>' or s.startswith('---') or cur is None:
            continue
        cur['lines'].append(re.sub(r'==|\*\*', '', s))
    return chs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('md'); ap.add_argument('-o', '--out')
    ap.add_argument('--音色', default='zf_001'); ap.add_argument('--语速', type=float, default=1.2)
    a = ap.parse_args()
    out = Path(a.out or (Path(a.md).with_suffix('') .as_posix() + '-试听')); out.mkdir(parents=True, exist_ok=True)
    from kokoro import KModel, KPipeline
    repo = 'hexgrad/Kokoro-82M-v1.1-zh'
    model = KModel(repo_id=repo).eval()
    pipe = KPipeline(lang_code='z', repo_id=repo, model=model)
    SR = 24000
    gap = np.zeros(int(.35 * SR), np.float32)           # 句间停顿（接近 MiniMax 断句）
    allw, rep = [], []
    for i, ch in enumerate(narration(a.md), 1):
        parts = []
        for ln in ch['lines']:
            for _, _, au in pipe(ln, voice=a.音色, speed=a.语速):
                parts.append(au.numpy())
            parts.append(gap)
        w = np.concatenate(parts) if parts else np.zeros(1, np.float32)
        sf.write(out / f'ch{i:02d}.wav', w, SR)
        allw += [w, np.zeros(int(1.0 * SR), np.float32)]
        n = sum(len(ZH.findall(x)) for x in ch['lines'])
        rep.append(dict(章=i, 标题=ch['title'], 字数=n, Kokoro秒=round(len(w) / SR, 1), MiniMax估秒=round(n / 4.7, 1)))
        print(rep[-1], flush=True)
    sf.write(out / '试听.wav', np.concatenate(allw), SR)
    tot = dict(字数=sum(r['字数'] for r in rep), Kokoro分钟=round(sum(r['Kokoro秒'] for r in rep) / 60, 1),
               MiniMax估分钟=round(sum(r['MiniMax估秒'] for r in rep) / 60, 1), 说明='MiniMax 估时按 gou 1.15 倍实测 4.7 字/秒（311 期）；没算喘气点、章卡')
    json.dump(dict(合计=tot, 每章=rep), open(out / '估时.json', 'w'), ensure_ascii=False, indent=1)
    print('合计', tot)


if __name__ == '__main__':
    main()
