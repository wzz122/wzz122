#!/usr/bin/env bash
# Idempotent: fetch fonts (Noto Sans JP/SC Black) and the offline zh TTS model.
set -euo pipefail
A="${FOOD_REEL_ASSETS:-$(cd "$(dirname "$0")/.." && pwd)/assets}"
mkdir -p "$A/fonts"
python3 -m pip install -q sherpa-onnx fonttools numpy pillow 2>/dev/null || true
cd "$A/fonts"
for pair in "notosansjp/NotoSansJP%5Bwght%5D.ttf:NotoSansJP-Black.ttf" \
            "notosanssc/NotoSansSC%5Bwght%5D.ttf:NotoSansSC-Black.ttf"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  [ -f "$dst" ] && continue
  curl -sSL -o var.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/$src"
  python3 -c "from fontTools.ttLib import TTFont; from fontTools.varLib import instancer; \
instancer.instantiateVariableFont(TTFont('var.ttf'),{'wght':900}).save('$dst')"
  rm -f var.ttf
done
cd "$A"
if [ ! -f kokoro-multi-lang-v1_0/model.onnx ]; then
  curl -sSL https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2 | tar xj
fi
echo "food-reel assets ready in $A"
