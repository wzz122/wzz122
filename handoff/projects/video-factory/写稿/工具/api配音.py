# -*- coding: utf-8 -*-
"""MiniMax API 配一章（2026-11-06 版：不重复扣费、记账、改句只重配改动的句子）。
密钥从 ~/video-projects/manga-video/.env 读（不打印、不落盘到别处）。模型固定 speech-2.8-hd（用户要保音质，不换 turbo）。

用法：
  python3 api配音.py 文本.txt 输出.wav [--voice ttv-voice-...] [--speed 1.15] [--tone 町/(ding1)]   # 整章配
  python3 api配音.py 新文本.txt 输出-v2.wav --基于 原始/ch02-v1.wav [--旧文本 旧.txt]               # 只重配改动的句子
  python3 api配音.py 文本.txt 输出.wav --只估价                                                     # 不花钱，只看字数和费用

不扣费的情况：同一段文本、音色、语速、读音词典配过（缓存在 输出目录/api缓存/），或输出文件已是这份文本。
输出已存在但文本变了：停下，要么用 --基于 只改句子，要么写 --覆盖 整章重配。
--基于：旧录音旁边的 .json 记着旧文本；这版以前配的章节没有，要用 --旧文本 给。改动超过一半、或定位可疑时不花钱，直接报错说明。
句子位置靠停顿估的，换完必须跑 reference 04 第 3 节读音审计，再听换过的地方。

读音（2026-11-16 起默认开）：配音前自动跑 pron_lib 的预检——永久词典 读音词典.tsv 的「通用」条目、本期 配音/读音.tsv、
常见词里的多音字，出现在本章文本里的都自动钉住读音一起发给接口；--tone 手写的同名条目优先。
还有「待定」的风险点时不花钱，直接停下（先跑 读音预检.py 把读音定好）。--不用词典 回到老做法（只用 --tone）。
  python3 api配音.py 文本.txt 输出-v2.wav --基于 原始/ch02-v1.wav --重配句 7,12     # 文本没变，只把第 7、12 句重新生成一遍换进去（点检不过关时用）
账本：输出目录/api账本.tsv 和共用的 ~/Desktop/写稿/工具/minimax费用记录.tsv。"""
import argparse, difflib, hashlib, json, re, subprocess, sys, time, urllib.request, wave
from pathlib import Path
import imageio_ffmpeg
import numpy as np

MODEL = 'speech-2.8-hd'
USD_PER_CHAR = 100 / 1e6            # 官方按量价；实测一个汉字约计 1.87 字符
CHARS_PER_HANZI = 1.87
SR = 48000
GOU = 'ttv-voice-2026093000431426-d3T6qk99'
SHARED = Path.home() / 'Desktop/写稿/工具/minimax费用记录.tsv'
HEAD = '时间\t文件\t方式\t计费字符\t美元\t秒数\t文本开头\n'
FF = imageio_ffmpeg.get_ffmpeg_exe()


def sentences(text):
    """按句末标点切句，引号跟着上一句。逗号不切：句子是重配的最小单位。"""
    return [s.strip() for s in re.findall(r'[^。！？!?…\n]+[。！？!?…]*[”」』"]*', text) if s.strip()]


def fingerprint(text, voice, speed, tones):
    return hashlib.sha1(json.dumps([MODEL, text, voice, speed, sorted(tones)], ensure_ascii=False).encode()).hexdigest()[:16]


def call_api(text, voice, speed, tones):
    """真正花钱的一步。返回 (mp3 字节, 计费字符, 毫秒)。"""
    env = {}
    for l in open(Path.home() / 'video-projects/manga-video/.env'):
        if '=' in l and not l.strip().startswith('#'):
            k, v = l.strip().split('=', 1)
            env[k] = v.strip().strip('"').strip("'")
    base = {'global': 'https://api.minimax.io', 'cn': 'https://api.minimaxi.com'}[env.get('MINIMAX_REGION', 'global').lower()]
    body = {'model': MODEL, 'text': text, 'stream': False, 'language_boost': 'Chinese',
            'voice_setting': {'voice_id': voice, 'speed': speed, 'vol': 1, 'pitch': 0},
            'audio_setting': {'sample_rate': 44100, 'bitrate': 128000, 'format': 'mp3', 'channel': 1}, 'output_format': 'hex'}
    if tones:
        body['pronunciation_dict'] = {'tone': tones}
    req = urllib.request.Request(base + '/v1/t2a_v2', data=json.dumps(body).encode(),
                                 headers={'Authorization': 'Bearer ' + env['MINIMAX_API_KEY'], 'Content-Type': 'application/json'})
    d = json.load(urllib.request.urlopen(req, timeout=600))
    if d.get('base_resp', {}).get('status_code') != 0:
        sys.exit(f"失败：{d.get('base_resp')}")
    ex = d.get('extra_info', {})
    return bytes.fromhex(d['data']['audio']), int(ex.get('usage_characters') or 0), int(ex.get('audio_length') or 0)


