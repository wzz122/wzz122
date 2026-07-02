# 04 · 现有代码问题清单 + Codex 任务清单

> 说明：Claude 侧本次环境只有 profile 仓库，App 源码在本机。以下问题 1–6 来自交接文档明确记载，7–12 是架构推断，标了 ⚠️ 的请 Codex 在动手前先到代码里确认一下实情。

## A. 现有代码问题清单（Codex 侧）

1. **`DebateFlowView.swift` 巨石文件**：流程状态、录音、上传、UI 混在一起，加模式必然膨胀。→ 按 01 文档 §3.1 拆分。
2. **API 只有两个一次性接口**（`/analyze`、`/debate`），表达不了多轮回合制。→ 01 文档 §4.1。
3. **每个模式一个巨型 prompt 一把梭**，没有 turn/summary/evidence 中间结构；多轮化后 token 会平方级失控（02 文档 §3 反面教材）。
4. **Worker 和 FastAPI 双实现漂移**。→ Worker 定为唯一主实现，FastAPI 冻结（见任务 C-1）。
5. **iOS multipart 一次性把音频读进内存**：长录音有内存与超时风险。→ `uploadTask(fromFile:)` + background session。
6. **文档里的旧路径失效**：`/Users/wuzhuangzhuang/Documents/New project/argument-score-ios` 已不存在，README/docs 需要全量替换为 `/Users/wuzhuangzhuang/Documents/核心项目/New project/argument-score-ios`。
7. ⚠️ **「第一个 speaker=男方」的映射是赌博**：diarization 的 speaker 顺序不稳定，虽有确认页兜底，但默认值错一半概率。→ 换成 personA/personB + 确认页展示各自首句原文帮用户判断（03 文档 §0）。
8. ⚠️ **上传无重试/断点**：录音上传失败时用户白说一分钟。确认现状后按 SessionDraftStore 设计补落盘重传。
9. ⚠️ **App 被杀 = 现场评理进度全丢**：确认 DebateFlow 状态是否有任何持久化。
10. ⚠️ **成本零护栏**：任何长度音频都照单全收、无预算上限，一段 3 小时录音能直接烧几百日元。→ 02 文档 §4/§5。
11. ⚠️ **模型名散落**：确认 iOS/Worker 是否有硬编码模型名，一律收敛到 env。
12. ⚠️ **`/debate` 的两段音频串行转写**：如果是串行，改为并行（Worker `Promise.all`），用户等待时间近乎减半，零成本。

## B. 任务清单（按顺序执行，每条含验收标准）

### 第 1 批 · 杂活（不动架构，先清场）

| # | 任务 | 验收 |
| --- | --- | --- |
| B-1 | 全仓 grep 旧路径 `Documents/New project`，替换为真实路径 | `grep -r "Documents/New project" .` 零命中 |
| B-2 | 确认 A 组 ⚠️ 各项实情，在本文件回填「确认/证伪 + 文件行号」 | 每条有结论 |
| B-3 | `/debate` 两段转写并行化（若 A-12 确认） | typecheck 过 + 手测耗时下降 |
| B-4 | Worker 转写路由：请求带 `diarize:false` 时走 `OPENAI_TRANSCRIPTION_MODEL`（mini 档） | 单测覆盖两条路由 |
| B-5 | Provider 抽象落地（交接文档伪代码照抄即可），`AI_PROVIDER=gemini` 冒烟通过 | 两 provider 各跑通一次 `/debate` |

### 第 2 批 · 后端新架构

| # | 任务 | 验收 |
| --- | --- | --- |
| B-6 | 新增 `/sessions`、`/sessions/:id/turns`、`/sessions/:id/finalize`（01 文档 §4.1 形状），无状态实现 | typecheck + curl 全链路脚本 |
| B-7 | Prompt 拆分为 turn_extract / judge_quick / judge_rounds，逐回合输出「谁更抓住问题/谁偷换概念/谁扩大化」 | fixture 音频跑出合规 JSON |
| B-8 | costMeter + `PRICE_TABLE_JSON` + 预算护栏（02 文档 §4） | 超预算返回 402 语义错误的测试 |
| B-9 | 旧 `/debate` 内部改写为 quick session 组合，行为对外不变 | 旧 iOS 版本回归通过 |

### 第 3 批 · iOS 重构

| # | 任务 | 验收 |
| --- | --- | --- |
| B-10 | 目录重组 + `DebateFlowView` 按 01 文档 §3.1 拆分 | Debug/Release 构建过 |
| B-11 | `AudioRecorderService` / `RecordedClip` / `SilenceTrimmer` / 90s 截断 | 单元测试 + 真机录音冒烟 |
| B-12 | `AnalysisAPI` 协议 + Mock 客户端 + `uploadTask(fromFile:)` 流式上传 | Preview 全部走 Mock 不发网络请求 |
| B-13 | `SessionDraftStore` 落盘恢复 | 杀 App 后重进能续录 |
| B-14 | rounds 状态机 + 录音页/时间轴/处理页/判决页（03 文档） | 全流程真机演示 |
| B-15 | 分享卡片 `ImageRenderer` 9:16 输出，免责声明渲染进图 | 7 张卡各出一张样图 |

### C. 独立决定项

| # | 任务 | 说明 |
| --- | --- | --- |
| C-1 | FastAPI 冻结：README 标注「仅本地参考，不再更新」，保留现有测试 | 下一轮直接删除 |
| C-2 | TestFlight 阻断是**人工操作**，Codex 做不了：需要用户本人在 App Store Connect 手动创建 App 记录（Name: 冷静报告 / Bundle ID: com.wuzhuangzhuang.ArgumentScore / SKU: ARGUMENT_SCORE_2026 / zh-Hans） | 用户 TODO |

## D. 每批完成后的固定验证（交接文档原命令）

```bash
cd "/Users/wuzhuangzhuang/Documents/核心项目/New project/argument-score-ios/server"
./.venv/bin/pytest -q

cd "/Users/wuzhuangzhuang/Documents/核心项目/New project/argument-score-ios/cloudflare-worker"
npm run typecheck

cd "/Users/wuzhuangzhuang/Documents/核心项目/New project/argument-score-ios"
xcodebuild -project ArgumentScore.xcodeproj -scheme ArgumentScore -configuration Debug -destination 'generic/platform=iOS' build
xcodebuild -project ArgumentScore.xcodeproj -scheme ArgumentScore -configuration Release -destination 'generic/platform=iOS' build
```

路径含空格问题：优先用真实路径，必要时复制到 `/tmp/argument-score-ios-build` 再构建。

## E. 红线（Codex 执行时不可违反）

- 不把 `/Users/wuzhuangzhuang/.codex/secrets/api-keys.env` 加入 git；不在任何输出里打印 key 值。
- key 只进 Worker secrets；iOS 只保存 `ARGUMENT_API_TOKEN`。
- TestFlight 脚本保持 `API_KEYS_PATH=/dev/null`。
- AI 输出不包含「谁赢」、事实裁决、人格评判、心理诊断、法律建议；免责声明不可移除。
