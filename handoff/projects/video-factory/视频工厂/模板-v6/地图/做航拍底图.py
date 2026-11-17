"""做航拍底图.py —— 国土地理院「全国最新写真（シームレス）」航空照片拼成一张大图，当 v6 地图舞台的底图（只覆盖日本）。

出典：国土地理院（地理院タイル・全国最新写真）。免费，片中和简介写「航拍：国土地理院」。谷歌卫星图条款不允许直接抓瓦片，不用。
同时用 Overpass 取铁路线和车站（© OpenStreetMap contributors），存成 <名>.osm.json，v6lib 的 osmline() 能按线名取线。

用法：python3 做航拍底图.py 航拍 --bbox 34.640,135.470,34.712,135.548 --out 画面v6/素材/地图 [--z 17]
输出：<名>.jpg（拼好的航拍）、<名>.json（投影参数，和 做底图.py 同格式，mapbase('航拍') 直接用）、<名>.osm.json
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import io
import json
import math
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image

UA = 'Mozilla/5.0 (v6-map-builder; personal video project)'
TILE = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg'
OVERPASS = 'https://overpass-api.de/api/interpreter'


def lonlat_px(lon, lat, z):
    s = 256 * 2 ** z
    r = math.radians(lat)
    return (lon + 180) / 360 * s, (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * s


def get(url, tries=4):
    for k in range(tries):
        r = subprocess.run(['curl', '-sS', '--fail', '-A', UA, '--max-time', '30', url], capture_output=True)
        if r.returncode == 0 and r.stdout:
            return r.stdout
        time.sleep(1 + k)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('name'); ap.add_argument('--bbox', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--z', type=int, default=17); ap.add_argument('--并发', dest='workers', type=int, default=6)
    a = ap.parse_args()
    S, W, N, E = [float(v) for v in a.bbox.split(',')]
    z = a.z
    out = Path(a.out).expanduser(); out.mkdir(parents=True, exist_ok=True)
    cache = out / f'_瓦片-{a.name}-z{z}'; cache.mkdir(exist_ok=True)
    x0, y0 = lonlat_px(W, N, z); x1, y1 = lonlat_px(E, S, z)
    tx0, ty0, tx1, ty1 = int(x0 // 256), int(y0 // 256), int(x1 // 256), int(y1 // 256)
    jobs = [(x, y) for y in range(ty0, ty1 + 1) for x in range(tx0, tx1 + 1)]
    print(f'航拍瓦片 z{z}：{len(jobs)} 张（{tx1 - tx0 + 1}×{ty1 - ty0 + 1}）')

    def fetch(xy):
        x, y = xy
        f = cache / f'{x}_{y}.jpg'
        if f.exists() and f.stat().st_size > 0:
            return True
        b = get(TILE.format(z=z, x=x, y=y))
        if b:
            f.write_bytes(b)
            return True
        return False

    with cf.ThreadPoolExecutor(a.workers) as ex:          # 网络下载，不是模型任务
        ok = sum(ex.map(fetch, jobs))
    print(f'下载完成 {ok}/{len(jobs)}')
    big = Image.new('RGB', ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256), (40, 44, 40))
    for x, y in jobs:
        f = cache / f'{x}_{y}.jpg'
        if f.exists() and f.stat().st_size:
            try:
                big.paste(Image.open(io.BytesIO(f.read_bytes())).convert('RGB'), ((x - tx0) * 256, (y - ty0) * 256))
            except Exception:
                pass
    cx0, cy0 = x0 - tx0 * 256, y0 - ty0 * 256
    w, h = round(x1 - x0), round(y1 - y0)
    big = big.crop((round(cx0), round(cy0), round(cx0) + w, round(cy0) + h))
    jp = out / f'{a.name}.jpg'
    big.save(jp, quality=86, optimize=True)
    mpp = 40075016.686 * math.cos(math.radians((S + N) / 2)) / (256 * 2 ** z)
    meta = dict(name=a.name, z=z, x0=round(tx0 * 256 + round(cx0), 3), y0=round(ty0 * 256 + round(cy0), 3), w=w, h=h, bbox=[S, W, N, E],
                mpp=round(mpp, 4), svg=jp.name, kind='航拍', attribution='航拍：国土地理院（全国最新写真）｜ 线路：© OpenStreetMap contributors')
    (out / f'{a.name}.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'航拍：{jp}（{w}×{h}，1 像素 ≈ {mpp:.2f} 米，{jp.stat().st_size / 1e6:.1f} MB）')

    osm = out / f'{a.name}.osm.json'
    if not osm.exists():
        q = f'''[out:json][timeout:180];
(way["railway"~"^(rail|subway|light_rail|monorail)$"]({S},{W},{N},{E});
 relation["route"~"^(train|subway|railway)$"]({S},{W},{N},{E});
 node["railway"="station"]({S},{W},{N},{E}););
out geom;'''
        r = subprocess.run(['curl', '-sS', '--fail', '-A', 'v6-map-builder (personal video project)', '--max-time', '240', '--data-urlencode', 'data@-', OVERPASS], input=q.encode(), capture_output=True)
        if r.returncode:
            sys.exit('Overpass 失败：' + r.stderr.decode()[:300])
        osm.write_bytes(r.stdout)
        print('铁路数据：', osm)


if __name__ == '__main__':
    main()