def ledger(out, how, chars, seconds, text):
    row = '\t'.join([time.strftime('%Y-%m-%d %H:%M:%S'), str(out), how, str(chars), f'{chars * USD_PER_CHAR:.4f}', f'{seconds:.1f}',
                     text[:24].replace('\t', ' ').replace('\n', ' ')]) + '\n'
    for f in (Path(out).parent / 'api账本.tsv', SHARED):
        if not f.exists():
            f.write_text(HEAD, encoding='utf-8')
        with open(f, 'a', encoding='utf-8') as h:
            h.write(row)


def synth(text, a, out, salt=''):
    """有缓存用缓存（不扣费），没有才调接口。返回 (mp3 路径, 这次计费字符)。"""
    fp = fingerprint(text, a.voice, a.speed, a.tone) + salt
    cache = Path(out).parent / 'api缓存'
    cache.mkdir(exist_ok=True)
    mp3 = cache / f'{fp}.mp3'
    if mp3.exists() and mp3.stat().st_size:
        return mp3, 0
    audio, chars, ms = call_api(text, a.voice, a.speed, a.tone)
    mp3.write_bytes(audio)
    ledger(out, '接口', chars, ms / 1000, text)
    return mp3, chars


def to_wav(src, dst):
    subprocess.run([FF, '-v', 'error', '-y', '-i', str(src), '-ar', str(SR), '-ac', '1', '-c:a', 'pcm_s16le', str(dst)], check=True)


def load(p):
    with wave.open(str(p)) as w:
        if w.getframerate() != SR or w.getnchannels() != 1:
            raise SystemExit(f'{p} 不是 {SR} Hz 单声道')
        return np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32768


def save(p, x):
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())


def speech_mask(x, hop=.01):
    """10 毫秒一格，True = 在说话。门限跟着本段响度走。"""
    h = int(SR * hop)
    n = len(x) // h
    db = 20 * np.log10(np.sqrt((x[:n * h].reshape(n, h) ** 2).mean(axis=1)) + 1e-9)
    return db > np.percentile(db, 90) - 32


def pauses(x, min_len=.1):
    """所有停顿 [(起, 止) 秒]，不含开头结尾。"""
    m = speech_mask(x)
    idx = np.flatnonzero(m)
    if not len(idx):
        return [], 0.0, 0.0
    a, b = idx[0], idx[-1] + 1
    out, i = [], a
    while i < b:
        if not m[i]:
            j = i
            while j < b and not m[j]:
                j += 1
            if (j - i) * .01 >= min_len:
                out.append((i * .01, j * .01))
            i = j
        else:
            i += 1
    return out, a * .01, b * .01


def locate(sents, x):
    """定出每句在录音里的 [开口, 收尾] 秒。按字数估每句结束时刻，再用动态规划挑出按顺序、靠近估计、又够长的停顿。
    返回 (spans, 最大偏差秒)。"""
    ps, t0, t1 = pauses(x)
    k = len(sents) - 1
    if k == 0:
        return [(t0, t1)], 0.0
    if len(ps) < k:
        return None, None
    lens = np.array([len(s) + 3 for s in sents], float)      # 句间气口按 3 个字算
    exp = t0 + (t1 - t0) * np.cumsum(lens)[:-1] / lens.sum()
    n = len(ps)
    mid = np.array([(a + b) / 2 for a, b in ps])
    dur = np.array([b - a for a, b in ps])
    cost = np.abs(exp[:, None] - mid[None, :]) - 2.0 * np.minimum(dur, .5)[None, :]   # 句末停顿比逗号长，长的优先
    best = np.full((k, n), np.inf)
    back = np.zeros((k, n), int)
    best[0] = cost[0]
    for i in range(1, k):
        run, arg = np.inf, -1
        for j in range(i, n):
            if best[i - 1, j - 1] < run:
                run, arg = best[i - 1, j - 1], j - 1
            best[i, j] = run + cost[i, j]
            back[i, j] = arg
    j = int(np.argmin(best[k - 1]))
    pick = [j]
    for i in range(k - 1, 0, -1):
        j = back[i, j]
        pick.append(j)
    pick = pick[::-1]
    spans, s = [], t0
    for p in pick:
        spans.append((s, ps[p][0]))
        s = ps[p][1]
    spans.append((s, t1))
    return spans, float(np.abs(mid[pick] - exp).max())


