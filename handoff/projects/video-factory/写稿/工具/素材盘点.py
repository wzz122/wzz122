# -*- coding: utf-8 -*-
"""素材盘点（2026-10-20 把夕张、311 两期手工做的选片准备固化）：给一个日期范围，把这几天的相机、手机、Sony 素材一次理清。

做的事（不改原片、不花钱）：
  1 DJI：从素材索引里取这几天的片段，用代理 LRF 每段抽 4 帧（8%/35%/65%/92%），每 12 段拼一张总览图，记代理时长
  2 手机：读照片库定位导出（手机图库定位与视频.json），按「1 公里内、1 小时内」聚成到访点，写地址
  3 Sony：扫 Sony 备份里 EXIF 拍摄日期在范围内的 ARW/JPG，导缩略图、拼总览图（photoinfo）
  4 每段 DJI 配上时间最近的手机定位（≤ 15 分钟才算）
  5 YOLO 人体检测（~/.venvs/av）跑全部抽帧和 Sony 缩略图，标出有人的帧（检测器会漏，最后仍要人眼看）
  6 写 选片表草稿.md：每段一行，「画面内容 / 可用度 / 用在哪」留空，看总览图后补

用法：
  python3 工具/素材盘点.py 2025-12-30 [2025-12-31] -o 资料/<期>/素材盘点 [--前缀 DB] [--不抽帧] [--不跑YOLO]
  （YOLO 是模型任务：Bash 钩子自动套内存锁；不要自己再包 mac-heavy-job，会死锁）
默认数据源（可用参数改）：
  --索引  ~/Desktop/写稿/资料/2026-10-夕张与东北视频整理/04-给Claude-索引数据.json
  --手机  /Users/wzz122/Movies/Codex剪辑/夕张与东北_素材整理_20261017/analysis/手机图库定位与视频.json
  --sony  "/Volumes/Extreme SSD/Sony A7M4 原片备份"
手机原图在 iCloud 照片库：要导出用 工具/照片导出.py（需要先给 Claude 完全磁盘访问权限，见那个脚本的说明）。
"""
import argparse, datetime as dt, glob, json, math, os, re, subprocess, sys
from pathlib import Path

HOME = Path.home()
TOOLS = Path(__file__).resolve().parent
VENV_PY = HOME / '.venvs/av/bin/python'
YOLO = HOME / 'Desktop/视频工厂/模板-v6/实拍/工具/yolo人检.py'
try:
    import imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FF = str(HOME / 'bin/ffmpeg')


def T(s):
    return dt.datetime.strptime(s[:19].replace(':', '-', 2) if s[4] == ':' else s[:19], '%Y-%m-%d %H:%M:%S')


def km(a, b):
    return math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 111 * math.cos(math.radians(a[0])))


