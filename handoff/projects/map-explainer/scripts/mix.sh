#!/usr/bin/env bash
# mix.sh — 画面 + 配音 + BGM（自动闪避）+ 音效 → 成片
#
#   配音：按 audio/vo/timeline.json 的 start 定位每段（没有 timeline 时按文件名顺序首尾相接）
#   BGM ：循环 / 裁剪到视频长度，淡入淡出，以配音为侧链 sidechaincompress 自动压低
#   音效：可选 audio/sfx/cues.csv（每行：时间秒,文件,增益dB）
#   总线：loudnorm 到 -16 LUFS / -1.5 dBTP，AAC 192k，视频流直接复制
#
# 用法：
#   scripts/mix.sh episodes/ep01
#   scripts/mix.sh episodes/ep01 --bgm path/to/music.mp3 --bgm-db -22 --out episodes/ep01/renders/final_v2.mp4
#   scripts/mix.sh --video a.mp4 --vo-dir vo/ --bgm bgm.mp3 --out out.mp4
#
# 兼容 macOS 自带 bash 3.2。需要 ffmpeg ≥ 4.4（amix normalize 参数）、ffprobe、python3（读 JSON/CSV）。
set -eo pipefail

usage() {
  cat <<'EOF'
用法: mix.sh [EPISODE_DIR] [选项]

路径（默认相对 EPISODE_DIR，EPISODE_DIR 默认为当前目录）：
  --video FILE        画面，默认 renders/video.mp4，其次 video.mp4
  --vo-dir DIR        配音目录，默认 audio/vo
  --timeline FILE     配音时间线，默认 <vo-dir>/timeline.json
  --bgm FILE          配乐，默认 audio/bgm/ 下按文件名排序的第一个音频；--no-bgm 关闭
  --sfx-cues FILE     音效表，默认 audio/sfx/cues.csv（存在才用）
  --out FILE          输出，默认 renders/final.mp4

电平：
  --vo-db N           配音增益 dB（默认 0）
  --bgm-db N          BGM 基础电平 dB（默认 -18）
  --duck-threshold N  闪避阈值（线性，默认 0.02）
  --duck-ratio N      闪避压缩比（默认 8）
  --duck-attack MS    （默认 20）
  --duck-release MS   （默认 600）
  --fade-in S / --fade-out S   BGM 淡入淡出（默认 1.5 / 3）
  --lufs N            目标响度（默认 -16）
  --tp N              真峰值上限 dBTP（默认 -1.5）

其他：
  --check             混完后测量成片响度
  --dry-run           只打印 ffmpeg 命令
  -h, --help
EOF
}

EP_DIR=""; VIDEO=""; VO_DIR=""; TIMELINE=""; BGM=""; NO_BGM=0; SFX_CUES=""; OUT=""
VO_DB=0; BGM_DB=-18; DUCK_THRESHOLD=0.02; DUCK_RATIO=8; DUCK_ATTACK=20; DUCK_RELEASE=600
FADE_IN=1.5; FADE_OUT=3; LUFS=-16; TP=-1.5; LRA=11; ABITRATE=192k; CHECK=0; DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --video) VIDEO="$2"; shift 2 ;;
    --vo-dir) VO_DIR="$2"; shift 2 ;;
    --timeline) TIMELINE="$2"; shift 2 ;;
    --bgm) BGM="$2"; shift 2 ;;
    --no-bgm) NO_BGM=1; shift ;;
    --sfx-cues) SFX_CUES="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --vo-db) VO_DB="$2"; shift 2 ;;
    --bgm-db) BGM_DB="$2"; shift 2 ;;
    --duck-threshold) DUCK_THRESHOLD="$2"; shift 2 ;;
    --duck-ratio) DUCK_RATIO="$2"; shift 2 ;;
    --duck-attack) DUCK_ATTACK="$2"; shift 2 ;;
    --duck-release) DUCK_RELEASE="$2"; shift 2 ;;
    --fade-in) FADE_IN="$2"; shift 2 ;;
    --fade-out) FADE_OUT="$2"; shift 2 ;;
    --lufs) LUFS="$2"; shift 2 ;;
    --tp) TP="$2"; shift 2 ;;
    --check) CHECK=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "未知参数: $1" >&2; usage >&2; exit 2 ;;
    *) EP_DIR="$1"; shift ;;
  esac
done

for cmd in ffmpeg ffprobe python3; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "缺少 $cmd" >&2; exit 1; }
done

