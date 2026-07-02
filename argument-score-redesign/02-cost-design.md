# 02 · 成本设计：一小时争吵 ≤100 日元（目标 ≤50 日元）

## 0. 结论先行

| 模式 | 转写路径 | 1 小时纯发言的估算成本 | 达标情况 |
| --- | --- | --- | --- |
| quick / rounds（发言人已知） | `gpt-4o-mini-transcribe`（无 diarize）+ 小模型分析 | **约 30–40 日元** | ✅ 达成 50 日元目标 |
| quick / rounds（fused：Gemini 音频直读） | Gemini Flash 一次调用出转写+摘要 | **约 15–30 日元** | ✅ 大幅低于 50 日元 |
| continuous / postmortem（需要 diarize） | `gpt-4o-transcribe-diarize` | **约 60–70 日元** | ✅ 达成 100 日元上限，不达 50 |

核心洞察只有一条：**成本大头是转写（ASR），不是 LLM 分析；而 diarization 是转写里最贵的需求。回合制模式里每段音频的发言人是已知的，diarization 完全不需要**——这就是为什么架构上要把「回合制」做成主打模式：它不只是产品玩法，它本身就是成本结构的解法。

> 汇率假设：1 USD = 150 JPY。下方单价基于 2026 年初价目表，`gemini-3.5-flash` 等新模型价格需上线前用官方价目表复核——所以护栏设计（§4）里单价一律走环境变量，不写死在代码里。

## 1. 单价基准（需部署前复核一次）

| 项 | 单价（USD） | 折算 |
| --- | --- | --- |
| gpt-4o-transcribe-diarize | ~$0.006 / 分钟音频 | ~0.9 日元/分钟 |
| gpt-4o-mini-transcribe（无 diarize） | ~$0.003 / 分钟音频 | ~0.45 日元/分钟 |
| Gemini Flash 音频输入 | ~$1.0 / 1M tokens，音频 ≈ 32 tokens/秒 ≈ 1,920 tokens/分钟 | ~0.3 日元/分钟 |
| Gemini Flash 文本输入 / 输出 | ~$0.30 / ~$2.50 per 1M tokens | 极小项 |
| gpt-5-mini 文本输入 / 输出 | ~$0.25 / ~$2.00 per 1M tokens | 极小项 |

## 2. 一小时争吵的成本拆解（rounds 模式，split pipeline）

假设：一小时里双方实际录了 60 个回合 × 60 秒（这是**上界**——现实中一小时的架，录进 App 的发言一般只有 30–40 分钟）。

| 成本项 | 计算 | 金额 |
| --- | --- | --- |
| 转写（mini，无 diarize） | 60 分钟 × 0.45 日元 | **27 日元** |
| 逐回合抽取（60 次小调用） | 每次约 1k tokens 入 + 350 tokens 出 | ~8 日元 |
| 终评 finalize（1 次） | 只吃 60 条 compactSummary（~5k in）+ ~3k out | ~1.5 日元 |
| **合计（上界）** | | **约 37 日元** ✅ |

同样的账用 fused pipeline（Gemini 音频直读，转写+抽取一次调用）：60 回合 × ~0.5 日元 + 终评 ≈ **约 30 日元**；现实录音量（35 分钟）下约 **18 日元**。

对照现状（一切都走 diarize 模型）：60 分钟 × 0.9 = 54 日元转写 + 分析 ≈ **60 日元出头**——能过 100 日元线但摸不到 50。**只改转写路由这一件事，就能把主打模式拉进 50 日元以内。**

## 3. 为什么 LLM 分析费用可以忽略

因为架构上强制了「摘要进终评、全文不进终评」（01 文档 §4.2）：

- 每回合只做一次小抽取，输入只有该回合转写（~400 tokens）+ 短 prompt；
- finalize 只吃每回合 ~80 tokens 的 compactSummary + 少量证据句；
- 全场 LLM 文本费用 < 10 日元，即使换更贵的分析模型也翻不了天。

反面教材（禁止的写法）：每回合把**全部历史转写**重新塞给模型 → token 随回合数平方增长，60 回合会烧掉几百日元。这是现有「大 prompt 一把梭」结构在多轮化之后必然踩的坑，也是必须现在改架构的最硬理由。

## 4. 预算护栏（Worker 端，代码级设计）

单价可变、模型会换，所以**护栏基于配置而不是硬编码**：

```text
Env:
  PRICE_TABLE_JSON      {"asr_diarize_per_min":0.9, "asr_mini_per_min":0.45,
                         "llm_in_per_1k":0.045, "llm_out_per_1k":0.375}   // 单位:日元
  SESSION_BUDGET_JPY    默认 100
  DAILY_BUDGET_JPY      默认 2000（按 API token 记，全局熔断）
```

规则：

1. 每个请求处理完，按 PRICE_TABLE 估算本次开销，累加进 session 计费（v1 无数据库：累计值放进 `TurnDigest.costMeter` 由 iOS 带回，Worker 校验签名防篡改可后做；v2 迁 KV）。
2. `costMeter.total > SESSION_BUDGET_JPY × 0.8` → 响应带 `budgetWarning`，iOS 提示「本场快到预算上限了，建议进入总结陈词」。
3. 超过 100% → `/turns` 返回 402 语义错误，只允许 finalize。**吵不完可以，烧穿钱包不行。**
4. `DAILY_BUDGET_JPY` 用 KV 计数器实现全局熔断，防止 token 泄漏被刷。
5. 每个响应都带 `costMeter: { thisCall, sessionTotal, currency:"JPY" }` —— 顺手变成产品功能：报告尾部可以展示「本场评理成本 ¥23」，既透明又是传播点。

## 5. 客户端省钱措施（iOS 端）

| 措施 | 效果 | 说明 |
| --- | --- | --- |
| 静音掐头去尾（SilenceTrimmer） | 转写按时长计费，剪掉沉默=直接省钱 | 录音常有 5–15% 静音，AVAudioRecorder metering 即可，不需要重 VAD |
| 单回合硬顶 90s 自动截断 | 封顶单回合成本 | 配合 UI 倒计时环（03 文档） |
| 单场回合数上限（rounds ≤14 turns） | 封顶单场成本 ≈ 21 分钟音频 ≈ 十几日元 | 「一小时的架」= 多场 session，每场独立预算 |
| 上传格式 AAC-HE 32kbps 单声道 | 省流量、加快上传 | 注意：**不省 API 钱**（按时长/token 计费），别在这上面过度优化 |
| Mock 模式 | Preview/演示/审核走 fixture | 开发迭代期一分钱不烧 |

## 6. 给 Codex 的落地顺序

1. Worker：转写路由按 `diarize: boolean` 分流（quick/rounds → mini 档）。← 性价比最高的一步
2. Worker：`PRICE_TABLE_JSON` + costMeter 计算，塞进所有响应。
3. Worker：SESSION_BUDGET / DAILY_BUDGET 护栏 + KV 熔断。
4. iOS：SilenceTrimmer + 90s 截断 + 预算提示 UI。
5. （实验分支）fused pipeline 开关 `TURN_PIPELINE=split|fused`，拿 10 段真实录音对比转写质量后再决定默认值。
