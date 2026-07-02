# Claude Code 交接文：冷静报告 v2（2026-07-02）

> 给下一个 Claude Code 会话的完整交接。上一个会话在**无 Xcode 的 Linux 云端环境**里，按《架构重设 Brief》从零重写了整个 App（iOS + 后端），代码已推送。你的首要任务见「下一步优先级」第 1 条。

## 1. 代码位置

- GitHub：`wzz122/wzz122`，分支 `claude/ios-app-architecture-ui-3qwy6d`
- 本仓库目录结构：
  - `argument-score-redesign/` —— 4 份设计文档（架构 / 成本 / UI / Codex 任务清单），是本次重写的依据
  - `argument-score-ios/` —— **v2 全新实现**（本交接文所在目录）
- 用户 Mac 上的 v1 旧项目（只作参考，不要在上面继续开发）：
  `/Users/wuzhuangzhuang/Documents/核心项目/New project/argument-score-ios`
- 本机 secrets（只引用变量名，永远不打印值，不入 git）：
  `/Users/wuzhuangzhuang/.codex/secrets/api-keys.env`

## 2. v2 已完成内容

### iOS（SwiftUI，iOS 17+，@Observable，深色主题）

- 26 个 Swift 文件，目录 `App / Core(API·Models·Recording·Storage) / Features(Home·LiveDebate·Postmortem·Reports·Settings) / Design`
- 现场评理：quick（各 1 分钟）+ rounds（前情→开篇→反驳×2→总结）完整状态机 `DebateSessionStore`
- 每回合录完立刻上传出「AI 小结」；交接手机过场页；大倒计时环（最后 10 秒变红+触觉）
- 判决页 8 张横滑卡片（总评/核心矛盾/双方论点/MVP/金句/雷达/修复），每张可用 `ImageRenderer` 出 9:16 分享图，免责声明渲染进图
- 录音 AAC 32kbps 单声道 + 90s 硬截断；`SessionDraft` 断点恢复；流式 multipart（`uploadTask(fromFile:)`，不整段进内存）
- `AnalysisAPI` 协议 + `MockAnalysisAPIClient`：**设置页默认开演示模式**，全流程可离线体验
- 事后复盘（导入音频→diarization→报告，含"称呼互换"兜底）；历史记录；设置页
- 工程文件：objectVersion 77（fileSystemSynchronizedGroups，Xcode 16+），共享 scheme，AppIcon 已生成（`scripts/generate_icon.py`），`PrivacyInfo.xcprivacy`、`Config/Info.plist`（麦克风文案 + `ITSAppUsesNonExemptEncryption=NO`）

### 后端（cloudflare-worker/，唯一主实现；v1 的 FastAPI 已废弃不迁移）

- 接口：`POST /sessions`、`POST /sessions/:id/turns`、`POST /sessions/:id/finalize`、`POST /analyze`（复盘）、`GET /health`；v1 无数据库，session 状态由 iOS 持有
- `providers.ts`：OpenAI/Gemini 双 Provider（都走 OpenAI-compatible `chat/completions`）；转写始终走 OpenAI，**quick/rounds 回合 `diarize=false` 走 `gpt-4o-mini-transcribe` 便宜档**（全项目最大省钱点），复盘走 `gpt-4o-transcribe-diarize`
- `cost.ts`：`PRICE_TABLE_JSON` 单价表（日元）→ 每响应带 `costMeter`；`SESSION_BUDGET_JPY`（默认 100，80% 警告、100% 拒收新回合只许终评）；可选 KV `BUDGET_KV` 每日全局熔断
- `prompts.ts` 按模式拆分；`normalize.ts` 对 LLM 输出做服务端兜底归一化，**保证 iOS Codable 一定能解码**
- 硬边界写死在 prompt：不判胜负/不裁决事实/不评人格/不诊断/不给法律建议

## 3. 验证状态（诚实记录）

