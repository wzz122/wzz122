# 冷静报告（ArgumentScore）架构重设方案 v2

> 基于 2026-07 交接文档《冷静报告架构重设 Brief》产出。
> 本仓库（wzz122/wzz122）不含 App 源码，源码在本机：
> `/Users/wuzhuangzhuang/Documents/核心项目/New project/argument-score-ios`
>
> 分工约定：Claude 负责架构与设计决策（本套文档），Codex 负责按清单执行代码改动并跑验证。

## 文档索引

| 文件 | 内容 | 给谁看 |
| --- | --- | --- |
| [01-architecture.md](01-architecture.md) | 产品形态、iOS 架构、后端 session/turn/finalize 架构、Provider 抽象 | 你 + Codex |
| [02-cost-design.md](02-cost-design.md) | 成本测算与预算护栏：1 小时争吵 ≤100 日元（目标 ≤50 日元）的具体设计 | 你 + Codex |
| [03-ui-redesign.md](03-ui-redesign.md) | UI/UX 改进方案：首页、回合录音、判决页、可截图卡片 | 你 + Codex |
| [04-codex-tasklist.md](04-codex-tasklist.md) | 现有代码问题清单 + 交给 Codex 的杂活任务清单（含验收命令） | Codex |

## 一句话结论

1. **架构**：后端从「两个一次性上传接口」改为 `session + turn + finalize` 三段式；v1 不引入数据库，session 状态由 iOS 持有，后端保持无状态。
2. **成本**：成本大头是转写（ASR），不是分析。关键洞察：**回合制模式下每段录音的发言人是已知的，根本不需要 diarization**，可以走便宜一档的转写（或 Gemini 音频直读），一小时争吵可以压到 **约 20–40 日元**；只有「连续录音」模式才需要 diarization（约 60–70 日元），作为高级模式单独标价。
3. **UI**：首页收敛为「强评分视觉 + 两个大入口」；回合录音页做成大计时环 + 回合进度条；判决页改成可横滑的截图卡片组（MVP / 金句 / 责任雷达）。
4. **杂活**：全部列在 04 文档，按顺序丢给 Codex 即可，每条都带验收标准。

## 安全红线（不变）

- OpenAI / Gemini key 只存在于后端（Worker secrets / 本机 env 文件），永远不进 iOS 包、README、git。
- `/Users/wuzhuangzhuang/.codex/secrets/api-keys.env` 只引用变量名，不打印值。
- AI 输出保持娱乐化边界：不输出「谁赢」、事实裁决、人格评判、心理诊断、法律建议；免责声明固定展示。
