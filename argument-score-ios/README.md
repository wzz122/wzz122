# 冷静报告 v2（ArgumentScore）

AI 吵架评审 iOS App：现场评理（快速 / 回合制）+ 事后复盘。
本目录是按《架构重设 Brief》从零重写的 v2 完整实现（SwiftUI + Cloudflare Worker）。

## 快速开始（Mac）

1. 用 Xcode 16+ 打开 `ArgumentScore.xcodeproj`，在 Signing & Capabilities 里选择你的 Team。
2. 直接运行。**App 默认开启「演示模式」**：全流程走本地示例数据，不需要后端、不消耗任何 API 费用，可以立刻体验完整 UI（回合录音 → AI 小结 → 终评卡片 → 分享图）。
3. 接真后端：部署 Worker（见下），然后在 App 设置页关闭演示模式、填服务地址和访问令牌。

## 部署后端（Cloudflare Worker）

```bash
cd cloudflare-worker
npm install
npx wrangler secret put ARGUMENT_API_TOKEN   # App 访问令牌，自己起一个随机串
npx wrangler secret put OPENAI_API_KEY       # 转写用（必需）
npx wrangler secret put GEMINI_API_KEY       # AI_PROVIDER=gemini 时用
npm run deploy
```

非敏感配置在 `wrangler.toml`：`AI_PROVIDER`、转写模型、`SESSION_BUDGET_JPY`（单场预算上限）、`PRICE_TABLE_JSON`（单价表，**上线前按官方价目表复核**）。每日全局熔断需绑定 KV（见 wrangler.toml 注释）。

本环境已验证：`npm run typecheck` 通过。iOS 构建请在 Mac 上跑：

```bash
xcodebuild -project ArgumentScore.xcodeproj -scheme ArgumentScore \
  -configuration Debug -destination 'generic/platform=iOS' build
```

## 架构速览

```text
ArgumentScore/                iOS（SwiftUI，iOS 17+，@Observable）
  App/                        入口 + TabView
  Core/
    API/                      AnalysisAPI 协议 / Cloud 客户端（流式 multipart）/ Mock
    Models/                   SessionConfig · TurnSlot · TurnDigest · VerdictReport
    Recording/                AudioRecorderService（AAC 32kbps 单声道，90s 硬截断）
    Storage/                  AppSettings · ReportHistoryStore · SessionDraft（断点恢复）
  Features/
    Home / LiveDebate / Postmortem / Reports / Settings
  Design/                     Tokens · 组件 · 雷达图 · 分享卡片渲染 · 触觉
cloudflare-worker/            唯一后端实现
  src/index.ts                /sessions · /sessions/:id/turns · /sessions/:id/finalize · /analyze
  src/providers.ts            OpenAI / Gemini 双 Provider（OpenAI-compatible 一份实现）
  src/cost.ts                 单价表 · 单场预算护栏 · 每日熔断
  src/prompts.ts              按模式拆分的 prompt（回合抽取 / 终评 / 复盘）
  src/normalize.ts            LLM 输出服务端兜底归一化（保证 iOS 一定能解码）
```

## 成本设计（1 小时争吵）

| 模式 | 路径 | 估算 |
| --- | --- | --- |
| 快速/回合制 | 发言人已知 → 免 diarization，走 `gpt-4o-mini-transcribe` | **约 ¥30–40** |
| 事后复盘 | 需要 diarization，`gpt-4o-transcribe-diarize` | 约 ¥60–70 |

护栏：终评只吃各回合 60 字摘要（不吃全文）；单回合 90s 截断；每个响应带 `costMeter` 实时显示在评理页；到预算 80% 提醒、100% 只许出终评；可选 KV 每日全局熔断。

## 安全边界

- OpenAI / Gemini key 只存在于 Worker secrets，App 只保存自家 Worker 的访问令牌。
- AI 不输出胜负判定 / 事实裁决 / 人格评判 / 心理诊断 / 法律建议；免责声明固定渲染进每张分享图。

## Roadmap

- 连续录音评审模式（continuous，UI 已留占位）
- fused pipeline 实验开关（Gemini 音频直读，回合成本再降一半）
- R2 音频暂存 + KV 会话记账（把预算护栏从"客户端带回"升级为服务端权威）

## TestFlight 阻断（需要人工操作一次）

App Store Connect 里手动创建 App 记录：Name `冷静报告` / Bundle ID `com.wuzhuangzhuang.ArgumentScore` / SKU `ARGUMENT_SCORE_2026` / 主语言 zh-Hans。API Key 无法自动创建（Apple 返回 403）。
