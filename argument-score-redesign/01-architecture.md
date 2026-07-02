# 01 · 产品形态与技术架构

## 1. 产品形态定稿

保留两个大入口，「现场评理」升级为主打，第一轮只实现前两个子模式：

```text
冷静报告
├── 事后复盘（postmortem）      整段录音导入 → diarization → 复盘报告（保留现状，接口兼容）
└── 现场评理（live debate）
    ├── 快速评理（quick）       A 1 分钟 + B 1 分钟 → 终评          ← 第一轮实现
    ├── 回合制（rounds）        前情 → 开篇 → 反驳×N → 总结 → 终评   ← 第一轮实现，主打
    ├── 连续录音（continuous）  一直录，AI 切回合                    ← 第二轮
    └── 议题裁判（topic）       先定议题再陈述                       ← 第二轮，可作为 rounds 的参数而非独立模式
```

设计决定：

- **议题裁判不做独立模式**。`topic` 是 session 的可选字段，quick/rounds 都能带，砍掉一个模式的维护成本。
- **毒舌版/温和版不做独立模式**。是 finalize 时的 `tone: roast | gentle` 参数，同一份事实结构换渲染文风。
- 参与者内部模型一律用 `personA / personB + displayName`，「男方/女方」只是默认显示名，可改。这同时解决现有代码「第一个 speaker=男方」的硬编码问题。

## 2. 回合制（rounds）流程定义

```text
phase 顺序（rounds 模式状态机）：
context(A) → context(B)            前情概要，各 ≤60s，可跳过
→ opening(A) → opening(B)          开篇陈词，各 ≤60s
→ rebuttal(A) → rebuttal(B) ×N     交锋回合，各 ≤60s，N 默认 2，上限 4
→ summary(A) → summary(B)          总结陈词，各 ≤45s，可跳过
→ finalize                         AI 终评
```

- 每回合录完立刻上传、立刻拿到该回合的转写 + 摘要（见 §4），用户在等对方说话时就能看到上一回合的「AI 小结」，这是「回合感」的核心体验，也把延迟摊平了。
- 上限：单回合硬性 90s 截断；一场 session 最多 14 turns。超时自动停止录音并提示。

## 3. iOS 架构

### 3.1 目录结构（目标态）

```text
ArgumentScore/
  App/                        入口、AppDelegate、环境注入
  Core/
    API/
      AnalysisAPI.swift           协议
      CloudAnalysisAPIClient.swift  真实现（指向 Worker）
      MockAnalysisAPIClient.swift   Preview/演示/UI 测试用
      MultipartUpload.swift         流式 multipart（从文件 URL 上传，不整段读进内存）
    Models/
      DebateSession.swift  DebateTurn.swift  VerdictReport.swift
      共享件: ScoreCard / ResponsibilitySplit / EvidenceQuote / RepairAction
      旧模型 ArgumentReport / DebateVerdict 保留做兼容层
    Recording/
      AudioRecorderService.swift    AVAudioRecorder 封装，产出 RecordedClip
      RecordedClip.swift            fileURL + duration + speaker + phase
      RecordingPermissionState.swift
      SilenceTrimmer.swift          掐头去尾静音（省转写钱，见 02 文档）
    Storage/
      SessionDraftStore.swift       进行中 session 落盘（崩溃/杀后台可恢复）
      ReportStore.swift             历史报告（现有，迁移过来）
  Features/
    Home/                HomeView
    LiveDebate/
      LiveDebateModePickerView
      DebateSessionStore            @Observable，持有状态机
      DebateTurnRecorderView        录音页（大计时环）
      DebateRoundTimelineView       回合时间轴
      DebateProcessingView          分阶段进度
      DebateResultView              终评卡片组
    Postmortem/          现有导入复盘流程迁移
    Reports/             历史列表
    Settings/
  Design/
    Tokens.swift         颜色/字号/圆角/间距
    Components/          ScoreRing, PhaseChip, ShareCardRenderer …
```

### 3.2 核心状态机（DebateSessionStore）

```swift
@Observable
final class DebateSessionStore {
    enum State {
        case configuring                      // 选模式/议题/称呼
        case waitingToRecord(TurnSlot)        // 轮到某人，未开始
        case recording(TurnSlot, Progress)    // 计时中
        case uploadingTurn(TurnSlot)          // 上传+逐回合分析中（可后台）
        case turnReady(TurnDigest)            // 展示该回合 AI 小结
        case finalizing
        case verdictReady(VerdictReport)
        case failed(RecoverableError)         // 一律可重试，clip 已落盘
    }

    struct TurnSlot { let speaker: Participant; let phase: Phase; let roundIndex: Int }
}
```

关键点：

- **上传失败不丢数据**：`RecordedClip` 一落盘就写入 `SessionDraftStore`，任何一步失败都能从磁盘重传，App 被杀也能恢复到断点。
- **上传用 `URLSession.uploadTask(fromFile:)`**，解决现有「一次性读进内存」问题；长音频（postmortem 模式）用 background session。
- `AnalysisAPI` 是协议，`MockAnalysisAPIClient` 返回固定 fixture，SwiftUI Preview 和演示模式不烧一分钱 API 费。

### 3.3 AnalysisAPI 协议

```swift
protocol AnalysisAPI {
    func createSession(_ req: CreateSessionRequest) async throws -> SessionHandle
    func submitTurn(session: SessionHandle, clip: RecordedClip,
                    slot: TurnSlot) async throws -> TurnDigest
    func finalize(session: SessionHandle,
                  turns: [TurnDigest], tone: Tone) async throws -> VerdictReport
    func analyzeRecording(_ fileURL: URL) async throws -> ArgumentReport  // 旧 /analyze 兼容
}
```

