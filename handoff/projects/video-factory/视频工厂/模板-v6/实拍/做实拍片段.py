# -*- coding: utf-8 -*-
"""模板-v6 实拍满屏（2026-10-20 从夕张、311 两期固化）：把相机原片和照片剪成每个镜头的满屏实拍底片（1920×1008、30fps、和镜头帧数一样长），再交给 v6 渲染叠字。
路径全部来自 画面v6/项目.json「实拍」（见 实拍设置.py）。

用法（重任务，走内存锁；一次一个进程，按镜头串行）：
  python3 实拍/做实拍片段.py [镜头号 …] [--force]     （直接跑；Bash 钩子会自动套内存锁，自己再包 mac-heavy-job 会死锁）
输入：
  实拍/实拍表.json   {"S02": {"段": [{"源": "YZ-004", "入": 0, "出": 8.8, "速": 0.75, "防抖": false, "裁": [x,y,w,h] 0–1, "竖": false, "淡": 0.4, "原声": 0}], "调色": "默认"}, …}
                     照片段：{"图": "IMG_2871", "秒": 4, "起": [cx, cy, 放大], "止": [...], "裁": [...], "转": 90}；可以用 写实拍表-示例-311.py 的 P()/V() 写法生成
                     「原声」：这一段带上原片现场声（数字 = 相对 −30 LUFS 的 dB（另外滤掉 60 Hz 以下风噪、单独限峰到 −14 dBFS，免得海浪风声的峰值触发总装限幅），0 = 正常、−6 = 更轻），只支持 速 0.5–2；总装自动混进去，说话时自动压低
  画面v6/工程/.work/storyboard-audio.json   取每个镜头的帧数
输出（SSD）：<片段目录>/<镜头号>.mp4（+ 有原声时 <镜头号>.wav）+ 检查帧/<镜头号>/*.jpg（每秒 2 帧）
记录：实拍/记录/<镜头号>.json（每段入出点、速度、防抖前后抖动量、帧数、人脸 / 人体 / YOLO 检查结果）
人脸：facecheck（Vision 人脸）+ personcheck（Vision 人体 + 分块小脸）+ YOLO 人体（~/.venvs/av，小目标更准）。三样都 0 也必须人眼逐秒看复查图（人脸复查图.py）——两期都靠人眼抓到了检测器漏掉的远处小人。
规则：
  - 段总长不够镜头长时，先在 0.6 倍以内整体放慢，还不够就最后一帧停住（记录里写明）；太长就截掉尾巴。
  - 「防抖」：先缩到 1920 宽，vidstabdetect（shakiness=8, accuracy=15）→ vidstabtransform（smoothing=24, optzoom=1, zoomspeed=0.2）；
    记录前后两遍 detect 的平均位移，救不回来（处理后仍 > 6 px/帧）就在记录里标「换片」。
  - 「裁」：在 4K 原片上先裁（去后视镜、行人），再缩放，不留黑边。
  - 「竖」：竖拍画面放中间，左右用同一画面放大模糊铺底。
  - 统一调色：轻微压饱和、提一点对比（eq），所有实拍一致。
"""
import json, math, os, subprocess, sys, shutil
from pathlib import Path
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
sys.path.insert(0, str(Path(__file__).resolve().parent))
from 实拍设置 import HERE, OUT, TMP, TL, TOOLS, VENV_PY, src_path, photo_path, need_ws   # noqa: E402
CHK = OUT / '检查帧'
REC = HERE / '记录'
TABLE = HERE / '实拍表.json'
FACE = TOOLS / 'facecheck'
PERSON = TOOLS / 'personcheck'
YOLO = TOOLS / 'yolo人检.py'
FPS, W, H = 30, 1920, 1008
GRADE = {'默认': 'eq=contrast=1.05:saturation=0.90:gamma=0.98', '暗处': 'eq=contrast=1.04:saturation=0.92:brightness=0.02:gamma=1.05',
         '无': 'null'}


def run(args, **kw):
    r = subprocess.run([FF, '-hide_banner', '-v', 'error', '-y'] + args, capture_output=True, text=True, **kw)
    if r.returncode:
        raise RuntimeError(r.stderr[-2000:])
    return r


