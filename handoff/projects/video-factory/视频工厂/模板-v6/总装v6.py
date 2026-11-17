# -*- coding: utf-8 -*-
"""总装v6（通用模板版，2026-10-07 从 T009《大阪USJ有多牛逼》v6 固化）：分镜头 mp4 + 旁白 + 配乐 + 音效 + 字幕 + 底部导航 → 成片。

每期不同的东西（旁白、成片路径、配乐分段、刻意音乐动作、导航标签与起始镜头、片名）都从同目录 项目.json 读，本文件不改。
只用 ffmpeg + numpy/scipy，不跑任何模型；视频重编码套 mac-heavy-job（退出码 75 = 别的重任务在跑，等 90 秒重试，绝不删锁）。

用法（在任意目录都行，路径一律 resolve）：
  python3 总装v6.py                                   # 全片：镜头/manifest.json → 项目.json「成片输出」
  python3 总装v6.py --start S19 --test 30 --work 自测/总装测试 --out 自测/总装测试/总装测试-30s.mp4
                                                     # 测试：从 S19 开头起只出 30 秒（不写成片位置）
  其他选项：--storyboard 分镜（默认 工程/.work/storyboard.json）  --audio-only 只出混音和记录、不编码视频
            --duck-db 3（说话时音乐再压几 dB；默认取 项目.json 配乐「闪避dB」）  --stems 另存 旁白/配乐/音效 三条分轨（试听、质检）
            --manifest / --sfx / --narration 换输入文件
  测试片校验：python3 质检/校验测试片.py 成片.mp4 渲染/拼接记录-v6.json（响度、静音段、音效时刻匹配滤波）

做什么：
  1 拼接：按 storyboard 顺序串接 manifest 里的镜头 mp4（-c copy），逐个核对 id、帧数、1920×1008/30fps，总帧数断言 = 时间轴帧数。
  2 配乐（按结构段，不按章；分段写在 项目.json「配乐.分段」）：曲子不够长就在曲内乐句处
    （能量低点 + 和声/音色相似 + 起拍对齐）跳回循环，接缝 1 秒等功率交叉淡化；段间 2 秒交叉淡化。
    刻意动作（项目.json「配乐.刻意动作」，每种最多一次）：收住（某段自然结尾落在段末）、上扬（新曲从无到满，锚点句）、
    抽空再进（锚点句前若干秒抽空，下一句再进）。锚点是旁白原文片段，必须在全片只出现一次。
    40 Hz 高通 + 2.5 kHz −3 dB 给人声让位；人声出现时轻压 闪避dB（起 80 ms、保持 250 ms、放 600 ms）；
    校准前先做「慢速电平骑行」（每段 3 秒短时响度，增益 clip(段目标 − 短时响度, −4, +6) dB，约 2 秒平滑；段目标随旁白 3 秒响度
    微调 ±2.5 dB 以内；项目.json「配乐.刻意动作区间」里的秒数区间不碰，没写就按刻意动作自动算）；
    再逐段按实测校准：说话时音乐比人声低「比人声低dB」（默认 20；USJ v6 定稿 19.8–20.1）。全片尾 3 秒淡出（只淡音乐和音效，不淡旁白）；
    曲子末尾是很轻的尾奏时用「src_end」把它挪到片尾之后（USJ M4b = 145），片尾配乐不能断。
  3 音效：读 sfx_events.json，按 explainer-video-workflow reference 05「动作 → 音效对照」选文件、算放置时间、等功率声像（≤±60%）；
    分档：轻（很轻，旁白 −22～−12 LU）/ 中（≤ −4 LU）/ 重（≤ −1 LU）；0.3 秒内只响较重的一个；中重档相邻 ≥ 2.5 秒，
    冲突就降成轻档（不能降的跳过；事件标了 exception（如「连盖」「连击」「连拍」）的不参加间隔检查、不被 0.3 秒合并、
    不计入次数上限，保持原档，再按事件 gain 降）；hit-重 全片 ≤ 6，胶片噪声每 10 分钟 ≤ 1，低频咚 ≤ 2。每条都写进记录（放了 / 降档 / 跳过及原因）。
  4 字幕：ASS 烧在 1920×1008 内容区，每句 t0 → min(t1+0.1, 下一句 t0−0.02)；深墨底条白字，框在 y≈937–994，不压出处条（881–921）。
  5 底部导航 1920×72：项目.json「导航」的标签与起始镜头（默认 8 段，每段等宽）；纸色底、墨色字、当前段朱红，顶上一条朱红进度细线；vstack 到底部。
  6 响度：旁白先限峰 −8 dBFS；混音后线性增益到约 −14 LUFS + 真峰限幅（4 倍过采样），再两遍 loudnorm（linear）到
    −14 LUFS、真峰 ≤ −1.5 dBTP；编码后实测，超了自动压低限幅门限重做（只重做音频）。
  7 硬性校验：配乐/音效/旁白文件缺失 → 报错退出；音效种类认不出 → 报错退出；音乐覆盖率 < 85% 或放进去的音效为 0 → 报错退出；
    loudnorm 退成 dynamic → 报错退出。写 拼接记录-v6.json（bgm 段落与接缝、覆盖率、音效数 = 事件数、跳过与原因、响度）。
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from scipy.signal import butter, lfilter, resample_poly, sosfilt

V6 = Path(__file__).resolve().parent                      # 先 resolve 再取 parent（v5 就是这里错了一层，配乐全丢）
FF = imageio_ffmpeg.get_ffmpeg_exe()
HEAVY = ['/usr/bin/python3', str(Path.home() / '.local' / 'bin' / 'mac-heavy-job.py')]
FPS, SR = 30, 48000
CONTENT = (1920, 1008)
NAV_H = 72

# ---------------------------------------------------------------- 每期设置：项目.json（新建一期.py 写骨架；字段见 模板-v6/README.md）
PROJECT_JSON = V6 / '项目.json'
P = json.loads(PROJECT_JSON.read_text(encoding='utf-8')) if PROJECT_JSON.exists() else {}


def _p(v):
    """项目.json 里的路径：绝对路径照用，相对路径按本文件所在的 画面v6/ 目录算。"""
    v = Path(str(v)).expanduser()
    return v if v.is_absolute() else V6 / v


AUDIO_JSON = _p(P.get('时间轴', '工程/.work/storyboard-audio.json'))
try:                                                     # 总帧数 = 时间轴帧数（各镜头 round(t1×30)−round(t0×30) 之和）
    _A0 = json.loads(AUDIO_JSON.read_text(encoding='utf-8'))
    TOTAL_FRAMES = sum(round(s['t1'] * FPS) - round(s['t0'] * FPS) for s in _A0['scenes'])
    N_SCENES = len(_A0['scenes'])
except (OSError, ValueError, KeyError):
    TOTAL_FRAMES = N_SCENES = None                        # main() 里 need_file 会报缺时间轴
MUSIC_DIR = _p(P.get('配乐目录', '声音'))
SFX_DIR = _p(P.get('音效目录', '声音/音效'))
NARRATION = _p(P.get('旁白', '声音/旁白.wav'))
OUT_DEFAULT = _p(P['成片输出']) if P.get('成片输出') else Path.home() / 'Desktop' / '视频工厂' / '2-成片' / f"{P.get('期名', V6.parent.name)}-v6.mp4"
NAME = P.get('期名') or V6.parent.name                   # 文件名用（SRT）


def _sections_from_project():
    """项目.json「配乐.分段」→ BGM sections。每段：名、曲子（相对 声音/ 或绝对）、起镜头、止镜头、对齐（开头/结尾）、src_end（可省）、比人声低dB、最多接缝（可省，默认 3）。"""
    out = []
    for i, s in enumerate((P.get('配乐') or {}).get('分段') or []):
        al = {'开头': 'start', '结尾': 'end', 'start': 'start', 'end': 'end'}[s.get('对齐', '结尾')]
        d = dict(name=s.get('名') or f'M{i + 1}', file=s['曲子'], first=s['起镜头'], last=s['止镜头'], align=al,
                 gap_db=float(s.get('比人声低dB', 20.0)))
        if s.get('src_end') is not None:
            d['src_end'] = float(s['src_end'])          # 听过、看过能量曲线后定的乐句边界：让它落在本段末（align=end 时）
        if s.get('最多接缝') is not None:
            d['max_seams'] = int(s['最多接缝'])          # 曲子比段落短很多、3 个接缝续不够时加到 4（默认 3）
        out.append(d)
    return out


def _freeze_from_project():
    """项目.json「配乐.刻意动作区间」→ 电平骑行不碰的全片秒数区间 [(起, 止), …]。没写返回 []（main() 里按刻意动作自动算）。"""
    out = []
    for z in (P.get('配乐') or {}).get('刻意动作区间') or []:
        a, b = float(z[0]), float(z[1])
        if b <= a:
            raise SystemExit(f'[总装v6 失败] 项目.json 配乐.刻意动作区间 [{a}, {b}] 起点要小于止点')
        out.append((a, b))
    return out


def _actions_from_project():
    """项目.json「配乐.刻意动作」→ BGM actions（每种最多一次）：
    {种类:收住, 曲段:M2, 淡出秒:1.5} / {种类:上扬, 曲段:M3, 锚点:'美国人', 后延秒:.2} / {种类:抽空再进, 锚点:'所以我的判断是', 提前秒:.8, 退秒:.25, 进秒:.3}"""
    out = []
    for a in (P.get('配乐') or {}).get('刻意动作') or []:
        k = a['种类']
        if k == '收住':
            out.append(dict(kind='收住', section=a['曲段'], fade=float(a.get('淡出秒', 1.5))))
        elif k == '上扬':
            out.append(dict(kind='上扬', section=a['曲段'], anchor=a['锚点'], after=float(a.get('后延秒', .2))))
        elif k == '抽空再进':
            out.append(dict(kind='抽空再进', anchor=a['锚点'], lead=float(a.get('提前秒', .8)), out_fade=float(a.get('退秒', .25)),
                            in_fade=float(a.get('进秒', .3))))
        else:
            raise SystemExit(f'[总装v6 失败] 项目.json 配乐.刻意动作 种类「{k}」认不出（只有 收住 / 上扬 / 抽空再进）')
    kinds = [a['kind'] for a in out]
    if len(kinds) != len(set(kinds)):
        raise SystemExit('[总装v6 失败] 项目.json 配乐.刻意动作 每种只能写一次')
    return out

# ---------------------------------------------------------------- 配乐表（按结构段）
BGM = dict(
    base_lufs=-36.0,              # 各曲先对齐到这个响度，再逐段按「说话时比人声低 gap_db」校准
    duck_db=float((P.get('配乐') or {}).get('闪避dB', 3.0)), attack=.08, hold=.25, release=.6, talk_db=-45.0,
    xfade=2.0,                    # 段间交叉淡化（要求 1.5–2.5 秒）
    loop_xfade=1.0,               # 曲内循环接缝的交叉淡化
    loop_slack=3.0,               # 循环后多出来的长度（≤ 3 秒）从曲头/曲尾让掉
    shift_tol=2.0,                # 曲子只差 ≤ 2 秒时不循环，结尾提前落下
    hpf=40.0, eq=(2500.0, -3.0, 0.7),
    fade_in=0.8, tail_fade=3.0,
    present_dbfs=-60.0,           # 100 ms RMS 高于此值算「有音乐」（覆盖率）
    sections=_sections_from_project(),            # 项目.json「配乐.分段」（USJ v6 定稿：M4b 加 src_end=145，gap_db 19.8–20.1）
    # 慢速电平骑行（2026-10-07 USJ v6 修复「安静段几乎听不见、个别段偏响」）：每段音乐（还没套交叉淡化/上扬/收住包络）
    # 算 3 秒 K 加权短时响度，增益 = clip(段目标 − 短时响度, −4, +6) dB，再约 2 秒平滑；段目标 = 本段核心区短时响度中位数。
    # 刻意音乐动作区不碰（区内增益按区外两端连起来，不追着「收住、上扬、抽空」去补）；骑行后再逐段按 gap_db 校准。
    # follow_voice：段目标随旁白 3 秒（只算说话）响度微调，最多 ±follow_max dB（旁白自身 3 秒响度标准差约 0.8 dB），让说话时的间距更稳
    # freeze：项目.json「配乐.刻意动作区间」[[起秒, 止秒], …]；没写就在 main() 里按刻意动作自动算（_auto_freeze）
    ride=dict(win=3.0, smooth=2.0, lo=-4.0, hi=6.0, hop=0.1, freeze=_freeze_from_project(), follow_voice=True, follow_max=2.5),
    actions=_actions_from_project(),              # 项目.json「配乐.刻意动作」（12 分钟以内 2–3 次）
)

# ---------------------------------------------------------------- 音效对照（reference 05「动作 → 音效对照」）
TIERS = {'轻': -12.0, '中': -4.0, '重': -1.0}            # 每档上限：音效 400 ms 瞬时响度最大值 ≤ 旁白说话中位 + 这个值（LU）
LIGHT_FLOOR, FLOOR_MAX_BOOST = -22.0, 12.0               # 轻档下限：低于旁白 22 LU 就听不见了（单下 tick 预设 −34 LU），最多补 12 dB
VOICE_LIMIT = -8.0                                       # 旁白先限峰：整体增益约 +5.5 dB 后旁白峰值落在真峰门限 −2.5 下面，限幅器只碰音效瞬态
TIER_RANK = {'轻': 0, '中': 1, '重': 2}
ALIASES = {
    'paper': 'paper', '纸': 'paper', '纸张': 'paper', 'page': 'paper',
    'shutter': 'shutter', '快门': 'shutter', 'camera': 'shutter',
    'burst': 'burst', 'shutter-burst': 'burst', 'shutter_burst': 'burst', '连拍': 'burst', '快门-连拍': 'burst',
    'marker': 'marker', '马克笔': 'marker', 'pen': 'marker', 'highlight': 'marker',
    'click': 'click', '嗒': 'click',
    'tick': 'tick', '嘀嗒': 'tick', 'count': 'tick',
    'ding': 'ding', '叮': 'ding',
    'stamp': 'stamp', '盖章': 'stamp', 'stamp2': 'stamp',
    'stamp1': 'stamp1', '盖章-单下': 'stamp1',
    'pop': 'pop', '弹': 'pop', '弹出': 'pop',
    'hit': 'hit', 'hit-light': 'hit', 'hit_light': 'hit', 'hit-轻': 'hit', 'impact': 'hit',
    'hit-heavy': 'hit-heavy', 'hit_heavy': 'hit-heavy', 'hitheavy': 'hit-heavy', 'hit-重': 'hit-heavy', 'heavy': 'hit-heavy',
    'whoosh': 'whoosh', '嗖': 'whoosh', 'swoosh': 'whoosh', 'swish': 'whoosh',
    'riser': 'riser', 'riser-1.2': 'riser', 'riser1.2': 'riser', 'riser-1.2s': 'riser',
    'riser-1.5': 'riser15', 'riser1.5': 'riser15', 'riser15': 'riser15', 'riser-1.5s': 'riser15',
    'film': 'film', '胶片': 'film', '胶片噪声': 'film',
    'boom': 'boom', '咚': 'boom', 'dong': 'boom',
    'type': 'type', 'typing': 'type', '打字': 'type',
    'growl': 'growl', 'roar': 'growl', '吼': 'growl', '嗷呜': 'growl',                     # 2026-10-07：S27「嗷呜！」卡通吼声
    'pat3': 'pat3', '轻拍三下': 'pat3', '哒哒哒': 'pat3',                                     # 2026-10-07：S06「哒哒哒——」三下快速轻拍
}
CARD_TYPES = {'chaptercard', 'panel', 'note', 'note2', 'quotecard', 'text', 'label', 'caption', 'bigquote'}
DOC_TYPES = {'docpage', 'photocard', 'evidence', 'videocard', 'parallax', 'fullbleed'}


def die(msg):
    print('[总装v6 失败] ' + msg, file=sys.stderr)
    sys.exit(1)


def need_file(p, what):
    """文件必须存在且可读（媒体可能是指向 Extreme SSD 的符号链接，SSD 没挂载时报缺盘，不另造替代文件）。"""
    p = Path(p)
    if p.is_symlink() and not p.exists():
        die(f'{what}是指向外置盘的链接，目标不可读（SSD 没挂载？）：{p} → {os.readlink(p)}')
    if not p.is_file():
        die(f'缺{what}：{p}')
    if not os.access(p, os.R_OK):
        die(f'{what}不可读：{p}')
    return p.resolve()


def media_run(args, what, *, text=True, wait=30, retries=120):
    """ffmpeg/抽帧串行共享重任务锁，75 只等。"""
    for k in range(retries):
        r = subprocess.run(HEAVY + ['--wait', '30', '--'] + [str(a) for a in args], capture_output=True, text=text)
        if r.returncode == 75:
            print(f'[等待] 重任务锁被占用，{wait} 秒后重试 {what}（第 {k+1} 次）', flush=True)
            time.sleep(wait)
            continue
        if r.returncode:
            print(r.stderr[-4000:], file=sys.stderr)
            die(f'{what} 失败（退出码 {r.returncode}）')
        return r
    die(f'{what}：重任务锁等待超时，请稍后再跑')


def run(args, what):
    return media_run(args, what).stderr


def run_heavy(args, what, wait=30, retries=120):
    return media_run(args, what, wait=wait, retries=retries).stderr


def decode(p, ch):
    raw = media_run([FF, '-v', 'error', '-i', str(p), '-vn', '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-'], '音频解码', text=False).stdout
    if not raw:
        die(f'解码失败：{p}')
    return np.frombuffer(raw, np.float32).reshape(-1, ch).copy()


def probe_video(p):
    e = run([FF, '-hide_banner', '-i', str(p), '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-'], '核对视频帧数')
    fr = re.findall(r'frame=\s*(\d+)', e)
    m = re.search(r'Video: (\w+).*?, (yuv\w+)[^,]*,.*? (\d{3,5})x(\d{3,5})', e)
    fps = re.search(r'([\d.]+) fps', e)
    return dict(frames=int(fr[-1]) if fr else -1, codec=m.group(1) if m else None, pix=m.group(2) if m else None,
                size=(int(m.group(3)), int(m.group(4))) if m else None, fps=float(fps.group(1)) if fps else None)



def seam_plan(man, specs):
    """字段省略=硬切。以 30fps 吸附，任何错误配置都明确拒绝。"""
    if not isinstance(specs, list):
        raise ValueError('项目.json「接缝淡化」必须是列表')
    ids = [r['id'] for r in man]
    plan = {}
    for item in specs:
        if not isinstance(item, dict) or '镜头' not in item or '秒' not in item:
            raise ValueError('接缝淡化：每项需要「镜头」和「秒」')
        sid, sec = item['镜头'], item['秒']
        if sid not in ids or sid == ids[0] or sid in plan:
            raise ValueError(f'接缝淡化：{sid} 不存在、是首镜头或重复配置')
        if isinstance(sec, bool) or not isinstance(sec, (int, float)) or not math.isfinite(sec) or not 0 < sec <= 1:
            raise ValueError(f'接缝淡化 {sid}：秒数必须在 (0, 1]')
        n = round(sec * FPS)
        if n < 2 or n >= man[ids.index(sid)]['frames']:
            raise ValueError(f'接缝淡化 {sid}：至少 2 帧、且短于目标镜头')
        plan[sid] = n
    return plan


def seam_parts(shots, man, plan, work):
    """前镜末帧冻结，覆盖后镜头开头原有 n 帧；不插入、不重叠剪短。其余视频包原样复制。"""
    parts, records = [], []
    ids = [r['id'] for r in man]
    d = work / '接缝'; d.mkdir(parents=True, exist_ok=True)
    for shot in shots:
        sid, cur, total = shot['id'], Path(shot['file']), shot['frames']
        n = plan.get(sid)
        if n is None:
            parts.append(shot)
            continue
        prev = man[ids.index(sid)-1]
        src_prev = Path(prev['file'])
        if not src_prev.exists():
            src_prev = cur.parent / src_prev.name
        src_prev = need_file(src_prev, f'接缝 {sid} 前一镜头 {prev["id"]} 的 mp4')
        # 只解码关键帧来找可以独立拷贝的尾段入口，不假设旧缓存的 GOP 长度。
        info = run([FF, '-hide_banner', '-nostats', '-skip_frame', 'nokey', '-i', cur, '-an', '-vf', 'showinfo', '-f', 'null', '-'], f'{sid} 关键帧定位')
        keys = sorted(set(round(float(t)*FPS) for t in re.findall(r'pts_time:([\d.]+)', info)))
        k = next((k for k in keys if k >= n), total)
        if k > n + 15:
            raise ValueError(f'接缝 {sid}：旧镜头 GOP 太长，需重编码开头 {k/FPS:.2f}s；请用新版分段渲染器重渲该镜头（半秒封闭 GOP）')
        frozen, prefix, tail = d / f'{sid}-前镜末帧.png', d / f'{sid}-淡化前段.mp4', d / f'{sid}-复制尾段.mp4'
        run_heavy([FF, '-y', '-v', 'error', '-i', src_prev, '-vf', f'select=eq(n\,{prev["frames"]-1})', '-fps_mode', 'passthrough', '-frames:v', '1', frozen], f'{sid} 前镜末帧')
        # blend 的 N 从 1 开始；第0帧=完整前镜末帧，第n-1帧=完整后镜对应帧。
        q = f'min(1,(N-1)/{n-1})'
        filt = f'[0:v]trim=end_frame={k},setpts=PTS-STARTPTS,format=yuv420p[a];[1:v]trim=end_frame={k},setpts=PTS-STARTPTS,format=yuv420p[b];[b][a]blend=all_expr=\'A*({q})+B*(1-({q}))\'[v]'
        run_heavy([FF, '-y', '-v', 'error', '-loop', '1', '-framerate', str(FPS), '-i', frozen, '-i', cur,
                   '-filter_complex_threads', '1', '-filter_complex', filt, '-map', '[v]', '-an', '-frames:v', str(k), '-c:v', 'libx264',
                   '-preset', 'veryfast', '-crf', '18', '-threads', '3', '-x264-params', 'keyint=15:min-keyint=15:scenecut=0:bframes=0:open-gop=0',
                   '-pix_fmt', 'yuv420p', '-r', str(FPS), '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709',
                   '-color_trc', 'bt709', '-video_track_timescale', '30000', prefix], f'{sid} 淡化前段编码')
        if probe_video(prefix)['frames'] != k:
            raise RuntimeError(f'接缝 {sid} 前段帧数错误')
        parts.append(dict(id=sid+'-淡化', file=str(prefix), frames=k))
        if k < total:
            run([FF, '-y', '-v', 'error', '-ss', f'{k/FPS:.9f}', '-i', cur, '-map', '0:v:0', '-an', '-c:v', 'copy', '-video_track_timescale', '30000', tail], f'{sid} 尾段视频包复制')
            if probe_video(tail)['frames'] != total-k:
                raise RuntimeError(f'接缝 {sid} 尾段帧数错误（应为 {total-k}）')
            parts.append(dict(id=sid+'-尾段', file=str(tail), frames=total-k))
        records.append(dict(shot=sid, previous=prev['id'], requested_seconds=n/FPS, blend_frames=n, encoded_frames=k,
                            copied_frames=total-k, frozen_frame=prev['frames']-1, timeline_frames=total,
                            source=str(cur), prefix=str(prefix), tail=str(tail) if k<total else None,
                            scheme='前镜末帧冻结 → 后镜开头原有帧；GOP 后的尾段 -c copy；声音和字幕时间不变'))
    assert sum(x['frames'] for x in parts) == sum(x['frames'] for x in shots)
    return parts, records


# ---------------------------------------------------------------- 响度工具（BS.1770，48 kHz 系数）
def kweight(x):
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]; a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]; a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, np.asarray(x, np.float64), axis=0), axis=0)


KB1, KA1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
KB2, KA2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]


def kpow_chunks(x, chunk=SR * 10):
    """逐块 K 加权（带滤波器状态，结果与整段一次滤波相同），每块产出 (起点, 每样本声道功率和)。不生成整条 float64 副本。"""
    x2 = x if x.ndim == 2 else x[:, None]
    z1 = np.zeros((2, x2.shape[1])); z2 = np.zeros((2, x2.shape[1]))
    for i in range(0, len(x2), chunk):
        y, z1 = lfilter(KB1, KA1, np.asarray(x2[i:i + chunk], np.float64), axis=0, zi=z1)
        y, z2 = lfilter(KB2, KA2, y, axis=0, zi=z2)
        yield i, (y * y).sum(axis=1)


def gate(q):
    """q：每 100 ms 的平均功率。400 ms 块、75% 重叠、−70 绝对门限、−10 相对门限。"""
    if len(q) < 4:
        return -99.0
    blk = (q[:-3] + q[1:-2] + q[2:-1] + q[3:]) / 4
    l = -0.691 + 10 * np.log10(blk + 1e-15)
    g = blk[l > -70]
    if not len(g):
        return -99.0
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    return float(-0.691 + 10 * np.log10(blk[(l > -70) & (l > rel)].mean()))


def hop_power(x):
    """每 100 ms 的 K 加权平均功率（声道相加）。"""
    hop = SR // 10
    out = []
    for _, p in kpow_chunks(x):
        n = len(p) // hop
        out.append(p[:n * hop].reshape(n, hop).mean(axis=1))
    return np.concatenate(out)


def lufs(x):
    return gate(hop_power(x))


def lufs_masked(x, mask):
    """只算 mask 为真的样本（拼起来再按 100 ms 分块），说话时 / 停顿时的响度用。"""
    hop = SR // 10
    ps = [p[mask[i:i + len(p)]].astype(np.float32) for i, p in kpow_chunks(x)]
    p = np.concatenate(ps) if ps else np.zeros(0, np.float32)
    n = len(p) // hop
    return gate(p[:n * hop].reshape(n, hop).mean(axis=1, dtype=np.float64)) if n >= 4 else -99.0


def momentary_max(mono):
    y = kweight(np.r_[mono.astype(np.float64), np.zeros(int(.4 * SR))]) ** 2
    c = np.r_[0, np.cumsum(y)]
    blk = int(.4 * SR)
    m = (c[blk:] - c[:-blk])[::SR // 100] / blk
    return float(-0.691 + 10 * np.log10(m.max() + 1e-15))


def true_peak_env(x, step=SR * 10, pad=64):
    """每个样本处的「真峰」包络（4 倍过采样后，每 4 个子样本取最大），float32，分块算。x: (n, ch)。"""
    n = len(x)
    out = np.zeros(n, np.float32)
    for i in range(0, n, step):
        j = min(n, i + step)
        out[i:j] = np.abs(x[i:j]).max(axis=1)
        a, b = max(0, i - pad), min(n, j + pad)
        for c in range(x.shape[1]):
            up = resample_poly(np.asarray(x[a:b, c], np.float64), 4, 1)
            v = np.abs(up).reshape(-1, 4).max(axis=1)[i - a:i - a + (j - i)]
            np.maximum(out[i:j], v.astype(np.float32), out=out[i:j])
    return out


def limiter_gain(x, ceil_db, look=.005, rel=.08, tp=False, block=16):
    """前瞻峰值限幅的增益曲线（所有声道共用）：最小值滤波（前后 look 秒）→ 滑动平均（起始平滑，仍保证不超）→ 逐块释放。
    返回 (增益 float32 或 None=不用压, 过线样本数, 最大压低 dB)。"""
    ceil = 10 ** (ceil_db / 20)
    pk = true_peak_env(x) if tp else np.abs(x).max(axis=1).astype(np.float32)
    need = np.minimum(np.float32(1.0), np.float32(ceil) / np.maximum(pk, np.float32(1e-12)))
    del pk
    n_over = int((need < 1).sum())
    if not n_over:
        return None, 0, 0.0
    n = len(need); nb = -(-n // block)
    gb = np.pad(need, (0, nb * block - n), constant_values=1.0).reshape(nb, block).min(axis=1)
    del need
    L = max(1, int(look * SR / block))
    gb = minimum_filter1d(gb, size=2 * L + 1, mode='nearest')
    gb = uniform_filter1d(gb, size=L + 1, mode='nearest')
    a = math.exp(-block / (rel * SR)); out = np.empty_like(gb); cur = 1.0
    for i, v in enumerate(gb.tolist()):
        cur = v if v < cur else a * cur + (1 - a) * v
        out[i] = cur
    return np.repeat(out.astype(np.float32), block)[:n], n_over, float(20 * np.log10(out.min()))


def biquad_peak(f0, gain_db, q):
    A = 10 ** (gain_db / 40); w = 2 * math.pi * f0 / SR; al = math.sin(w) / (2 * q)
    b = [1 + al * A, -2 * math.cos(w), 1 - al * A]; a = [1 + al / A, -2 * math.cos(w), 1 - al / A]
    return np.array(b) / a[0], np.array(a) / a[0]


# ---------------------------------------------------------------- 曲内循环：找乐句处的跳回点
HOP_A, NFFT_A = 1200, 4096
FR_A = SR / HOP_A                                        # 分析帧率 40 帧/秒


def smooth(x, w):
    k = np.ones(w) / w
    if x.ndim == 1:
        return np.convolve(x, k, 'same')
    return np.stack([np.convolve(x[:, i], k, 'same') for i in range(x.shape[1])], 1)


def analyze(mono):
    a = mono.astype(np.float64)
    n = (len(a) - NFFT_A) // HOP_A + 1
    win = np.hanning(NFFT_A)
    f = np.fft.rfftfreq(NFFT_A, 1 / SR)
    sel = (f >= 55) & (f <= 4200)
    pc = np.round(12 * np.log2(f[sel] / 440.0)).astype(int) % 12
    edges = np.geomspace(40, 16000, 25)
    E = np.zeros(n); C = np.zeros((n, 12)); B = np.zeros((n, 24))
    for i0 in range(0, n, 1000):                        # 分块做 STFT，省内存
        idx = np.arange(NFFT_A)[None, :] + HOP_A * np.arange(i0, min(n, i0 + 1000))[:, None]
        fr = a[idx]
        X = np.abs(np.fft.rfft(fr * win, axis=1)) ** 2
        E[i0:i0 + len(fr)] = 10 * np.log10((fr ** 2).mean(axis=1) + 1e-12)
        P = X[:, sel]
        for k in range(12):
            C[i0:i0 + len(fr), k] = P[:, pc == k].sum(axis=1)
        for k in range(24):
            m = (f >= edges[k]) & (f < edges[k + 1])
            B[i0:i0 + len(fr), k] = np.log10(X[:, m].sum(axis=1) + 1e-10)
    C = C / (C.sum(axis=1, keepdims=True) + 1e-12)
    Es = smooth(E, 16)
    Cs, Bs = smooth(C, 40), smooth(B, 40)
    Bz = (Bs - Bs.mean(0)) / (Bs.std(0) + 1e-9)
    F = np.hstack([Cs / (np.linalg.norm(Cs, axis=1, keepdims=True) + 1e-12), Bz / (np.linalg.norm(Bz, axis=1, keepdims=True) + 1e-12)])
    w = int(2 * FR_A)
    dip = Es - np.convolve(Es, np.ones(2 * w) / (2 * w), 'same')       # 负数 = 比前后 2 秒都低（乐句间的能量低点）
    # 起拍包络（5 ms 一帧，能量差分），用于把接缝对到拍子上
    h5 = SR // 200
    m5 = len(a) // h5
    en = np.sqrt((a[:m5 * h5].reshape(m5, h5) ** 2).mean(axis=1))
    on = np.maximum(0, np.diff(np.log(en + 1e-6), prepend=0))
    return dict(E=Es, F=F, dip=dip, n=n, onset=on, dur=len(a) / SR)


def snap_dip(ft, t, rad=1.5):
    i0, i1 = int(max(0, (t - rad) * FR_A)), int(min(ft['n'] - 1, (t + rad) * FR_A))
    i = i0 + int(np.argmin(ft['E'][i0:i1 + 1]))
    return i / FR_A


def refine_beat(ft, a, b, rad=.15, win=3.0):
    """跳回点 a 在 ±rad 秒内微调，让 b 前后与 a 前后的起拍包络对齐（交叉淡化时鼓点不打架）。"""
    on = ft['onset']; r5 = 200
    bi, w = int(b * r5), int(win * r5)
    if bi - w < 0 or bi + w > len(on):
        return a
    ref = on[bi - w:bi + w] - on[bi - w:bi + w].mean()
    best, ba = -1e9, a
    for d in range(-int(rad * r5), int(rad * r5) + 1):
        ai = int(a * r5) + d
        if ai - w < 0 or ai + w > len(on):
            continue
        s = on[ai - w:ai + w] - on[ai - w:ai + w].mean()
        c = float((ref * s).sum() / (np.linalg.norm(ref) * np.linalg.norm(s) + 1e-9))
        if c > best:
            best, ba = c, ai / r5
    return ba


def plan_loops(ft, segs, X, slack, jmin=8.0, max_seams=3, h=.5):
    """在 segs（播放路径，源时间区间列表）里插入跳回点，使总长增加 X..X+slack 秒。返回新路径与接缝。"""
    F, E, dip = ft['F'], ft['E'], ft['dip']
    n = ft['n']
    W0, W1 = int(1.5 * FR_A), int(3 * FR_A)
    seams, remaining = [], X
    while remaining > 1e-6 and len(seams) < max_seams:
        lo = remaining if remaining < 2 * jmin else jmin
        hi = remaining + slack
        best = None
        for l in range(int(math.ceil(lo * FR_A)), int(hi * FR_A) + 1):
            if l >= n - W0 - W1:                     # 跳距不能接近曲长（要续的长度接近整首时会出现，曲子太短的段落）
                break
            J = l / FR_A
            if not (J >= remaining - 1e-9 or remaining - J >= jmin):
                continue
            S = (F[:-l] * F[l:]).sum(axis=1) / 2
            Sw = np.convolve(S, np.ones(W0 + W1) / (W0 + W1), 'same')
            t = np.arange(max(W0, int((h + .2) * FR_A)), n - l - W1)
            if not len(t):
                continue
            b = t + l
            ok = np.zeros(len(t), bool)
            for sa, sb in segs:                      # b 在某段路径内，且切开后两边都 ≥ 3 秒
                ok |= (b / FR_A >= sa + 3) & (b / FR_A <= sb - 3) & (sb - t / FR_A >= 3)
            for s in seams:                          # 和已有接缝在源里至少隔 2 秒
                for p in (s['src_from'], s['src_to']):
                    ok &= (np.abs(b / FR_A - p) > 2) & (np.abs(t / FR_A - p) > 2)
            if not ok.any():
                continue
            sc = Sw[t] - .02 * np.abs(E[t] - E[b]) - .015 * np.maximum(dip[b], -6) + .1 * min(1.0, J / max(remaining, 1e-6))
            sc[~ok] = -9
            i = int(np.argmax(sc))
            if sc[i] > -9 and (best is None or sc[i] > best[0]):
                best = (float(sc[i]), t[i] / FR_A, b[i] / FR_A, float(Sw[t[i]]), float(dip[b[i]]))
        if best is None:
            break
        _, a, b, sim, dp = best
        a = refine_beat(ft, a, b)
        J = b - a
        for k, (sa, sb) in enumerate(segs):
            if sa + 3 <= b <= sb - 3:
                segs = segs[:k] + [[sa, b], [a, sb]] + segs[k + 1:]
                break
        seams.append(dict(src_from=round(b, 3), src_to=round(a, 3), jump=round(J, 3), similarity=round(sim, 3), dip_db=round(dp, 1)))
        remaining -= J
    return segs, seams, remaining


def render_path(track, segs, h):
    """按播放路径把源音频接起来；接缝处等功率交叉淡化（宽 2h，中心在接缝）。"""
    hs = int(round(h * SR))
    ss = [(int(round(a * SR)), int(round(b * SR))) for a, b in segs]
    total = sum(b - a for a, b in ss)
    out = np.zeros((total + hs, 2), np.float32)
    pos, last = 0, len(ss) - 1
    for i, (a, b) in enumerate(ss):
        pre = hs if i > 0 else 0
        post = hs if i < last else 0
        lo, hi = a - pre, b + post
        chunk = np.zeros((hi - lo, 2), np.float32)
        s0, s1 = max(0, lo), min(len(track), hi)
        if s1 > s0:
            chunk[s0 - lo:s1 - lo] = track[s0:s1]
        env = np.ones(len(chunk), np.float32)
        if pre:
            env[:2 * pre] *= np.sin(np.linspace(0, np.pi / 2, 2 * pre)).astype(np.float32)
        if post:
            env[-2 * post:] *= np.cos(np.linspace(0, np.pi / 2, 2 * post)).astype(np.float32)
        d = pos - pre
        out[d:d + len(chunk)] += chunk * env[:, None]
        pos += b - a
    return out[:total]


def ramp(t, a, b):
    return np.clip((t - a) / max(1e-6, b - a), 0, 1)


def ride_curve(layer, n0, A, B, vdev=None):
    """慢速电平骑行的增益曲线（每 100 ms 一点，dB）和对应的成片时刻。layer = 本段音乐（未套包络），n0 = 它在成片里的起点样本。
    3 秒短时响度（K 加权、居中窗）→ clip(段目标 − 短时响度, lo, hi) → 冻结区按两端连线 → 约 2 秒居中平滑。"""
    R = BGM['ride']
    hop = int(R['hop'] * SR)
    p = hop_power(layer)                                         # 每 100 ms 的 K 加权功率（声道相加）
    st = -0.691 + 10 * np.log10(uniform_filter1d(p, size=int(round(R['win'] / R['hop'])), mode='nearest') + 1e-15)
    t_h = (n0 + (np.arange(len(p)) + .5) * hop) / SR
    core = (t_h >= A + 1.5) & (t_h <= B - 1.5)
    for z0, z1 in R['freeze']:
        core &= ~((t_h >= z0 - R['win'] / 2) & (t_h <= z1 + R['win'] / 2))
    target = float(np.median(st[core])) if core.any() else float(np.median(st))
    tgt = np.full(len(st), target)
    if vdev is not None and R.get('follow_voice'):                # vdev：全片每 100 ms 的旁白 3 秒响度偏差（dB，相对本段中位）
        k = np.clip(np.round(t_h / R['hop'] - .5).astype(int), 0, len(vdev) - 1)
        dv = vdev[k]
        dv = dv - np.median(dv[core]) if core.any() else dv - np.median(dv)
        tgt = tgt + np.clip(dv, -R['follow_max'], R['follow_max'])
    g = np.clip(tgt - st, R['lo'], R['hi'])
    for z0, z1 in R['freeze']:                                   # 刻意动作区：区内增益 = 区外两端连线（只有一端在本段里就用那一端）
        inz = (t_h >= z0) & (t_h <= z1)
        if not inz.any():
            continue
        bi, ai = np.where(t_h < z0)[0], np.where(t_h > z1)[0]
        gb = g[bi[-1]] if len(bi) else None
        ga = g[ai[0]] if len(ai) else None
        g[inz] = (np.interp(t_h[inz], [z0, z1], [gb, ga]) if gb is not None and ga is not None else (gb if gb is not None else ga))
    g = uniform_filter1d(g, size=int(round(R['smooth'] / R['hop'])), mode='nearest')
    return t_h, g, target, st


# ---------------------------------------------------------------- 主流程
# 字幕样式：项目.json「字幕样式」= '描边'（地图片：白字黑描边阴影、无底框，2026-10-27）；默认深色底框
def _sub_style():
    try:
        pj = json.loads((Path(__file__).resolve().parent / '项目.json').read_text(encoding='utf-8'))
    except Exception:
        pj = {}
    if pj.get('字幕样式') == '描边':
        return 'Style: Default,Source Han Sans CN Medium,44,&H00FFFFFF,&H00FFFFFF,&H50000000,&H78000000,0,0,0,0,100,100,1,0,1,2.4,1.6,2,90,90,26,1\n'
    return 'Style: Default,Source Han Sans CN Medium,44,&H00FFFFFF,&H00FFFFFF,&H1A181C1E,&H1A181C1E,0,0,0,0,100,100,1,0,3,8,0,2,90,90,21,1\n'


SUB_STYLE = _sub_style()


def main():
    ap = argparse.ArgumentParser(description=f'v6 总装（{NAME}）')
    ap.add_argument('--manifest', default=str(V6 / '镜头' / 'manifest.json'))
    ap.add_argument('--storyboard', default=str(V6 / '工程' / '.work' / 'storyboard.json'))
    ap.add_argument('--sfx', default=str(V6 / '工程' / '.work' / 'sfx_events.json'))
    ap.add_argument('--narration', default=str(NARRATION))
    ap.add_argument('--work', default=str(V6 / '渲染'))
    ap.add_argument('--out', default=str(OUT_DEFAULT))
    ap.add_argument('--test', type=float, default=None, help='只出 N 秒（测试）')
    ap.add_argument('--start', default=None, help='测试片从哪个镜头的开头起（镜头号，如 S19；默认从片头）。配乐、音效、字幕、导航都按全片时间算好再截这一段')
    ap.add_argument('--duck-db', type=float, default=BGM['duck_db'])
    ap.add_argument('--audio-only', action='store_true')
    ap.add_argument('--trad', action='store_true', help='油管繁体版：字幕和导航转台湾繁体（屏上字另用 V6_TRAD=1 重拼分镜、重渲）')
    ap.add_argument('--stems', action='store_true', help='另存 旁白/配乐/音效 三条分轨（24 bit，已含整体增益，未限幅），试听和质检用')
    args = ap.parse_args()
    t_start = time.time()
    work = Path(args.work).resolve(); work.mkdir(parents=True, exist_ok=True)
    out = Path(args.out).resolve(); out.parent.mkdir(parents=True, exist_ok=True)
    rec = dict(version='v6', project=NAME, mode='test' if (args.test or args.start) else 'full', out=str(out),
               started=time.strftime('%Y-%m-%d %H:%M:%S'))
    rec_path = work / '拼接记录-v6.json'

    def save_rec():
        rec_path.write_text(json.dumps(rec, ensure_ascii=False, indent=1))

    # ---------- 0) 输入齐不齐：分镜、旁白、配乐、音效库，缺一个就停 ----------
    sb_path = need_file(args.storyboard, '分镜 storyboard.json')
    aud_path = need_file(AUDIO_JSON, '时间轴 storyboard-audio.json')
    man_path = need_file(args.manifest, '镜头 manifest.json')
    sfx_path = need_file(args.sfx, '音效事件 sfx_events.json')
    narr_path = need_file(args.narration, '旁白')
    for sec in BGM['sections']:
        sec['path'] = need_file(MUSIC_DIR / sec['file'], f'配乐 {sec["name"]} ')
    if not SFX_DIR.is_dir():
        die(f'缺音效库目录：{SFX_DIR}')
    ev0 = json.loads(sfx_path.read_text())
    bad = sorted({str(e.get('kind')) for e in ev0 if ALIASES.get(str(e.get('kind', '')).strip().lower(), ALIASES.get(str(e.get('kind', '')).strip())) is None})
    if bad:                                           # 先查种类，免得混完音才发现
        die('认不出的音效种类：' + '、'.join(bad) + '（在 总装v6.py 的 ALIASES 里加对照，或改镜头脚本的 sfx=）')

    sb = json.loads(sb_path.read_text())
    aud = json.loads(aud_path.read_text())
    scenes, beats = sb['scenes'], sb['beats']
    assert len(scenes) == len(aud['scenes']), f'分镜应有 {len(aud["scenes"])} 个镜头（时间轴），现在 {len(scenes)}'
    for a, b in zip(scenes, aud['scenes']):
        assert a['stable_id'] == b['stable_id'] and a['t0'] == b['t0'] and a['t1'] == b['t1'], f'镜头时间与旁白时间轴不一致：{a["stable_id"]}'
    assert beats == aud['beats'], '分镜的 beats 与 storyboard-audio.json 不一致'
    N_full = round(sb['meta']['duration'] * FPS)
    assert N_full == TOTAL_FRAMES, f'总帧数 {N_full} ≠ {TOTAL_FRAMES}'
    T_full = N_full / FPS
    sid_idx = {s['stable_id']: i for i, s in enumerate(scenes)}
    fr_of = lambda s: round(s['t1'] * FPS) - round(s['t0'] * FPS)
    if not BGM['sections']:                                  # 项目.json 的配乐设置先核一遍（缺了就停，不静默跳过）
        die('项目.json 没写配乐分段（配乐.分段）')
    for sec in BGM['sections']:
        for k, nm in (('first', '起镜头'), ('last', '止镜头')):
            if sec[k] not in sid_idx:
                die(f'项目.json 配乐分段 {sec["name"]} 的{nm} {sec[k]} 不在时间轴里')
    for a_ in BGM['actions']:
        if a_.get('section') and a_['section'] not in [x['name'] for x in BGM['sections']]:
            die(f'项目.json 刻意动作「{a_["kind"]}」写的曲段 {a_["section"]} 不在配乐分段里')

    # ---------- 1) 拼接画面 ----------
    man = json.loads(man_path.read_text())
    if len(man) != len(scenes):
        die(f'manifest 应有 {len(scenes)} 行（--only 只写 manifest-only.json；总装前先跑一次全量 render()），现在 {len(man)} 行：{man_path}')
    if [r['id'] for r in man] != [s['stable_id'] for s in scenes]:
        die('manifest 的镜头顺序与 storyboard 不一致')
    for r, s in zip(man, scenes):
        if r['frames'] != fr_of(s):
            die(f'{r["id"]} 帧数 {r["frames"]} ≠ 分镜 {fr_of(s)}')
    if sum(r['frames'] for r in man) != TOTAL_FRAMES:
        die(f'manifest 总帧数 {sum(r["frames"] for r in man)} ≠ {TOTAL_FRAMES}')
    i_start = 0
    if args.start:
        if args.start not in sid_idx:
            die(f'--start {args.start} 不是时间轴里的镜头号')
        i_start = sid_idx[args.start]
    F_start = round(scenes[i_start]['t0'] * FPS)             # 起始镜头的全片帧号（= 前面所有镜头帧数之和）
    S = F_start / FPS                                       # 输出第 0 秒 = 全片第 S 秒（全片出片时 S = 0）
    S0 = F_start * (SR // FPS)                              # 同上，按采样点
    N = int(round(args.test * FPS)) if args.test else N_full - F_start
    if N > N_full - F_start:
        die('--test 超过全片长度（从 --start 算）')
    T = N / FPS
    use, acc = [], 0
    for r in man[i_start:]:
        if acc >= N:
            break
        use.append(r); acc += r['frames']
    shots = []
    for r in use:
        f = Path(r['file'])
        if not f.exists() and (man_path.parent / f.name).exists():
            f = man_path.parent / f.name                     # manifest 里是另一台电脑的绝对路径：按文件名在 manifest 同目录找
        f = need_file(f, f'镜头 {r["id"]} 的 mp4')
        pv = probe_video(f)
        if pv['frames'] != r['frames'] or pv['size'] != CONTENT or (pv['fps'] and abs(pv['fps'] - FPS) > .01) or pv['pix'] != 'yuv420p':
            die(f'{r["id"]} 编码参数或帧数不对：{pv}（应为 {r["frames"]} 帧、1920×1008、30fps、yuv420p）')
        shots.append(dict(id=r['id'], file=str(f), frames=r['frames'], reused=r.get('reused')))
    try:
        plan = seam_plan(man, P.get('接缝淡化', []))
        parts, seams = seam_parts(shots, man, plan, work) if plan else (shots, [])
    except (ValueError, RuntimeError) as ex:
        die(str(ex))
    cf = work / 'concat-v6.txt'
    cf.write_text(''.join("file '" + s['file'].replace("'", "'\\''") + "'\n" for s in parts))
    silent = work / 'v6-无声画面.mp4'
    run([FF, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', cf, '-c', 'copy', silent], '串接镜头')
    got = probe_video(silent)['frames']
    if got != acc:
        die(f'串接后帧数 {got} ≠ {acc}')
    rec['narration'] = str(narr_path)
    rec['video'] = dict(manifest=str(man_path), shots_used=len(shots), frames_concat=got, frames_out=N, frames_full_assert=TOTAL_FRAMES,
                        seams=seams, copied_frames=sum(x['frames'] for x in shots)-sum(x['encoded_frames'] for x in seams), encoded_seam_frames=sum(x['encoded_frames'] for x in seams),
                        duration=round(T, 3), shots=[s['id'] for s in shots], start_shot=scenes[i_start]['stable_id'], start_s=round(S, 3))
    print(f'[1] 画面：{len(shots)} 个镜头串接 {got} 帧（全片 manifest 合计 {TOTAL_FRAMES} 帧已核对），输出 {N} 帧 = {T:.2f} 秒'
          + (f'（从 {scenes[i_start]["stable_id"]} = 全片 {S:.2f} 秒起）' if S else ''), flush=True)

    # ---------- 2) 旁白 ----------
    NS_full = N_full * (SR // FPS)
    v = decode(narr_path, 1)[:, 0]
    v = np.pad(v, (0, max(0, NS_full - len(v))))[:NS_full]
    narr_peak = float(20 * np.log10(np.abs(v).max() + 1e-12))
    narr_lufs = lufs(v)
    gv, n_lim, _ = limiter_gain(v[:, None], VOICE_LIMIT)
    if gv is not None:
        v *= gv
    del gv
    voice_peak = float(20 * np.log10(np.abs(v).max() + 1e-12))       # 限峰后的旁白峰值：音效「比旁白峰值高/低几 dB」以它为准
    # 说话检测 → 闪避包络（1 ms 控制率）
    ctl = SR // 1000; nc = NS_full // ctl
    pw = (v[:nc * ctl].astype(np.float64) ** 2).reshape(nc, ctl).mean(axis=1)
    rms20 = np.sqrt(np.convolve(pw, np.ones(20) / 20, 'same'))
    talk = (20 * np.log10(rms20 + 1e-9) > BGM['talk_db']).astype(np.float64)
    hold = int(BGM['hold'] * 1000)
    talk_h = (np.convolve(talk, np.ones(hold))[:nc] > 0).astype(np.float64)       # 说完再保持 250 ms
    aa, ar = math.exp(-1 / (BGM['attack'] * 1000)), math.exp(-1 / (BGM['release'] * 1000))
    env = np.empty(nc); cur = 0.0
    for i, x in enumerate(talk_h.tolist()):
        cur = aa * cur + (1 - aa) * x if x > cur else ar * cur + (1 - ar) * x
        env[i] = cur
    tc = (np.arange(nc) + .5) / 1000                # 控制率 1 kHz 的时间轴（包络都在这上面算，再按 1 ms 一级展开，省内存）

    def up(c, dtype=np.float32):
        o = np.repeat(np.asarray(c).astype(dtype), ctl)
        return np.pad(o, (0, max(0, NS_full - len(o))), mode='edge')[:NS_full]
    duck_c = 10 ** (-args.duck_db * env / 20)
    duck = up(duck_c)
    speech = up(talk_h > .5, bool)
    mo = hop_power(v)
    mo4 = -0.691 + 10 * np.log10((mo[:-3] + mo[1:-2] + mo[2:-1] + mo[3:]) / 4 + 1e-15)
    voice_ref = float(np.median(mo4[mo4 > -40]))  # 说话时旁白 400 ms 瞬时响度中位（单声道），音效分档的参照
    print(f'[2] 旁白：{narr_lufs:.1f} LUFS，峰值 {narr_peak:.1f} dBFS → 限峰 {VOICE_LIMIT} dBFS（{n_lim} 个样本被压）；说话瞬时响度中位 {voice_ref:.1f}', flush=True)

    # ---------- 3) 配乐 ----------
    # 旁白 3 秒短时响度（只算说话的 100 ms 块）→ 相对全片中位的偏差，给配乐骑行「跟着旁白」微调目标用
    hop_n = int(BGM['ride']['hop'] * SR)
    sp_hop = speech[:len(mo) * hop_n].reshape(len(mo), hop_n).mean(axis=1) > .5
    wv = int(round(BGM['ride']['win'] / BGM['ride']['hop']))
    num = uniform_filter1d(np.where(sp_hop, mo, 0.0), size=wv, mode='nearest')
    den = uniform_filter1d(sp_hop.astype(np.float64), size=wv, mode='nearest')
    v3 = np.where(den > .3, 10 * np.log10(num / np.maximum(den, 1e-9) + 1e-15), np.nan)
    ok = ~np.isnan(v3)
    vdev = np.interp(np.arange(len(v3)), np.where(ok)[0], v3[ok]) if ok.any() else np.zeros(len(v3))
    vdev = vdev - np.median(vdev[ok]) if ok.any() else vdev
    secs = BGM['sections']
    names = [s['name'] for s in secs]
    act = {a['kind']: a for a in BGM['actions']}
    h_loop = BGM['loop_xfade'] / 2
    x2 = BGM['xfade'] / 2
    music = np.zeros((NS_full, 2), np.float32)
    sec_recs, layers = [], []
    hpf = butter(2, BGM['hpf'], btype='high', fs=SR, output='sos')
    pb, pa = biquad_peak(*BGM['eq'])

    def beat_of(anchor, sid=None):
        hits = [b for b in beats if anchor in (b.get('say') or '') and (sid is None or scenes[b['scene']]['stable_id'] == sid)]
        if len(hits) != 1:
            die(f'锚点「{anchor}」在旁白里出现 {len(hits)} 次（必须唯一）')
        return hits[0]

    # 电平骑行不碰的区间：项目.json 写了就用；没写按刻意动作自动算（收住：段末前 淡出秒+2 秒到段末后 0.5 秒；
    # 上扬：新段开头前 0.5 秒到锚点句 + 后延秒 + 0.5 秒；抽空再进：抽空前 退秒+0.3 秒到再进后 进秒+0.3 秒），重叠的合并
    freeze_src = '项目.json「配乐.刻意动作区间」'
    if not BGM['ride']['freeze'] and BGM['actions']:
        zs = []
        sec_by = {x['name']: x for x in secs}
        for a_ in BGM['actions']:
            if a_['kind'] == '收住':
                B_ = scenes[sid_idx[sec_by[a_['section']]['last']]]['t1']
                zs.append((B_ - a_['fade'] - 2.0, B_ + .5))
            elif a_['kind'] == '上扬':
                A_ = scenes[sid_idx[sec_by[a_['section']]['first']]]['t0']
                bt_ = beat_of(a_['anchor'], sec_by[a_['section']]['first'])
                zs.append((A_ - .5, bt_['t0'] + a_.get('after', .2) + .5))
            elif a_['kind'] == '抽空再进':
                bt_ = beat_of(a_['anchor'])
                nb_ = beats[beats.index(bt_) + 1]
                zs.append((bt_['t0'] - a_['lead'] - a_['out_fade'] - .3, nb_['t0'] - .15 + a_['in_fade'] + .3))
        zs.sort()
        merged = []
        for z in zs:
            if merged and z[0] <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], z[1]))
            else:
                merged.append(z)
        BGM['ride']['freeze'] = [(round(a_, 2), round(b_, 2)) for a_, b_ in merged]
        freeze_src = '按刻意动作自动算'
    rec['ride_freeze'] = dict(source=freeze_src, zones=[list(z) for z in BGM['ride']['freeze']])
    print(f'[3] 电平骑行不碰的区间（{freeze_src}）：{[list(z) for z in BGM["ride"]["freeze"]]}', flush=True)

    for k, sec in enumerate(secs):
        i0, i1 = sid_idx[sec['first']], sid_idx[sec['last']]
        A, B = scenes[i0]['t0'], scenes[i1]['t1']
        if k and abs(A - prev_B) > 1e-6:
            die(f'{sec["name"]} 段起点 {A:.2f} 与上一段终点 {prev_B:.2f} 不衔接')
        prev_B = B
        shou = act.get('收住', {}).get('section') == sec['name']
        rise = act.get('上扬', {}).get('section') == sec['name']
        nxt_rise = k + 1 < len(secs) and act.get('上扬', {}).get('section') == secs[k + 1]['name']
        pre = 0.0 if (k == 0 or rise or (k and act.get('收住', {}).get('section') == secs[k - 1]['name'])) else x2
        post = 0.0 if (k == len(secs) - 1 or shou) else (.35 if nxt_rise else x2)    # 下一段上扬：本段 0.35 秒短淡出，不硬切（T019 质检）
        st = decode(sec['path'], 2).astype(np.float64)
        I_raw = lufs(st)
        st = sosfilt(hpf, st, axis=0)
        st = lfilter(pb, pa, st, axis=0)
        st = (st * 10 ** ((BGM['base_lufs'] - lufs(st)) / 20)).astype(np.float32)
        mono = st.mean(axis=1)
        cs = np.r_[0, np.cumsum(mono.astype(np.float64) ** 2)]
        lvl = 10 * np.log10((cs[4800::480] - cs[:-4800:480][:len(cs[4800::480])]) / 4800 + 1e-15)   # 100 ms 窗，每 10 ms 一点
        loud = np.where(lvl > lvl.max() - 35)[0]                   # 去掉尾部静音：最后一个比全曲最响处低不到 35 dB 的点
        Lsrc = (loud[-1] * 480 + 4800) / SR if len(loud) else len(st) / SR
        del cs
        ft = analyze(mono)
        F0 = A - pre
        seams, note = [], ''
        if sec['align'] == 'start':
            need = B + post - F0
            segs = [[0.0, min(need, Lsrc)]]
            X = need - Lsrc
            if X > 0:
                segs, seams, rem = plan_loops(ft, segs, X, BGM['loop_slack'], max_seams=sec.get('max_seams', 3), h=h_loop)
                if rem > 1e-6:
                    die(f'{sec["name"]}：找不到足够的循环点（还差 {rem:.1f} 秒）')
                tot = sum(b - a for a, b in segs)
                segs[-1][1] -= tot - need                          # 多出来的从曲尾让掉（反正会交叉淡化出去）
            e_film = None
        else:
            e = float(sec['src_end']) if sec.get('src_end') else Lsrc   # src_end 是听过、看过能量曲线后定的乐句边界，不再吸附
            need_pre = B - F0                                  # e 要落在 B
            X = need_pre - e
            segs = [[0.0, e]]
            if X > BGM['shift_tol']:
                segs, seams, rem = plan_loops(ft, segs, X, BGM['loop_slack'], max_seams=sec.get('max_seams', 3), h=h_loop)
                if rem > BGM['shift_tol']:
                    die(f'{sec["name"]}：找不到足够的循环点（还差 {rem:.1f} 秒）')
                X = rem                                        # 负数 = 多出来的
            if X < 0:                                          # 多出来的从曲头让掉
                segs[0][0] = -X
                note = f'曲头让掉 {-X:.2f} 秒'
                X = 0.0
            elif X > 0:
                note = f'曲子只差 {X:.2f} 秒，不循环，结尾提前落下'
            if post > 0:                                       # 交叉淡化要用到 e 之后的一点
                segs[-1][1] = min(len(st) / SR, e + post)
            e_film = B - X
        layer = render_path(st, segs, h_loop)
        n0 = int(round(F0 * SR))
        if n0 < 0:
            layer = layer[-n0:]; n0 = 0
        layer = layer[:NS_full - n0]
        # 慢速电平骑行（在交叉淡化 / 上扬 / 收住包络之前；逐样本线性插值增益）
        t_h, g_ride, ride_target, st_ride = ride_curve(layer, n0, A, B, vdev)
        t_smp = (n0 + np.arange(len(layer))) / SR
        layer *= (10 ** (np.interp(t_smp, t_h, g_ride) / 20)).astype(np.float32)[:, None]
        del t_smp
        ride_rec = dict(target_lufs=round(ride_target, 2), gain_db_min=round(float(g_ride.min()), 2), gain_db_max=round(float(g_ride.max()), 2),
                        gain_db_p10_p90=[round(float(np.percentile(g_ride, 10)), 2), round(float(np.percentile(g_ride, 90)), 2)],
                        st_spread_before_p10_p90=[round(float(np.percentile(st_ride, 10)), 2), round(float(np.percentile(st_ride, 90)), 2)])
        t_l = (n0 + np.arange(-(-len(layer) // ctl)) * ctl + ctl / 2) / SR     # 1 ms 控制率
        envl = np.ones(len(t_l))
        if pre > 0:
            envl *= np.sin(np.pi / 2 * ramp(t_l, F0, F0 + 2 * pre))
        elif rise:
            bt = beat_of(act['上扬']['anchor'], sec['first'])
            z = bt['t0'] + act['上扬'].get('after', .2)
            envl *= ramp(t_l, A, z) ** 1.6                              # 从无到满，后段更陡（上扬）
        elif k == 0:
            envl *= ramp(t_l, F0, F0 + BGM['fade_in'])
        if post > 0:
            envl *= np.cos(np.pi / 2 * ramp(t_l, B + post - 2 * post, B + post))
        if shou:
            z = min(e_film, B) if e_film is not None else B     # 开头对齐的段没有 e_film：收住落在段末
            envl *= 1 - ramp(t_l, z - act['收住']['fade'], z)
        envl[t_l > B + post] = 0
        layer *= np.repeat(envl.astype(np.float32), ctl)[:len(layer), None]
        # 逐段校准：本段核心区（避开两端 1.5 秒）说话时，音乐（闪避后）比人声低 gap_db
        c0, c1 = int((A + 1.5) * SR), int((B - 1.5) * SR)
        s0, s1 = max(c0, n0), min(c1, n0 + len(layer))
        m = speech[s0:s1]
        lay_core = layer[s0 - n0:s1 - n0] * duck[s0:s1, None]
        Lv = lufs_masked(v[s0:s1], m) + 10 * math.log10(2)          # 旁白复制成双声道 = 单声道 + 3.01 dB
        Lm = lufs_masked(lay_core, m)
        gain_db = float(np.clip((Lv - Lm) - sec['gap_db'], -24, 24))
        layer *= 10 ** (gain_db / 20)
        music[n0:n0 + len(layer)] += layer
        layers.append((sec['name'], n0, len(layer)))
        acc_t, by_src = F0, {}
        for kk in range(len(segs) - 1):
            acc_t += segs[kk][1] - segs[kk][0]
            by_src[(round(segs[kk][1], 2), round(segs[kk + 1][0], 2))] = round(acc_t, 2)
        for s_ in seams:              # 2026-10-07：按源时间对上接缝的成片时刻（原来按找到的先后 zip，和播放先后不同时会标错）
            s_['film_t'] = by_src.get((round(s_['src_from'], 2), round(s_['src_to'], 2)))
        seams.sort(key=lambda s_: 1e9 if s_['film_t'] is None else s_['film_t'])
        sec_recs.append(dict(name=sec['name'], file=str(sec['path']), scenes=f'{sec["first"]}–{sec["last"]}', film=[round(A, 3), round(B, 3)],
                             layer=[round(n0 / SR, 3), round((n0 + len(layer)) / SR, 3)], pre_xfade=pre * 2, post_xfade=post * 2,
                             src_len=round(len(st) / SR, 2), src_music_end=round(Lsrc, 2), src_path=[[round(a, 3), round(b, 3)] for a, b in segs],
                             src_end_lands_at=round(e_film, 3) if e_film is not None else None, loops=seams, note=note,
                             raw_lufs=round(I_raw, 1), gain_db=round(gain_db, 2), target_gap_db=sec['gap_db'], ride=ride_rec))
        segs = [[float(a), float(b)] for a, b in segs]
        print(f'[3] {sec["name"]} {A:7.2f}–{B:7.2f}  源路径 {[[round(a, 1), round(b, 1)] for a, b in segs]}  接缝 {len(seams)}'
              f'{" " + note if note else ""}  骑行 {ride_rec["gain_db_min"]:+.1f}～{ride_rec["gain_db_max"]:+.1f} dB  增益 {gain_db:+.1f} dB', flush=True)
        del st, layer, lay_core, envl, t_l, mono, ft

    # 刻意动作：抽空再进；全片开头淡入已在 M1 层；全片尾淡出在后面（音乐 + 音效一起）
    G = np.ones(nc)
    actions = []
    if '收住' in act:
        r = next(s for s in sec_recs if s['name'] == act['收住']['section'])
        actions.append(dict(kind='收住', section=r['name'], at=r['src_end_lands_at'], scene_end=r['film'][1],
                            desc=f'{r["name"]} 自然结尾在 {r["src_end_lands_at"]:.2f} 秒落下（{act["收住"]["fade"]} 秒收尾），段末 {r["film"][1]:.2f}'))
    if '上扬' in act:
        r = next(s for s in sec_recs if s['name'] == act['上扬']['section'])
        bt = beat_of(act['上扬']['anchor'], secs[names.index(r['name'])]['first'])
        actions.append(dict(kind='上扬', section=r['name'], start=r['film'][0], full_at=round(bt['t0'] + act['上扬'].get('after', .2), 3),
                            anchor=bt['say']))
    if '抽空再进' in act:
        c = act['抽空再进']
        bt = beat_of(c['anchor'])
        nb = beats[beats.index(bt) + 1]
        a_out = bt['t0'] - c['lead']
        a_in = nb['t0'] - .15
        G = np.minimum(G, 1 - np.minimum(ramp(tc, a_out - c['out_fade'], a_out), 1 - ramp(tc, a_in, a_in + c['in_fade'])))
        actions.append(dict(kind='抽空再进', anchor=bt['say'], silent=[round(a_out, 3), round(a_in, 3)], back_full_at=round(a_in + c['in_fade'], 3),
                            reenter_on=nb['say']))
    # 落点前留空（2026-11-06，手法库卡 12）：强段的重音效落下前，配乐让出约 0.15 秒再回来。只在气口里做（说着话时听不出来），有上限、有间隔，
    # 不是每个动作都踩。节拍表.json 没填强段就什么都不做；项目.json 配乐.落点留空 = false 关掉，写字典可改 秒/压dB/每十分钟上限/最小间隔。
    hg = (P.get('配乐') or {}).get('落点留空', {})
    hit_done, hit_skip = [], []
    bj = V6 / '节拍表.json'
    if hg is not False and bj.exists():
        rows = json.loads(bj.read_text(encoding='utf-8')).get('镜头') or {}
        gap_s, gap_db = float(hg.get('秒', .15)), float(hg.get('压dB', 14))
        cap = max(1, round(float(hg.get('每十分钟上限', 6)) * T_full / 600))
        min_gap = float(hg.get('最小间隔', 20))
        cands = sorted((e for e in json.loads(sfx_path.read_text()) if (rows.get(e.get('shot')) or {}).get('强弱') == '强'
                        and ALIASES.get(str(e.get('kind', '')).strip().lower(), ALIASES.get(str(e.get('kind', '')).strip())) in ('stamp', 'stamp1', 'hit-heavy', 'boom')),
                       key=lambda e: e['t'])
        floor = 10 ** (-gap_db / 20)
        for e in cands:
            h = float(e['t'])
            why = None
            if hit_done and h - hit_done[-1]['t'] < min_gap:
                why = f'离上一处不到 {min_gap:.0f} 秒'
            elif len(hit_done) >= cap:
                why = f'已到上限 {cap} 处'
            elif talk[max(0, int((h - gap_s - .1) * 1000)):int(h * 1000)].any():
                why = '落点前在说话'
            if why:
                hit_skip.append(dict(t=round(h, 3), shot=e.get('shot'), kind=e.get('kind'), reason=why))
                continue
            G = np.minimum(G, 1 - (1 - floor) * ramp(tc, h - gap_s - .06, h - gap_s) * (1 - ramp(tc, h - .015, h)))
            hit_done.append(dict(t=round(h, 3), shot=e.get('shot'), kind=e.get('kind')))
        print(f'[3] 落点前留空 {len(hit_done)} 处：{[x["t"] for x in hit_done]}；跳过 {len(hit_skip)} 处', flush=True)
    music *= up(duck_c * G)[:, None]
    del G, duck

    # ---------- 4) 音效 ----------
    events = json.loads(sfx_path.read_text())
    if not isinstance(events, list):
        die('sfx_events.json 应是事件列表')
    els = {}
    for si, sc in enumerate(scenes):
        for el in sc.get('elements') or []:
            els[el['id']] = (si, el)
    have = lambda n: (SFX_DIR / n).is_file()
    unknown = sorted({str(e.get('kind')) for e in events if ALIASES.get(str(e.get('kind', '')).strip().lower(), ALIASES.get(str(e.get('kind', '')).strip())) is None})
    if unknown:
        die('认不出的音效种类：' + '、'.join(unknown) + '（在 总装v6.py 的 ALIASES 里加对照，或改镜头脚本的 sfx=）')

    def cx_of(el):
        if el is None:
            return None
        if 'cx' in el:
            return float(el['cx'])
        if el.get('rect'):
            r = el['rect']; return r[0] + r[2] / 2
        if el.get('ref') and el['ref'] in els:
            return cx_of(els[el['ref']][1])
        if el.get('center'):
            return float(el['x'])
        w = el.get('w')
        if w and w < 1800:
            return float(el['x']) + w / 2
        return None

    def typing_run(ev, el, sc_t0):
        """打字：每个字一下降了音高的轻咔嗒，间隔 1/cps（有 打字.wav 就直接用它）。"""
        cards = [el] if el is not None and el.get('type') == 'quotecard' else \
            [e for _, e in els.values() if e.get('type') == 'quotecard' and scenes[els[e['id']][0]]['stable_id'] == ev.get('shot')]
        n, cps, positions = None, 9.0, None
        for r in (el or {}).get('typeRuns') or []:          # chatui / codecard（2026-10-23）：v6lib 已算好每段的字数和字速
            if abs(r['at'] - ev['at']) <= .12:
                n, cps = int(r['n']), float(r['cps'])
                positions = [float(t) - ev['at'] for t in r['times']] if r.get('times') else None
                break
        for c in ([] if n else cards):
            cps = float(c.get('cps') or 9)
            for g in c.get('segs') or []:
                if abs(g['at'] - ev['at']) <= .12:
                    n = len(re.sub(r'\*\*|==|\n', '', g['text']))
                    cps = float(g.get('cps') or cps)
                    positions = [float(t) - ev['at'] for t in g['times']] if g.get('times') is not None else None
            if n is None and c.get('text') and abs((c.get('typeAt') or c.get('delay', 0)) - ev['at']) <= .6:
                n = len(re.sub(r'\*\*|==|\n|\s', '', c['text']))
            if n:
                break
        n = n or 6
        ticks = [decode(SFX_DIR / f'tick-{i}.wav', 1)[:, 0] for i in (1, 2, 3)]
        ticks = [resample_poly(t_.astype(np.float64), 7, 5).astype(np.float32) for t_ in ticks]   # 拉长 1.4 倍 = 降音高
        rng = np.random.default_rng(int(ev['t'] * 1000))
        L = int(((positions[-1] if positions else n / cps) + .3) * SR)
        out = np.zeros(L, np.float32)
        for j in range(n):
            p = int(((positions[j] if positions else j / cps) + rng.uniform(-.008, .008)) * SR)
            p = max(0, p)
            tk = ticks[j % 3] * float(10 ** (rng.uniform(-2, 0) / 20))
            out[p:p + len(tk)] += tk[:max(0, L - p)]
        return out, n, cps

    cache, mmax = {}, {}

    def clip_of(name):
        if name not in cache:
            p = need_file(SFX_DIR / name, f'音效 {name} ')
            cache[name] = decode(p, 1)[:, 0]
            mmax[name] = momentary_max(cache[name])
        return cache[name]

    def pick(cands, fallback=None):
        for c in cands:
            if have(c):
                return c, False
        if fallback:
            for c in fallback:
                need_file(SFX_DIR / c, f'音效 {c} ')
            return fallback, True
        need_file(SFX_DIR / cands[0], f'音效 {cands[0]} ')

    ROT = {'pop': ['pop-1.wav', 'pop-2.wav', 'pop-3.wav'], 'tick': ['tick-1.wav', 'tick-2.wav', 'tick-3.wav'],
           'flip': ['纸张翻动-1.wav', '纸张翻动-2.wav']}
    items = []
    for k_ev, ev in enumerate(events):
        kind0 = str(ev.get('kind', '')).strip()
        kind = ALIASES.get(kind0.lower(), ALIASES.get(kind0))
        si_el = els.get(ev.get('el')) if ev.get('el') else None
        el = si_el[1] if si_el else None
        etype = el.get('type') if el else None
        t = float(ev['t'])
        it = dict(i=k_ev, t=round(t, 3), kind=kind0, k=kind, shot=ev.get('shot'), el=ev.get('el'), el_type=etype,
                  gain_ev=float(ev.get('gain') or 0.0))
        if ev.get('exception'):            # 镜头脚本标明的例外（如 S53b「连盖」）：不受中重档 2.5 秒间隔约束，按原档 + 事件增益播
            it['exc'] = str(ev['exception'])
        files, offset, tier, peak_rel, note, dur_imp = None, 0.0, '轻', None, '', 0.0
        if kind == 'paper':
            if etype in CARD_TYPES:
                files, offset = ['纸张滑入.wav'], -.15                     # 落定轻拍在 0.40 s，对准卡片落定
            else:
                files = 'flip'                                         # 原件、照片、新闻截图：翻动 1/2 轮流
        elif kind == 'shutter':
            files, tier, peak_rel = ['快门.wav'], '中', 0.0
        elif kind == 'burst':
            files, tier, peak_rel = ['快门-连拍.wav'], '中', 0.0
        elif kind == 'marker':
            f, fb = pick(['马克笔.wav'], ['纸张滑入.wav'])
            files = [f] if isinstance(f, str) else f
            note = '马克笔待补，临时用纸张滑入' if fb else ''
        elif kind == 'click':
            f, fb = pick(['嗒.wav'], ['tick-1.wav', 'tick-2.wav', 'tick-3.wav'])
            files = [f] if isinstance(f, str) else 'tick'
            note = '嗒待补，临时用 tick' if fb else ''
        elif kind == 'tick':
            if etype == 'counter':
                d = float(el.get('dur') or .9)
                if d >= .8:
                    files, offset, note = ['tick-滚动-1.2s.wav'], -.8, f'计数器滚 {d:.2f} 秒，叮对准落定'
                else:
                    files = ['叮-落定.wav']
            elif etype == 'statbar':
                files = ['叮-落定.wav']
            else:
                files = 'tick'
        elif kind == 'ding':
            files = ['叮-落定.wav']
        elif kind == 'stamp':
            files, offset, tier, peak_rel = ['盖章-两下.wav'], -.22, '重', 5.0     # 第二下「嗒」对准落定
        elif kind == 'stamp1':
            files, tier, peak_rel = ['盖章.wav'], '重', 5.0
        elif kind == 'pop':
            files, offset = 'pop', .05
        elif kind == 'hit':
            files, tier = ['hit-轻.wav'], '中'
        elif kind == 'hit-heavy':
            files, tier = ['hit-重.wav'], '重'
        elif kind == 'whoosh':
            files, offset, tier = ['嗖.wav'], -.1, '中'
        elif kind in ('riser', 'riser15'):
            files, tier = (['riser-1.2s.wav'] if kind == 'riser' else ['riser-1.5s.wav']), '重'
            dur_imp = 1.2 if kind == 'riser' else 1.5                 # 事件时刻 = 起点，冲击点 = 起点 + 时长
        elif kind == 'film':
            files, tier, peak_rel = ['胶片噪声.wav'], '中', -2.0
        elif kind == 'boom':
            files, tier = ['咚-低频.wav'], '重'
        elif kind == 'growl':
            files, tier = ['吼-嗷呜.wav'], '中'
        elif kind == 'pat3':
            files, tier = ['轻拍-三下.wav'], '中'
        elif kind == 'type':
            f, fb = pick(['打字.wav'], ['tick-1.wav', 'tick-2.wav', 'tick-3.wav'])
            files = [f] if isinstance(f, str) else 'type'
            note = '打字待补，用降调 tick 按 cps 逐字排' if fb else ''
        it.update(files=files, offset=offset, tier=tier, peak_rel=peak_rel, note=note, anchor=round(t + dur_imp, 3))
        cx = cx_of(el)
        it['pan'] = 0.0 if cx is None else round(float(np.clip((cx / 1920 - .5) * 2 * .6, -.6, .6)), 2)
        items.append(it)
    for it in items:                       # 先把所有用到的文件都核一遍（缺就停）
        fs = ROT.get(it['files'], it['files']) if isinstance(it['files'], str) else it['files']
        if it['files'] != 'type':
            for f in fs:
                clip_of(f)

    skipped, downgraded = [], []

    def skip(it, why):
        it['status'] = 'skipped'; it['reason'] = why; skipped.append(it)

    live = []
    for it in items:
        if it['anchor'] >= S + T - .05 or it['anchor'] < S or it['t'] + it['offset'] < -0.5:
            skip(it, f'超出输出范围（全片 {S:.2f}–{S + T:.2f} 秒）')
        else:
            it['status'] = 'placed'; live.append(it)
    # 次数上限：hit-重 ≤ 6（多的降成 hit-轻）；胶片噪声每 10 分钟 ≤ 1；低频咚 ≤ 2
    caps = {'hit-heavy': 6, 'film': max(1, math.ceil(T_full / 600) * 1), 'boom': 2}
    for kk, cap in caps.items():
        xs = [x for x in live if x['k'] == kk and not x.get('exc')]     # 例外事件（如 S12「连击」第 2、3 下）不计入次数上限
        for x in xs[cap:]:
            if kk == 'hit-heavy':
                x['k'], x['files'], x['tier'] = 'hit', ['hit-轻.wav'], '中'
                x['downgrade'] = f'hit-重 全片已 {cap} 次，改用 hit-轻'; downgraded.append(x)
            else:
                skip(x, f'{kk} 全片上限 {cap} 次'); live.remove(x)
    # riser 与紧跟的冲击配成一组（冲击点 0.3 秒内）
    for r in [x for x in live if x['k'] in ('riser', 'riser15')]:
        mates = [x for x in live if x is not r and x['tier'] != '轻' and abs(x['anchor'] - r['anchor']) <= .3]
        if mates:
            r['group'] = mates[0]['i']
    # 中重档相邻 ≥ 2.5 秒：重档优先、同档先到先得；冲突就降成轻档，不能降的跳过
    DOWNGRADABLE = {'hit', 'hit-heavy', 'whoosh', 'shutter', 'burst', 'stamp', 'stamp1'}
    for x in live:                       # 例外事件（「连盖」）不参加间隔检查，也不挡别的事件；保持原档，事件增益照算
        if x.get('exc'):
            x['note'] = (x.get('note') + '；' if x.get('note') else '') + f'例外「{x["exc"]}」：不受中重档 2.5 秒间隔约束，按{x["tier"]}档 {x["gain_ev"]:+g} dB 播'
    heavy = [x for x in live if x['tier'] != '轻' and 'group' not in x and not x.get('exc')]
    heavy.sort(key=lambda x: (-TIER_RANK[x['tier']], x['anchor']))
    kept = []
    for x in heavy:
        clash = [y for y in kept if abs(y['anchor'] - x['anchor']) < 2.5]
        if not clash:
            kept.append(x); continue
        y = clash[0]
        why = f'与 {y["anchor"]:.2f} 秒的{y["kind"]}（{y["tier"]}档）相隔 {abs(y["anchor"] - x["anchor"]):.2f} 秒 < 2.5 秒'
        if x['k'] in DOWNGRADABLE:
            x['downgrade'] = why + '，降成轻档'; x['tier'] = '轻'; downgraded.append(x)
        else:
            skip(x, why); live.remove(x)
    for r in [x for x in live if 'group' in x]:
        mate = next((y for y in items if y['i'] == r['group']), None)
        if mate is None or mate['status'] != 'placed' or mate['tier'] == '轻':
            if mate is not None and mate['status'] == 'placed' and mate['tier'] == '轻':
                r['downgrade'] = '配对的冲击被降档，riser 一起降成轻档'; r['tier'] = '轻'; downgraded.append(r)
            else:
                skip(r, '配对的冲击被跳过'); live.remove(r)
    # 0.3 秒内两个动作只响较重的一个
    live.sort(key=lambda x: (x['anchor'], -TIER_RANK[x['tier']]))
    for x in list(live):
        if x['tier'] != '轻' or x not in live or x.get('exc'):      # 例外事件（连拍等）是刻意的另一下，不合并
            continue
        near = [y for y in live if y is not x and abs(y['anchor'] - x['anchor']) < .3 and
                (TIER_RANK[y['tier']] > 0 or y['anchor'] < x['anchor'] or (y['anchor'] == x['anchor'] and y['i'] < x['i']))]
        if near:
            y = near[0]
            skip(x, f'与 {y["anchor"]:.2f} 秒的{y["kind"]}相差 < 0.3 秒，共用一声'); live.remove(x)
    # 放进去
    sfx_bus = np.zeros((NS_full, 2), np.float32)
    rot_i = {'pop': 0, 'tick': 0, 'flip': 0}
    for x in sorted(live, key=lambda x: x['t']):
        if x['files'] == 'type':
            si_el = els.get(x['el']) if x['el'] else None
            ev0 = events[x['i']]
            clip, nch, cps = typing_run(dict(at=float(ev0.get('at', 0)), t=x['t'], shot=x['shot']), si_el[1] if si_el else None, None)
            fname = f'打字（降调 tick × {nch}，{cps:g} 字/秒）'
            mm = momentary_max(clip)
            fpk = float(20 * np.log10(np.abs(clip).max() + 1e-12))
        else:
            if isinstance(x['files'], str):
                grp = ROT[x['files']]; fname = grp[rot_i[x['files']] % len(grp)]; rot_i[x['files']] += 1
            else:
                fname = x['files'][0]
            clip = clip_of(fname); mm = mmax[fname]
            fpk = float(20 * np.log10(np.abs(clip).max() + 1e-12))
        g = 0.0 if x.get('exc') else x['gain_ev']                 # 例外事件：先按原档算满音量（含上限修剪），再整体降 gain_ev
        if x['peak_rel'] is not None:                               # 05：盖章峰值比旁白峰值高约 5 dB、快门持平、胶片低 2 dB
            g += (voice_peak + x['peak_rel']) - fpk
        ceil = voice_ref + TIERS[x['tier']]
        trim = 0.0
        if mm + g > ceil:
            trim = ceil - (mm + g); g += trim
        elif x['tier'] == '轻' and mm + g < voice_ref + LIGHT_FLOOR:
            trim = min(FLOOR_MAX_BOOST, voice_ref + LIGHT_FLOOR - (mm + g)); g += trim
        if x.get('exc'):
            g += x['gain_ev']
        p = x['pan']
        gl, gr = math.sqrt(2) * math.cos((p + 1) * math.pi / 4), math.sqrt(2) * math.sin((p + 1) * math.pi / 4)
        start = x['t'] + x['offset']
        i0 = int(round(start * SR)); c0 = max(0, -i0); i0 = max(0, i0)
        seg = clip[c0:c0 + max(0, min(len(clip) - c0, NS_full - i0))] * float(10 ** (g / 20))
        sfx_bus[i0:i0 + len(seg), 0] += seg * gl
        sfx_bus[i0:i0 + len(seg), 1] += seg * gr
        x.update(file=fname, start=round(start, 3), gain_db=round(g, 2), trim_db=round(trim, 2), level_rel_voice=round(mm + g - voice_ref, 1))
    placed = [x for x in items if x['status'] == 'placed']
    assert len(placed) + len(skipped) == len(events), '音效计数对不上'
    hh = sum(1 for x in placed if x['file'] == 'hit-重.wav' and not x.get('exc'))
    hh_exc = sum(1 for x in placed if x['file'] == 'hit-重.wav' and x.get('exc'))
    print(f'[4] 音效：事件 {len(events)} 个 → 放入 {len(placed)}（降档 {len(downgraded)}），跳过 {len(skipped)}；hit-重 {hh} 次'
          + (f'（另有连击例外 {hh_exc} 下，降 6 dB）' if hh_exc else ''), flush=True)

    # ---------- 5) 混音、覆盖率、响度 ----------
    NS = N * (SR // FPS)
    tail = up(1 - ramp(tc, S + T - BGM['tail_fade'], S + T))[S0:S0 + NS, None]
    mus = music[S0:S0 + NS]; sfx = sfx_bus[S0:S0 + NS]           # 视图，原地乘（不另占内存）；全片出片时 S0 = 0
    mus *= tail; sfx *= tail
    del tail
    # 覆盖率：100 ms 窗音乐 RMS 高于 present_dbfs 的比例
    h10 = SR // 10; nh = NS // h10
    pw10 = (mus[:nh * h10].astype(np.float64) ** 2).mean(axis=1).reshape(nh, h10).mean(axis=1)
    mrms = 10 * np.log10(pw10 + 1e-15)
    present = mrms > BGM['present_dbfs']
    coverage = float(present.mean())
    gaps, run_s = [], None
    for i, pz in enumerate(present.tolist() + [True]):
        if not pz and run_s is None:
            run_s = i
        if pz and run_s is not None:
            if i - run_s >= 3:
                gaps.append([round(run_s / 10, 1), round(i / 10, 1)])
            run_s = None
    # 实测：说话时音乐比人声低多少（逐段，用最终的音乐总线）
    l2 = 10 * math.log10(2)
    gap_meas = {}
    for r in sec_recs:
        a, b = int(max(S, r['film'][0] + 1.5) * SR), int(min(S + T, r['film'][1] - 1.5) * SR)     # 全片采样点
        if b - a < 5 * SR:
            continue
        m = speech[a:b]
        gap_meas[r['name']] = round(lufs_masked(v[a:b], m) + l2 - lufs_masked(mus[a - S0:b - S0], m), 1)
        r['gap_db_measured'] = gap_meas[r['name']]
    # 无旁白处不突然变大：停顿里闪避最多回升多少（相对说话时被压的电平；闪避只压 duck_db，所以上限就是 duck_db）
    dk = 20 * np.log10(duck_c + 1e-9)
    pz = (talk_h < .5) & (tc > S + 2) & (tc < S + T - BGM['tail_fade'])
    pause_rise = round(float(np.percentile(dk[pz] + args.duck_db, 99)), 2) if pz.any() else 0.0
    pause_max = round(float(dk[pz].max() + args.duck_db), 2) if pz.any() else 0.0
    # ---------- 5b) 实拍原声（2026-10-20 加）：实拍/做实拍片段.py 给带「原声」的镜头写了 <片段目录>/<镜头号>.wav ----------
    # 在算整体增益之前并进音效总线（否则原声填满安静段，整体响度测低 3 dB、loudnorm 退成 dynamic——2026-10-20 实测）。放在镜头起点；说话时按「实拍.原声.闪避dB」再压（包络和配乐闪避同一条）；整体再乘「相对dB」。没有 wav 的镜头不受影响。
    orig_rec = []
    oc = P.get('实拍', {}) or {}
    if oc.get('工作区'):
        od = Path(os.path.expanduser(str(oc.get('片段目录', '实拍片段'))))
        if not od.is_absolute():
            od = Path(os.path.expanduser(str(oc['工作区']))) / od
        o_rel = float((oc.get('原声') or {}).get('相对dB', 0)); o_duck = float((oc.get('原声') or {}).get('闪避dB', 12))
        o_lufs = narr_lufs - 16 + o_rel                         # 原声电平跟着旁白走：默认比旁白低 16 LU（做实拍片段.py 已把原声归一到 −30 LUFS）
        g_o = np.float32(10 ** ((o_lufs + 30) / 20))
        oenv_c = 10 ** (-o_duck * env / 20)
        for sc in scenes:
            f = od / f"{sc['stable_id']}.wav"
            if not f.exists():
                continue
            a = decode(f, 2)
            st = round(sc['t0'] * FPS) * (SR // FPS) - S0                # 输出里的起点（采样）
            lo, hi = max(0, st), min(NS, st + len(a))
            if hi <= lo:
                continue
            seg = a[lo - st:hi - st]
            ce = np.repeat(oenv_c[(S0 + lo) // ctl:(S0 + hi) // ctl + 2].astype(np.float32), ctl)[(S0 + lo) % ctl:(S0 + lo) % ctl + (hi - lo)]
            if len(ce) < hi - lo:
                ce = np.pad(ce, (0, hi - lo - len(ce)), mode='edge')
            sfx[lo:hi] += seg * ce[:, None] * g_o            # 并进音效总线：整体增益、响度统计、分轨都把原声算进去
            orig_rec.append(dict(shot=sc['stable_id'], file=str(f), start=round((lo + S0) / SR, 3), dur=round((hi - lo) / SR, 3)))
        if orig_rec:
            print(f'[5b] 实拍原声 {len(orig_rec)} 段（{o_lufs:.1f} LUFS = 旁白 −16 LU {o_rel:+.0f} dB，说话时再压 {o_duck:.0f} dB）', flush=True)
    rec['orig_audio'] = orig_rec
    def mix_chunks():
        for i in range(0, NS, SR * 10):
            j = min(NS, i + SR * 10)
            yield mus[i:j] + sfx[i:j] + v[S0 + i:S0 + j, None]
    hop = SR // 10
    qs = []
    for blk in mix_chunks():
        q = hop_power(blk)
        qs.append(q)
    pre_I = gate(np.concatenate(qs))                 # 10 秒块是 100 ms 的整数倍；块边界处滤波器重启的误差可忽略
    g_pre = -14.0 - pre_I
    if args.stems:
        gg = 10 ** (g_pre / 20)
        for nm, arr in (('旁白', None), ('配乐', mus), ('音效', sfx)):
            pr = subprocess.Popen([FF, '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s24le',
                                   str(work / f'stem-{nm}.wav')], stdin=subprocess.PIPE)
            for i in range(0, NS, SR * 10):
                blk = np.repeat(v[S0 + i:S0 + min(NS, i + SR * 10), None], 2, axis=1) if arr is None else arr[i:i + SR * 10]
                pr.stdin.write((blk * gg).astype(np.float32).tobytes())
            pr.stdin.close(); pr.wait()
        rec['stems'] = {nm: str(work / f'stem-{nm}.wav') for nm in ('旁白', '配乐', '音效')}
    mix = mus                                        # 原地相加：音乐总线 + 音效 + 旁白
    mix += sfx
    del sfx, sfx_bus
    mix += v[S0:S0 + NS, None]
    del music, mus
    mix *= np.float32(10 ** (g_pre / 20))
    print(f'[5] 音乐覆盖 {coverage:.1%}；说话时音乐比人声低 {gap_meas} dB；停顿里闪避回升 99 分位 {pause_rise} dB、最多 {pause_max} dB', flush=True)
    rec['bgm'] = dict(files=[str(s['path']) for s in secs],
                      sections=[[round(max(r['film'][0], S) - S, 3), round(min(r['film'][1], S + T) - S, 3), r['name']]
                                for r in sec_recs if r['film'][0] < S + T and r['film'][1] > S],          # 输出片里的时间
                      sections_detail=sec_recs, actions=actions, hit_gaps=dict(done=hit_done, skipped=hit_skip), coverage=round(coverage, 4), no_music_spans=gaps,
                      duck=dict(db=args.duck_db, attack=BGM['attack'], hold=BGM['hold'], release=BGM['release'], talk_db=BGM['talk_db']),
                      xfade=BGM['xfade'], loop_xfade=BGM['loop_xfade'], eq=dict(hpf=BGM['hpf'], peak=BGM['eq']),
                      speech_gap_db=gap_meas, pause_duck_recovery_db=dict(p99=pause_rise, max=pause_max), base_lufs=BGM['base_lufs'], tail_fade=BGM['tail_fade'])
    rec['music_coverage'] = round(coverage, 4)
    rec['sfx_events'] = len(events)
    rec['sfx_count'] = len(placed)
    rec['sfx'] = dict(source=str(sfx_path), library=str(SFX_DIR), events=len(events), placed=len(placed), skipped_n=len(skipped),
                      downgraded_n=len(downgraded), hit_heavy=hh, hit_heavy_exception=hh_exc, voice_ref_momentary=round(voice_ref, 1), tier_ceiling_lu=TIERS,
                      light_floor_lu=LIGHT_FLOOR,
                      count_check=f'{len(placed)} 放入 + {len(skipped)} 跳过 = {len(events)} 事件',
                      skipped=[{k: x.get(k) for k in ('t', 'kind', 'shot', 'el', 'reason')} for x in skipped],
                      downgraded=[{k: x.get(k) for k in ('t', 'kind', 'shot', 'el', 'downgrade')} for x in downgraded],
                      detail=[{k: x.get(k) for k in ('t', 'kind', 'shot', 'el', 'el_type', 'file', 'start', 'anchor', 'tier', 'gain_db', 'trim_db',
                                                    'level_rel_voice', 'pan', 'note', 'exc')} for x in placed])
    if (len(events) - len(placed)) > .05 * max(1, len(events)):
        rec['sfx']['warning'] = f'放入的音效比事件少 {len(events) - len(placed)} 个（> 5%），看 skipped 的原因'
    fails = []
    if coverage < .85:
        fails.append(f'音乐覆盖率 {coverage:.1%} < 85%')
    if not placed:
        fails.append('放进去的音效为 0')
    if not rec['bgm']['sections']:
        fails.append('配乐段为空')
    if fails:
        rec['failed'] = fails; save_rec(); die('；'.join(fails) + f'（记录：{rec_path}）')

    # 真峰限幅 + 两遍 loudnorm（linear）+ AAC；编码后真峰超了就压低门限重做
    premix = work / 'v6-premix.wav'
    m4a = work / 'v6-混音.m4a'
    ceiling = -2.5                                   # AAC 编码会让真峰再冒 0.5–0.7 dB
    for attempt in range(4):
        glim, n_over, gr_max = limiter_gain(mix, ceiling, tp=True)
        pr = subprocess.Popen([FF, '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_f32le', str(premix)],
                              stdin=subprocess.PIPE)
        for i in range(0, len(mix), SR * 10):                  # 分块乘增益、分块写，不另存整条
            blk = mix[i:i + SR * 10] if glim is None else mix[i:i + SR * 10] * glim[i:i + SR * 10, None]
            pr.stdin.write(np.ascontiguousarray(blk, np.float32).tobytes())
        pr.stdin.close()
        if pr.wait():
            die('写预混音失败')
        del glim
        e1 = run([FF, '-hide_banner', '-nostats', '-i', premix, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=20:print_format=json', '-f', 'null', '-'],
                 'loudnorm 第一遍')
        p1 = json.loads(e1[e1.rindex('{'):e1.rindex('}') + 1])
        # 目标 LRA 跟着实测走（2026-10-20）：纯音乐喘气段多的片子响度范围 17 LU 上下，LRA=11 会让 loudnorm 退成 dynamic（311 期 4 轮都失败）
        lra_t = int(max(11, min(20, math.ceil(float(p1['input_lra'])) + 1)))
        ln = (f"loudnorm=I=-14:TP=-1.5:LRA={lra_t}:measured_I={p1['input_i']}:measured_TP={p1['input_tp']}:measured_LRA={p1['input_lra']}"
              f":measured_thresh={p1['input_thresh']}:offset={p1['target_offset']}:linear=true:print_format=json")
        e2 = run([FF, '-y', '-hide_banner', '-nostats', '-i', premix, '-af', ln + f',aresample={SR}', '-c:a', 'aac', '-b:a', '192k',
                  '-ar', str(SR), m4a], 'loudnorm 第二遍 + AAC')
        p2 = json.loads(e2[e2.rindex('{'):e2.rindex('}') + 1])
        e3 = run([FF, '-hide_banner', '-nostats', '-i', m4a, '-af', 'ebur128=peak=true', '-f', 'null', '-'], '实测响度')
        I_out = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', e3)[-1])
        TP_out = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', e3)[-1])
        LRA = float(re.findall(r'LRA:\s+(-?[\d.]+) LU', e3)[-1])
        print(f'[6] 第 {attempt + 1} 轮：限幅门限 {ceiling} dBTP（{n_over} 个样本过线，最大压 {gr_max:.1f} dB）→ {p2["normalization_type"]}，'
              f'成品 {I_out:.2f} LUFS、真峰 {TP_out:.2f} dBTP', flush=True)
        if p2['normalization_type'] == 'linear' and TP_out <= -1.5 and abs(I_out + 14) <= .5:
            break
        ceiling -= max(.3, TP_out + 1.5 + .2) if TP_out > -1.5 else .5
    else:
        rec['failed'] = [f'响度未达标：{I_out} LUFS / {TP_out} dBTP / {p2["normalization_type"]}']; save_rec()
        die(rec['failed'][0])
    premix.unlink(missing_ok=True)
    rec['loudness'] = dict(loudnorm_lra_target=lra_t, narration_lufs=round(narr_lufs, 2), narration_peak_dbfs=round(narr_peak, 2), voice_limit_dbfs=VOICE_LIMIT,
                           voice_limited_samples=n_lim, voice_peak_after_limit_dbfs=round(voice_peak, 2), premix_lufs=round(pre_I, 2), pre_gain_db=round(g_pre, 2),
                           tp_limiter_ceiling_dbtp=ceiling, tp_limited_samples=n_over, tp_max_reduction_db=round(gr_max, 2),
                           loudnorm_pass1=p1, loudnorm_pass2=p2, normalization_type=p2['normalization_type'],
                           final_lufs=I_out, final_true_peak_dbtp=TP_out, final_lra=LRA)
    save_rec()

    # ---------- 6) 字幕（ASS，1920×1008 内容区） ----------
    def ts_ass(t):
        c = int(round(t * 100)); return f'{c // 360000}:{c // 6000 % 60:02}:{c // 100 % 60:02}.{c % 100:02}'
    ass = ('[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1008\nWrapStyle: 2\nScaledBorderAndShadow: yes\n'
           '[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, '
           'StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n'
           # 档案纸主题：PingFang SC Semibold 42，白字；底条墨色 #1E1C18（10% 透明）；框约 y 937–994，不压出处条（881–921）
           + SUB_STYLE +
           '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n')
    srt, nsub = [], 0
    for i, bt in enumerate(beats):
        if bt['t0'] >= S + T:
            break
        if bt['t0'] < S - .05:                         # --start 之前的句子不出
            continue
        text = (bt.get('say') or '').replace('{', '').replace('}', '').replace('\\', '').strip()
        if not text:
            continue
        if P.get('字幕繁体') or args.trad:                            # 2026-11-17：油管版片内字幕出台湾繁体（opencc s2twp + 本期词表）
            import opencc
            global _CC
            try:
                _CC
            except NameError:
                _CC = opencc.OpenCC('s2twp')
            text = _CC.convert(text)
            for _a, _b in (P.get('字幕繁体词表') or {}).items():
                text = text.replace(_a, _b)
        end = min(bt['t1'] + .10, beats[i + 1]['t0'] - .02 if i + 1 < len(beats) else S + T, S + T) - S
        t0s = max(0.0, bt['t0'] - S)
        ass += f'Dialogue: 0,{ts_ass(t0s)},{ts_ass(end)},Default,,0,0,0,,{text.replace(chr(10), chr(92) + "N")}\n'
        srt.append((t0s, end, text.replace('\n', '')))
        nsub += 1
    ass_path = work / '字幕-v6.ass'
    ass_path.write_text(ass)

    def ts_srt(t):
        ms = int(round(t * 1000)); return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'
    srt_path = work / f'{NAME}-v6.srt'
    srt_path.write_text(''.join(f'{i}\n{ts_srt(a)} --> {ts_srt(b)}\n{t}\n\n' for i, (a, b, t) in enumerate(srt, 1)))

    # ---------- 7) 底部导航（档案纸配色） ----------
    nav = P.get('导航') or []                       # 项目.json「导航」：[{标签, 起镜头}, …]，默认 8 段，按时间顺序
    if not 2 <= len(nav) <= 10:
        die(f'项目.json「导航」要 2–10 段（默认 8 段），现在 {len(nav)} 段')
    labels = [str(x['标签']) for x in nav]
    if P.get('字幕繁体') or args.trad:                 # 繁体版：导航标签也转
        import opencc
        _cc2 = opencc.OpenCC('s2twp')
        labels = [_cc2.convert(x) for x in labels]
    ids = [x['起镜头'] for x in nav]
    ids = [x['起镜头'] for x in nav]
    miss = [x for x in ids if x not in sid_idx]
    if miss:
        die('项目.json「导航」里的起镜头不在时间轴里：' + '、'.join(miss))
    starts = [scenes[sid_idx[x]]['t0'] for x in ids]
    if starts != sorted(starts) or starts[0] > 1e-6:
        die('项目.json「导航」的起镜头要按时间顺序排，第一段从片头（第一个镜头）开始')
    n_nav = len(labels)
    seg_w = 1920 / n_nav                                 # 每段宽（8 段 = 240 px）
    PAPER, INK, MUTED, RED = (0xEC, 0xE5, 0xD8), (0x1E, 0x1C, 0x18), (0x9C, 0x97, 0x8C), (0xB0, 0x3A, 0x33)
    fp = next(iter(Path('/System/Library/AssetsV2').glob('com_apple_MobileAsset_Font*/**/PingFang.ttc')), Path('/System/Library/Fonts/PingFang.ttc'))
    faces = {}
    for i in range(30):
        try:
            f = ImageFont.truetype(str(fp), 28, index=i)
        except OSError:
            break
        faces[f.getname()] = i
    _fd = Path(__file__).resolve().parent / '素材/字体'                     # v7b：导航用思源黑体（OFL）
    f_reg = ImageFont.truetype(str(_fd / 'SourceHanSansCN-Medium.otf'), 28)
    f_cur = ImageFont.truetype(str(_fd / 'SourceHanSansCN-Bold.otf'), 28)
    navs = []
    for active in range(n_nav):
        im = Image.new('RGB', (1920, NAV_H), PAPER); dr = ImageDraw.Draw(im)
        # v7b：内容区已无格线，导航也不画格线（全片纯色纸底）
        dr.line([(0, 0), (1920, 0)], fill=(0xC9, 0xC5, 0xB6))         # 顶边细线（进度线的底轨）
        for j, lb in enumerate(labels):
            x = round(j * seg_w); x2 = round((j + 1) * seg_w); cxn = (x + x2) / 2
            if j:
                dr.line([(x, 24), (x, 48)], fill=MUTED)
            if dr.textlength(lb, font=f_cur) > seg_w - 16:
                die(f'导航标签「{lb}」太长，放不进 {seg_w:.0f} px（8 段时 ≤ 7 个字，最好 4 个字）')
            if j == active:
                dr.rectangle((x + 1, 4, x2 - 1, NAV_H - 1), fill=(0xE9, 0xDC, 0xCD))      # 当前段：极淡的朱红底
                dr.text((cxn, 37), lb, font=f_cur, anchor='mm', fill=RED)
                dr.line([(cxn - 28, 58), (cxn + 28, 58)], fill=RED, width=3)
            else:
                dr.text((cxn, 37), lb, font=f_reg, anchor='mm', fill=INK if j < active else (0x4A, 0x47, 0x40))
        p = work / f'nav-v6-{active}.png'; im.save(p); navs.append(p)
    rec['nav'] = dict(labels=labels, ids=ids, starts=[round(s, 3) for s in starts], size=[1920, NAV_H],
                      colors=dict(paper='#EBE8D9', ink='#1E1C18', current='#B03A33', progress='#B03A33'))
    rec['subtitles'] = dict(ass=str(ass_path), srt=str(srt_path), count=nsub, font='Source Han Sans CN Medium 44',
                            box='墨色 #1E1C18（10% 透明），约 y 937–994')
    (work / 'timeline-成片-v6.js').write_text('window.__DATA = ' + json.dumps(
        {**{k: sb[k] for k in ('meta', 'scenes', 'beats')}, 'inserts': [], 'overlays': [],
         'sfx': [{'t': x['start'], 'sfx': x['file'], 'kind': x['kind']} for x in placed]}, ensure_ascii=False) + ';')
    save_rec()
    if args.audio_only:
        print(f'只出音频：{m4a}；记录 {rec_path}')
        return

    # ---------- 8) 最终编码（套 mac-heavy-job） ----------
    a = [FF, '-y', '-v', 'warning', '-nostats', '-i', silent]
    for p in navs:
        a += ['-loop', '1', '-framerate', str(FPS), '-t', f'{T + 1:.3f}', '-i', p]
    a += ['-f', 'lavfi', '-i', f'color=c=0xB03A33:s=1920x4:r={FPS}:d={T + 1:.3f}', '-i', m4a]   # 高度必须是偶数（yuv420 下 3 px 会让 overlay 崩溃）
    _fdir = str((Path(__file__).resolve().parent / '素材/字体')).replace("'", r"\'")   # v7b：字幕用工程内思源黑体（OFL）
    filt = ["[0:v]setpts=PTS-STARTPTS,ass=filename='" + str(ass_path).replace("'", r"\'") + "':fontsdir='" + _fdir + "'[main]", '[1:v]format=yuv420p[n0]']
    for i in range(1, n_nav):                         # 第 i 段从 starts[i] 起盖上去（--start 时减去 S；负数 = 一开始就盖）
        filt.append(f"[n{i - 1}][{i + 1}:v]overlay=0:0:enable='gte(t,{starts[i] - S:.6f})'[n{i}]")
    # 2026-11-17 修：进度线按段走（第 i 段播放时，线头在第 i 格里从左走到右），和等宽的导航格对齐。
    # 原来按全片时间匀速走，章节长短不一时，线头和当前高亮格对不上（用户审片指出）。
    _ends = list(starts[1:]) + [T_full]
    _px = f'{1920:.0f}'
    _xe = f"-1920+{seg_w:.6f}*{n_nav}"                     # 最后：走满
    for i in range(n_nav - 1, -1, -1):
        seg = f"(-1920+{seg_w:.6f}*({i}+((t+{S:.6f})-{starts[i]:.6f})/{max(.001, _ends[i] - starts[i]):.6f}))"
        _xe = f"if(lt(t+{S:.6f},{_ends[i]:.6f}),{seg},{_xe})"
    filt += [f"[n{n_nav - 1}][{n_nav + 1}:v]overlay=x='{_xe}':y=0[nav]",
             '[main][nav]vstack=inputs=2:shortest=1,format=yuv420p[v]']
    tmp = out.with_name(out.stem + '.tmp.mp4')
    a += ['-filter_complex_threads', '2', '-filter_complex', ';'.join(filt), '-map', '[v]', '-map', f'{n_nav + 2}:a', '-frames:v', str(N),
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '3', '-r', str(FPS), '-pix_fmt', 'yuv420p',
          '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
          '-c:a', 'copy', '-t', f'{T:.3f}', '-movflags', '+faststart', tmp]
    print('[7] 编码成片（mac-heavy-job）…', flush=True)
    t_enc = time.time()
    run_heavy(a, '成片编码')
    os.replace(tmp, out)
    pv = probe_video(out)
    e4 = run([FF, '-hide_banner', '-nostats', '-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-'], '成片响度')
    I_f = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', e4)[-1]); TP_f = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', e4)[-1])
    rec['video'].update(out_frames=pv['frames'], out_size=pv['size'], encode_seconds=round(time.time() - t_enc, 1))
    rec['loudness'].update(out_file_lufs=I_f, out_file_true_peak_dbtp=TP_f)
    rec['finished'] = time.strftime('%Y-%m-%d %H:%M:%S'); rec['seconds'] = round(time.time() - t_start, 1)
    checks = dict(frames=pv['frames'] == N, size=pv['size'] == (1920, 1080), lufs=abs(I_f + 14) <= .5, true_peak=TP_f <= -1.5,
                  linear=p2['normalization_type'] == 'linear', coverage=coverage >= .85, sfx=len(placed) > 0)
    rec['checks'] = checks
    save_rec()
    silent.unlink(missing_ok=True)
    if not all(checks.values()):
        die(f'成片校验没过：{checks}（记录 {rec_path}）')
    print(json.dumps(dict(out=str(out), frames=pv['frames'], duration=round(T, 3), lufs=I_f, true_peak=TP_f, music_coverage=round(coverage, 4),
                          sfx=f'{len(placed)}/{len(events)}', record=str(rec_path)), ensure_ascii=False))


if __name__ == '__main__':
    main()