def sheet(items, out, cols=4, w=320, h=180, label_w=110):
    """items: [(标签, [图路径…])]，每行一个素材。"""
    from PIL import Image, ImageDraw, ImageFont
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', 20)
    except Exception:
        font = ImageFont.load_default()
    im = Image.new('RGB', (label_w + cols * (w + 6), (h + 6) * len(items)), 'white')
    d = ImageDraw.Draw(im)
    for r, (lab, fs) in enumerate(items):
        y = r * (h + 6)
        d.text((4, y + h // 2 - 20), lab, fill='black', font=font)
        for i, f in enumerate(fs[:cols]):
            if not os.path.exists(f):
                continue
            t = Image.open(f); t.thumbnail((w, h))
            im.paste(t, (label_w + i * (w + 6), y))
    im.save(out, quality=80)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('从'); ap.add_argument('到', nargs='?')
    ap.add_argument('-o', '--out', required=True)
    ap.add_argument('--索引', default=str(HOME / 'Desktop/写稿/资料/2026-10-夕张与东北视频整理/04-给Claude-索引数据.json'))
    ap.add_argument('--手机', default='/Users/wzz122/Movies/Codex剪辑/夕张与东北_素材整理_20261017/analysis/手机图库定位与视频.json')
    ap.add_argument('--sony', default='/Volumes/Extreme SSD/Sony A7M4 原片备份')
    ap.add_argument('--前缀', default='')
    ap.add_argument('--不抽帧', action='store_true'); ap.add_argument('--不跑YOLO', action='store_true')
    a = ap.parse_args()
    d0 = a.从; d1 = a.到 or a.从
    inr = lambda s: d0 <= s[:10].replace(':', '-') <= d1
    O = Path(a.out).expanduser().resolve(); (O / '抽帧').mkdir(parents=True, exist_ok=True)

    # 2 手机定位 → 到访点
    phone = []
    if os.path.exists(a.手机):
        phone = [p for p in json.load(open(a.手机)) if inr(p['capture_time'])]
    gps = sorted([p for p in phone if p['latitude'] > -180], key=lambda p: p['capture_time'])
    clusters = []
    for p in gps:
        xy = (p['latitude'], p['longitude'])
        if clusters and km(clusters[-1]['c'], xy) < 1 and (T(p['capture_time']) - T(clusters[-1]['t1'])).total_seconds() < 3600:
            c = clusters[-1]; c['n'] += 1; c['t1'] = p['capture_time']; c['v'] += p['kind']; c['a'] = c['a'] or p['address']
        else:
            clusters.append(dict(c=xy, t0=p['capture_time'], t1=p['capture_time'], n=1, v=p['kind'], a=p['address']))

    # 1 DJI
    idx = json.load(open(os.path.expanduser(a.索引)))['clips'] if os.path.exists(os.path.expanduser(a.索引)) else []
    dji = [x for x in idx if x['source_type'].startswith('DJI') and inr(x['capture_time']) and x['clip_id'].startswith(a.前缀)]
    meta = {}
    for x in dji:
        cid, p = x['clip_id'], x.get('proxy_path')
        r = subprocess.run([FF, '-hide_banner', '-i', p], capture_output=True, text=True).stderr if p else ''
        m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r)
        dur = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 0
        fr = []
        if not a.不抽帧 and dur:
            for i, f in enumerate((.08, .35, .65, .92)):
                o = O / '抽帧' / f'{cid}_{i}.jpg'
                if not o.exists():
                    subprocess.run([FF, '-v', 'error', '-ss', str(dur * f), '-i', p, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', str(o)])
                fr.append(str(o))
        t = T(x['capture_time'])
        near = min((q for q in gps if q['address']), key=lambda q: abs((T(q['capture_time']) - t).total_seconds()), default=None)   # 最近一张有地址的
        gap = abs((T(near['capture_time']) - t).total_seconds()) if near else None
        place = near['address'].replace('日本', '') if near and gap <= 900 else ''
        if not place:                                   # 退一步：落在某个到访点前后 15 分钟内，就用那个到访点的地址
            for c in clusters:
                if (T(c['t0']) - dt.timedelta(minutes=15)) <= t <= (T(c['t1']) + dt.timedelta(minutes=15)) and c['a']:
                    place = '≈' + c['a'].replace('日本', ''); break
        meta[cid] = dict(time=x['capture_time'], file=x['filename'], dur=round(dur, 1), frames=fr, place=place, gap=gap)
        print(cid, meta[cid]['dur'], meta[cid]['place'][:30], flush=True)
    ids = sorted(meta)
    for k in range(0, len(ids), 12):
        sheet([(c, meta[c]['frames']) for c in ids[k:k + 12]], O / f'DJI总览_{k // 12 + 1:02d}.jpg')

    # 3 Sony
    sony = []
    if os.path.isdir(a.sony):
        days = [d0] if d0 == d1 else [str((dt.date.fromisoformat(d0) + dt.timedelta(n))) for n in range((dt.date.fromisoformat(d1) - dt.date.fromisoformat(d0)).days + 1)]
        cands = sorted({f for day in days for f in glob.glob(f'{a.sony}/**/{day}*/*.ARW', recursive=True)})
        if cands:
            r = subprocess.run([str(TOOLS / 'photoinfo'), str(O / 'sony缩略图'), '360'] + cands, capture_output=True, text=True).stdout
            for ln in r.strip().splitlines():
                f, tm, la, lo, th = ln.split('\t')
                if tm != '-' and inr(tm):
                    sony.append(dict(file=f, time=tm.replace(':', '-', 2), thumb=th))
        sony.sort(key=lambda s: s['time'])
        for k in range(0, len(sony), 36):
            grp = sony[k:k + 36]
            sheet([(f"{grp[i]['time'][11:16]}", [g['thumb'] for g in grp[i:i + 6]]) for i in range(0, len(grp), 6)], O / f'Sony总览_{k // 36 + 1:02d}.jpg', cols=6, w=240, h=170, label_w=70)

    # 5 YOLO
    yolo = {}
    imgs = [f for c in ids for f in meta[c]['frames']] + [s['thumb'] for s in sony]
    if imgs and not a.不跑YOLO and VENV_PY.exists():
        r = subprocess.run([str(VENV_PY), str(YOLO)] + imgs, capture_output=True, text=True).stdout
        for ln in r.strip().splitlines():
            f, n, *_ = ln.split('\t')
            yolo[f] = int(n)

    # 6 写草稿
    L = [f'# 素材盘点 {d0}' + (f' ～ {d1}' if d1 != d0 else ''), '',
         f'{dt.datetime.now():%Y-%m-%d %H:%M} · 工具/素材盘点.py 自动生成。「画面内容 / 可用度 / 用在哪」看总览图后补；有人 = YOLO 检出人的帧（0–3 = 8%/35%/65%/92%），检测器会漏，仍要人眼看。', '',
         '## 到访点（手机定位聚类）', '', '| 时间 | 张数 | 视频 | 坐标 | 地址 |', '|---|---|---|---|---|']
    for c in clusters:
        L.append(f"| {c['t0'][5:16]}–{c['t1'][11:16]} | {c['n']} | {c['v']} | {c['c'][0]:.4f},{c['c'][1]:.4f} | {c['a'].replace('日本', '')} |")
    L += ['', f'## DJI（{len(ids)} 段，代理合计 {sum(meta[c]["dur"] for c in ids) / 60:.1f} 分钟；总览图 DJI总览_*.jpg）', '',
          '| 编号 | 时间 | 时长 | 最近定位 | 有人（帧） | 画面内容 | 可用度 | 用在哪 |', '|---|---|---|---|---|---|---|---|']
    for c in ids:
        hit = [str(i) for i, f in enumerate(meta[c]['frames']) if yolo.get(f)]
        L.append(f"| {c} | {meta[c]['time'][11:]} | {meta[c]['dur']} | {meta[c]['place'][:24]} | {','.join(hit) or '—'} |  |  |  |")
    if sony:
        L += ['', f'## Sony（{len(sony)} 张；总览图 Sony总览_*.jpg）', '', '| 文件 | 时间 | 有人 |', '|---|---|---|']
        for s in sony:
            L.append(f"| {s['file']} | {s['time'][11:16]} | {yolo.get(s['thumb'], '—') or '—'} |")
    (O / '选片表草稿.md').write_text('\n'.join(L) + '\n', encoding='utf-8')
    json.dump(dict(dji=meta, sony=sony, clusters=clusters, yolo=yolo), open(O / '盘点.json', 'w'), ensure_ascii=False, indent=1)
    print('写好', O / '选片表草稿.md')


if __name__ == '__main__':
    main()
