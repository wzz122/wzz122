# -*- coding: utf-8 -*-
"""定时间轴：把视频工厂 run.mjs「外部配音 + 对齐」出的分镜，转成 v6 画面要的时间轴 storyboard-audio.json。

一期的流程：稿子 md → MiniMax 配音「<文案名>.旁白.wav」→ 视频工厂 run.mjs 对齐（本期 工程/.work/storyboard.json，真实每句时间）
            → 本脚本 → 画面v6/工程/.work/storyboard-audio.json + 画面v6/声音/旁白.wav → 写镜头脚本 → 渲染 → 总装。
只用 Python 标准库 + numpy，不跑任何模型，不花钱，不改输入文件。

用法：
  python3 定时间轴.py 工厂分镜.json 输出目录 [--旁白 工厂narration.wav] [--旁白输出 画面v6/声音/旁白.wav] [--稿子 稿子.md]
                     [--保留片头] [--精剪 计划.json] [--生成精剪计划 计划.json]
  python3 定时间轴.py 已经是v6的storyboard-audio.json 输出目录 [--旁白 旁白.wav --旁白输出 …]      # 只核对、照抄（换期复用、自测）

三种做法：
  1 直接转（默认）：每屏一个镜头，stable_id 按稿内顺序编号 S01、S02…；片头静止屏（工厂默认 3.2 秒，不念旁白）默认去掉，
    整条旁白同步剪掉开头这 3.2 秒（--保留片头 则留下，编号 S00）；镜头边界吸附到 1/30 秒帧边界（向前取整：镜头一定在它第一句开口之前或同一帧开始）；
    beats（每句旁白的 t0/t1、文字）原样保留，只整体平移；最后核对 各镜头帧数之和 = 总帧数。
  2 精剪（--精剪 计划.json）：照 USJ 整改v5/剪辑v5.py 的做法，按计划逐句剪旁白——可以删句、调顺序、一屏拆几个镜头、收紧句间停顿；
    每个镜头的旁白片段补零到整帧（48k ÷ 30 = 1600 采样点），所以镜头边界天然在帧上；末尾加 尾帧（默认 36 帧 = 1.2 秒）。
    计划格式：{"镜头": [{"镜头号": "S02", "章号": 1, "句": [[1, 4]]}, {"镜头号": "S04", "章号": 2, "句": [[12, 13], [15, 16]]}, …],
              "尾帧": 36, "meta": {"title": "…"}}；「句」是直接转之后的句号（original_beat），区间两头都含。
    要用工厂对齐时的 audio/aligned.json（每句真正开口、收口的时刻），和工厂分镜在同一个 .work 里。
    --生成精剪计划 计划.json：按直接转的结果写一份起点计划（每屏一个镜头、整屏的句子），在上面删改就行。
  3 照抄：输入已经是 v6 时间轴（beats 带 original_beat、镜头带 stable_id）时只核对帧边界和总帧数，原样写出。

输出（输出目录里，通常是 画面v6/工程/.work/）：
  storyboard-audio.json   v6 时间轴，结构与 USJ 整改v5 的那份一致：meta / scenes[stable_id, chapter, no, t0, t1, x, y, camera, camEnd,
                          elements(空), original_ranges] / beats[original_beat, scene, say, tts, show(空), t0, t1]
  时间轴-屏信息.json       每个镜头的屏标题、版式、稿子行号与原文、每句时刻（新建一期.py 拿它写镜头脚本骨架）
  时间轴-报告.txt          镜头数、句数、总帧数、每镜时长、被并掉的空屏
  --旁白输出 写出与时间轴对齐的整条旁白（48 kHz 单声道 16 bit）
"""
import argparse
import json
import math
import re
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

FPS, SR = 30, 48000
SPF = SR // FPS                                         # 每帧 1600 个采样点
CAM = {'cx': 960, 'cy': 504, 'zoom': 1}


def die(msg):
    print('[定时间轴 失败] ' + msg, file=sys.stderr)
    sys.exit(1)


def floor_frame(t):
    return math.floor(t * FPS + 1e-6)


