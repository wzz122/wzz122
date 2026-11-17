"""v7b 质检：逐镜列出每张图（照片/截图/新闻画面/视频/推文卡）在屏上的停留时长，检查 ≥2 秒、带字 ≥3.5 秒；
每屏 0.5 秒内要有主体内容；不许出现 flash / 黑白滤镜 / onoma / pop / chaptercard / recapwall；盖章 ≤3、荧光笔 ≤5。
输出 质检/图片停留表-v7b.md。"""
import json, re
from pathlib import Path
from urllib.parse import unquote
V6 = Path(__file__).resolve().parent.parent
sb = json.loads((V6 / '工程/.work/storyboard.json').read_text())
scenes = sb.get('scenes') or sb.get('shots')
IMG = {'photocard', 'docpage', 'videocard', 'parallax'}
BAN = {'onoma', 'pop', 'chaptercard', 'recapwall', 'note2'}
TEXTY = re.compile(r'^(\d{8}-|新/20|截帧-(09|15|17|23|24))|讲座|券商|NTV1104-40|字幕')
rows, bad, stamps, hls = [], [], 0, 0
for sc in scenes:
    sid = sc.get('stable_id') or sc.get('id'); dur = sc['t1'] - sc['t0']
    els = sc.get('elements', [])
    main = [e for e in els if e['type'] not in ('eyebrow', 'title', 'scrim', 'source')]
    first = min((e.get('delay', 0) for e in main), default=99)
    if first > .5:
        bad.append(f'{sid} 第一个主体元素 {first:.2f}s 才出现（> 0.5s）')
    for e in els:
        t = e['type']
        if t in BAN:
            bad.append(f'{sid} 用了已停用的组件 {t}')
        if e.get('flash'):
            bad.append(f'{sid} 有 flash 插镜')
        if 'filter' in json.dumps(e.get('css', '')) or 'grayscale' in json.dumps(e):
            bad.append(f'{sid} {e["id"]} 带滤镜')
        if t in ('bigstamp', 'seal'):
            stamps += 1
        if t == 'highlighter':
            hls += 1
        is_tweet = t == 'panel' and 'navy' in (e.get('cls') or '')
        if t in IMG or is_tweet:
            a = e.get('delay', 0); b = e.get('hideAt', dur)
            src = unquote(e.get('src', '') or (e.get('frames') or [''])[0]) if not is_tweet else ''
            name = '推文卡' if is_tweet else re.sub(r'^.*/(素材/|片段/|推文/|照片/|截图/|视频截帧/)', '', src)[:60]
            if t == 'videocard':
                name = '视频：' + (e.get('name') or Path(src).parent.name)[:40]
            texty = is_tweet or bool(TEXTY.search(name)) or '推文' in name
            need = 3.5 if texty else 2.0
            ok = (b - a) >= need - 1e-6
            rows.append((sid, name, round(a, 2), round(b, 2), round(b - a, 2), '带字' if texty else '照片', '✓' if ok else '✗'))
            if not ok:
                bad.append(f'{sid} {name} 停留 {b - a:.2f}s < {need}s')
if stamps > 3: bad.append(f'盖章 {stamps} 枚 > 3')
if hls > 5: bad.append(f'荧光笔 {hls} 处 > 5')
out = ['# 股神水谷 v7b · 图片停留表（自动生成）', '', f'盖章 {stamps} 枚；荧光笔 {hls} 处。规则：照片 ≥2 秒，带字（推文、截图、海报、新闻字幕）≥3.5 秒；每屏 0.5 秒内出主体。', '',
       '| 镜头 | 图 | 出现 | 消失 | 停留(秒) | 类型 | 合格 |', '|---|---|---|---|---|---|---|']
out += [f'| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} | {r[6]} |' for r in rows]
out += ['', '## 不合格项', ''] + ([f'- {x}' for x in bad] or ['- 无'])
(V6 / '质检/图片停留表-v7b.md').write_text('\n'.join(out) + '\n')
print(f'{len(rows)} 张图，最短停留 {min(r[4] for r in rows)} 秒；盖章 {stamps}；荧光笔 {hls}')
print('\n'.join(bad) or '全部合格')
