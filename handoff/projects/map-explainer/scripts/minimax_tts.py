#!/usr/bin/env python3
"""按 script.md 的 ## 段落分段调用 MiniMax T2A v2 生成旁白，并写出 timeline.json。

仅用 Python 标准库。

用法：
  python3 scripts/minimax_tts.py episodes/ep01/script.md --dry-run   # 只看分段、字数、估价，不发请求
  python3 scripts/minimax_tts.py episodes/ep01/script.md             # 正式生成（花钱，先确认）
  python3 scripts/minimax_tts.py episodes/ep01/script.md --only S03,S05 --force
  python3 scripts/minimax_tts.py episodes/ep01/script.md --timeline-only --gap 0.8

script.md 约定：
  ## S01 钩子问题           段落标题，编号 S + 数字，决定文件名 S01.mp3
  <!-- tts: speed=1.05 emotion=calm gap=1.0 vol=1 pitch=0 voice=xxx -->   可选，本段参数
  > 画面：……                画面提示（引用块），不进配音
  ### 小标题 / | 表格 |       不进配音
  普通段落                   = 旁白，可用 <#0.5#> 插入 0.5 秒停顿（MiniMax 原生停顿标记）

环境变量（或 .env）：
  MINIMAX_API_KEY   必填（--dry-run 除外）
  MINIMAX_REGION    global → https://api.minimax.io（默认），cn → https://api.minimaxi.com
  MINIMAX_GROUP_ID  可选
  MINIMAX_VOICE_ID  音色 ID
  MINIMAX_TTS_MODEL 默认 speech-2.8-hd

音色规则：
  只允许 MiniMax 系统音色，或用户本人声音的克隆。不得克隆他人声音。
  克隆音色的 voice_id 连续 7 天不使用会被删除；首次使用克隆音色收费 $1.5。
  发布时在简介和片尾标注「旁白为 AI 合成（MiniMax）」。

输出（默认在 script.md 同级的 audio/vo/）：
  S01.mp3        配音
  S01.json       元数据：时长、trace_id、文本哈希（文本不变则跳过，避免重复扣费）
  timeline.json  每段 start / duration / end（秒）与 start_frame，供 HyperFrames 时间线对齐
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import minimax_common as mm  # noqa: E402

DEFAULT_MODEL = "speech-2.8-hd"
PRICE_PER_MILLION_CHARS = 100.0  # 美元，估算用；以控制台账单为准
CHARS_PER_SEC = 4.2              # 中文旁白语速估计，用于 dry-run 预估时长
MAX_CHARS_WARN = 9000            # 单次请求文本过长时提醒拆段（上限以官方文档为准）

SECTION_RE = re.compile(r"^##\s+(S\d+)\b\s*(.*)$")
DIRECTIVE_RE = re.compile(r"<!--\s*tts:(.*?)-->", re.S)
COMMENT_RE = re.compile(r"<!--.*?-->", re.S)
PAUSE_RE = re.compile(r"<#(\d+(?:\.\d+)?)#>")
SKIP_PREFIXES = (">", "#", "|", "```", "---", "- [", "* [")
FLOAT_PARAMS = {"speed", "vol", "pitch", "gap"}


# ---------------- 解析 ----------------

def parse_script(path: Path) -> list[dict]:
    sections: list[dict] = []
    cur = None
    for line in path.read_text(encoding="utf-8").splitlines():
        m = SECTION_RE.match(line.strip())
        if m:
            cur = {"id": m.group(1), "title": m.group(2).strip(), "raw": []}
            sections.append(cur)
        elif cur is not None:
            cur["raw"].append(line)

    ids = [s["id"] for s in sections]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        sys.exit(f"段落编号重复：{', '.join(sorted(dup))}")

    for s in sections:
        raw = "\n".join(s.pop("raw"))
        s["params"] = parse_directives(raw)
        s["text"] = extract_narration(COMMENT_RE.sub("", raw))
    return sections


def parse_directives(raw: str) -> dict:
    params: dict = {}
    for block in DIRECTIVE_RE.findall(raw):
        for pair in block.split():
            if "=" not in pair:
                continue
            k, v = pair.split("=", 1)
            params[k.strip()] = float(v) if k.strip() in FLOAT_PARAMS else v.strip()
    return params


def extract_narration(body: str) -> str:
    paragraphs, buf = [], []
    for line in body.splitlines():
        s = line.strip()
        if not s:
            if buf:
                paragraphs.append("".join(buf))
                buf = []
            continue
        if s.startswith(SKIP_PREFIXES):
            continue
        s = re.sub(r"\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`", lambda m: next(g for g in m.groups() if g), s)
        buf.append(s)
    if buf:
        paragraphs.append("".join(buf))
    return "\n".join(paragraphs)


def count_chars(text: str) -> int:
    return len(re.sub(r"\s", "", PAUSE_RE.sub("", text)))


def pause_seconds(text: str) -> float:
    return sum(float(x) for x in PAUSE_RE.findall(text))


def text_hash(text: str, settings: dict) -> str:
    h = hashlib.sha256()
    h.update(text.encode("utf-8"))
    h.update(json.dumps(settings, sort_keys=True).encode("utf-8"))
    return h.hexdigest()[:16]


# ---------------- 请求 ----------------

def build_body(section: dict, args, model: str, voice_id: str) -> dict:
    p = section["params"]
    voice = {
        "voice_id": p.get("voice", voice_id),
        "speed": p.get("speed", args.speed),
        "vol": p.get("vol", args.vol),
        "pitch": int(p.get("pitch", args.pitch)),
    }
    emotion = p.get("emotion", args.emotion)
    if emotion:
        voice["emotion"] = emotion
    body = {
        "model": model,
        "text": section["text"],
        "stream": False,
        "language_boost": args.language_boost,
        "output_format": "hex",
        "voice_setting": voice,
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": "mp3",
            "channel": 1,
        },
    }
    if args.subtitles:
        body["subtitle_enable"] = True
    return body


def synthesize(section: dict, body: dict, out_dir: Path, force: bool) -> dict:
    sid = section["id"]
    mp3, meta_path = out_dir / f"{sid}.mp3", out_dir / f"{sid}.json"
    settings = {k: v for k, v in body.items() if k != "text"}
    digest = text_hash(section["text"], settings)

    if not force and mp3.is_file() and meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if meta.get("hash") == digest:
            print(f"  {sid}  未改动，跳过（{meta['audio_length_ms'] / 1000:.2f}s）")
            return meta

    print(f"  {sid}  合成中 … {count_chars(section['text'])} 字")
    resp = mm.post_json("/v1/t2a_v2", body)
    data = resp.get("data") or {}
    audio_hex = data.get("audio")
    if not audio_hex:
        raise mm.MiniMaxError(f"{sid}: 响应中没有 data.audio（trace_id={resp.get('trace_id')}）")
    mp3.write_bytes(bytes.fromhex(audio_hex))

    extra = resp.get("extra_info") or {}
    length_ms = extra.get("audio_length")
    if length_ms is None:
        raise mm.MiniMaxError(f"{sid}: 响应中没有 extra_info.audio_length")

    sub_url = data.get("subtitle_file")
    if sub_url:
        try:
            mm.download(sub_url, out_dir / f"{sid}.subtitle.json")
        except Exception as e:  # 字幕失败不影响配音
            print(f"  ! {sid} 字幕下载失败：{e}", file=sys.stderr)

    meta = {
        "id": sid,
        "title": section["title"],
        "hash": digest,
        "chars": count_chars(section["text"]),
        "audio_length_ms": int(length_ms),
        "trace_id": resp.get("trace_id"),
        "model": body["model"],
        "voice_setting": body["voice_setting"],
        "extra_info": extra,
        "ai_generated": True,
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  {sid}  完成 {length_ms / 1000:.2f}s → {mp3.name}")
    return meta


# ---------------- 时间线 ----------------

def write_timeline(sections: list[dict], out_dir: Path, args) -> bool:
    segs, missing = [], []
    t = args.lead_in
    for i, s in enumerate(sections):
        meta_path = out_dir / f"{s['id']}.json"
        if not meta_path.is_file() or not (out_dir / f"{s['id']}.mp3").is_file():
            missing.append(s["id"])
            continue
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        dur = meta["audio_length_ms"] / 1000.0
        gap = s["params"].get("gap", args.gap) if i < len(sections) - 1 else 0.0
        segs.append({
            "id": s["id"],
            "title": s["title"],
            "file": f"{s['id']}.mp3",
            "start": round(t, 3),
            "duration": round(dur, 3),
            "end": round(t + dur, 3),
            "gap_after": round(gap, 3),
            "start_frame": round(t * args.fps),
            "end_frame": round((t + dur) * args.fps),
            "chars": meta.get("chars"),
        })
        t += dur + gap

    if missing:
        print(f"\n! 缺少 {', '.join(missing)} 的配音，timeline.json 未写出（后续段的起点会错）。", file=sys.stderr)
        return False

    total = segs[-1]["end"] + args.tail if segs else 0.0
    timeline = {
        "fps": args.fps,
        "lead_in": args.lead_in,
        "gap_default": args.gap,
        "tail": args.tail,
        "total": round(total, 3),
        "total_frames": round(total * args.fps),
        "segments": segs,
    }
    path = out_dir / "timeline.json"
    path.write_text(json.dumps(timeline, ensure_ascii=False, indent=2), encoding="utf-8")
    m, s = divmod(total, 60)
    print(f"\ntimeline.json → {path}（{len(segs)} 段，总长 {int(m)}:{s:05.2f}）")
    return True


# ---------------- dry-run ----------------

def dry_run(sections: list[dict], args, model: str, voice_id: str | None) -> None:
    print(f"接口：POST {mm.base_url()}/v1/t2a_v2   模型：{model}   音色：{voice_id or '（未设置）'}")
    print(f"MINIMAX_API_KEY：{mm.key_status()}   GroupId：{'已设置' if mm.env('MINIMAX_GROUP_ID') else '未设置'}\n")
    print(f"{'段落':<6}{'字数':>6}{'停顿s':>8}{'预计s':>8}{'估价$':>10}  标题")
    tot_chars = tot_secs = 0.0
    for i, s in enumerate(sections):
        n = count_chars(s["text"])
        speed = s["params"].get("speed", args.speed)
        secs = n / CHARS_PER_SEC / speed + pause_seconds(s["text"])
        cost = n / 1_000_000 * PRICE_PER_MILLION_CHARS
        gap = s["params"].get("gap", args.gap) if i < len(sections) - 1 else 0.0
        tot_chars += n
        tot_secs += secs + gap
        flag = "  ⚠ 空段" if n == 0 else ("  ⚠ 过长，建议拆段" if n > MAX_CHARS_WARN else "")
        print(f"{s['id']:<6}{n:>6}{pause_seconds(s['text']):>8.1f}{secs:>8.1f}{cost:>10.4f}  {s['title']}{flag}")
        if args.verbose:
            print("      " + s["text"].replace("\n", "\n      ") + "\n")
    tot_secs += args.lead_in + args.tail
    m, sec = divmod(tot_secs, 60)
    print(f"\n合计 {len(sections)} 段，{int(tot_chars)} 字，预计 {int(m)}:{sec:04.1f}，"
          f"估价 ${tot_chars / 1_000_000 * PRICE_PER_MILLION_CHARS:.4f}（按 ${PRICE_PER_MILLION_CHARS:.0f}/百万字符）")
    if not 600 <= tot_secs <= 780:
        print("提示：成片目标 10–13 分钟，当前旁白预计时长不在范围内。")
    print("（dry-run：未发送任何请求）")


# ---------------- main ----------------

def main() -> None:
    ap = argparse.ArgumentParser(
        description="按 script.md 的 ## S01 段落调用 MiniMax T2A v2 生成配音，并写出 timeline.json。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="只允许 MiniMax 系统音色或用户本人声音克隆；克隆 voice_id 7 天不用会被删除，首次使用收费 $1.5。发布时标注 AI 合成。",
    )
    ap.add_argument("script", type=Path, help="script.md 路径")
    ap.add_argument("--out", type=Path, help="输出目录（默认 <script 所在目录>/audio/vo）")
    ap.add_argument("--dry-run", action="store_true", help="不发请求，只打印分段、字数和估价")
    ap.add_argument("--only", help="只合成这些段，逗号分隔，如 S03,S05")
    ap.add_argument("--force", action="store_true", help="文本未变也重新合成")
    ap.add_argument("--timeline-only", action="store_true", help="不合成，只按已有 Sxx.json 重建 timeline.json")
    ap.add_argument("--model", help=f"默认取 MINIMAX_TTS_MODEL，否则 {DEFAULT_MODEL}")
    ap.add_argument("--voice", help="覆盖 MINIMAX_VOICE_ID")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--vol", type=float, default=1.0)
    ap.add_argument("--pitch", type=int, default=0)
    ap.add_argument("--emotion", help="可选，如 calm / happy / sad（以官方文档支持的值为准）")
    ap.add_argument("--language-boost", default="Chinese", help="默认 Chinese；混合语言可用 auto")
    ap.add_argument("--subtitles", action="store_true", help="subtitle_enable=true，并下载字幕时间戳文件")
    ap.add_argument("--gap", type=float, default=0.6, help="段间间隔秒数（可被段内 gap= 覆盖）")
    ap.add_argument("--lead-in", type=float, default=0.0, help="第一段之前的留白秒数")
    ap.add_argument("--tail", type=float, default=0.0, help="最后一段之后的留白秒数（计入 total）")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("-v", "--verbose", action="store_true", help="dry-run 时打印每段正文")
    args = ap.parse_args()

    mm.load_dotenv()
    if not args.script.is_file():
        sys.exit(f"找不到 {args.script}")
    sections = parse_script(args.script)
    if not sections:
        sys.exit("script.md 里没有 `## S01 标题` 形式的段落。")

    model = args.model or mm.env("MINIMAX_TTS_MODEL", DEFAULT_MODEL)
    voice_id = args.voice or mm.env("MINIMAX_VOICE_ID")
    out_dir = args.out or args.script.resolve().parent / "audio" / "vo"

    if args.dry_run:
        dry_run(sections, args, model, voice_id)
        return

    out_dir.mkdir(parents=True, exist_ok=True)
    if not args.timeline_only:
        mm.require_key()
        if not voice_id:
            sys.exit("缺少 MINIMAX_VOICE_ID（或 --voice）。")
        only = {x.strip() for x in args.only.split(",")} if args.only else None
        if only and (unknown := only - {s["id"] for s in sections}):
            sys.exit(f"--only 中的段落不存在：{', '.join(sorted(unknown))}")
        print(f"合成到 {out_dir}（模型 {model}）")
        for s in sections:
            if only and s["id"] not in only:
                continue
            if count_chars(s["text"]) == 0:
                print(f"  {s['id']}  空段，跳过")
                continue
            synthesize(s, build_body(s, args, model, voice_id), out_dir, args.force)

    # 空段不参与时间线
    ok = write_timeline([s for s in sections if count_chars(s["text"]) > 0], out_dir, args)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    try:
        main()
    except mm.MiniMaxError as e:
        sys.exit(f"MiniMax 请求失败：{e}")
