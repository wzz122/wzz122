# -*- coding: utf-8 -*-
"""现地素材分镜（2026-10-28）：把出门拍回来的视频/照片，按拍摄位置自动分到「拍摄点位」，对应到镜头。

为什么要轨迹：DJI Osmo Pocket 3 本身没有 GPS（官方参数页只有 Wi-Fi、蓝牙），视频里一般不带位置。
所以位置有两个来源，按顺序取：
  ① 文件自带的位置（手机拍的照片/视频、连着 DJI Mimo 时可能写进去的 location 标签）
  ② 手机记录的轨迹 GPX：按每段素材「拍摄时间的中点」在轨迹里插值出位置
然后找最近的拍摄点位（在半径内才算），输出分镜表、按点位分好的文件夹（只建链接，不复制、不改原文件）和一张缩略图总览。

用法：
  python3 ~/Desktop/写稿/工具/现地素材分镜.py <素材文件夹> --点位 <拍摄点位.json> [--gpx 轨迹.gpx ...] [--时差 秒] [--输出 文件夹]
    --时差：相机时钟比手机慢了几秒就写正数（拍摄前对着手机时钟拍 3 秒，回来对一下就知道）；Pocket 3 连过 Mimo 一般已同步，写 0
    --时区：相机写的时间若是本地时间却标成 UTC（DJI 常见），用 --相机时间是本地 让工具按 +09:00 处理
例：
  python3 ~/Desktop/写稿/工具/现地素材分镜.py ~/Desktop/拍摄/2026-11-02-日本桥 \
      --点位 ~/Desktop/写稿/资料/2026-10-日本桥/素材/拍摄点位.json --gpx ~/Desktop/拍摄/2026-11-02-日本桥/轨迹.gpx --相机时间是本地
输出（默认 <素材文件夹>/_分镜/）：素材分镜表.md、素材分镜表.json、按点位/<点位名>/（软链接）、缩略图总览.jpg
不跑模型；只用 ffmpeg 读元数据、取一帧缩略图。
"""
import argparse, bisect, datetime as dt, json, math, os, re, subprocess, sys
import xml.etree.ElementTree as ET
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont, ExifTags

FF = imageio_ffmpeg.get_ffmpeg_exe()
VID = {'.mp4', '.mov', '.m4v', '.mts', '.lrv'}
PIC = {'.jpg', '.jpeg', '.png', '.heic', '.dng'}
JST = dt.timezone(dt.timedelta(hours=9))


def haversine(a, b):
    R = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def ffmeta(p):
    """ffmpeg -i 的输出里取 creation_time、时长、ISO6709 位置。"""
    t = subprocess.run([FF, '-hide_banner', '-i', str(p)], capture_output=True, text=True, errors='ignore').stderr
    m = re.search(r'creation_time\s*:\s*(\S+)', t)
    d = re.search(r'Duration: (\d+):(\d+):([\d.]+)', t)
    loc = re.search(r'(?:location|ISO6709)[^:]*:\s*([+-]\d+\.\d+)([+-]\d+\.\d+)', t)
    dur = int(d[1]) * 3600 + int(d[2]) * 60 + float(d[3]) if d else 0.0
    ct = dt.datetime.fromisoformat(m[1].replace('Z', '+00:00')) if m else None
    gps = (float(loc[1]), float(loc[2])) if loc else None
    return ct, dur, gps


def exif(p):
    try:
        im = Image.open(p); ex = im.getexif()
    except Exception:
        return None, None
    tags = {ExifTags.TAGS.get(k, k): v for k, v in ex.items()}
    ct = None
    s = tags.get('DateTime')
    if s:
        try:
            ct = dt.datetime.strptime(s, '%Y:%m:%d %H:%M:%S').replace(tzinfo=JST)
        except ValueError:
            pass
    gps = None
    g = ex.get_ifd(0x8825) if hasattr(ex, 'get_ifd') else None
    if g and 2 in g and 4 in g:
        f = lambda v: float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
        la, lo = f(g[2]), f(g[4])
        if g.get(1) == 'S': la = -la
        if g.get(3) == 'W': lo = -lo
        gps = (la, lo)
    return ct, gps


def load_gpx(paths):
    pts = []
    for p in paths:
        root = ET.parse(p).getroot()
        for e in root.iter():
            if e.tag.endswith('trkpt') or e.tag.endswith('wpt'):
                tm = next((c.text for c in e if c.tag.endswith('time')), None)
                if tm:
                    pts.append((dt.datetime.fromisoformat(tm.replace('Z', '+00:00')), float(e.get('lat')), float(e.get('lon'))))
    pts.sort()
    return pts


def at_track(pts, t):
    """轨迹插值；离最近点超过 120 秒就不算。返回 (lat, lon, 误差秒)。"""
    if not pts:
        return None
    ts = [p[0] for p in pts]
    i = bisect.bisect_left(ts, t)
    if i == 0 or i == len(pts):
        j = 0 if i == 0 else len(pts) - 1
        gap = abs((pts[j][0] - t).total_seconds())
        return (pts[j][1], pts[j][2], gap) if gap <= 120 else None
    a, b = pts[i - 1], pts[i]
    span = (b[0] - a[0]).total_seconds() or 1
    r = (t - a[0]).total_seconds() / span
    gap = min((t - a[0]).total_seconds(), (b[0] - t).total_seconds())
    if span > 300 and gap > 120:
        return None
    return (a[1] + (b[1] - a[1]) * r, a[2] + (b[2] - a[2]) * r, gap)


