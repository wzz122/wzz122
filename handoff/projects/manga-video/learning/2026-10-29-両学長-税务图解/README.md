# 両学長最新 5 期学习 → 税务图解工作流优化（2026-10-29）

先看：`样片/故乡税v3-第2段5-16句-左旧右新.mp4`（68 秒，左旧右新，同一份配音），再看 `审片-状态对比/index.html`。

| 文件 | 内容 |
|---|---|
| `学习结论.md` | 12 条机制，每条分观察（样本 + 时间 + 拼图）/ 解释 / 实施 / 待复核；不学的；证据范围 |
| `工作流差距与改动.md` | P0 / P1 / P2：现状证据 → 观众问题 → 最小修改 → 影响 → 验收 → 回退；修改的文件清单 |
| `分镜状态模板.md` | 状态字段（已接入 / 仅规范分开写）、你草案字段的对应、配方（分步计算、异议澄清、对照、比较聚焦、列表焦点、原件、行动闭环） |
| `工作流-vNext.md` | 12 个阶段的输入、输出、关口、命令、失败处理；人工可覆盖的位置；数据流 |
| `QC.md` | 12 项检查：通过 / 部分 / 未做，证据路径；文末是你看完试作后的 5 个决定和对应改动（2026-10-29） |
| `样片/` | 新版、旧版、左旧右新并排 |
| `审片-状态对比/` | 18 个状态 × 开始前 / 变化中 / 结束，加旧版同一时刻 |
| `改动-代码.diff`、`改动-技能.diff` | 完整 diff |
| `回退备份/` | 改前原文件（`.bak`）。回退：把 `.bak` 复制回原位置、去掉后缀 |

新期从模板开始：`node pipeline/new-episode.mjs <期名>`（模板在 `templates/tax-episode/`）。

试作数据：`episodes/furusato-v3-trial-old/`（v3 原样）、`episodes/furusato-v3-trial-new/`（新写法）。重做样片：

```
node pipeline/build-episode.mjs episodes/furusato-v3-trial-new
node pipeline/lint-episode.mjs episodes/furusato-v3-trial-new
npx remotion render src/episode/index.ts Episode learning/2026-10-29-両学長-税务图解/样片/故乡税v3-第2段5-16句-new.mp4 --props='{"episode":"furusato-v3-trial-new"}' --frames=732-2774 --concurrency=4 --crf=18
```