EP_DIR="${EP_DIR:-.}"
if [ -z "$VIDEO" ]; then
  if [ -f "$EP_DIR/renders/video.mp4" ]; then VIDEO="$EP_DIR/renders/video.mp4"; else VIDEO="$EP_DIR/video.mp4"; fi
fi
VO_DIR="${VO_DIR:-$EP_DIR/audio/vo}"
TIMELINE="${TIMELINE:-$VO_DIR/timeline.json}"
OUT="${OUT:-$EP_DIR/renders/final.mp4}"
if [ -z "$SFX_CUES" ] && [ -f "$EP_DIR/audio/sfx/cues.csv" ]; then SFX_CUES="$EP_DIR/audio/sfx/cues.csv"; fi
if [ "$NO_BGM" = 0 ] && [ -z "$BGM" ] && [ -d "$EP_DIR/audio/bgm" ]; then
  BGM="$(find "$EP_DIR/audio/bgm" -maxdepth 1 -type f \( -iname '*.mp3' -o -iname '*.wav' -o -iname '*.m4a' -o -iname '*.flac' -o -iname '*.aac' \) | sort | head -n 1)"
fi
[ "$NO_BGM" = 1 ] && BGM=""

[ -f "$VIDEO" ] || { echo "找不到画面文件: $VIDEO" >&2; exit 1; }
[ -n "$BGM" ] && [ ! -f "$BGM" ] && { echo "找不到 BGM: $BGM" >&2; exit 1; }

DUR="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$VIDEO")"
[ -n "$DUR" ] || { echo "无法读取视频时长" >&2; exit 1; }

# ---- 配音清单：输出 "毫秒<TAB>路径" ----
vo_list() {
  python3 - "$TIMELINE" "$VO_DIR" <<'PY'
import json, os, subprocess, sys
timeline, vo_dir = sys.argv[1], sys.argv[2]
if os.path.isfile(timeline):
    base = os.path.dirname(timeline)
    for s in json.load(open(timeline, encoding="utf-8"))["segments"]:
        p = os.path.join(base, s["file"])
        if not os.path.isfile(p):
            sys.exit(f"timeline 中的文件不存在: {p}")
        print(f"{round(s['start'] * 1000)}\t{p}")
elif os.path.isdir(vo_dir):
    print(f"! 没有 {timeline}，按文件名顺序首尾相接", file=sys.stderr)
    t = 0.0
    for name in sorted(os.listdir(vo_dir)):
        if not name.lower().endswith((".mp3", ".wav", ".m4a")):
            continue
        p = os.path.join(vo_dir, name)
        d = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                           "-of", "default=nw=1:nk=1", p]).strip())
        print(f"{round(t * 1000)}\t{p}")
        t += d
PY
}

# ---- 音效清单：输出 "毫秒<TAB>路径<TAB>增益dB" ----
sfx_list() {
  python3 - "$SFX_CUES" <<'PY'
import csv, os, sys
path = sys.argv[1]
base = os.path.dirname(path)
with open(path, encoding="utf-8") as f:
    for row in csv.reader(f):
        if not row or row[0].strip().startswith("#") or row[0].strip() in ("time", "时间"):
            continue
        t, name = float(row[0]), row[1].strip()
        gain = float(row[2]) if len(row) > 2 and row[2].strip() else 0.0
        p = name if os.path.isabs(name) else os.path.join(base, name)
        if not os.path.isfile(p):
            sys.exit(f"音效文件不存在: {p}")
        print(f"{round(t * 1000)}\t{p}\t{gain}")
PY
}

FMT="aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo"
ARGS=(-hide_banner -y -i "$VIDEO")
FILTERS=()
IDX=1

# 配音
VO_LABELS=""; NVO=0
VO_TMP="$(vo_list)" || exit 1
if [ -n "$VO_TMP" ]; then
  while IFS=$'\t' read -r ms path; do
    ARGS+=(-i "$path")
    FILTERS+=("[$IDX:a]$FMT,adelay=${ms}|${ms}[vo$IDX]")
    VO_LABELS="$VO_LABELS[vo$IDX]"
    IDX=$((IDX + 1)); NVO=$((NVO + 1))
  done <<EOF
$VO_TMP
EOF
fi