def probe(p):
    r = subprocess.run([FF, '-hide_banner', '-i', str(p)], capture_output=True, text=True).stderr
    import re
    m = re.search(r'Video: .*?, (\d{3,5})x(\d{3,5})', r)
    rot = re.search(r'rotate\s*:\s*(-?\d+)|displaymatrix: rotation of (-?[\d.]+)', r)
    fps = re.search(r'([\d.]+) fps', r)
    w, h = int(m.group(1)), int(m.group(2))
    ang = float(rot.group(1) or rot.group(2)) if rot else 0
    if abs(ang) % 180 == 90:
        w, h = h, w
    return w, h, float(fps.group(1)) if fps else 30.0


def shake(p):
    """抖动量：相邻帧整体位移（相位相关，480 宽灰度）减去 9 帧滑动平均（去掉有意的摇镜），取平均，换算成 1920 宽的像素。"""
    import numpy as np
    w, h = 480, 270
    r = subprocess.run([FF, '-v', 'error', '-i', str(p), '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True)
    a = np.frombuffer(r.stdout, np.uint8).reshape(-1, h, w).astype(np.float32)
    win = np.outer(np.hanning(h), np.hanning(w))
    F = [np.fft.fft2((f - f.mean()) * win) for f in a]
    d = []
    for f0, f1 in zip(F, F[1:]):
        c = f0 * np.conj(f1); c /= np.abs(c) + 1e-6
        q = np.fft.ifft2(c).real
        y, x = np.unravel_index(np.argmax(q), q.shape)
        d.append((x if x < w / 2 else x - w, y if y < h / 2 else y - h))
    if len(d) < 10:
        return 0.0
    d = np.array(d, float) * (1920 / w)
    k = 9
    sm = np.stack([np.convolve(d[:, i], np.ones(k) / k, mode='same') for i in range(2)], 1)
    res = np.hypot(*(d - sm)[k:-k].T)
    return round(float(res.mean()), 2)


def make_photo(sid, k, s):
    """照片段（12/25 只有照片）：满屏慢推 / 平移 / 局部放大，亚像素平滑（PIL 浮点裁框），不生成假的运动镜头。
    参数：图、秒（输出秒数）、起/止 = [中心x, 中心y, 放大]（0–1 相对原图；放大 1 = 刚好铺满 1920×1008）、裁（先裁原图 x,y,w,h）。
    竖拍照片默认按铺满宽度裁 16:9 窗口，用起/止的中心 y 做上下平移（例如楼梯塔从下往上摇）。"""
    from PIL import Image, ImageOps
    src = photo_path(s['图'])
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    if s.get('转'):
        im = im.rotate(s['转'], expand=True)        # 拍倒了的照片（例 IMG_2901 展示屏）
    if s.get('裁'):
        x, y, w, h = s['裁']; iw, ih = im.size
        im = im.crop((int(iw * x), int(ih * y), int(iw * (x + w)), int(ih * (y + h))))
    a = s.get('起', [0.5, 0.5, 1.0]); z = s.get('止', [0.5, 0.5, 1.06])
    ar = W / H
    iw, ih = im.size
    need_w = W * max(a[2], z[2]) * 1.3 / (min(iw, ih * ar) / iw)   # 原图缩到够用就行（4800 万像素太慢）
    if iw > need_w:
        im = im.resize((int(need_w), int(ih * need_w / iw)), Image.LANCZOS); iw, ih = im.size
    n = max(1, round(float(s.get('秒', 4)) * FPS))
    base_w = min(iw, ih * ar)            # 放大 1 时的裁框宽（原图像素）
    out = TMP / f'{sid}-{k}.mp4'
    p = subprocess.Popen([FF, '-hide_banner', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-vf', GRADE.get(s.get('调色', '默认'), GRADE['默认']) + ',format=yuv420p', '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', str(out)],
                         stdin=subprocess.PIPE)
    for i in range(n):
        u = i / max(1, n - 1)
        e = u * u * (3 - 2 * u) if s.get('缓', True) else u     # smoothstep，起止不顿
        cx = a[0] + (z[0] - a[0]) * e; cy = a[1] + (z[1] - a[1]) * e; zm = a[2] + (z[2] - a[2]) * e
        cw = base_w / zm; ch = cw / ar
        x0 = min(max(cx * iw - cw / 2, 0), iw - cw); y0 = min(max(cy * ih - ch / 2, 0), ih - ch)
        fr = im.transform((W, H), Image.EXTENT, (x0, y0, x0 + cw, y0 + ch), Image.BICUBIC)
        p.stdin.write(fr.tobytes())
    p.stdin.close(); p.wait()
    rec = dict(图=s['图'], 文件=src.name, 源尺寸=[iw, ih], 起=a, 止=z, 秒=round(n / FPS, 3), 输出帧数=n)
    return out, n, rec


def make_seg(sid, k, s, need):
    """处理一段：裁、缩、防抖、调速，输出 1920×1008 30fps 中间文件，返回 (路径, 实际秒数, 记录)。"""
    if s.get('图'):
        return make_photo(sid, k, s)
    src = src_path(s['源'])
    sw, sh, sfps = probe(src)
    a, z = float(s.get('入', 0)), s.get('出')
    rec = dict(源=s['源'], 文件=src.name, 入=a, 出=z, 源尺寸=[sw, sh], 源帧率=sfps)
    raw = TMP / f'{sid}-{k}-raw.mp4'
    vf = []
    vertical = s.get('竖', sh > sw)
    if s.get('倒'):
        vf.append('hflip,vflip')          # 云台翻转拍成倒的画面 → 转 180°
    if s.get('裁'):
        x, y, w, h = s['裁']
        vf.append(f'crop=iw*{w}:ih*{h}:iw*{x}:ih*{y}')
    if vertical:
        vf.append('scale=-2:1080:flags=lanczos')
    else:
        vf.append('scale=1920:-2:flags=lanczos,crop=1920:min(ih\\,1080)')
    vf.append('setsar=1')
    cut = ['-ss', str(a)] + (['-to', str(z)] if z is not None else [])
    run(cut + ['-i', str(src), '-an', '-vf', ','.join(vf), '-c:v', 'libx264', '-preset', 'fast', '-crf', '12',
               '-pix_fmt', 'yuv420p', str(raw)])
    cur = raw
    if s.get('原声') is not None:
        sp0 = float(s.get('速', 1.0))
        if not .5 <= sp0 <= 2:
            raise ValueError(f'{sid} 第 {k} 段：带原声的段速度要在 0.5–2 之间（现在 {sp0}）')
        aw = TMP / f'{sid}-{k}-a.wav'
        run(cut + ['-i', str(src), '-vn', '-af', f'atempo={sp0},highpass=f=60,loudnorm=I={-30 + float(s["原声"])}:TP=-9:LRA=20,alimiter=limit=0.2:attack=2:release=80:level=false,aresample=48000',
                   '-ac', '2', '-c:a', 'pcm_s16le', str(aw)])
        rec['原声'] = dict(dB=float(s['原声']), 文件=aw.name)
    if s.get('防抖'):
        before = shake(raw)
        trf = TMP / f'{sid}-{k}.trf'
        run(['-i', str(raw), '-vf', f'vidstabdetect=shakiness=8:accuracy=15:result={trf}', '-f', 'null', '-'])
        st = TMP / f'{sid}-{k}-stab.mp4'
        run(['-i', str(raw), '-vf', f'vidstabtransform=input={trf}:smoothing={s.get("平滑", 24)}:optzoom=1:zoomspeed=0.2:interpol=bicubic,unsharp=5:5:0.6:3:3:0.3',
             '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', '-pix_fmt', 'yuv420p', str(st)])
        after = shake(st)
        if after > before * 0.95:
            # 防抖反而更抖（低纹理画面 vidstab 会乱跟踪）→ 用原片
            rec.update(防抖=True, 抖动前=before, 抖动后=after, 结论='防抖变差，改用原片' if before <= 4 else '换片')
        else:
            rec.update(防抖=True, 抖动前=before, 抖动后=after, 结论='通过' if after <= 4 else '换片')
            cur = st
    sp = float(s.get('速', 1.0))
    rec['速'] = sp
    out = TMP / f'{sid}-{k}.mp4'
    g = GRADE.get(s.get('调色', '默认'), GRADE['默认'])
    if vertical:
        fc = (f'[0:v]setpts=(PTS-STARTPTS)/{sp},fps={FPS},split[a][b];'
              f'[a]scale={W}:{W*16//9}:force_original_aspect_ratio=increase,crop={W}:{H},gblur=sigma=40,eq=brightness=-0.08[bg];'
              f'[b]scale=-2:{H}[fg];[bg][fg]overlay=(W-w)/2:0,{g},format=yuv420p[v]')
    else:
        dy = s.get('上下', 0.5)
        fc = f'[0:v]setpts=(PTS-STARTPTS)/{sp},fps={FPS},crop={W}:{H}:0:(ih-{H})*{dy},{g},format=yuv420p[v]'
    run(['-i', str(cur), '-filter_complex', fc, '-map', '[v]', '-c:v', 'libx264', '-preset', 'fast', '-crf', '12', str(out)])
    n = frames_of(out)
    rec['输出帧数'] = n
    return out, n, rec


def frames_of(p):
    r = subprocess.run([FF, '-i', str(p), '-map', '0:v', '-c', 'copy', '-f', 'null', '-'], capture_output=True, text=True).stderr
    import re
    m = re.findall(r'frame=\s*(\d+)', r)
    return int(m[-1]) if m else 0


def build(sid, spec, nframes, force=False):
    OUT.mkdir(parents=True, exist_ok=True); TMP.mkdir(parents=True, exist_ok=True); REC.mkdir(exist_ok=True)
    dst = OUT / f'{sid}.mp4'
    key = json.dumps(dict(spec=spec, n=nframes, v=6), ensure_ascii=False, sort_keys=True)
    rj = REC / f'{sid}.json'
    if not force and dst.exists() and rj.exists() and json.loads(rj.read_text()).get('key') == key:
        print(sid, '复用'); return
    segs, recs = [], []
    for k, s in enumerate(spec['段']):
        p, n, r = make_seg(sid, k, s, nframes)
        segs.append((p, n, s)); recs.append(r)
    total = sum(n for _, n, _ in segs)
    note = ''
    # 长度对齐：不够时整体放慢（最多到 0.6 倍原速），还不够最后一帧停住
    f = 1.0
    if total < nframes:
        if total / nframes >= 0.6 and spec.get('补长', '放慢') == '放慢':
            f = total / nframes
            note = f'整体再放慢到 {f:.2f}'
    # 拼接（段间默认硬切；「淡」秒数 > 0 时与上一段交叉淡化）
    inputs, fc, last = [], [], None
    for i, (p, n, s) in enumerate(segs):
        inputs += ['-i', str(p)]
        fc.append(f'[{i}:v]setpts=(PTS-STARTPTS)/{f:.5f},fps={FPS},settb=1/{FPS}[s{i}]')
    acc, acc_len = 's0', segs[0][1] / f
    starts = [0.0]                                   # 每段在输出里的起始帧（原声对位用）
    for i in range(1, len(segs)):
        fade = float(segs[i][2].get('淡', 0))
        starts.append(acc_len - fade * FPS if fade > 0 else acc_len)
        if fade > 0:
            fc.append(f'[{acc}][s{i}]xfade=transition=fade:duration={fade}:offset={(acc_len / FPS) - fade:.4f}[x{i}]')
            acc_len += segs[i][1] / f - fade * FPS
        else:
            fc.append(f'[{acc}][s{i}]concat=n=2:v=1:a=0[x{i}]')
            acc_len += segs[i][1] / f
        acc = f'x{i}'
    fc.append(f'[{acc}]tpad=stop_mode=clone:stop_duration=60,trim=end_frame={nframes},setpts=PTS-STARTPTS,format=yuv420p[v]')
    run(inputs + ['-filter_complex', ';'.join(fc), '-map', '[v]', '-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '15',
                  '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', str(dst)])
    if spec.get('渐暗'):
        # 灯一盏一盏灭：从右往左擦成压暗版（同一时刻的画面，不回跳）
        a0, dd = float(spec['渐暗']['at']), float(spec['渐暗'].get('dur', 4))
        k0 = round(a0 * FPS)
        tmp = TMP / f'{sid}-dim.mp4'
        fc2 = (f"[0:v]fps={FPS},settb=1/{FPS},split[a0][b];[a0]fps={FPS}[a];[b]trim=start_frame={k0},setpts=PTS-STARTPTS,fps={FPS},settb=1/{FPS},eq=brightness=-0.32:saturation=0.45:gamma=0.85[d];"
               f"[a][d]xfade=transition=wipeleft:duration={dd}:offset={a0},trim=end_frame={nframes},setpts=PTS-STARTPTS,format=yuv420p[v]")
        run(['-i', str(dst), '-filter_complex', fc2, '-map', '[v]', '-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '15',
             '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', str(tmp)])
        tmp.replace(dst)
    got = frames_of(dst)
    assert got == nframes, (sid, got, nframes)
    # 原声：带「原声」的段按输出位置放好（全片再放慢 f 倍时音频同步 atempo），段头尾 0.15 秒淡入淡出，写 <镜头号>.wav；总装自动混
    import numpy as np
    wav_out = OUT / f'{sid}.wav'
    a_segs = [(starts[i], recs[i]['原声']) for i in range(len(segs)) if recs[i].get('原声')]
    if a_segs:
        SR = 48000
        mix = np.zeros((int(round(nframes / FPS * SR)), 2), np.float32)
        for st, ar in a_segs:
            r = subprocess.run([FF, '-v', 'error', '-i', str(TMP / ar['文件']), '-af', f'atempo={f:.5f}', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
                               capture_output=True)
            x = np.frombuffer(r.stdout, np.float32).reshape(-1, 2).copy()
            fl = int(.15 * SR)
            if len(x) > 2 * fl:
                ramp = np.linspace(0, 1, fl, dtype=np.float32)[:, None]
                x[:fl] *= ramp; x[-fl:] *= ramp[::-1]
            a0 = int(round(st / FPS * SR))
            n = max(0, min(len(x), len(mix) - a0))
            mix[a0:a0 + n] += x[:n]
        subprocess.run([FF, '-v', 'error', '-y', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-i', '-', '-c:a', 'pcm_s16le', str(wav_out)],
                       input=np.clip(mix, -1, 1).tobytes(), check=True)
    elif wav_out.exists():
        wav_out.unlink()
    if acc_len < nframes and not note:
        note = f'最后一帧停住 {(nframes - acc_len) / FPS:.1f} 秒'
    # 每秒 2 帧检查图 + 人脸/人体检查
    cd = CHK / sid
    shutil.rmtree(cd, ignore_errors=True); cd.mkdir(parents=True)
    run(['-i', str(dst), '-vf', 'fps=2', '-q:v', '3', str(cd / '%04d.jpg')])
    imgs = sorted(str(x) for x in cd.glob('*.jpg') if not x.name.startswith('._'))
    fc1 = subprocess.run([str(FACE)] + imgs, capture_output=True, text=True).stdout.strip().splitlines()
    pc1 = subprocess.run([str(PERSON)] + imgs, capture_output=True, text=True).stdout.strip().splitlines()
    yo = []
    if VENV_PY.exists() and YOLO.exists():
        yo = subprocess.run([str(VENV_PY), str(YOLO)] + imgs, capture_output=True, text=True).stdout.strip().splitlines()
    yolo_hits = [ln for ln in yo if ln.count('\t') >= 1 and ln.split('\t')[1] != '0']
    faces = [ln for ln in fc1 if ln.split('\t')[1] not in ('0',)]
    persons = [ln for ln in pc1 if ln.split('\t')[1] != '0' or ln.split('\t')[2] != '0']
    rec = dict(key=key, 镜头=sid, 帧数=nframes, 段=recs, 补长=note or '无', 检查帧=len(imgs),
               facecheck命中=[Path(x.split('\t')[0]).name + ' ' + x.split('\t')[1] for x in faces],
               personcheck命中=[Path(x.split('\t')[0]).name + ' ' + '\t'.join(x.split('\t')[1:]) for x in persons],
               yolo命中=[Path(x.split('\t')[0]).name + ' ' + '\t'.join(x.split('\t')[1:]) for x in yolo_hits],
               原声=bool(a_segs))
    rj.write_text(json.dumps(rec, ensure_ascii=False, indent=1))
    for p, _, _ in segs:
        p.unlink(missing_ok=True)
    for p in TMP.glob(f'{sid}-*'):
        p.unlink(missing_ok=True)
    print(sid, f'{nframes} 帧', note or '', '| facecheck', len(faces), '| personcheck', len(persons), '| YOLO', len(yolo_hits), '| 原声' if a_segs else '',
          '| 防抖', [(r.get('抖动前'), r.get('抖动后')) for r in recs if r.get('防抖')], flush=True)


def main():
    need_ws()
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    force = '--force' in sys.argv
    table = json.loads(TABLE.read_text())
    tl = json.loads(TL.read_text())
    nf = {s['stable_id']: round(s['t1'] * FPS) - round(s['t0'] * FPS) for s in tl['scenes']}
    for sid in (args or [k for k in table if not k.startswith('_')]):
        if sid not in table:
            print(sid, '实拍表里没有'); continue
        try:
            build(sid, table[sid], nf[sid], force)
        except Exception as e:
            print(sid, '失败：', str(e)[-600:], flush=True)


if __name__ == '__main__':
    main()