def thumb(p, is_vid, mid):
    try:
        if is_vid:
            r = subprocess.run([FF, '-v', 'error', '-ss', f'{mid:.2f}', '-i', str(p), '-frames:v', '1', '-vf', 'scale=320:-1',
                                '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True)
            from io import BytesIO
            return Image.open(BytesIO(r.stdout)).convert('RGB')
        im = Image.open(p).convert('RGB'); im.thumbnail((320, 320)); return im
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('素材'); ap.add_argument('--点位', required=True); ap.add_argument('--gpx', nargs='*', default=[])
    ap.add_argument('--时差', type=float, default=0.0); ap.add_argument('--相机时间是本地', action='store_true'); ap.add_argument('--输出')
    a = ap.parse_args()
    src = Path(a.素材).expanduser(); out = Path(a.输出).expanduser() if a.输出 else src / '_分镜'
    pois = json.load(open(Path(a.点位).expanduser(), encoding='utf-8'))['点位']
    gpx = load_gpx([Path(g).expanduser() for g in a.gpx])
    rows = []
    for p in sorted(x for x in src.rglob('*') if x.suffix.lower() in VID | PIC and '_分镜' not in x.parts):
        is_vid = p.suffix.lower() in VID
        if is_vid:
            ct, dur, gps = ffmeta(p)
            if ct and a.相机时间是本地:
                ct = ct.replace(tzinfo=JST)
        else:
            (ct, gps), dur = exif(p), 0.0
        if ct is None:
            ct = dt.datetime.fromtimestamp(p.stat().st_mtime, JST)
            how_t = '文件修改时间（不可靠）'
        else:
            how_t = '元数据'
        mid_t = ct + dt.timedelta(seconds=a.时差 + dur / 2)
        how, err = '', None
        if gps:
            how = '文件自带位置'
        else:
            tr = at_track(gpx, mid_t)
            if tr:
                gps, err, how = (tr[0], tr[1]), tr[2], f'轨迹插值（离最近轨迹点 {tr[2]:.0f} 秒）'
        best, dist = None, None
        if gps:
            for q in pois:
                d = haversine(gps, (q['纬度'], q['经度']))
                if d <= q['半径'] and (dist is None or d < dist):
                    best, dist = q, d
        rows.append(dict(文件=str(p), 名=p.name, 视频=is_vid, 时长=round(dur, 1), 拍摄时间=mid_t.astimezone(JST).strftime('%m-%d %H:%M:%S'),
                         时间来源=how_t, 纬度=gps[0] if gps else None, 经度=gps[1] if gps else None, 位置来源=how or '无位置',
                         点位=best['名'] if best else ('无位置' if not gps else '不在任何点位半径内'), 距离米=round(dist) if dist is not None else None,
                         镜头=best['镜头'] if best else [], 该拍=best['拍'] if best else ''))
    out.mkdir(parents=True, exist_ok=True)
    for r in rows:
        d = out / '按点位' / r['点位']; d.mkdir(parents=True, exist_ok=True)
        link = d / r['名']
        if not link.exists():
            os.symlink(r['文件'], link)
    json.dump(rows, open(out / '素材分镜表.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    L = ['# 素材分镜表', '', f'素材：{src}　共 {len(rows)} 个文件；轨迹点 {len(gpx)} 个；时差 {a.时差:+.0f} 秒', '',
         '| 点位 | 文件 | 时长 | 拍摄时间 | 距离 | 位置来源 | 对应镜头 |', '|---|---|---|---|---|---|---|']
    for r in sorted(rows, key=lambda r: (r['点位'], r['拍摄时间'])):
        L.append(f"| {r['点位']} | {r['名']} | {r['时长']}s | {r['拍摄时间']} | {'' if r['距离米'] is None else str(r['距离米']) + ' 米'} | {r['位置来源']} | {' '.join(r['镜头'])} |")
    covered = {r['点位'] for r in rows}
    L += ['', '## 还没拍到的点位', ''] + [f"- {q['名']}：{q['拍']}" for q in pois if q['名'] not in covered]
    (out / '素材分镜表.md').write_text('\n'.join(L) + '\n', encoding='utf-8')
    # 缩略图总览：每个文件一格，下面写点位
    font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 15)
    W, H, cols = 320, 180, 6
    n = len(rows); sheet = Image.new('RGB', (W * cols, (H + 44) * max(1, math.ceil(n / cols))), 'black'); dr = ImageDraw.Draw(sheet)
    for i, r in enumerate(sorted(rows, key=lambda r: (r['点位'], r['拍摄时间']))):
        im = thumb(Path(r['文件']), r['视频'], r['时长'] / 2)
        x, y = (i % cols) * W, (i // cols) * (H + 44)
        if im:
            im.thumbnail((W, H)); sheet.paste(im, (x, y))
        dr.text((x + 4, y + H + 2), f"{r['点位'][:14]}", fill='yellow', font=font)
        dr.text((x + 4, y + H + 22), f"{r['名'][:22]} {r['时长']}s", fill='white', font=font)
    sheet.save(out / '缩略图总览.jpg', quality=82)
    hit = sum(1 for r in rows if r['镜头'])
    print(f'{len(rows)} 个文件，{hit} 个分到了点位；表：{out / "素材分镜表.md"}')


if __name__ == '__main__':
    main()
