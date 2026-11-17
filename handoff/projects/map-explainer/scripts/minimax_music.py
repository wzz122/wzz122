#!/usr/bin/env python3
"""调用 MiniMax 音乐生成接口（POST /v1/music_generation）生成纯音乐 BGM。仅用 Python 标准库。

!! 可用性说明（官方公告）!!
  2026-08-20 起，音乐付费 API 不再向新用户开放，free 版下线；只有老付费用户还能调用。
  其他用户请改用：
    1. MiniMax Audio 网页版 https://www.minimax.io/audio 手动生成，下载后放进 <episode>/audio/bgm/；
    2. 自托管开源 MiniMax Music 3（需要 NVIDIA GPU，这台 Mac 跑不了）。
  mix.sh 只认 audio/bgm/ 里的文件，不关心文件是怎么生成的。

用法：
  python3 scripts/minimax_music.py --episode episodes/ep01 --dry-run
  python3 scripts/minimax_music.py --episode episodes/ep01 --name main \\
      --prompt "calm lo-fi city documentary, warm piano, soft vinyl texture, 80 bpm, no vocals, loopable"

环境变量（或 .env）：MINIMAX_API_KEY、MINIMAX_REGION（global|cn）、MINIMAX_GROUP_ID（可选）、
                    MINIMAX_MUSIC_MODEL（默认 music-3.0）

发布时在简介和片尾标注「配乐为 AI 合成（MiniMax）」。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import minimax_common as mm  # noqa: E402

DEFAULT_MODEL = "music-3.0"
DEFAULT_PROMPT = "calm lo-fi city documentary, warm piano, soft vinyl texture, 80 bpm, no vocals, loopable"

NOTICE = """\
可用性：官方公告 2026-08-20 起音乐付费 API 不再向新用户开放、free 版下线，只有老付费用户可用。
否则请在 MiniMax Audio 网页版 (https://www.minimax.io/audio) 手动生成后把文件放进 audio/bgm/，
或自托管开源 MiniMax Music 3（需 NVIDIA GPU）。"""


def main() -> None:
    ap = argparse.ArgumentParser(
        description="MiniMax 音乐生成：纯音乐 BGM → audio/bgm/。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=NOTICE,
    )
    ap.add_argument("--episode", type=Path, help="一期的目录，输出到 <episode>/audio/bgm/")
    ap.add_argument("--out-dir", type=Path, help="直接指定输出目录（优先于 --episode）")
    ap.add_argument("--name", default="bgm", help="文件名（不含扩展名），默认 bgm")
    ap.add_argument("--prompt", default=DEFAULT_PROMPT, help="风格描述（英文效果更稳定）")
    ap.add_argument("--model", help=f"默认取 MINIMAX_MUSIC_MODEL，否则 {DEFAULT_MODEL}")
    ap.add_argument("--sample-rate", type=int, default=44100)
    ap.add_argument("--bitrate", type=int, default=256000)
    ap.add_argument("--format", default="mp3", choices=["mp3", "wav"])
    ap.add_argument("--force", action="store_true", help="覆盖已有文件")
    ap.add_argument("--dry-run", action="store_true", help="不发请求，只打印将要发送的内容")
    args = ap.parse_args()

    mm.load_dotenv()
    out_dir = args.out_dir or ((args.episode / "audio" / "bgm") if args.episode else Path("audio/bgm"))
    out_file = out_dir / f"{args.name}.{args.format}"
    model = args.model or mm.env("MINIMAX_MUSIC_MODEL", DEFAULT_MODEL)

    body = {
        "model": model,
        "prompt": args.prompt,
        "is_instrumental": True,
        "output_format": "hex",
        "audio_setting": {
            "sample_rate": args.sample_rate,
            "bitrate": args.bitrate,
            "format": args.format,
        },
    }

    if args.dry_run:
        print(NOTICE + "\n")
        print(f"接口：POST {mm.base_url()}/v1/music_generation")
        print(f"MINIMAX_API_KEY：{mm.key_status()}")
        print(f"输出：{out_file}")
        print("请求体：")
        print(json.dumps(body, ensure_ascii=False, indent=2))
        print("（dry-run：未发送任何请求）")
        return

    if out_file.exists() and not args.force:
        sys.exit(f"{out_file} 已存在，用 --force 覆盖。")
    mm.require_key()
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"生成中（{model}）… 可能需要一两分钟")
    try:
        resp = mm.post_json("/v1/music_generation", body, timeout=600)
    except mm.MiniMaxError as e:
        sys.exit(f"MiniMax 请求失败：{e}\n\n{NOTICE}")

    data = resp.get("data") or {}
    audio = data.get("audio")
    if not audio:
        sys.exit(f"响应中没有 data.audio（trace_id={resp.get('trace_id')}）")
    if audio.startswith("http"):
        mm.download(audio, out_file)  # 若服务端返回的是 URL
    else:
        out_file.write_bytes(bytes.fromhex(audio))

    meta = {
        "file": out_file.name,
        "model": model,
        "prompt": args.prompt,
        "trace_id": resp.get("trace_id"),
        "extra_info": resp.get("extra_info"),
        "ai_generated": True,
        "credit": "配乐：MiniMax AI 合成",
    }
    out_file.with_suffix(".json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"完成 → {out_file}")
    print("记得在 credits.md 的「音乐」一栏登记，并标注 AI 合成。")


if __name__ == "__main__":
    main()
