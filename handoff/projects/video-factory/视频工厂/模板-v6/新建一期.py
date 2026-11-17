# -*- coding: utf-8 -*-
"""新建一期：用 模板-v6 一键搭好 样片/<期>/画面v6/（v6 镜头脚本做法，2026-10-07 固化自大阪 USJ v6）。

用法（三种起点，任选其一）：
  # ① 已经在本期工程跑过视频工厂对齐（推荐）：第三个参数给对齐后的分镜
  python3 新建一期.py <期目录> <稿子.md> <期目录>/工程/.work/storyboard.json
  # ② 只有配音：第三个参数给旁白 wav。本期工程里还没对齐时，脚本会把 工程/ 搭好并告诉你对齐命令，对齐完再跑一次 ①
  python3 新建一期.py <期目录> <稿子.md> <文案名>.旁白.wav
  # ③ 已有现成的 v6 时间轴（复用、自测）：旁白 wav + --时间轴
  python3 新建一期.py <期目录> <稿子.md> 旁白.wav --时间轴 某期/storyboard-audio.json
选项：--资料 ~/Desktop/写稿/资料/<期>（证据卡、截图、视频目录写进 项目.json）  --成片 输出路径  --期名 名字
      --保留片头（工厂片头静止屏留作 S00）  --精剪 计划.json（见 定时间轴.py）  --更新模板（已建好的期里用模板新版覆盖代码文件，
      不动 项目.json、镜头脚本、素材；改了 engine 等于全片重渲）
<期目录> 可以写绝对路径，也可以只写期名（= ~/Desktop/视频工厂/样片/<期名>）。

做什么：
  1 建目录：画面v6/{工程/.work, 镜头脚本, 镜头, 素材/{帧,原件,生成,序列}, 声音/音效, 封面/{候选-v2,成品}, 质检, 自测, 示范}
  2 拷模板：v6lib.py + 接口说明、总装v6.py、定时间轴.py、工程/engine（档案纸主题 + fx.js）、分段渲染.mjs、做纸纹.py、
    声音/做音效-v6.py + 音效库、做闪避对比.py、质检/抽帧拼图.py + 校验测试片.py、示范/（USJ 三个示范镜头）、
    素材/生成/（Seedance 寓意小动画：生成.mjs、抽帧检查.py、风格参考图、USJ 镜头表示例）；写 工程/指纹-来源.txt
  3 定时间轴：调 定时间轴.py → 工程/.work/storyboard-audio.json + 声音/旁白.wav（已有的不覆盖，除非时间轴来源变了）
  4 写 项目.json 骨架（已有就只补空着的字段）：期名、片名、稿子、证据卡、成片输出、旁白、时间轴、素材目录、视频目录、
    章名、导航（默认 8 段，按章自动分，标签要人改成 4 个字左右）、配乐分段（默认 4 段占位，曲子文件要另外生成）、封面
  6 节拍表.json 骨架（每屏一行，强弱待填；已填的不动）
  5 每屏一个空白镜头脚本骨架 镜头脚本/<镜头号>.py（已有的不动）：注释里有该屏旁白（句号、镜头内时刻）、时长、稿子原文、画面任务
不跑模型、不渲染、不花钱。重跑安全：已有的 项目.json 字段、镜头脚本、素材都不覆盖。
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TPL = Path(__file__).resolve().parent
FACTORY = Path.home() / 'Desktop' / '视频工厂'                # 两台电脑都从 ~/Desktop/视频工厂（指向云盘）进入
SAMPLES = FACTORY / '样片'
MAIN_ENGINE = FACTORY / 'engine'
FPS = 30

# 模板里要拷进每期的代码文件（相对 模板-v6/ 与 画面v6/）
CODE_FILES = ['v6lib.py', 'v6lib-接口说明.md', '总装v6.py', '定时间轴.py',
              '工程/分段渲染.mjs', '工程/做纸纹.py',
              '声音/做音效-v6.py', '声音/做闪避对比.py',
              '质检/抽帧拼图.py', '质检/校验测试片.py']
CODE_DIRS = ['工程/engine', '声音/音效', '示范', '素材/生成', '实拍', '地图', '素材/字体']   # 素材/字体：v7b 思源黑体 + Oswald（OFL，2026-11-07）   # 地图：做底图.py（2026-10-27 地图舞台）          # 实拍：满屏实拍/照片底片工具（2026-10-20 从夕张、311 固化）          # 素材/生成：Seedance 寓意小动画工具（生成.mjs 花钱前要用户批准上限）
SUBDIRS = ['工程/.work', '镜头脚本', '镜头', '素材/帧', '素材/原件', '素材/生成', '素材/序列', '声音/音效', '封面/候选-v2', '封面/成品', '质检', '自测', '示范']


def die(msg):
    print('[新建一期 失败] ' + msg, file=sys.stderr)
    sys.exit(1)


def sha(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''):
            h.update(c)
    return h.hexdigest()


def portable(p) -> str:
    """写进 项目.json 的路径：在 ~/Desktop/写稿、~/Desktop/视频工厂（两者指向云盘 视频制作/）下面的，一律写成 ~/Desktop/…，
    不写用户名、不写云盘真实长路径（两台电脑用户名、云盘文件夹名可能不同）。v6lib、总装读的时候会展开 ~。"""
    p = Path(p)
    for name in ('视频工厂', '写稿'):
        entry = Path.home() / 'Desktop' / name
        for base in (entry, entry.resolve()):
            try:
                return str(Path('~/Desktop') / name / p.relative_to(base))
            except ValueError:
                pass
    return str(p)


def plain(t: str) -> str:
    return re.sub(r'==|\*\*', '', t or '').strip()


def copy_template(V: Path, update: bool):
    done = []
    for rel in CODE_FILES:
        s, d = TPL / rel, V / rel
        if not s.exists():
            die(f'模板缺文件：{s}')
        if d.exists() and not update:
            continue
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(s, d)
        done.append(rel)
    for rel in CODE_DIRS:
        s, d = TPL / rel, V / rel
        for f in sorted(s.rglob('*')):
            if f.is_dir() or f.name.startswith('.'):
                continue
            t = d / f.relative_to(s)
            if t.exists() and not update:
                continue
            t.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, t)
            done.append(str(t.relative_to(V)))
    # 指纹：记下这期用的是哪一版模板（以后对比、回溯用）
    fp = V / '工程' / '指纹-来源.txt'
    lines = [f'# 画面v6 模板来源指纹（{datetime.datetime.now():%Y-%m-%d %H:%M}，来自 {TPL}）',
             '# 分段渲染.mjs 的缓存键含 engine/ 下这些文件的哈希：改任何一个 = 全部镜头重渲']
    for f in sorted((V / '工程' / 'engine').rglob('*')) + [V / '工程' / '分段渲染.mjs', V / 'v6lib.py', V / '总装v6.py']:
        if f.is_file() and not f.name.startswith('.'):
            lines.append(f'{sha(f)}  {f.relative_to(V)}')
    if done or not fp.exists():
        fp.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return done


def setup_factory(D: Path, md: Path, wav: Path):
    """②：本期还没对齐时，把视频工厂工程搭好（引擎快照 + 稿子、配音的符号链接），返回对齐命令。"""
    W = D / '工程'
    if not (W / 'engine').exists():
        shutil.copytree(MAIN_ENGINE, W / 'engine', ignore=shutil.ignore_patterns('_备份', '.DS_Store'))
        lines = [f'# 视频工厂引擎快照（{datetime.datetime.now():%Y-%m-%d %H:%M}，复制自 {MAIN_ENGINE}，只用来对齐时间轴）']
        lines += [f'{sha(f)}  {f.relative_to(W)}' for f in sorted((W / 'engine').rglob('*')) if f.is_file()]
        (W / '引擎快照指纹.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    (W / '1-我的文案').mkdir(parents=True, exist_ok=True)
    (W / '2-成片').mkdir(parents=True, exist_ok=True)
    name = md.stem
    for link, target in [(W / '1-我的文案' / md.name, md), (W / '1-我的文案' / f'{name}.旁白{wav.suffix}', wav)]:
        if link.is_symlink() or link.exists():
            continue
        root = FACTORY.resolve().parent                    # 云盘 视频制作/：两边都在里面就用相对链接，另一台电脑也能用
        inside = all(str(x).startswith(str(root) + os.sep) for x in (target, link.parent.resolve()))
        link.symlink_to(os.path.relpath(target, link.parent.resolve()) if inside else target)
    return (f'cd "{W}" && export PATH="$(ls -d $HOME/.nvm/versions/node/v24*/bin | sort -V | tail -1):$PATH" && '
            f'/usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- node engine/run.mjs "1-我的文案/{md.name}" 2>&1 | tee 对齐日志.txt')


def auto_nav(aud, n_max=8):
    """默认导航：按章分段（章多于 n_max 时把相邻章合并，尽量让每段时长差不多）。标签先用章名前几个字，要人改。"""
    runs = []                                            # 时间顺序上的「章段」：(章号, 章名, 起镜头, 起点)
    for s in aud['scenes']:
        if not runs or runs[-1][0] != s['no']:
            runs.append((s['no'], s.get('chapter') or '', s['stable_id'], s['t0']))
    T = aud['meta']['duration']
    if len(runs) > n_max:                                # 合并：在 k*T/n 附近挑章的起点
        picks, used = [runs[0]], {0}
        for k in range(1, n_max):
            target = k * T / n_max
            j = min((i for i in range(1, len(runs)) if i not in used), key=lambda i: abs(runs[i][3] - target))
            used.add(j)
            picks.append(runs[j])
        runs = sorted(picks, key=lambda r: r[3])
    out = []
    for no, ch, sid, t0 in runs:
        lb = re.sub(r'[，。、：:；;！!？?\s「」『』“”"\'（）()·—-]', '', plain(ch))[:4] or f'第{no}章'
        out.append({'标签': lb, '起镜头': sid})
    return out


def auto_music(aud, n=4):
    """默认配乐分段：按结构段 4 段（在全片 1/4、1/2、3/4 附近的章节交界换曲），曲子文件名是占位，要按音乐表生成后改。"""
    sc = aud['scenes']
    T = aud['meta']['duration']
    cuts = [0]
    starts = [i for i in range(1, len(sc)) if sc[i]['no'] != sc[i - 1]['no']] or list(range(1, len(sc)))
    for k in range(1, n):
        cand = [i for i in starts if i > cuts[-1]]
        if not cand:
            break
        cuts.append(min(cand, key=lambda i: abs(sc[i]['t0'] - k * T / n)))
    cuts.append(len(sc))
    out = []
    for k in range(len(cuts) - 1):
        a, b = cuts[k], cuts[k + 1] - 1
        out.append({'名': f'M{k + 1}', '曲子': f'配乐-M{k + 1}-待生成.mp3', '起镜头': sc[a]['stable_id'], '止镜头': sc[b]['stable_id'],
                    '对齐': '开头' if k == 0 else '结尾', '比人声低dB': 20.0})
    return out


def fill_project(V: Path, D: Path, md: Path, aud, args):
    pj = V / '项目.json'
    P = json.loads(pj.read_text(encoding='utf-8')) if pj.exists() else {}
    title = ''
    for ln in md.read_text(encoding='utf-8').split('\n'):
        if ln.startswith('# '):
            title = plain(ln[2:])
            break
    res = Path(args.资料).expanduser().resolve() if args.资料 else None
    name = args.期名 or D.name
    want = {
        '_说明': '本期 v6 画面与总装的设置（字段说明见 模板-v6/README.md「项目.json」）。相对路径按 画面v6/ 目录算。'
                 '章名、章号文字、章标覆盖画在镜头里，改了要重渲；导航、配乐、成片输出只影响总装。',
        '期名': name,
        '片名': title,
        '稿子': portable(md),
        '证据卡': portable(res / '00-证据卡.md') if res else '',
        '成片输出': portable(Path(args.成片).expanduser().resolve()) if args.成片 else portable(FACTORY / '2-成片' / f'{name}-v6.mp4'),
        '旁白': '声音/旁白.wav',
        '时间轴': '工程/.work/storyboard-audio.json',
        '素材目录': ['素材'] + ([portable(res / '素材' / '截图')] if res else []),
        '视频目录': ['素材', '素材/生成'] + ([portable(res / '素材' / '视频' / x) for x in ('片段', '成品', '原始')] if res else []),
        '实拍': {'_注': '有自己拍的实拍/照片满屏时填（见 实拍/实拍设置.py）；没有就留空。工作区放 SSD。',
                 '工作区': '', '原片目录': ['原片'], '照片目录': ['照片'], '片段目录': '实拍片段',
                 '索引': '', '标签': '实拍', '原声': {'相对dB': 0, '闪避dB': 12}},
        '章名': {},
        '章号文字': {},
        '章标覆盖': {},
        '章卡': {},
        '接缝淡化': [],
        '导航': [],
        '配乐': {'闪避dB': 3.0, '分段': [], '刻意动作': [], '刻意动作区间': []},
        '封面': {'_注': '主体图要故事完整；Codex 一次出 6–7 个构图让用户挑（reference 07 第 3 节）。标题用用户本期定的，拆成 2–3 行、'
                       '分段上色（墨 / 红）、某行可垫荧光笔；尺寸表先照 USJ 定稿（主体在右下、标题在左上），换了主体图要调 主体高 / 主体位置',
                 '主体图': '封面/候选-v2/原图-01.png',
                 '标题': {'字体': '/System/Library/Fonts/Supplemental/Songti.ttc', '字体序号': 0, '行距': 0.2,
                          '行': [{'片段': [[title or '本期标题', '墨']], '字号': '大'}]},
                 '尺寸': {'yt': {'宽': 1280, '高': 720, '标题位置': [46, 29], '大字号': 108, '小字号': 59, '主体高': 720.4, '主体位置': [0, 0], '文件名': '封面-yt'},
                          '16x9': {'宽': 1920, '高': 1080, '标题位置': [69, 43], '大字号': 162, '小字号': 89, '主体高': 1080.6, '主体位置': [0, 0], '文件名': '封面-16x9'},
                          '4x3': {'宽': 1440, '高': 1080, '标题位置': [60, 50], '大字号': 150, '小字号': 84, '主体高': 810, '主体位置': [0, 270], '文件名': '封面-视频号4x3'},
                          '3x4': {'宽': 1080, '高': 1440, '标题位置': [64, 90], '大字号': 128, '小字号': 70, '主体高': 900, '主体位置': [-475, 470], '文件名': '封面-视频号3x4'},
                          '9x16': {'宽': 1080, '高': 1920, '标题位置': [64, 440], '大字号': 128, '小字号': 70, '主体高': 860, '主体位置': [-434, 800], '文件名': '封面-视频号9x16'}},
                 '文件名': f'{name}-v6', '输出目录': '封面/成品'},
    }
    if aud is not None:
        chapters, chapno = {}, {}
        first_title, cur = [], None                         # 稿子里每个 ## 下面第一个 # 大标题（给「引子」「尾声」当章名）
        for ln in md.read_text(encoding='utf-8').split('\n'):
            if ln.startswith('## '):
                first_title.append(''); cur = len(first_title) - 1
            elif ln.startswith('# ') and cur is not None and not first_title[cur]:
                first_title[cur] = plain(ln[2:])[:10]
        for s in aud['scenes']:
            if s['no'] and str(s['no']) not in chapters:
                raw = (s.get('chapter') or '').strip()
                m = re.match(r'^第\s*(\d+)\s*章\s*', raw)
                # 稿子 ## 写成「第3章 xxx」：章名只留 xxx，章号照稿子写（有「引子」时时间轴的序号会比稿子多 1）；
                # 「引子」「尾声」这类不带章号的：右上那行直接写它（2026-10-20，夕张、311 都手动改过）
                ft = first_title[s['no'] - 1] if 0 < s['no'] <= len(first_title) else ''
                chapters[str(s['no'])] = raw[m.end():] if m else (ft or raw)
                chapno[str(s['no'])] = f'第 {int(m.group(1))} 章' if m else (raw or f'第 {s["no"]} 章')
        want['章名'] = chapters
        want['章号文字'] = chapno
        want['导航'] = auto_nav(aud)
        want['配乐']['分段'] = auto_music(aud)
    added = []
    for k, v in want.items():
        if k not in P or P[k] in ('', [], {}, None):
            if v not in ('', [], {}, None) or k not in P:
                P[k] = v
                added.append(k)
        elif isinstance(v, dict) and isinstance(P[k], dict):          # 配乐、封面：只补缺的子字段
            for kk, vv in v.items():
                if kk not in P[k] or P[k][kk] in ('', [], None):
                    if vv not in ('', [], None) or kk not in P[k]:
                        P[k][kk] = vv
                        added.append(f'{k}.{kk}')
    pj.write_text(json.dumps(P, ensure_ascii=False, indent=1), encoding='utf-8')
    long = [f'第{k}章「{v}」' for k, v in (P.get('章名') or {}).items()
            if len(re.sub(r'[，。、：:；;！!？?\s「」『』“”"\'（）()·—-]', '', plain(v))) > 12]     # USJ 认可的章名最长 11 个字
    return P, added, long


def write_skeletons(V: Path, aud, info):
    by_id = {d['镜头号']: d for d in info} if info else {}
    made = []
    for k, s in enumerate(aud['scenes']):
        sid = s['stable_id']
        f = V / '镜头脚本' / f'{sid}.py'
        if f.exists():
            continue
        d = by_id.get(sid, {})
        dur = round(s['t1'] * FPS) / FPS - round(s['t0'] * FPS) / FPS
        head = d.get('屏标题', '')
        lines = [f'"""{sid} {plain(head) or "（待定标题）"}（{dur:.2f} 秒，第 {s["no"]} 章「{s.get("chapter", "")}」）—— 待写',
                 '旁白（镜头内秒数；句号就是 T(句号) 用的号，Tw(\'词\') 取念到某个词的时刻）：']
        for b in aud['beats']:
            if b['scene'] == k:
                lines.append(f'  句{b["original_beat"]:>4}  {b["t0"] - s["t0"]:6.2f}–{b["t1"] - s["t0"]:6.2f}  {b["say"]}')
        src = d.get('稿子原文') or []
        if src:
            lines.append(f'稿子这一屏（第 {d["稿子行号"][0]}–{d["稿子行号"][1]} 行）：')
            lines += ['  ' + x for x in src]
        tasks = [x for x in src if '画面' in x and x.strip().startswith('<!--')]
        lines.append('画面任务：' + ('见上面稿子里的 <!-- 画面 --> 注释' if tasks else '（稿子没写，按旁白自己设计）'))
        lines += ['写法：照 示范/ 三个例子；一屏一个主效果，小变化每 2.5–4 秒一个；第一个画面元素 1 秒内出现；每个动作写 sfx=。',
                  '      参数见 v6lib-接口说明.md；数字、引语只按证据卡；写完 python3 v6lib.py 看检查报告。', '"""',
                  'import sys', 'from pathlib import Path', 'sys.path.insert(0, str(Path(__file__).resolve().parent.parent))',
                  'from v6lib import *', '', '',
                  'def build():',
                  f"    s = begin({sid!r}, {head!r}, None)      # 第三个参数是左下出处，如 '来源：…'；标题不提前剧透后半句才揭晓的数字" if head
                  else f"    s = begin({sid!r}, None, None)      # 第二个参数是标题，第三个是左下出处（'来源：…'）",
                  '    # TODO：照旁白时刻放原件 / 照片 / 视频卡 / 数字 / 盖章……（全片约 9 成时长要有照片、原件或视频卡）',
                  '    return s', '']
        f.write_text('\n'.join(lines), encoding='utf-8')
        made.append(sid)
    return made