MIX_LABELS=""
if [ "$NVO" -gt 0 ]; then
  if [ "$NVO" -eq 1 ]; then VO_SUM="${VO_LABELS}anull"; else VO_SUM="${VO_LABELS}amix=inputs=$NVO:normalize=0:dropout_transition=0"; fi
  FILTERS+=("$VO_SUM,apad,atrim=0:$DUR,volume=${VO_DB}dB,asplit=2[vo][vosc]")
  MIX_LABELS="[vo]"
fi

# BGM
if [ -n "$BGM" ]; then
  ARGS+=(-stream_loop -1 -i "$BGM")
  FADE_OUT_ST="$(awk -v d="$DUR" -v f="$FADE_OUT" 'BEGIN { s = d - f; if (s < 0) s = 0; print s }')"
  FILTERS+=("[$IDX:a]$FMT,atrim=0:$DUR,asetpts=PTS-STARTPTS,volume=${BGM_DB}dB,afade=t=in:st=0:d=$FADE_IN,afade=t=out:st=$FADE_OUT_ST:d=$FADE_OUT[bgmraw]")
  if [ "$NVO" -gt 0 ]; then
    FILTERS+=("[bgmraw][vosc]sidechaincompress=threshold=$DUCK_THRESHOLD:ratio=$DUCK_RATIO:attack=$DUCK_ATTACK:release=$DUCK_RELEASE:makeup=1[bgm]")
  else
    FILTERS+=("[bgmraw]anull[bgm]")
  fi
  MIX_LABELS="$MIX_LABELS[bgm]"
  IDX=$((IDX + 1))
elif [ "$NVO" -gt 0 ]; then
  FILTERS+=("[vosc]anullsink")
fi

# 音效
if [ -n "$SFX_CUES" ]; then
  SFX_TMP="$(sfx_list)" || exit 1
  SFX_LABELS=""; NSFX=0
  if [ -n "$SFX_TMP" ]; then
    while IFS=$'\t' read -r ms path gain; do
      ARGS+=(-i "$path")
      FILTERS+=("[$IDX:a]$FMT,volume=${gain}dB,adelay=${ms}|${ms}[sfx$IDX]")
      SFX_LABELS="$SFX_LABELS[sfx$IDX]"
      IDX=$((IDX + 1)); NSFX=$((NSFX + 1))
    done <<EOF
$SFX_TMP
EOF
  fi
  if [ "$NSFX" -gt 0 ]; then
    if [ "$NSFX" -eq 1 ]; then FILTERS+=("${SFX_LABELS}anull[sfx]"); else FILTERS+=("${SFX_LABELS}amix=inputs=$NSFX:normalize=0:dropout_transition=0[sfx]"); fi
    MIX_LABELS="$MIX_LABELS[sfx]"
  fi
fi

NMIX="$(printf '%s' "$MIX_LABELS" | grep -o '\[' | wc -l | tr -d ' ')"
[ "$NMIX" -gt 0 ] || { echo "没有任何音频（配音 / BGM / 音效都为空）" >&2; exit 1; }
if [ "$NMIX" -eq 1 ]; then BUS="${MIX_LABELS}anull"; else BUS="${MIX_LABELS}amix=inputs=$NMIX:normalize=0:dropout_transition=0"; fi
FILTERS+=("$BUS,apad,atrim=0:$DUR,loudnorm=I=$LUFS:TP=$TP:LRA=$LRA,aresample=48000[aout]")

FILTER_COMPLEX="$(IFS=';'; echo "${FILTERS[*]}")"
mkdir -p "$(dirname "$OUT")"

CMD=(ffmpeg "${ARGS[@]}" -filter_complex "$FILTER_COMPLEX" -map 0:v -map "[aout]"
     -c:v copy -c:a aac -b:a "$ABITRATE" -ar 48000 -t "$DUR" -movflags +faststart "$OUT")

echo "画面   $VIDEO（${DUR}s）"
echo "配音   $NVO 段  ${TIMELINE}"
echo "BGM    ${BGM:-（无）}"
echo "音效   ${SFX_CUES:-（无）}"
echo "输出   $OUT"

if [ "$DRY" = 1 ]; then
  printf '%q ' "${CMD[@]}"; echo
  exit 0
fi

"${CMD[@]}"

if [ "$CHECK" = 1 ]; then
  echo "---- 成片响度 ----"
  ffmpeg -hide_banner -nostats -i "$OUT" -af "loudnorm=I=$LUFS:TP=$TP:LRA=$LRA:print_format=summary" -f null - 2>&1 \
    | grep -E 'Input Integrated|Input True Peak|Input LRA' || true
fi
echo "完成 → $OUT"
