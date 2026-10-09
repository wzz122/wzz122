#!/usr/bin/env python3
"""Cut a 9:16 food reel from raw phone clips + a reel.json spec.

Usage:
  python3 make_reel.py path/to/reel.json [--draft] [--out out_dir]

Pipeline: TTS/voiceover per beat -> beat lengths follow the narration ->
each clip is cropped to 1080x1920, graded, optionally pushed in / slowed ->
segments concatenated -> cover title, captions, info card overlaid ->
voiceover + ASMR + ducked BGM mixed and loudness-normalised.

Outputs (in out dir): reel.mp4, reel_nobgm.mp4 (for adding Instagram in-app
music), cover.jpg, timeline.txt.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import wave

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
ASSETS = os.environ.get("FOOD_REEL_ASSETS", os.path.join(SKILL, "assets"))
W, H, FPS = 1080, 1920, 30

KOKORO_VOICES = {  # kokoro-multi-lang-v1_0 speaker ids (zh voices)
    "zf_xiaobei": 45, "zf_xiaoni": 46, "zf_xiaoxiao": 47, "zf_xiaoyi": 48,
    "zm_yunjian": 49, "zm_yunxi": 50, "zm_yunxia": 51, "zm_yunyang": 52,
}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("ffmpeg failed:\n" + " ".join(cmd) + "\n" + r.stderr[-3000:])
    return r


def probe(path):
    r = run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path])
    return json.loads(r.stdout)


def duration(path):
    return float(probe(path)["format"]["duration"])


def font_path(lang):
    name = "NotoSansJP-Black.ttf" if lang == "ja" else "NotoSansSC-Black.ttf"
    p = os.path.join(ASSETS, "fonts", name)
    if not os.path.exists(p):
        sys.exit(f"missing font {p} - run scripts/setup.sh first")
    return p


# ---------------------------------------------------------------- audio

def tts_lines(lines, voice, speed, outdir):
    import numpy as np
    import sherpa_onnx
    d = os.path.join(ASSETS, "kokoro-multi-lang-v1_0") + "/"
    if not os.path.exists(d + "model.onnx"):
        sys.exit("missing TTS model - run scripts/setup.sh first")
    cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=d + "model.onnx", voices=d + "voices.bin", tokens=d + "tokens.txt",
            data_dir=d + "espeak-ng-data", dict_dir=d + "dict",
            lexicon=d + "lexicon-us-en.txt," + d + "lexicon-zh.txt"),
        num_threads=4))
    tts = sherpa_onnx.OfflineTts(cfg)
    sid = KOKORO_VOICES.get(voice, voice if isinstance(voice, int) else 47)
    out = []
    for i, line in enumerate(lines):
        if not line:
            out.append(None)
            continue
        a = tts.generate(strip_marks(line), sid=sid, speed=speed)
        x = (np.clip(np.array(a.samples), -1, 1) * 32767).astype("<i2")
        p = os.path.join(outdir, f"vo_{i:02d}.wav")
        with wave.open(p, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(a.sample_rate)
            w.writeframes(x.tobytes())
        out.append(p)
    return out


def split_voiceover(path, n, outdir, base):
    """Split one recorded take into n phrases at the longest silences."""
    r = subprocess.run(["ffmpeg", "-i", path, "-af", "silencedetect=n=-35dB:d=0.25",
                        "-f", "null", "-"], capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    total = duration(path)
    gaps = [(e - s, s, e) for s, e in zip(starts, ends) if s > 0.05 and e < total - 0.05]
    if len(gaps) < n - 1:
        sys.exit(f"voiceover has {len(gaps) + 1} phrases but reel.json has {n} spoken beats; "
                 "pause ~0.5s between lines when recording")
    cuts = sorted(gaps, reverse=True)[: n - 1]
    bounds = [0.0] + sorted((s + e) / 2 for _, s, e in cuts) + [total]
    out = []
    for i in range(n):
        p = os.path.join(outdir, f"vo_{i:02d}.wav")
        run(["ffmpeg", "-y", "-i", path, "-ss", f"{bounds[i]:.3f}", "-to", f"{bounds[i + 1]:.3f}",
             "-af", "silenceremove=start_periods=1:start_threshold=-40dB,areverse,"
                    "silenceremove=start_periods=1:start_threshold=-40dB,areverse",
             "-ar", "48000", "-ac", "1", p])
        out.append(p)
    return out


# ---------------------------------------------------------------- graphics

def strip_marks(s):
    return s.replace("**", "")


EMOJI_FONT = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
_cmaps = {}


def has_glyph(font, ch):
    key = font.path
    if key not in _cmaps:
        from fontTools.ttLib import TTFont
        _cmaps[key] = TTFont(key, lazy=True).getBestCmap()
    return ord(ch) in _cmaps[key] or ch in "\ufe0f\u200d"


def emoji_img(ch, size):
    try:
        f = ImageFont.truetype(EMOJI_FONT, 109)
    except OSError:
        return None
    g = Image.new("RGBA", (136, 128), (0, 0, 0, 0))
    ImageDraw.Draw(g).text((0, 0), ch, font=f, embedded_color=True)
    return g.resize((int(size * 1.06), int(size)), Image.LANCZOS)


def text_w(draw, s, font):
    w = 0
    for run_, emo in runs(s, font):
        w += len(run_) * font.size * 1.1 if emo else draw.textlength(run_, font=font)
    return w


def runs(s, font):
    """Split text into (text, is_emoji) runs; emoji come from the colour font."""
    out = []
    for ch in s:
        emo = not has_glyph(font, ch)
        if out and out[-1][1] == emo:
            out[-1][0] += ch
        else:
            out.append([ch, emo])
    return out


def draw_marked(draw, xy, s, font, stroke, hi=(255, 214, 0)):
    """Draw text where **word** is highlighted yellow; emoji drawn in colour."""
    x, y = xy
    for i, part in enumerate(s.split("**")):
        fill = hi if i % 2 else (255, 255, 255)
        for run_, emo in runs(part, font):
            if emo:
                for ch in run_:
                    if ch in "\ufe0f\u200d":
                        continue
                    g = emoji_img(ch, font.size)
                    if g:
                        draw._image.alpha_composite(g, (int(x), int(y + font.size * 0.2)))
                    x += font.size * 1.1
            else:
                draw.text((x, y), run_, font=font, fill=fill, stroke_width=stroke,
                          stroke_fill=(0, 0, 0))
                x += draw.textlength(run_, font=font)


NO_START = "，。、！？!?,.：:；;）)」』ー～…"


def wrap(draw, s, font, maxw):
    """CJK wrap: prefer breaking after punctuation, never start a line with it."""
    if text_w(draw, strip_marks(s), font) <= maxw:
        return [s]
    # break after the last punctuation mark whose clause still fits on the line
    marks = [m.end() for m in re.finditer(r"[，、。！？,!? ]", s)]
    for cut in sorted(marks, reverse=True):
        a_, b_ = s[:cut].rstrip(), s[cut:].lstrip()
        if a_.count("**") % 2:
            a_, b_ = a_ + "**", "**" + b_
        if b_ and text_w(draw, strip_marks(a_), font) <= maxw:
            return [a_] + wrap(draw, b_, font, maxw)
    lines, cur, hl = [], "", False
    for ch in re.findall(r"\*\*|.", s):
        if ch == "**":
            hl = not hl
            cur += ch
            continue
        if text_w(draw, strip_marks(cur + ch), font) > maxw and strip_marks(cur) \
                and ch not in NO_START:
            lines.append(cur + ("**" if hl else ""))
            cur = ("**" if hl else "") + ch
        else:
            cur += ch
    if strip_marks(cur):
        lines.append(cur)
    return lines


def caption_png(text, fontp, path, size=78, y_center=1300):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(fontp, size)
    lines = wrap(d, text, f, W - 160)
    while len(lines) > 2 and size > 64:  # keep captions to two lines
        size -= 6
        f = ImageFont.truetype(fontp, size)
        lines = wrap(d, text, f, W - 160)
    lh = int(size * 1.25)
    y = y_center - lh * len(lines) // 2
    for ln in lines:
        x = (W - text_w(d, strip_marks(ln), f)) / 2
        draw_marked(d, (x, y), ln, f, stroke=max(6, size // 10))
        y += lh
    img.save(path)


def cover_png(cover, fontp, path):
    """Area badge top-left, vertical hook down the left, big horizontal title."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    top, bottom = 280, 1560  # stays inside the 3:4 profile-grid crop
    # badge
    area = cover.get("area", "")
    if area:
        r = 105
        cx, cy = 40 + r, top + r
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255))
        fs = 96 if len(area) <= 2 else int(190 / len(area) * 1.05)
        f = ImageFont.truetype(fontp, fs)
        tw = text_w(d, area, f)
        d.text((cx - tw / 2, cy - fs * 0.62), area, font=f, fill=(0, 0, 0))
    # title
    title = cover.get("title", "")
    hook = cover.get("hook", "")
    tsize = 124
    ft = ImageFont.truetype(fontp, tsize)
    col_w = 120 if hook else 0
    while title and text_w(d, title, ft) > W - 60 - col_w and tsize > 60:
        tsize -= 4
        ft = ImageFont.truetype(fontp, tsize)
    title_y = bottom - tsize
    # vertical hook: one char per row, last row shares the title baseline
    if hook:
        hs = 104
        fh = ImageFont.truetype(fontp, hs)
        room = title_y + tsize - (top + 230)
        while len(hook) * hs * 1.02 > room and hs > 56:
            hs -= 4
            fh = ImageFont.truetype(fontp, hs)
        y = title_y + tsize - hs * 1.02 * len(hook)
        for ch in hook:
            if ch in "ー—～〜":  # rotate long-vowel marks for vertical text
                g = Image.new("RGBA", (hs * 2, hs * 2), (0, 0, 0, 0))
                ImageDraw.Draw(g).text((hs * 0.5, hs * 0.3), ch, font=fh, fill="white",
                                       stroke_width=7, stroke_fill="black")
                g = g.rotate(-90)
                img.alpha_composite(g, (int(40 + col_w / 2 - hs), int(y - hs * 0.5)))
            else:
                cw = text_w(d, ch, fh)
                d.text((40 + col_w / 2 - cw / 2, y - hs * 0.15), ch, font=fh, fill="white",
                       stroke_width=7, stroke_fill="black")
            y += hs * 1.02
    if title:
        d.text((40 + col_w + 14, title_y - tsize * 0.12), title, font=ft, fill="white",
               stroke_width=9, stroke_fill="black")
    img.save(path)


