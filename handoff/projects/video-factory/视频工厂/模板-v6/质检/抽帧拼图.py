# -*- coding: utf-8 -*-
"""v6 成片质检抽帧：每 2 秒一帧（1280 宽）→ 抽帧2s/；48 帧一页拼图（带时间码、镜头号）→ 拼图/；每镜末帧 → 每镜末帧/<序号>-<ID>.jpg。

用法：python3 质检/抽帧拼图.py [成片.mp4]（不写 = 项目.json「成片输出」）
ffmpeg 解码走 mac-heavy-job（退出码 75 = 别的重任务在跑，等 90 秒重试，不删锁）。
"""
import json
import subprocess
import sys
import time
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

V6 = Path(__file__).resolve().parent.parent
QC = V6 / '质检'
_PJ = V6 / '项目.json'
_P = json.loads(_PJ.read_text(encoding='utf-8')) if _PJ.exists() else {}
_OUT = Path(_P.get('成片输出', f'~/Desktop/视频工厂/2-成片/{V6.parent.name}-v6.mp4')).expanduser()
MP4 = Path(sys.argv[1]) if len(sys.argv) > 1 else (_OUT if _OUT.is_absolute() else V6 / _OUT)
FF = imageio_ffmpeg.get_ffmpeg_exe()
HEAVY = ['/usr/bin/python3', str(Path.home() / '.local' / 'bin' / 'mac-heavy-job.py'), '--wait', '60', '--']
FPS, STEP = 30, 2
D2, DSHEET, DLAST = QC / '抽帧2s', QC / '拼图', QC / '每镜末帧'


def heavy(args, what):
    for k in range(80):
        r = subprocess.run(HEAVY + [str(a) for a in args], capture_output=True, text=True)
        if r.returncode == 75:
            print(f'[等待] 另一个重任务在跑，90 秒后重试 {what}（第 {k + 1} 次）', flush=True)
            time.sleep(90)
            continue
        if r.returncode:
            print(r.stderr[-3000:], file=sys.stderr)
            raise SystemExit(f'{what} 失败（退出码 {r.returncode}）')
        return
    raise SystemExit('重任务锁一直被占用')


def font(size):
    for f in ('/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/Helvetica.ttc'):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def mmss(t):
    return f'{int(t // 60):02d}:{t % 60:05.2f}' if t % 1 else f'{int(t // 60):02d}:{int(t % 60):02d}'


def main():
    if not MP4.is_file():
        raise SystemExit(f'缺成片：{MP4}')
    man = json.loads((V6 / '镜头' / 'manifest.json').read_text())
    shots = [(m['id'], m['global_start_frame'], m['frames']) for m in man]
    total = shots[-1][1] + shots[-1][2]

    def shot_at(fr):
        for i, (sid, g0, n) in enumerate(shots):
            if g0 <= fr < g0 + n:
                return i + 1, sid
        return len(shots), shots[-1][0]

    for d in (D2, DSHEET, DLAST):
        d.mkdir(parents=True, exist_ok=True)
        for p in d.glob('*.jpg'):
            p.unlink()
    tmp2, tmpL = QC / '.tmp2s', QC / '.tmpLast'
    for d in (tmp2, tmpL):
        d.mkdir(exist_ok=True)
        for p in d.glob('*.jpg'):
            p.unlink()

    # 1) 每 2 秒一帧：第 0、60、120… 帧（精确帧号，不靠 fps 滤镜取整）
    heavy([FF, '-y', '-v', 'error', '-i', MP4, '-vf', f'select=not(mod(n\\,{FPS * STEP})),scale=1280:-2', '-vsync', 'vfr', '-q:v', '3',
           tmp2 / '%04d.jpg'], '每 2 秒抽帧')
    raw = sorted(tmp2.glob('*.jpg'))
    names = []
    for k, p in enumerate(raw):
        fr = k * FPS * STEP
        t = fr / FPS
        no, sid = shot_at(fr)
        q = D2 / f'{k + 1:03d}-{int(t // 60):02d}m{int(t % 60):02d}s-{no:02d}{sid}.jpg'
        p.rename(q)
        names.append((q, t, no, sid))
    tmp2.rmdir()

    # 2) 48 帧一页拼图（8 列 × 6 行，每格 320×180 + 时间码条）
    cols, rows, tw = 8, 6, 320
    th = round(tw * 1080 / 1920)
    lab = 26
    f1 = font(18)
    pages = []
    for pg in range(0, len(names), cols * rows):
        chunk = names[pg:pg + cols * rows]
        sheet = Image.new('RGB', (cols * tw, rows * (th + lab)), '#1b1b1b')
        dr = ImageDraw.Draw(sheet)
        for i, (q, t, no, sid) in enumerate(chunk):
            x, y = (i % cols) * tw, (i // cols) * (th + lab)
            im = Image.open(q).convert('RGB').resize((tw, th), Image.LANCZOS)
            sheet.paste(im, (x, y + lab))
            dr.text((x + 6, y + 3), f'{mmss(t)}  #{no:02d} {sid}', fill='#f2f2f2', font=f1)
            dr.line([(x + tw - 1, y), (x + tw - 1, y + th + lab)], fill='#000', width=1)
        out = DSHEET / f'拼图-{pg // (cols * rows) + 1:02d}-{mmss(chunk[0][1]).replace(":", "m")}s-{mmss(chunk[-1][1]).replace(":", "m")}s.jpg'
        sheet.save(out, quality=88)
        pages.append(out)

    # 3) 每镜末帧（成片里的帧号 = 起始帧 + 帧数 − 1）
    lasts = [g0 + n - 1 for _, g0, n in shots]
    expr = '+'.join(f'eq(n\\,{f})' for f in lasts)
    heavy([FF, '-y', '-v', 'error', '-i', MP4, '-vf', f'select={expr},scale=1280:-2', '-vsync', 'vfr', '-q:v', '2', tmpL / '%03d.jpg'],
          '每镜末帧')
    rawL = sorted(tmpL.glob('*.jpg'))
    if len(rawL) != len(shots):
        raise SystemExit(f'末帧数 {len(rawL)} ≠ 镜头数 {len(shots)}')
    for i, (p, (sid, g0, n)) in enumerate(zip(rawL, shots)):
        p.rename(DLAST / f'{i + 1:02d}-{sid}.jpg')
    tmpL.rmdir()
    print(json.dumps(dict(frames_2s=len(names), sheets=len(pages), last_frames=len(rawL), total_frames_manifest=total), ensure_ascii=False))


if __name__ == '__main__':
    main()
