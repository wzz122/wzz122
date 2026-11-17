"""做底图.py —— 用 OpenStreetMap 数据画一张「米色纸感」城市底图（SVG），给 v6 地图舞台用。

学 Wendao 那种「一张自绘底图贯穿全片」：浅米色陆地、灰蓝水面、白色道路、无文字（地名由镜头脚本按旁白弹出）。
数据：Overpass API（免费、免 key）。署名：© OpenStreetMap contributors（ODbL），片尾和简介要写。

用法：
  python3 做底图.py 日本桥 --bbox 34.6440,135.4880,34.6780,135.5250 --out ~/Desktop/视频工厂/样片/<期>/画面v6/素材/地图
  python3 做底图.py 日本桥 --bbox … --out … --z 17          # 缩放级别（默认 17：1 像素 ≈ 1 米，2–4 公里见方的街区）
  python3 做底图.py 大阪 --bbox … --out … --z 14 --粗        # 城市全景：只画主干道、河、铁路
输出：<名>.svg（底图）、<名>.json（投影参数，v6lib 的 mapbase()/LL() 读它）、<名>.osm.json（原始数据缓存，重跑不再下载）。

投影：Web Mercator，世界像素 = 256·2^z；底图左上角 = bbox 西北角。经纬度 → 底图像素见 lonlat_px()。
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

UA = 'v6-map-builder (personal video project)'
OVERPASS = 'https://overpass-api.de/api/interpreter'

# ---------------------------------------------------------------- 配色（与 v6 档案纸协调；改了要重渲用到底图的镜头）
STYLE = {
    'land': '#EEE6D4',
    'park': '#D3DBB5', 'park_edge': '#BCC79A',
    'temple': '#E7DCC4',
    'water': '#ABC7D4', 'water_edge': '#8DAFC0',
    'casing': '#D5C8AE', 'road': '#FBF7EE', 'road_minor': '#F6F0E2',
    'hw_casing': '#C9A66A', 'hw': '#EED29A',
    'rail': '#9C9587', 'rail_dash': '#F4EEE2',
}
# 道路宽度（世界像素，z17 时 1px ≈ 0.95 米）；z 不同按 2^(z-17) 缩放
ROAD_W = {'trunk': 17, 'primary': 15, 'secondary': 13, 'tertiary': 10.5, 'unclassified': 7, 'residential': 6.5,
          'living_street': 5, 'pedestrian': 5, 'service': 3.6,
          'motorway': 13, 'motorway_link': 7, 'trunk_link': 8, 'primary_link': 8, 'secondary_link': 7, 'tertiary_link': 6}
ROAD_RANK = ['service', 'pedestrian', 'living_street', 'residential', 'unclassified', 'tertiary_link', 'tertiary',
             'secondary_link', 'secondary', 'primary_link', 'primary', 'trunk_link', 'trunk']
COARSE_KEEP = {'motorway', 'trunk', 'primary', 'secondary', 'motorway_link', 'trunk_link'}


def lonlat_px(lon, lat, z):
    s = 256 * 2 ** z
    x = (lon + 180) / 360 * s
    r = math.radians(lat)
    y = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * s
    return x, y


def query(bbox, coarse):
    S, W, N, E = bbox
    b = f'({S},{W},{N},{E})'
    hw = 'motorway|trunk|primary|secondary|motorway_link|trunk_link' if coarse else \
        'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|service'
    return f'''[out:json][timeout:180];
(
 way["highway"~"^({hw})$"]{b};
 way["natural"="water"]{b}; relation["natural"="water"]{b};
 way["waterway"~"^(river|canal|riverbank)$"]{b};
 way["railway"~"^(rail|light_rail|subway|tram|narrow_gauge)$"]{b};
 way["leisure"~"^(park|garden)$"]{b}; relation["leisure"~"^(park|garden)$"]{b};
 way["landuse"~"^(grass|recreation_ground|cemetery|religious)$"]{b};
 way["amenity"="place_of_worship"]{b};
);
out geom;'''


def fetch(bbox, coarse, cache: Path):
    if cache.exists():
        return json.loads(cache.read_text())
    q = query(bbox, coarse)
    print('下载 OSM 数据（Overpass，约 30–90 秒）…')
    r = subprocess.run(['curl', '-sS', '--fail', '-A', UA, '--max-time', '240', '--data-urlencode', 'data@-', OVERPASS],
                       input=q.encode(), capture_output=True)
    if r.returncode:
        sys.exit('Overpass 下载失败：' + r.stderr.decode()[:400])
    d = json.loads(r.stdout)
    cache.write_text(json.dumps(d, ensure_ascii=False))
    return d


def dp(pts, eps):
    """Douglas–Peucker 简化（迭代版）。"""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / L
            if d > best:
                best, bi = d, i
        if best > eps:
            keep[bi] = True
            stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]


def stitch(ways):
    """把多段 way 首尾相接拼成闭合环（多边形关系用）。"""
    segs = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while changed and cur[0] != cur[-1]:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += s[::-1][1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        rings.append(cur)
    return rings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('name')
    ap.add_argument('--bbox', required=True, help='南,西,北,东（纬度,经度,纬度,经度）')
    ap.add_argument('--out', required=True)
    ap.add_argument('--z', type=int, default=17)
    ap.add_argument('--粗', dest='coarse', action='store_true', help='只画主干道（城市全景用）')
    ap.add_argument('--重下', dest='refetch', action='store_true')
    a = ap.parse_args()
    bbox = [float(v) for v in a.bbox.split(',')]
    S, W, N, E = bbox
    out = Path(a.out).expanduser()
    out.mkdir(parents=True, exist_ok=True)
    cache = out / f'{a.name}.osm.json'
    if a.refetch and cache.exists():
        cache.unlink()
    d = fetch(bbox, a.coarse, cache)
    z = a.z
    k = 2 ** (z - 17)                              # 线宽缩放
    x0, y0 = lonlat_px(W, N, z)
    x1, y1 = lonlat_px(E, S, z)
    w, h = round(x1 - x0), round(y1 - y0)
    eps = .45

    def P(g):
        pts = [(lonlat_px(q['lon'], q['lat'], z)) for q in g]
        pts = [(x - x0, y - y0) for x, y in pts]
        return dp(pts, eps)

    def dstr(pts, close=False):
        if len(pts) < 2:
            return ''
        s = 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        return s + ('Z' if close else '')

    layers = {key: [] for key in ['park', 'temple', 'water', 'river', 'waterline', 'rail', 'hw_casing', 'hw']}
    roads_c = {r: [] for r in ROAD_RANK}
    roads_f = {r: [] for r in ROAD_RANK}
    bridges = []
    n = 0
    for e in d['elements']:
        t = e.get('tags', {})
        if e['type'] == 'relation':
            outer = [P(m['geometry']) for m in e.get('members', []) if m.get('geometry')]
            rings = stitch([[tuple(p) for p in r] for r in outer])
            dd = ''.join(dstr(r, True) for r in rings)
            if t.get('natural') == 'water':
                layers['water'].append(dd)
            elif t.get('leisure') in ('park', 'garden'):
                layers['park'].append(dd)
            n += 1
            continue
        g = e.get('geometry')
        if not g:
            continue
        pts = P(g)
        closed = len(g) > 3 and g[0] == g[-1]
        hwy = t.get('highway')
        tunnel = t.get('tunnel') in ('yes', 'building_passage') or (t.get('layer', '0').lstrip('-').isdigit() and int(t.get('layer', '0')) < 0)
        if hwy:
            if tunnel or t.get('area') == 'yes':
                continue
            if a.coarse and hwy not in COARSE_KEEP:
                continue
            if hwy in ('motorway', 'motorway_link'):
                wd = ROAD_W[hwy] * k
                layers['hw_casing'].append((wd + 3 * k, dstr(pts)))
                layers['hw'].append((wd, dstr(pts)))
            elif hwy in roads_f:
                roads_c[hwy].append(dstr(pts))
                roads_f[hwy].append(dstr(pts))
            n += 1
        elif t.get('natural') == 'water' or t.get('waterway') == 'riverbank':
            if closed:
                # 河（道顿堀川这类）实际只有 30 米宽，全景里太细：多描一圈同色粗边，读得清
                layers['river' if t.get('water') in ('river', 'canal') or t.get('waterway') == 'riverbank' else 'water'].append(dstr(pts, True))
                n += 1
        elif t.get('waterway') in ('river', 'canal'):
            layers['waterline'].append(dstr(pts))
            n += 1
        elif t.get('railway'):
            if tunnel or t.get('railway') == 'subway':
                continue
            layers['rail'].append(dstr(pts))
            n += 1
        elif t.get('leisure') in ('park', 'garden') or t.get('landuse') in ('grass', 'recreation_ground', 'cemetery'):
            if closed:
                layers['park'].append(dstr(pts, True))
                n += 1
        elif t.get('landuse') == 'religious' or t.get('amenity') == 'place_of_worship':
            if closed:
                layers['temple'].append(dstr(pts, True))
                n += 1

    st = STYLE
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">',
           f'<rect width="{w}" height="{h}" fill="{st["land"]}"/>']
    if layers['temple']:
        svg.append(f'<path d="{"".join(layers["temple"])}" fill="{st["temple"]}"/>')
    if layers['park']:
        svg.append(f'<path d="{"".join(layers["park"])}" fill="{st["park"]}" fill-rule="evenodd" stroke="{st["park_edge"]}" stroke-width="{1.2 * k:.2f}"/>')
    if layers['waterline']:
        svg.append(f'<path d="{"".join(layers["waterline"])}" fill="none" stroke="{st["water"]}" stroke-width="{14 * k:.2f}" stroke-linecap="round" stroke-linejoin="round"/>')
    if layers['river']:
        svg.append(f'<path d="{"".join(layers["river"])}" fill="{st["water"]}" stroke="{st["water"]}" stroke-width="{9 * k:.2f}" stroke-linejoin="round"/>')
    if layers['water']:
        svg.append(f'<path d="{"".join(layers["water"])}" fill="{st["water"]}" fill-rule="evenodd" stroke="{st["water_edge"]}" stroke-width="{1.6 * k:.2f}"/>')
    # 道路：先全部描边（由细到粗），再全部填芯，交叉口才干净
    for r in ROAD_RANK:
        if roads_c[r]:
            svg.append(f'<path d="{"".join(roads_c[r])}" fill="none" stroke="{st["casing"]}" stroke-width="{(ROAD_W[r] + 2.6) * k:.2f}" stroke-linecap="round" stroke-linejoin="round"/>')
    for r in ROAD_RANK:
        if roads_f[r]:
            col = st['road'] if ROAD_RANK.index(r) >= ROAD_RANK.index('unclassified') else st['road_minor']
            svg.append(f'<path d="{"".join(roads_f[r])}" fill="none" stroke="{col}" stroke-width="{ROAD_W[r] * k:.2f}" stroke-linecap="round" stroke-linejoin="round"/>')
    if layers['rail']:
        dd = ''.join(layers['rail'])
        svg.append(f'<path d="{dd}" fill="none" stroke="{st["rail"]}" stroke-width="{4.2 * k:.2f}" stroke-linecap="butt" stroke-linejoin="round"/>')
        svg.append(f'<path d="{dd}" fill="none" stroke="{st["rail_dash"]}" stroke-width="{1.8 * k:.2f}" stroke-dasharray="{9 * k:.1f} {9 * k:.1f}"/>')
    # 高架高速（阪神高速等）压在最上面
    for (wd, dd) in layers['hw_casing']:
        svg.append(f'<path d="{dd}" fill="none" stroke="{st["hw_casing"]}" stroke-width="{wd:.2f}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".85"/>')
    for (wd, dd) in layers['hw']:
        svg.append(f'<path d="{dd}" fill="none" stroke="{st["hw"]}" stroke-width="{wd:.2f}" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".9"/>')
    svg.append('</svg>')
    sp = out / f'{a.name}.svg'
    sp.write_text('\n'.join(svg), encoding='utf-8')
    mpp = 40075016.686 * math.cos(math.radians((S + N) / 2)) / (256 * 2 ** z)
    meta = dict(name=a.name, z=z, x0=round(x0, 3), y0=round(y0, 3), w=w, h=h, bbox=bbox, mpp=round(mpp, 4),
                svg=sp.name, attribution='© OpenStreetMap contributors（ODbL）', features=n)
    (out / f'{a.name}.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'底图：{sp}（{w}×{h} 像素，1 像素 ≈ {mpp:.2f} 米，{n} 个要素，{sp.stat().st_size / 1e6:.2f} MB）')


if __name__ == '__main__':
    main()