| 项 | 状态 |
| --- | --- |
| Worker `npm run typecheck` | ✅ 已在云端通过 |
| Info.plist / xcprivacy / 资产 JSON 语法 | ✅ 已验证 |
| AppIcon 1024 | ✅ 已生成并目检 |
| **iOS 编译** | ⚠️ **从未编译过**（云端无 Xcode）。已做两轮人工交叉核对（API 签名/SF Symbol/隔离/Codable），但必有漏网之鱼 |
| 真机全流程 | ❌ 未跑 |
| Worker 真实上游冒烟 | ❌ 未跑（需要 key） |

## 4. 下一步优先级

1. **在 Mac 上编译修错**（预计少量小错，模式已知：SF Symbol 名、并发隔离警告升级、遗漏 import）：
   ```bash
   cd argument-score-ios
   xcodebuild -project ArgumentScore.xcodeproj -scheme ArgumentScore \
     -configuration Debug -destination 'generic/platform=iOS' build
   ```
   注意工程用的是 Xcode 16 的 synchronized folder 格式，新增文件放进 `ArgumentScore/` 目录即自动入 target。
2. 模拟器/真机跑通演示模式全流程（默认开）：模式选择 → rounds 全回合 → 终评卡片 → 分享图。
3. 部署 Worker（`wrangler secret put ARGUMENT_API_TOKEN / OPENAI_API_KEY / GEMINI_API_KEY`，vars 见 wrangler.toml），关掉演示模式，用两段真实录音冒烟 `/turns`+`/finalize` 和 `/analyze`。
4. **部署前复核 `PRICE_TABLE_JSON` 单价**（写文档时的价基于 2026 年初价目表；`gemini-3.5-flash` 价格务必查官方）。
5. TestFlight 阻断是人工操作：App Store Connect 手动建 App 记录（Name `冷静报告` / Bundle ID `com.wuzhuangzhuang.ArgumentScore` / SKU `ARGUMENT_SCORE_2026` / zh-Hans），API key 建不了（403）。
6. 之后的 roadmap：continuous 模式（UI 已留占位）、fused pipeline（Gemini 音频直读一次调用出转写+摘要，回合成本再降一半，做成 `TURN_PIPELINE=split|fused` 开关）、R2+KV 服务端记账。

## 5. 改代码前必须知道的契约

iOS Codable 和 Worker JSON **字段名严格一一对应**（camelCase）。改任何一边都要同步另一边 + `normalize.ts`：

- `/turns` 响应：`{ analysis: TurnAnalysis, costMeter }`；`TurnAnalysis` = transcript / stance / claims[] / evidenceQuotes[] / emotionalCues[] / fallacies[] / compactSummary / roundTake
- `/finalize` 请求：`{ config, turns: [TurnDigest], sessionCostJpy }`（TurnDigest = TurnAnalysis + speaker("A"|"B") / phase / roundIndex）
- `/finalize`、`/analyze` 响应 = `VerdictReport`：mode / coreIssue / overallScore / responsibility{aShare,note} / sides[] / mvp / goldenQuote / evidenceQuotes[] / radar[]（六维，维度名写死在 `RADAR_DIMENSIONS`）/ roundNotes[]? / repairActions[] / missingSentence / finalRemark / disclaimer / transcriptLines[]? / costMeter?
- 参与者在协议层永远是字母 `"A"/"B"`，显示名只在 iOS `SessionConfig` 里映射（这是为了让 LLM 输出稳定 + 支持任意两人关系）

设计约束：所有颜色/圆角只从 `Design/Tokens.swift` 取；参与者色 A=青 B=橙（刻意避开性别刻板）；终评 prompt 只吃 compactSummary 不吃全文（省钱架构的核心，别破坏）。

## 6. 红线（与原 Brief 一致）

- OpenAI/Gemini key 只进 Worker secrets；iOS 只保存 `ARGUMENT_API_TOKEN`；key 不进 git/README/Info.plist/IPA
- 不把 `~/.codex/secrets/api-keys.env` 内容打印或提交
- AI 输出边界与免责声明不可移除（`prompts.ts` 的 BOUNDARIES + `normalize.ts` 强制 disclaimer）
- 开发分支 `claude/ios-app-architecture-ui-3qwy6d`，未经允许不要推别的分支