def info_png(lines, fontp, path):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(fontp, 64)
    lh = 92
    h = lh * len(lines) + 80
    y0 = 1180 - h // 2
    d.rounded_rectangle((70, y0, W - 70, y0 + h), radius=36, fill=(0, 0, 0, 170))
    y = y0 + 40
    for ln in lines:
        draw_marked(d, (120, y), ln, f, stroke=0)
        y += lh
    img.save(path)


# ---------------------------------------------------------------- video

def is_hdr(st):
    return st.get("color_transfer") in ("arib-std-b67", "smpte2084")


def render_segment(src, t_in, seg, opts, out, draft):
    info = probe(src)
    vs = next(s for s in info["streams"] if s["codec_type"] == "video")
    has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
    speed = float(opts.get("speed", 1.0))
    src_len = float(info["format"]["duration"]) - t_in
    need = seg * speed
    w, h = (540, 960) if draft else (W, H)
    vf = []
    if is_hdr(vs):
        vf.append("zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
                  "tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p")
    vf.append(f"setpts=(PTS-STARTPTS)/{speed}")
    vf.append(f"fps={FPS}")
    if need > src_len:  # clip too short: hold last frame
        vf.append(f"tpad=stop_mode=clone:stop_duration={need - src_len + 0.2:.3f}")
    push = opts.get("push", True)
    zoom = float(opts.get("zoom", 1.0))
    if push:  # slow digital push-in, ~8% over the segment
        z = f"{zoom}*(1+0.08*t/{seg:.3f})"
        vf.append(f"scale=w='if(gt(a,{w}/{h}),-2,{w}*{z})':h='if(gt(a,{w}/{h}),{h}*{z},-2)':eval=frame")
    else:
        vf.append(f"scale=w='if(gt(a,{w}/{h}),-2,{w}*{zoom})':h='if(gt(a,{w}/{h}),{h}*{zoom},-2)'")
    fx, fy = opts.get("focus", [0.5, 0.5])
    vf.append(f"crop={w}:{h}:'(iw-{w})*{fx}':'(ih-{h})*{fy}'")
    vf.append("eq=saturation=1.15:contrast=1.05:gamma=0.98,unsharp=5:5:0.4")
    vf.append("setsar=1,format=yuv420p")
    cmd = ["ffmpeg", "-y", "-ss", f"{t_in:.3f}", "-i", src]
    asmr = float(opts.get("asmr", 0))
    if asmr and has_audio:
        af = f"atempo={max(0.5, speed)},volume={asmr},aresample=48000,apad"
        amap = ["-map", "0:a:0", "-af", af]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        amap = ["-map", "1:a"]
    cmd += ["-map", "0:v:0", "-vf", ",".join(vf)] + amap
    cmd += ["-t", f"{seg:.3f}", "-r", str(FPS), "-c:v", "libx264",
            "-preset", "ultrafast" if draft else "medium", "-crf", "18",
            "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "192k", out]
    run(cmd)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--out")
    ap.add_argument("--draft", action="store_true", help="half-res, fast preview")
    a = ap.parse_args()

    spec_dir = os.path.dirname(os.path.abspath(a.spec))
    spec = json.load(open(a.spec, encoding="utf-8"))
    out = a.out or os.path.join(spec_dir, "out")
    tmp = os.path.join(out, "_work")
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    rel = lambda p: p if os.path.isabs(p) else os.path.join(spec_dir, p)

    lang = spec.get("lang", "zh")
    fontp = font_path(lang)
    beats = spec["beats"]
    lines = [b.get("line", "") for b in beats]
    vo = spec.get("voice", {})

    # 1. narration per beat
    if any(b.get("line_audio") for b in beats):
        vo_files = [rel(b["line_audio"]) if b.get("line_audio") else None for b in beats]
    elif vo.get("file"):
        spoken = [i for i, ln in enumerate(lines) if ln]
        parts = split_voiceover(rel(vo["file"]), len(spoken), tmp, spec_dir)
        vo_files = [None] * len(beats)
        for i, p in zip(spoken, parts):
            vo_files[i] = p
    elif lang == "zh":
        vo_files = tts_lines(lines, vo.get("tts_voice", "zf_xiaoxiao"), vo.get("speed", 1.15), tmp)
    else:
        sys.exit("no offline Japanese TTS: record the narration and set voice.file or beats[].line_audio")

    # 2. timeline: each beat lasts as long as its line (+breath), clips share it
    gap = float(spec.get("gap", 0.12))
    t, timeline = 0.0, []
    for i, b in enumerate(beats):
        vlen = duration(vo_files[i]) if vo_files[i] else 0
        dur = max(float(b.get("dur", 0)), vlen + gap, float(b.get("min_dur", 0.8)))
        timeline.append((t, dur, vo_files[i]))
        t += dur
    total = t

    # 3. render segments
    seg_files = []
    for i, b in enumerate(beats):
        start, dur, _ = timeline[i]
        clips = b["clips"]
        ws = [float(c.get("w", 1)) for c in clips]
        acc = 0.0
        for j, c in enumerate(clips):
            seg = dur * ws[j] / sum(ws)
            # snap to frame grid so concat stays in sync
            f0, f1 = round((start + acc) * FPS), round((start + acc + seg) * FPS)
            acc += seg
            p = os.path.join(tmp, f"seg_{i:02d}_{j:02d}.mp4")
            render_segment(rel(c["file"]), float(c.get("in", 0)), (f1 - f0) / FPS, c, p, a.draft)
            seg_files.append(p)
    lst = os.path.join(tmp, "concat.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in seg_files)
    body = os.path.join(tmp, "body.mp4")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", body])

    # 4. overlays
    cover = spec.get("cover", {})
    cov_dur = float(cover.get("duration", 1.8))
    ov = []  # (png, t0, t1)
    cp = os.path.join(tmp, "cover.png")
    cover_png(cover, fontp, cp)
    ov.append((cp, 0, cov_dur))
    for i, b in enumerate(beats):
        start, dur, _ = timeline[i]
        if b.get("info"):
            p = os.path.join(tmp, f"info_{i:02d}.png")
            info_png(b["info"], fontp, p)
            ov.append((p, start, start + dur))
        cap = b.get("caption", b.get("line", ""))
        if cap and spec.get("captions", True) and not (i == 0 and cover.get("hide_first_caption", True)):
            p = os.path.join(tmp, f"cap_{i:02d}.png")
            caption_png(cap, fontp, p, size=int(spec.get("caption_size", 88)))
            ov.append((p, start, start + dur))

    # 5. audio + mux
    ins = ["-i", body]
    for p, _, _ in ov:
        ins += ["-loop", "1", "-t", f"{total:.3f}", "-i", p]
    vchain, last = [], "0:v"
    vw = 540 if a.draft else W
    for k, (p, t0, t1) in enumerate(ov):
        src = f"{k + 1}:v"
        if a.draft:
            vchain.append(f"[{src}]scale={vw}:-1[s{k}]")
            src = f"s{k}"
        vchain.append(f"[{last}][{src}]overlay=0:0:enable='between(t,{t0:.3f},{t1 - 0.001:.3f})'[v{k}]")
        last = f"v{k}"
    n_in = len(ov) + 1
    achain, amix = [], ["[0:a]"]
    for i, (start, _, vf_) in enumerate(timeline):
        if vf_:
            ins += ["-i", vf_]
            ms = int(start * 1000)
            achain.append(f"[{n_in}:a]aresample=48000,aformat=channel_layouts=stereo,"
                          f"adelay={ms}|{ms},volume=1.6[vo{i}]")
            amix.append(f"[vo{i}]")
            n_in += 1
    achain.append(f"{''.join(amix)}amix=inputs={len(amix)}:normalize=0,"
                  f"atrim=0:{total:.3f}[voice]")

    def mux(path, bgm):
        chain = list(achain)
        extra = []
        if bgm:
            extra = ["-stream_loop", "-1", "-i", rel(bgm["file"])]
            vol = float(bgm.get("volume", 0.22))
            chain[-1] = chain[-1].replace("[voice]", "[vmix]")
            chain += ["[vmix]asplit[voice0][sc]",
                      f"[{n_in}:a]aresample=48000,aformat=channel_layouts=stereo,volume={vol},"
                      f"atrim=0:{total:.3f},afade=t=out:st={max(0, total - 1.2):.3f}:d=1.2[bg]",
                      "[bg][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=300[bgd]",
                      "[voice0][bgd]amix=inputs=2:normalize=0[voice]"]
        chain.append("[voice]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]")
        fc = ";".join(vchain + chain)
        run(["ffmpeg", "-y"] + ins + extra + ["-filter_complex", fc, "-map", f"[{last}]",
             "-map", "[aout]", "-t", f"{total:.3f}", "-c:v", "libx264",
             "-preset", "ultrafast" if a.draft else "slow", "-crf", "18", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", path])

    final = os.path.join(out, "reel.mp4")
    mux(os.path.join(out, "reel_nobgm.mp4"), None)
    if spec.get("bgm", {}).get("file"):
        mux(final, spec["bgm"])
    else:
        shutil.copy(os.path.join(out, "reel_nobgm.mp4"), final)
    run(["ffmpeg", "-y", "-ss", f"{min(0.5, cov_dur / 2):.2f}", "-i", final,
         "-frames:v", "1", "-q:v", "2", os.path.join(out, "cover.jpg")])

    with open(os.path.join(out, "timeline.txt"), "w", encoding="utf-8") as f:
        for i, (start, dur, _) in enumerate(timeline):
            f.write(f"{start:6.2f}s  {dur:4.2f}s  {len(beats[i]['clips'])} clip(s)  "
                    f"{strip_marks(beats[i].get('line', ''))}\n")
        f.write(f"total {total:.2f}s\n")
    if not a.draft:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"done: {final}  ({total:.1f}s)")


if __name__ == "__main__":
    main()
