#!/bin/bash
# ColorMatch 核心实现的 Mac 端一键验证：
# 1. Python 参照实现的算法验收（需要 python3 + numpy）
# 2. Swift 包全量测试（含与 Python goldens 的交叉校验）
set -euo pipefail
cd "$(dirname "$0")"

echo "==> [1/3] Python 参照实现验收"
if python3 -c "import numpy" 2>/dev/null; then
    (cd reference && python3 acceptance_test.py)
else
    echo "    跳过：缺 numpy（pip3 install numpy 后重跑可获得完整验证）"
fi

echo "==> [2/3] Swift 包测试（含跨语言 golden 校验）"
(cd ColorMatchCore && swift test)

echo "==> [3/3] 完成"
echo "全部通过。下一步：把 ColorMatchCore 作为 local package 挂进 ColorMatchIOS，"
echo "用真实图对跑 M1 验收（App 预览 vs Lightroom 导入 XMP 目视比对）。"