def write_beats(V: Path, aud):
    """节拍表骨架 画面v6/节拍表.json（2026-11-06）：每个镜头一行，秒数和首句自动填，新信息、情绪、强弱由写镜头脚本的人填。
    重跑安全：已填的不动，只补新镜头、刷新秒数和首句。"""
    f = V / '节拍表.json'
    d = json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}
    old = d.get('镜头') or {}
    rows = {}
    for i, s in enumerate(aud['scenes']):
        sid = s['stable_id']
        say = next((b['say'] for b in aud['beats'] if b['scene'] == i), '')
        r = dict(old.get(sid) or {'新信息': '', '情绪': '', '强弱': ''})
        rows[sid] = {'秒数': round(s['t1'] - s['t0'], 1), '首句': say[:28], **{k: v for k, v in r.items() if k not in ('秒数', '首句')}}
    new = [k for k in rows if k not in old]
    d = {'说明': '强弱只写 强/中/松。强段 15–30%：盖章、集中线、拟声字、极短插镜只放这里；松段至少 10%：少动作，允许停 8 秒。见 reference 09「节拍强弱表」。', '镜头': rows}
    f.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding='utf-8')
    return new


def main():
    ap = argparse.ArgumentParser(description='用 模板-v6 新建一期（画面v6）')
    ap.add_argument('期目录')
    ap.add_argument('稿子')
    ap.add_argument('旁白或分镜', help='MiniMax 旁白 wav，或视频工厂对齐后的 .work/storyboard.json')
    ap.add_argument('--时间轴', default=None, help='已经是 v6 格式的 storyboard-audio.json（配合旁白 wav 用：复用、自测）')
    ap.add_argument('--资料', default=None, help='写稿资料目录（~/Desktop/写稿/资料/<期>）：证据卡、截图、视频目录写进 项目.json')
    ap.add_argument('--成片', default=None)
    ap.add_argument('--期名', default=None)
    ap.add_argument('--保留片头', action='store_true')
    ap.add_argument('--精剪', default=None)
    ap.add_argument('--更新模板', action='store_true')
    a = ap.parse_args()

    D = Path(a.期目录).expanduser()
    if not D.is_absolute():
        D = (Path.cwd() / D) if (Path.cwd() / D).exists() else SAMPLES / D
    D = D.resolve()
    md = Path(a.稿子).expanduser().resolve()
    third = Path(a.旁白或分镜).expanduser().resolve()
    if not md.is_file():
        die(f'缺稿子：{md}')
    if not third.exists():
        die(f'缺第三个参数指的文件：{third}')
    V = D / '画面v6'
    for sd in SUBDIRS:
        (V / sd).mkdir(parents=True, exist_ok=True)
    copied = copy_template(V, a.更新模板)
    print(f'[1] 目录：{V}（拷了 {len(copied)} 个模板文件{"，--更新模板 覆盖了代码" if a.更新模板 else ""}）')

    # ---------- 定时间轴 ----------
    tl = V / '工程' / '.work' / 'storyboard-audio.json'
    narr_out = V / '声音' / '旁白.wav'
    cmd = None
    if third.suffix.lower() == '.json':                       # ① 工厂对齐分镜
        cmd = [sys.executable, str(V / '定时间轴.py'), str(third), str(tl.parent), '--旁白输出', str(narr_out), '--稿子', str(md)]
        if a.保留片头:
            cmd.append('--保留片头')
        if a.精剪:
            cmd += ['--精剪', str(Path(a.精剪).expanduser().resolve())]
    elif a.时间轴:                                            # ③ 现成 v6 时间轴 + 旁白
        cmd = [sys.executable, str(V / '定时间轴.py'), str(Path(a.时间轴).expanduser().resolve()), str(tl.parent),
               '--旁白', str(third), '--旁白输出', str(narr_out)]
    else:                                                     # ② 只有旁白：找本期工程里的对齐结果
        sb = D / '工程' / '.work' / 'storyboard.json'
        if sb.is_file() and (D / '工程' / '.work' / 'narration.wav').is_file() and sb.stat().st_mtime >= third.stat().st_mtime:
            print(f'[2] 找到本期工程的对齐结果：{sb}')
            cmd = [sys.executable, str(V / '定时间轴.py'), str(sb), str(tl.parent), '--旁白输出', str(narr_out), '--稿子', str(md)]
            if a.保留片头:
                cmd.append('--保留片头')
            if a.精剪:
                cmd += ['--精剪', str(Path(a.精剪).expanduser().resolve())]
        else:
            run = setup_factory(D, md, third)
            P, added, _ = fill_project(V, D, md, None, a)
            print('[2] 本期还没有对齐好的时间轴。已搭好视频工厂工程（引擎快照 + 稿子、配音链接），请先对齐一次'
                  '（要跑 Whisper，按 16 GB 规矩走 mac-heavy-job；退出码 75 = 别的重任务在跑，等它跑完）：\n    ' + run)
            print('    日志出现「正在渲染画面」时 工程/.work/storyboard.json 已经写好：可以等它跑完（工厂成片当兜底预览，'
                  '10 分钟片约半小时），也可以 Ctrl-C 停掉。然后再跑一次：\n'
                  f'    python3 "{TPL / "新建一期.py"}" "{D}" "{md}" "{D / "工程" / ".work" / "storyboard.json"}"')
            print(f'[3] 项目.json 骨架已写（{V / "项目.json"}），章名、导航、配乐分段等对齐后再补。')
            return
    if tl.exists() and cmd:
        old = tl.read_bytes()
    else:
        old = None
    r = subprocess.run(cmd)
    if r.returncode:
        die('定时间轴失败（看上面的报错）')
    aud = json.loads(tl.read_text(encoding='utf-8'))
    if old is not None and old != tl.read_bytes():
        print('    ⚠️ 时间轴变了：已经写好的镜头脚本里手写的秒数要重查（T()、Tw() 会自动跟着走），全部镜头要重渲')
    info_p = tl.parent / '时间轴-屏信息.json'
    info = json.loads(info_p.read_text(encoding='utf-8')) if info_p.exists() else []
    N = sum(round(s['t1'] * FPS) - round(s['t0'] * FPS) for s in aud['scenes'])
    print(f'[2] 时间轴：{len(aud["scenes"])} 个镜头，{len(aud["beats"])} 句，{N} 帧 = {N / FPS:.2f} 秒；旁白 {narr_out}')

    # ---------- 项目.json ----------
    P, added, long = fill_project(V, D, md, aud, a)
    print(f'[3] 项目.json：{V / "项目.json"}（这次补了：{"、".join(added) or "无"}）')
    if long:
        print('    ⚠️ 章名偏长（去掉标点超过 12 个字，右上章标可能放不下），在 项目.json「章名」里改短（≤10 字最好）：' + '；'.join(long))
    if any(x['曲子'].endswith('待生成.mp3') for x in P['配乐']['分段']):
        print('    配乐分段是占位：按音乐表用 MiniMax 生成约 4 首纯器乐，放进 画面v6/声音/，把「曲子」改成真文件名（reference 05）')
    if '导航' in added:
        print('    导航标签是按章名截的，要改成 4 个字左右的小标题（项目.json「导航」）')

    # ---------- 镜头脚本骨架 ----------
    made = write_skeletons(V, aud, info)
    print(f'[4] 镜头脚本骨架：新写 {len(made)} 个（已有的不动），在 {V / "镜头脚本"}')
    beats_new = write_beats(V, aud)
    print(f'[5] 节拍表：{V / "节拍表.json"}（新增 {len(beats_new)} 行）。写镜头脚本前先填每屏的新信息、情绪、强弱')
    s1, s2 = aud['scenes'][0]['stable_id'], aud['scenes'][min(1, len(aud['scenes']) - 1)]['stable_id']
    print('\n下一步：\n'
          f'  cd "{V}"\n'
          '  先填 节拍表.json（强 15–30%、松至少 10%）\n'
          f'  python3 v6lib.py {s1} {s2}            # 看这几个镜头的旁白时刻，照着写 镜头脚本/{s1}.py …\n'
          '  python3 v6lib.py                    # 拼分镜 + 检查报告\n'
          f"  python3 -c \"from v6lib import *; build_storyboard(); render(['{s1}'], stills=True, at=[1, 4])\"   # 先看静帧\n"
          '  python3 -c "from v6lib import *; build_storyboard(); render()"                                 # 全片渲染（没改的复用）\n'
          '  python3 总装v6.py                     # 总装成片（配乐、音效、字幕、底部导航）\n'
          '  细则：模板-v6/README.md、v6lib-接口说明.md、explainer-video-workflow reference 09')


if __name__ == '__main__':
    main()