## 4. 后端架构（Cloudflare Worker 为唯一主实现）

决定：**Worker 是主实现，FastAPI 降级为「本地参考」并冻结**（只留 README 说明 + 现有测试，不再追新功能；下一轮直接删除）。消除双实现漂移。

### 4.1 接口

```text
POST /sessions
  body: { mode, topic?, participants: [{id:"A", displayName}, {id:"B", displayName}], tone? }
  返回: { sessionId, config }        ← v1 无数据库，sessionId 仅用于日志聚合与预算记账

POST /sessions/:id/turns
  multipart: audio + JSON 字段 { speaker, phase, roundIndex }
  动作: ASR（按模式选便宜路径，见 02 文档）→ 单回合抽取
  返回 TurnDigest: { transcript, stance, claims[], evidenceQuotes[],
                     emotionalCues[], fallacies[], compactSummary, costMeter }

POST /sessions/:id/finalize
  body: { mode, topic?, tone, turns: [TurnDigest...] }   ← iOS 把所有 digest 传回，后端无状态
  动作: 只喂 compactSummary + 关键证据句给评审模型（不喂全文）
  返回: VerdictReport

POST /analyze          保留，旧版整段复盘兼容
GET  /health
```

- v1 **不引入 D1/R2**：iOS 持有全部 TurnDigest，finalize 一次性接收。后端每个请求自包含，最容易测、零迁移成本。
- v2 再上 R2（临时音频、TTL 清理）+ KV（session 记账、预算护栏持久化）。接口形状从 v1 起就按这个设计，届时只换存储不换协议。

### 4.2 AI Pipeline（按回合，不是大 prompt 一把梭）

```text
turn 音频 ─→ ASR ─→ turn extractor（小 prompt，JSON schema）─→ TurnDigest
                                                                │ iOS 累积
所有 TurnDigest ─→ session judge（中 prompt，只吃摘要+证据句）─→ VerdictReport
完整 transcript 只作为报告附件返回，不进终评 prompt
```

Prompt 按模式拆文件：`prompts/turn_extract.ts`、`prompts/judge_quick.ts`、`prompts/judge_rounds.ts`、`prompts/judge_postmortem.ts`，禁止共用巨型 prompt。

### 4.3 Provider 抽象（OpenAI / Gemini）

```ts
interface AIProvider {
  transcribe(audio: Blob, opts: { diarize: boolean; language?: string }): Promise<Transcript>;
  completeJSON<T>(req: { model: string; system: string; user: string;
                         schema: object }): Promise<T>;
}
```

路由规则（成本导向，细节见 02 文档）：

| 场景 | diarize 需要吗 | 转写 | 分析 |
| --- | --- | --- | --- |
| quick / rounds 单回合 | **不需要**（发言人已知） | 便宜档：`gpt-4o-mini-transcribe` 或 Gemini 音频直读 | `GEMINI_ANALYSIS_MODEL` 或 `OPENAI_ANALYSIS_MODEL` |
| postmortem / continuous | 需要 | `gpt-4o-transcribe-diarize` | 同上 |

Env（沿用交接文档约定，Worker secrets 配置，iOS 永不接触）：

```text
AI_PROVIDER=openai|gemini
OPENAI_API_KEY / OPENAI_ANALYSIS_MODEL / OPENAI_TRANSCRIPTION_MODEL / OPENAI_PROXY_BASE_URL
GEMINI_API_KEY / GEMINI_ANALYSIS_MODEL / GEMINI_PROXY_BASE_URL
  （GEMINI_PROXY_BASE_URL 为空时默认 https://generativelanguage.googleapis.com/v1beta/openai/）
PRICE_TABLE_JSON / SESSION_BUDGET_JPY / DAILY_BUDGET_JPY   ← 新增，见 02 文档
```

Gemini 走官方 OpenAI-compatible endpoint，`completeJSON` 一份实现两家通吃；分析层唯一要处理的差异是 JSON schema 严格模式的字段兼容（Codex 任务清单里有对应条目）。

### 4.4 一个可选的省钱大招（标记为实验，v1 可先不做）

Gemini Flash 系列支持音频直读。rounds 模式可以把「ASR + turn extractor」合并成**一次调用**：音频直接进 Gemini，JSON 输出 `{transcript, claims, compactSummary, ...}`。少一次调用、少一次文本重复计费，单回合成本再降约一半（测算见 02 文档 §3）。风险是转写质量/时间戳不如专职 ASR 模型，所以做成 `TURN_PIPELINE=split|fused` 开关，A/B 对比后再定默认值。

## 5. 第一轮改动范围（对齐交接文档）

1. 新增 `DebateMode: quick | rounds`（continuous 枚举先占位不实现）。
2. iOS 首页现场评理入口 → 模式选择页。
3. rounds 本地回合状态机 + 录音 UI（§2 流程）。
4. Worker 新增 `/sessions`、`/sessions/:id/turns`、`/sessions/:id/finalize`；`/debate` 保留并内部改写为「一个 quick session 的两个 turn + finalize」。
5. Prompt 拆分 + 逐回合输出「这一回合谁更抓住问题 / 谁在偷换概念 / 谁在扩大化」。
6. 报告页可截图卡片（见 03 文档）。