def trimmed(x):
    m = speech_mask(x)
    idx = np.flatnonzero(m)
    h = int(SR * .01)
    return x[max(0, idx[0] * h - int(SR * .02)):(idx[-1] + 1) * h + int(SR * .03)] if len(idx) else x


def rms(x):
    return float(np.sqrt((x ** 2).mean()) + 1e-9)


def patch(a, text, old_wav, out):
    """只重配改动的句子，原位换进旧录音。返回 (新录音, 计费字符, 说明)。定位不可靠或改动太多时不花钱，直接退出。"""
    meta = Path(str(old_wav) + '.json')
    if a.旧文本:
        old_text = Path(a.旧文本).read_text(encoding='utf-8').strip()
    elif meta.exists():
        old_text = json.loads(meta.read_text(encoding='utf-8'))['text']
    else:
        sys.exit(f'{old_wav} 旁边没有 .json，用 --旧文本 给出当时配音用的文本')
    old_s, new_s = sentences(old_text), sentences(text)
    x = load(old_wav)
    spans, err = locate(old_s, x)
    if spans is None or err > max(2.5, .08 * len(x) / SR):
        sys.exit(f'定位不到句子（偏差 {err} 秒），没有花钱。这章按 reference 04 第 4 节用逐字时间换，或写 --覆盖 整章重配')
    ops = [o for o in difflib.SequenceMatcher(None, old_s, new_s, autojunk=False).get_opcodes() if o[0] != 'equal']
    redo = set()
    if a.重配句:
        if old_s != new_s:
            sys.exit('--重配句 只在文本没变时用（同一句重新生成一遍）；文本改了就直接用 --基于')
        for n in sorted({int(x) for x in a.重配句.split(',')}):
            if not 1 <= n <= len(old_s):
                sys.exit(f'--重配句 {n} 超出范围（本章 {len(old_s)} 句）')
            ops.append(('replace', n - 1, n, n - 1, n)); redo.add(n - 1)
    for o in ops:                                   # 改动的句子和前后各一句，语速要正常，否则多半切错了位置，宁可不换
        for i in range(max(0, o[1] - 1), min(len(old_s), o[2] + 1)):
            r = len(old_s[i]) / max(spans[i][1] - spans[i][0], .01)
            if not 3.0 <= r <= 11.0:
                sys.exit(f'第 {i + 1} 句「{old_s[i][:14]}」定位可疑（每秒 {r:.1f} 字），没有花钱。这章按 reference 04 第 4 节用逐字时间换，或写 --覆盖 整章重配')
    changed = sum(len(s) for o in ops for s in new_s[o[3]:o[4]])
    if changed > .5 * len(text):
        sys.exit(f'改动 {changed}/{len(text)} 字，超过一半，没有花钱。整章重配请写 --覆盖 或换一个输出文件名（不写 --基于）')
    ref = rms(np.concatenate([x[int(s * SR):int(e * SR)] for s, e in spans]))
    pieces, cur, billed, notes = [], 0, 0, []
    for tag, i1, i2, j1, j2 in ops:
        a0 = int(spans[i1][0] * SR) if i1 < len(spans) else len(x)
        a1 = int(spans[i2 - 1][1] * SR) if i2 > i1 else a0
        seg = np.zeros(0, np.float32)
        if j2 > j1:
            block = ''.join(new_s[j1:j2])
            mp3, c = synth(block, a, out, salt=f'-r{int(time.time())}' if i1 in redo else '')
            billed += c
            tmp = Path(out).parent / 'api缓存' / (mp3.stem + '.wav')
            to_wav(mp3, tmp)
            seg = trimmed(load(tmp))
            seg = seg * float(np.clip(ref / rms(seg), 10 ** (-3 / 20), 10 ** (3 / 20)))
            f = min(int(SR * .005), len(seg) // 2)
            seg[:f] *= np.linspace(0, 1, f, dtype=np.float32)
            seg[-f:] *= np.linspace(1, 0, f, dtype=np.float32)
        if tag == 'insert':
            gap = np.zeros(int(SR * .4), np.float32)
            seg = np.concatenate([seg, gap])
        if tag == 'delete' and i2 < len(spans):
            a1 = int(spans[i2][0] * SR)
        pieces += [x[cur:a0], seg]
        cur = a1
        notes.append(f'{tag}：{"".join(old_s[i1:i2])[:18]} → {"".join(new_s[j1:j2])[:18]}')
    pieces.append(x[cur:])
    return np.concatenate(pieces), billed, notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('txt'); ap.add_argument('out')
    ap.add_argument('--voice', default=GOU); ap.add_argument('--speed', type=float, default=1.15)
    ap.add_argument('--tone', action='append', default=[], help='读音词典，如 町/(ding1)')
    ap.add_argument('--基于', dest='基于', help='旧录音：只重配改动的句子'); ap.add_argument('--旧文本', dest='旧文本', help='旧录音当时用的文本')
    ap.add_argument('--读音表', dest='读音表', help='本期读音表，默认自动找 配音/读音.tsv'); ap.add_argument('--不用词典', dest='不用词典', action='store_true')
    ap.add_argument('--重配句', dest='重配句', help='文本不变，重新生成第几句（从 1 数），如 7,12；要和 --基于 一起用')
    ap.add_argument('--覆盖', dest='覆盖', action='store_true', help='输出已存在时整章重配'); ap.add_argument('--只估价', dest='只估价', action='store_true')
    a = ap.parse_args()
    text = Path(a.txt).read_text(encoding='utf-8').strip()
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    meta = Path(str(out) + '.json')
    auto_pins = []
    if not a.不用词典:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import pron_lib
        r = pron_lib.analyze(text, pron_lib.load_table(a.读音表 or pron_lib.find_table(a.txt, out)))
        if r['todo']:
            for q in r['todo']:
                print(f'  待定[{q["kind"]}] {q["ctx"]}  → {q["hint"]}')
            sys.exit(f'还有 {len(r["todo"])} 处读音没定，没有花钱。先跑 读音预检.py，把读音写进本期 配音/读音.tsv')
        mine = {t.split('/')[0] for t in a.tone}
        auto_pins = [t for t in r['pins'] if t.split('/')[0] not in mine]
        a.tone = a.tone + auto_pins
        print(f'读音：钉 {len(a.tone)} 条（手写 {len(mine)}，词典/本期/自动 {len(auto_pins)}）')
    if a.重配句 and not a.基于:
        sys.exit('--重配句 要和 --基于 旧录音 一起用')
    fp = fingerprint(text, a.voice, a.speed, a.tone)
    est = len(re.findall(r'[一-鿿]', text)) * CHARS_PER_HANZI + len(re.findall(r'[^一-鿿]', text))
    if a.只估价:
        print(f'{len(text)} 字，整章约计费 {est:.0f} 字符 ≈ ${est * USD_PER_CHAR:.3f}（没有调用接口）')
        return
    if out.exists() and meta.exists() and json.loads(meta.read_text(encoding='utf-8')).get('fp') == fp and not a.重配句:
        print(f'没变，不扣费：{out}')
        return
    if out.exists() and not a.覆盖:
        sys.exit(f'{out} 已存在，文本可能变了，没有花钱。只改几句用 --基于 {out} 并换个输出文件名；整章重配写 --覆盖')
    if a.基于:
        if Path(a.基于).resolve() == out.resolve():
            sys.exit('--基于 的旧录音和输出不能是同一个文件（旧版要留着）')
        y, billed, notes = patch(a, text, a.基于, out)
        save(out, y)
        how = '改句'
        print('\n'.join(notes))
    else:
        mp3, billed = synth(text, a, out)
        to_wav(mp3, out)
        notes, how = [], '整章'
    sec = len(load(out)) / SR
    meta.write_text(json.dumps(dict(fp=fp, text=text, voice=a.voice, speed=a.speed, tone=a.tone, model=MODEL, how=how, billed=billed,
                                    seconds=round(sec, 2), based_on=a.基于, redo=a.重配句), ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'完成 {out}：{sec:.1f} 秒，本次计费 {billed} 字符 ≈ ${billed * USD_PER_CHAR:.3f}' + ('（全部来自缓存）' if not billed else ''))


if __name__ == '__main__':
    main()