# ---------------------------------------------------------------- 旁白读写（48 kHz 单声道 16 bit）
def read_pcm16(p: Path) -> np.ndarray:
    p = Path(p)
    if p.is_symlink() and not p.exists():
        die(f'旁白是指向外置盘的链接，目标不可读（SSD 没挂载？）：{p}')
    if not p.is_file():
        die(f'缺旁白：{p}')
    try:
        with wave.open(str(p), 'rb') as r:
            if (r.getnchannels(), r.getsampwidth(), r.getframerate()) == (1, 2, SR):
                return np.frombuffer(r.readframes(r.getnframes()), dtype='<i2').copy()
    except wave.Error:
        pass
    import imageio_ffmpeg                                 # 不是 48k 单声道 16 bit：用 ffmpeg 转一遍（只读原文件）
    raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(p), '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<i2').copy()


def write_pcm16(p: Path, a: np.ndarray):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + '.tmp')
    with wave.open(str(tmp), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(np.asarray(a, dtype='<i2').tobytes())
    tmp.replace(p)


# ---------------------------------------------------------------- 识别输入
def is_v6(b):
    sc, be = b.get('scenes') or [], b.get('beats') or []
    return bool(sc) and all('stable_id' in s for s in sc) and all('original_beat' in x for x in be) \
        and all(not s.get('elements') for s in sc)


def find_cover(b):
    """工厂分镜第 0 屏是片头（chapter 为 false/空、只有空旁白句）就返回 True。"""
    sc = b['scenes']
    if len(sc) < 2 or sc[0].get('chapter'):
        return False
    bs = [x for x in b['beats'] if x['scene'] == 0]
    return all(not (x.get('say') or '').strip() for x in bs)


# ---------------------------------------------------------------- 1 直接转
def convert(src, keep_cover=False):
    scenes, beats = src['scenes'], src['beats']
    cover = find_cover(src)
    offset = scenes[1]['t0'] if (cover and not keep_cover) else 0.0      # 去片头：整体前移这么多秒（旁白同步剪掉）
    first_out = 1 if (cover and not keep_cover) else 0
    dur = float(src['meta']['duration']) - offset
    N = round(dur * FPS)
    # 每屏的起点 → 帧（向前取整），终点 = 下一屏起点；最后一屏到 N
    keep = list(range(first_out, len(scenes)))
    starts = [0 if k == first_out else floor_frame(scenes[i]['t0'] - offset) for k, i in enumerate(keep, first_out)]
    bounds = starts + [N]
    dropped, out_idx = [], {}
    sc_out = []
    for k, i in enumerate(keep):
        f0, f1 = bounds[k], bounds[k + 1]
        s = scenes[i]
        if f1 <= f0:                                         # 只有标题、没有旁白的屏：外部配音模式下时长是 0，并掉
            dropped.append(dict(屏=i, 标题=(s.get('src') or {}).get('head', ''), 章=s.get('chapter')))
            continue
        out_idx[i] = len(sc_out)
        is_cov = cover and i == 0
        sc_out.append(dict(_src=i, _f0=f0, _f1=f1, chapter='片头' if is_cov else (s.get('chapter') or ''),
                           no=0 if is_cov else int(s.get('no') or 0)))
    # 被并掉的屏：它的（空）句子归到下一个留下的镜头（没有就上一个）
    def owner(i):
        j = i
        while j < len(scenes) and j not in out_idx:
            j += 1
        if j >= len(scenes):
            j = i
            while j >= 0 and j not in out_idx:
                j -= 1
        return out_idx[j]
    # 编号：片头 S00；其余按稿内顺序 S01、S02…
    n = 0
    for s in sc_out:
        if cover and keep_cover and s['_src'] == 0:
            s['stable_id'] = 'S00'
        else:
            n += 1
            s['stable_id'] = f'S{n:02d}'
    be_out, num = [], 0
    for x in beats:
        if x['scene'] < first_out:
            continue
        is_cov_beat = cover and keep_cover and x['scene'] == 0
        if not is_cov_beat:
            num += 1
        be_out.append(dict(original_beat=0 if is_cov_beat else num, scene=owner(x['scene']), say=re.sub(r'\*\*|==', '', x.get('say') or '').strip(),   # 2026-10-27：去掉稿里的 **加粗** ==荧光== 标记（否则字幕里出现 **）
                           tts=x.get('tts') or x.get('say') or '', show=[], t0=x['t0'] - offset, t1=x['t1'] - offset))
    meta = dict(channel=src['meta'].get('channel', ''), series=src['meta'].get('series', ''), title=src['meta'].get('title', ''),
                vw=1920, vh=1008, duration=N / FPS, revision='v6-时间轴', voice='外部配音（视频工厂对齐）')
    scenes_v6 = []
    for k, s in enumerate(sc_out):
        nums = [b['original_beat'] for b in be_out if b['scene'] == k and b['original_beat'] > 0]
        scenes_v6.append(dict(stable_id=s['stable_id'], chapter=s['chapter'], no=s['no'], t0=s['_f0'] / FPS, t1=s['_f1'] / FPS,
                              x=0, y=0, camera=dict(CAM), camEnd=dict(CAM), elements=[],
                              original_ranges=[[min(nums), max(nums)]] if nums else []))
    out = dict(meta=meta, scenes=scenes_v6, beats=be_out)
    info = dict(offset=offset, cover=cover, keep_cover=keep_cover, dropped=dropped, src_index=[s['_src'] for s in sc_out])
    return out, info


# ---------------------------------------------------------------- 2 精剪（剪辑v5.py 的通用版）
def fine_cut(src, base, plan, raw, aligned, info):
    """按计划逐句剪旁白。raw = 工厂 narration（未去片头，int16）；aligned = 工厂 audio/aligned.json 的 lines（每句真正开口/收口，
    时间相对补过停顿的配音，工厂 narration 里要加上第一句的起点 voice0）。"""
    said = [x for x in src['beats'] if (x.get('say') or '').strip()]
    if len(said) != len(aligned):
        die(f'aligned.json 有 {len(aligned)} 句，工厂分镜有 {len(said)} 句有旁白，对不上（是不是同一次对齐的产物？）')
    voice0 = said[0]['t0']                              # 工厂 narration 里配音开始的秒数（= 片头停留，默认 3.2）
    # 直接转后的句号（original_beat）→ aligned 里第几句
    num2line, k = {}, 0
    for b in base['beats']:
        if (b['say'] or '').strip() and b['original_beat'] > 0:
            num2line[b['original_beat']] = k
            k += 1
    lines = aligned
    by_num = {b['original_beat']: b for b in base['beats'] if b['original_beat'] > 0}
    scenes, beats, audio, edl, pos = [], [], [], [], 0
    used = set()
    for shot in plan['镜头']:
        ident = shot['镜头号']
        local, parts, spans, offset = [], [], [], 0
        for a, z in shot['句']:
            if a > z:
                die(f'{ident} 句区间 [{a}, {z}] 写反了')
            for j in range(a, z + 1):
                if j not in num2line:
                    die(f'{ident} 的第 {j} 句不存在或是空句（句号按直接转之后的 original_beat）')
                if j in used:
                    print(f'[提示] 第 {j} 句在计划里用了两次（{ident}）')
                used.add(j)
            ia, iz = num2line[a], num2line[z]
            first, last = lines[ia], lines[iz]
            pre = (first['t0'] - lines[ia - 1]['t1']) / 2 if ia > 0 else .1
            post = (lines[iz + 1]['t0'] - last['t1']) / 2 if iz + 1 < len(lines) else .32
            t0 = voice0 + first['t0'] - min(.14, max(0, pre))
            t1 = voice0 + last['t1'] + min(.34, max(.09, post))
            clip = raw[round(t0 * SR):round(t1 * SR)].copy()
            edge = min(240, len(clip) // 2)                 # 5 ms 淡入淡出，切点不爆音
            clip[:edge] = (clip[:edge] * np.linspace(0, 1, edge)).astype('<i2')
            clip[-edge:] = (clip[-edge:] * np.linspace(1, 0, edge)).astype('<i2')
            parts.append(clip)
            spans.append(dict(beats=[a, z], source_t0=t0, source_t1=t1, local_t0=offset / SR))
            for j in range(a, z + 1):
                ln = lines[num2line[j]]
                bj = by_num[j]
                local.append(dict(original_beat=j, scene=len(scenes), say=bj['say'], tts=bj['tts'], show=[],
                                  t0=offset / SR + ln['t0'] + voice0 - t0, t1=offset / SR + ln['t1'] + voice0 - t0))
            offset += len(clip)
        frames = math.ceil(offset / SPF)
        chunk = np.pad(np.concatenate(parts), (0, frames * SPF - offset))
        start, end = pos / SR, (pos + len(chunk)) / SR
        for x in local:
            x['t0'] += start
            x['t1'] += start
        # 章名：这个镜头第一句所在的工厂屏的章名；章号：计划里写了就用计划的
        b0 = by_num[shot['句'][0][0]]
        base_sc = base['scenes'][b0['scene']]
        no = int(shot.get('章号', base_sc['no']))
        scenes.append(dict(stable_id=ident, chapter=shot.get('章名', base_sc['chapter']), no=no, t0=start, t1=end, x=0, y=0,
                           camera=dict(CAM), camEnd=dict(CAM), elements=[], original_ranges=[list(r) for r in shot['句']]))
        beats += local
        audio.append(chunk)
        edl.append(dict(id=ident, chapter=no, t0=start, t1=end, frames=frames, spans=spans))
        pos += len(chunk)
    tail = int(plan.get('尾帧', 36))                          # 最后一句后留一点（默认 1.2 秒），音乐自然收
    extra = tail * SPF
    audio[-1] = np.pad(audio[-1], (0, extra))
    pos += extra
    scenes[-1]['t1'] = pos / SR
    edl[-1]['t1'] = pos / SR
    edl[-1]['frames'] += tail
    ids = [s['stable_id'] for s in scenes]
    if len(ids) != len(set(ids)):
        die('计划里镜头号重复：' + '、'.join(sorted({x for x in ids if ids.count(x) > 1})))
    meta = dict(base['meta'])
    meta.update(duration=pos / SR, revision='v6-精剪', voice='外部配音（视频工厂对齐）· 逐句精剪')
    meta.update(plan.get('meta') or {})
    out = dict(meta=meta, scenes=scenes, beats=beats)
    unused = sorted(set(num2line) - used)
    return out, np.concatenate(audio), edl, unused


# ---------------------------------------------------------------- 核对
def check(out):
    sc, be = out['scenes'], out['beats']
    N = round(out['meta']['duration'] * FPS)
    probs = []
    if abs(sc[0]['t0']) > 1e-9:
        probs.append(f'第一个镜头不是从 0 开始（{sc[0]["t0"]}）')
    for a, b in zip(sc, sc[1:]):
        if abs(a['t1'] - b['t0']) > 1e-9:
            probs.append(f'{a["stable_id"]} 结束 {a["t1"]:.4f} ≠ {b["stable_id"]} 开始 {b["t0"]:.4f}')
    for s in sc:
        for k in ('t0', 't1'):
            if abs(s[k] * FPS - round(s[k] * FPS)) > 1e-4:          # 6 位小数的时间（加喘气.py 写出）误差约 1.5e-5 帧
                probs.append(f'{s["stable_id"]} {k}={s[k]} 不在帧边界上')
        if round(s['t1'] * FPS) - round(s['t0'] * FPS) < 1:
            probs.append(f'{s["stable_id"]} 不到 1 帧')
    tot = sum(round(s['t1'] * FPS) - round(s['t0'] * FPS) for s in sc)
    if tot != N:
        probs.append(f'各镜头帧数之和 {tot} ≠ 总帧数 {N}')
    if any(be[i]['scene'] > be[i + 1]['scene'] for i in range(len(be) - 1)):
        probs.append('beats 的镜头下标不是从小到大（镜头顺序和句子顺序对不上）')
    if len({s['stable_id'] for s in sc}) != len(sc):
        probs.append('stable_id 有重复')
    return N, tot, probs


def screen_info(out, src, info, md_lines):
    """每个镜头：屏标题、版式、稿子行号与原文、每句（镜头内）时刻。"""
    res = []
    for k, s in enumerate(out['scenes']):
        d = dict(镜头号=s['stable_id'], 章号=s['no'], 章名=s['chapter'], 时长=round(s['t1'] - s['t0'], 3),
                 帧数=round(s['t1'] * FPS) - round(s['t0'] * FPS), 全片起点=round(s['t0'], 3))
        si = (info.get('src_index') or [None] * len(out['scenes']))[k] if info else None
        if si is not None and src is not None:
            sr = src['scenes'][si].get('src') or {}
            d.update(屏标题=sr.get('head', ''), 版式=sr.get('layout', ''), 版式内容=sr.get('items', []))
            if 'l0' in sr and md_lines is not None:
                l0, l1 = int(sr['l0']), int(sr['l1'])
                d['稿子行号'] = [l0 + 1, l1]
                d['稿子原文'] = [x for x in md_lines[l0:l1] if x.strip() and x.strip() != '---' and not x.startswith('## ')]
        d['句'] = [dict(句号=b['original_beat'], t0=round(b['t0'] - s['t0'], 3), t1=round(b['t1'] - s['t0'], 3), 旁白=b['say'])
                  for b in out['beats'] if b['scene'] == k]
        res.append(d)
    return res


def main():
    ap = argparse.ArgumentParser(description='工厂对齐分镜 → v6 时间轴 storyboard-audio.json')
    ap.add_argument('src', help='视频工厂对齐后的 .work/storyboard.json（或已经是 v6 的 storyboard-audio.json）')
    ap.add_argument('out_dir', help='输出目录（通常 画面v6/工程/.work）')
    ap.add_argument('--旁白', dest='narr', default=None, help='与输入分镜对齐的整条旁白（默认 = 工厂分镜旁边的 narration.wav）')
    ap.add_argument('--旁白输出', dest='narr_out', default=None, help='写出与新时间轴对齐的旁白（通常 画面v6/声音/旁白.wav）')
    ap.add_argument('--稿子', dest='md', default=None, help='稿子 md（屏信息里带上每屏原文，写镜头脚本骨架用）')
    ap.add_argument('--保留片头', dest='keep_cover', action='store_true', help='保留工厂的片头静止屏（编号 S00），默认去掉')
    ap.add_argument('--精剪', dest='plan', default=None, help='精剪计划 json（见文件开头）')
    ap.add_argument('--生成精剪计划', dest='plan_out', default=None, help='按直接转的结果写一份起点计划')
    a = ap.parse_args()
    src_p = Path(a.src).resolve()
    out_dir = Path(a.out_dir).resolve()
    if not src_p.is_file():
        die(f'缺输入分镜：{src_p}')
    src = json.loads(src_p.read_text(encoding='utf-8'))
    md_lines = Path(a.md).read_text(encoding='utf-8').split('\n') if a.md else None
    narr_in = Path(a.narr).resolve() if a.narr else src_p.parent / 'narration.wav'
    report, info, edl, unused, audio_out = [], {}, None, [], None

    if is_v6(src):                                           # 3 照抄
        out = src
        mode = '照抄（输入已是 v6 时间轴）'
        if a.narr_out:
            if not a.narr:
                die('照抄模式要写旁白，请用 --旁白 指明这条时间轴对应的旁白 wav')
            audio_out = read_pcm16(narr_in)
        src_for_info = None
    else:                                                    # 1 直接转
        if not src.get('beats') or not src.get('scenes'):
            die('输入里没有 scenes / beats，不像视频工厂的分镜')
        out, info = convert(src, keep_cover=a.keep_cover)
        mode = '直接转' + ('（保留片头 S00）' if a.keep_cover else ('（去掉片头 %.2f 秒）' % info['offset'] if info['offset'] else ''))
        src_for_info = src
        if a.plan_out:
            plan = dict(说明='每个镜头一行：镜头号、章号、句（直接转之后的句号区间，两头都含）。删句、调顺序、拆镜头都在这里改；'
                           '尾帧 = 最后一句后留几帧（30 帧 = 1 秒）。改完：python3 定时间轴.py 工厂分镜.json 输出目录 --精剪 本文件 --旁白输出 …',
                        尾帧=36,
                        镜头=[dict(镜头号=s['stable_id'], 章号=s['no'], 句=s['original_ranges']) for s in out['scenes'] if s['original_ranges']])
            Path(a.plan_out).parent.mkdir(parents=True, exist_ok=True)
            Path(a.plan_out).write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding='utf-8')
            print(f'起点精剪计划：{a.plan_out}（{len(plan["镜头"])} 个镜头）')
        if a.plan:                                           # 2 精剪
            al_p = src_p.parent / 'audio' / 'aligned.json'
            if not al_p.is_file():
                die(f'精剪要用对齐时的 {al_p}（每句真正开口、收口的时刻），没找到')
            aligned = json.loads(al_p.read_text(encoding='utf-8'))['lines']
            plan = json.loads(Path(a.plan).read_text(encoding='utf-8'))
            raw = read_pcm16(narr_in)
            base = out
            out, audio_out, edl, unused = fine_cut(src, base, plan, raw, aligned, info)
            mode = f'精剪（计划 {Path(a.plan).name}，{len(out["scenes"])} 个镜头）'
            src_for_info, info = None, {}
        elif a.narr_out:
            raw = read_pcm16(narr_in)
            cut = round(info['offset'] * SR)
            audio_out = raw[cut:]
            report.append(f'旁白：{narr_in} 去掉开头 {info["offset"]:.3f} 秒（{cut} 个采样点）')

    N, tot, probs = check(out)
    if probs:
        die('时间轴核对没过：\n  ' + '\n  '.join(probs))
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'storyboard-audio.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    (out_dir / '时间轴-屏信息.json').write_text(json.dumps(screen_info(out, src_for_info, info, md_lines), ensure_ascii=False, indent=1),
                                            encoding='utf-8')
    if edl is not None:
        (out_dir / '精剪清单.json').write_text(json.dumps(edl, ensure_ascii=False, indent=2), encoding='utf-8')
    if audio_out is not None:
        need = N * SPF
        if len(audio_out) < need - SR // 2:
            report.append(f'⚠️ 旁白比时间轴短 {(need - len(audio_out)) / SR:.2f} 秒（总装会补静音；差得多就是旁白和分镜不是一套）')
        elif len(audio_out) > need + SR:
            report.append(f'⚠️ 旁白比时间轴长 {(len(audio_out) - need) / SR:.2f} 秒（多出来的总装不用）')
        write_pcm16(Path(a.narr_out), audio_out)
        report.append(f'旁白写出：{a.narr_out}（{len(audio_out) / SR:.3f} 秒）')
    durs = [round(s['t1'] - s['t0'], 2) for s in out['scenes']]
    head = (f'{mode}：{len(out["scenes"])} 个镜头，{len(out["beats"])} 句，总 {N} 帧 = {N / FPS:.3f} 秒（帧数之和 {tot}，核对通过）；'
            f'镜头时长 {min(durs):.2f}–{max(durs):.2f} 秒，中位 {sorted(durs)[len(durs) // 2]:.2f} 秒')
    lines = [head] + report
    if info.get('dropped'):
        lines.append('并掉的空屏（没有旁白，时长 0）：' + '；'.join(f'第{d["屏"]}屏「{d["标题"]}」' for d in info['dropped']))
    if unused:
        lines.append(f'精剪计划没用到的句子 {len(unused)} 句：{unused[:40]}{"…" if len(unused) > 40 else ""}')
    lines.append('镜头：' + '  '.join(f'{s["stable_id"]} {s["t1"] - s["t0"]:.2f}s' for s in out['scenes']))
    (out_dir / '时间轴-报告.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('\n'.join(lines[:-1]))
    print(f'写出：{out_dir / "storyboard-audio.json"}')


if __name__ == '__main__':
    main()
