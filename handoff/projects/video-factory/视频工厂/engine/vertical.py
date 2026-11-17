# -*- coding: utf-8 -*-
"""竖屏版（小红书 / 视频号）：1080×1920
   上：标题区 · 中：横屏画面（不烧字幕那版）· 下：大字幕（ASS）· 底：进度条
   用法：python3 vertical.py 无字幕横版.mp4 storyboard.json 输出.mp4 "主标题" "副标题" "小标"
   只用 ffmpeg + PIL，不加载任何模型。"""
import sys, json, subprocess, os
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H = 1080, 1920
BG = (233, 226, 212); INK = (26, 24, 22); RED = (196, 40, 36); MUTED = (120, 112, 100)
SONG = '/System/Library/Fonts/Supplemental/Songti.ttc'      # 0 = Songti SC Black
SANS = '/System/Library/Fonts/Hiragino Sans GB.ttc'          # 2 = W6
VID_Y, VID_H = 540, 608                                      # 横屏画面放在这里（1080×608）
SUB_TOP = 1236                                               # 字幕区上沿

def font(p, s, i): return ImageFont.truetype(p, s, index=i)

def make_bg(path, title, sub, kicker):
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    X = 72
    d.rectangle([X, 178, X + 10, 222], fill=RED)
    d.text((X + 26, 200), kicker, font=font(SANS, 38, 2), fill=MUTED, anchor='lm')
    y = 262
    ft = font(SONG, 104, 0)
    while d.textlength(title, font=ft) > W - 2 * X: ft = font(SONG, ft.size - 4, 0)
    d.text((X, y), title, font=ft, fill=INK, anchor='lt')
    l, t, r, b = d.textbbox((X, y), title, font=ft, anchor='lt')
    fs = font(SONG, 54, 0)
    while d.textlength(sub, font=fs) > W - 2 * X: fs = font(SONG, fs.size - 2, 0)
    d.text((X, b + 34), sub, font=fs, fill=INK, anchor='lt')
    # 画面外框阴影
    d.rectangle([0, VID_Y - 6, W, VID_Y + VID_H + 6], fill=(205, 197, 182))
    im.save(path)

def ass_time(t):
    t = max(0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f'{h}:{m:02d}:{s:05.2f}'

# 个别句子的手动断点（自动规则断不好时用）：原句 → 断开后的两行
MANUAL = {
 "这无疑是一曲打破“玻璃天花板”的平权赞歌": "这无疑是一曲|打破“玻璃天花板”的平权赞歌",
 "拿下第一名且票数已经单独过半的候选人": "拿下第一名且票数|已经单独过半的候选人",
 "工学部的染谷隆夫教授拿下了1107票": "工学部的染谷隆夫教授|拿下了1107票",
 "最终却被高层委员会无情推翻的情况，前所未有": "最终却被高层委员会|无情推翻的情况，前所未有",
 "还是仅仅为了去凑出一个好看的结果指标": "还是仅仅为了去凑出|一个好看的结果指标",
 "比民意，染谷隆夫连续两轮投票都是第一": "比民意，染谷隆夫|连续两轮投票都是第一",
 "染谷隆夫的论文被引次数超过5.9万次": "染谷隆夫的论文|被引次数超过5.9万次",
 "而藤垣教授的引用次数约为500多次": "而藤垣教授的引用次数|约为500多次",
 "当然，文理科的论文引用习惯天差地别": "当然，文理科的|论文引用习惯天差地别",
 "却又“秘而不宣”的标准，究竟是什么": "却又“秘而不宣”的标准，|究竟是什么",
 "变成了选考委员会“考虑投票结果”来拍板": "变成了选考委员会|“考虑投票结果”来拍板",
 "连“选举”二字都被降格成了“意向投票”": "连“选举”二字|都被降格成了“意向投票”",
 "大学煞费苦心地让两千多名顶尖学者郑重其事地对比、投票": "大学煞费苦心地让两千多名|顶尖学者郑重其事地对比、投票",
 "硬生生投出一个代表多数人意志的结果": "硬生生投出|一个代表多数人意志的结果",
 "难怪日本网民在雅虎新闻下愤怒地嘲讽": "难怪日本网民|在雅虎新闻下愤怒地嘲讽",
 "既然选考会议觉得候选人各有千秋、无法量化": "既然选考会议觉得|候选人各有千秋、无法量化",
 "议长却极力撇清“性别没有成为讨论对象”": "议长却极力撇清|“性别没有成为讨论对象”",
 "这场被网民称为“既定剧本（出来レース）”的选举出炉后": "这场被网民称为“既定剧本|（出来レース）”的选举出炉后",
 "2019年在东大入学典礼上的名言——": "2019年在东大|入学典礼上的名言——",
 "是一个努力了也不一定能得到回报的社会。”": "是一个努力了|也不一定能得到回报的社会。”",
 "在7年后以最荒诞的形式应验在了工学部染谷教授身上": "在7年后以最荒诞的形式|应验在了工学部染谷教授身上",
 "怎么能把四分之一的惨败美化成“受到鼓舞”": "怎么能把四分之一的惨败|美化成“受到鼓舞”",
 "将这位没有民意基础的校长戏称为“假名总长（仮名総長）”": "将这位没有民意基础的校长|戏称为“假名总长（仮名総長）”",
 "反而坐实了“女性靠特权照顾上位”的偏见": "反而坐实了|“女性靠特权照顾上位”的偏见",
 "让未来所有在社会上凭真本事拼杀的职业女性": "让未来所有在社会上|凭真本事拼杀的职业女性",
 "连巨额的国家财政资助（国际卓越研究大学）": "连巨额的国家财政资助|（国际卓越研究大学）",
 "东大没有选择能在国际上打硬仗的前沿半导体权威": "东大没有选择|能在国际上打硬仗的前沿半导体权威",
 "反而选了一位擅长写体制内行政报告的文科官僚": "反而选了一位擅长写|体制内行政报告的文科官僚",
 "他们只是想推一个带有“女性首发”光环的人出来顶雷": "他们只是想推一个|带有“女性首发”光环的人出来顶雷",
 "就注定是一个在校内缺乏75%教职员信任的“跛脚鸭”": "就注定是一个在校内|缺乏75%教职员信任的“跛脚鸭”",
 "她不仅要承受“德不配位”的诛心审视": "她不仅要承受|“德不配位”的诛心审视",
 "因为挑选她的委员会把所有的打分记录锁进了保险箱": "因为挑选她的委员会|把所有的打分记录锁进了保险箱"
}

def wrap(s, n=16):
    """超过 n 字折成两行，两行都不超过 n 字；断点优先在标点后，其次在虚词后，再次靠近中间"""
    if s in MANUAL: return MANUAL[s].replace('|', r'\N')
    if len(s) <= n: return s
    L = len(s); lo, hi = max(1, L - n), min(n, L - 1); mid = L / 2
    def best(chars):
        c = [k for k in range(lo, hi + 1) if s[k - 1] in chars]
        return min(c, key=lambda k: abs(k - mid)) if c else None
    cut = best('，、：；”）') or best('的了着地得在就把被给和与是对向从让') or round(mid)
    cut = min(max(cut, lo), hi)
    while 0 < cut < L and s[cut - 1].isdigit() and s[cut].isdigit(): cut += 1   # 不拆数字
    if s[cut - 1:cut + 1] == '——': cut += 1
    return s[:cut] + r'\N' + s[cut:]

def make_ass(path, beats):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Hiragino Sans GB,60,&H00161A1A,&H00161A1A,&H00D4E2E9,&H00000000,-1,0,0,0,100,100,1,0,1,0,0,8,60,60,{SUB_TOP},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    # 短引号被拆成两条字幕时（如「陷入“科技衰退 / 制造业疲软”的…」），合成一条两行字幕
    said = [dict(b) for b in beats if b.get('say')]
    merged = []
    for b in said:
        if merged:
            p = merged[-1]; open_q = p['say'].count('“') - p['say'].count('”')
            if open_q > 0 and '”' in b['say'] and b['say'].index('”') <= 8 and len(p['say']) + len(b['say']) + 1 <= 32:
                p['say'] = p['say'] + ('、' if not p['say'].endswith(('、', '，')) else '') + b['say']; p['t1'] = b['t1']; continue
        merged.append(b)
    lines = [f'Dialogue: 0,{ass_time(b["t0"])},{ass_time(b["t1"])},Sub,,0,0,0,,{wrap(b["say"])}' for b in merged]
    open(path, 'w', encoding='utf-8').write(head + '\n'.join(lines) + '\n')

def main(src, sbf, out, title, sub, kicker):
    work = os.path.splitext(out)[0] + '.work'; os.makedirs(work, exist_ok=True)
    sb = json.load(open(sbf)); dur = sb['meta']['duration']
    make_bg(f'{work}/bg.png', title, sub, kicker)
    make_ass(f'{work}/sub.ass', sb['beats'])
    # 进度条：底轨 + 一条按时间从左滑入的红条（overlay 的 x 支持逐帧时间 t）
    fc = (f"[1:v]scale={W}:{VID_H}:flags=lanczos[v];"
          f"[0:v][v]overlay=0:{VID_Y}:shortest=1,"
          f"subtitles=sub.ass:fontsdir=/System/Library/Fonts,"
          f"drawbox=x=0:y={H - 14}:w=iw:h=14:color=0xCFC6B4:t=fill[base];"
          f"color=c=0xC42824:s={W}x14:r=30[bar];"
          f"[base][bar]overlay=x='-{W}+{W}*t/{dur:.3f}':y={H - 14}:eval=frame:shortest=1,"
          f"scale=out_range=tv:out_color_matrix=bt709,format=yuv420p[o]")   # 标准色彩范围，平台播放不发灰
    cmd = [FF, '-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-i', 'bg.png', '-i', src,
           '-filter_complex', fc, '-map', '[o]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
           '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-c:a', 'copy', '-movflags', '+faststart', '-shortest', os.path.abspath(out)]
    subprocess.run(cmd, cwd=work, check=True)
    print('ok', out)

if __name__ == '__main__':
    main(*sys.argv[1:7])
