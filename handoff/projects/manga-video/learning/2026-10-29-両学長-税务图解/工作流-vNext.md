# 税务图解工作流 vNext

在现有流程（技能 `tax-explainer-video`）上加了三个关口：**理解链**、**自检**、**按状态审片**。新字段都可选，旧期照旧能构建。

所有命令在 `~/video-projects/manga-video` 下运行。下文 `<期>` = `episodes/<期名>`。

| # | 阶段 | 输入 | 输出 | 谁做 | 过关标准 | 失败怎么办 |
|---|---|---|---|---|---|---|
| 1 | 收稿 | 云盘 `税务图解/01-文稿/<题目>.md` | `node pipeline/new-episode.mjs <期名>` 从 `templates/tax-episode/` 建好 `<期>/`（默认都已打开） | 用户给稿 | — | 已存在的期不覆盖 |
| 2 | 事实卡 | 文稿 | `<期>/facts.md`（F 编号、官方出处 URL、核对结论） | Claude 查，用户看有疑问的 | 每个上屏数字、额度、年份、对象范围都有官方出处；示例/假设写明 | 找不到出处：画面和旁白标「示例/假设」，或回头问用户 |
| 3 | 理解链 | 文稿 + facts | `<期>/states.md`：每段的开场入口、question_id、状态表（见 `分镜状态模板.md` 第 1 节）、一个合理反驳、适用边界 | Claude | 每个状态只有一个新变化和一个视线落点；颜色语义标好；入口按题目选（人物困境 / 直接案例 / 新闻参数反差 / 先给结论），不默认小剧场 | — |
| 4 | 台词 | 文稿 | `<期>/lines.txt` → `script.json`（`{tts:…}` 写配音读法） | Claude | 不改用户观点；口语取整不改画面数字 | — |
| 5 | 场景数据 | states.md | `<期>/scenes.mjs`（`states` + 对象 `role`）、`<期>/visuals.json`（`"cueAlign": "phrase"`、`"sfxPolicy": "explicit"`、需要时每段 `cast`） | Claude | `node pipeline/build-episode.mjs <期>` 不报错 | 报错信息直接指出哪个场景/状态/对象；按提示改 |
| 6 | 自检 | 时间轴 | `<期>/build/lint.md`、`cue-report.json`、`sfx.json` | `node pipeline/lint-episode.mjs <期>` | FAIL = 0；WARN 逐条看过，能解释的写进 QC，不能解释的改 | 稳定时间不够：先换触发词（让结果多留一会），实在不行才降 hold 并写理由 |
| 7 | **审片关口 1**（方向） | 无声或复用旧音轨的关键帧 | `node pipeline/review-states.mjs <期> <目录> [--compare <旧版>]` → HTML | Claude 出，**用户看** | 用户点头再继续 | 按用户意见回到 3 或 5 |
| 8 | 配音 | script.json | `<期>/lines/sXX_lYY.wav` | MiniMax（gou / 芝士机器人，已定），**花钱前按技能规则** | 切出的句数 = 台词句数；读音核查（audit.py，走 `mac-heavy-job.py`，全机只跑一个模型） | 退出码 75：等另一个模型任务结束，不绕锁 |
| 9 | 对齐与人工校正 | 最终配音 | 重新构建；`cue-report.json` | Claude + 用户耳朵 | 优先听：金额第一次出现、公式代入、转折句、例外条件。差得多的写进 `<期>/cue-fixes.json`（`"s02_l06:固定扣除": 1.42`），再构建 | 短语对不上（报告里 method = char）的句子必须听 |
| 10 | **审片关口 2**（定稿前） | 新时间轴 | 重跑 6、7；连续播放样片 | 用户看 | — | — |
| 11 | 渲染 | 时间轴 | `npx remotion render src/episode/index.ts Episode out/<期名>.mp4 --props='{"episode":"<期名>"}' --concurrency=4`，之后总响度拉到约 −15 LUFS | Claude，渲染串行 | 无报错；`ffmpeg -af ebur128` 量响度 | 背景音乐在云盘读超时：先换已缓存的曲目或问用户，不在原路径造替代文件 |
| 12 | QC 与交付 | 成片 | `QC.md`（通过 / 失败 / 未做 + 证据路径）；按技能交付到云盘 | Claude | 不写没测过的结论；没实听的声音项标「未做」 | — |

## 人工输入 / 自动生成 / 可覆盖

| 东西 | 来源 | 能怎么改 |
|---|---|---|
| 句子起止时间 | 自动（配音时长 + 句间停顿 `timing`） | `visuals.json` 的 `timing` |
| 关键词时间 | 自动（phrase 或 char） | `cue-fixes.json` 人工覆盖 |
| 状态、焦点、停留、指向 | 人写（scenes.mjs） | 直接改 |
| 角色 | 老师和芝士从头到尾都在画面上，不能离场；状态上的 `point` 让老师抬手指向 | 只改 `point`；写 `'out'` 构建报错 |
| 音效 | explicit：只来自写明的 `sfx` | 关键帧/状态上的 `sfx`，`'none'` 关掉 |
| 字幕切分 | 自动（19 字 + 标点） | 改台词标点；自检列出过快的条目 |
| 背景音乐 | `visuals.json` 的 `bgm` 列表 | 直接改 |

## 数据流

```
文稿 ─▶ facts.md（F 编号、出处）
   └─▶ states.md（入口、question_id、状态表、反驳、边界）   ← 人写，审片关口 1 前用户可看
          └─▶ lines.txt / script.json ─▶ MiniMax 配音（付费，关口后）─▶ lines/*.wav
          └─▶ scenes.mjs（states + objects + role）+ visuals.json（cueAlign / sfxPolicy / cast）
                     │
        build-episode.mjs：句子时间 ─▶ 关键词时间（cue-fixes > phrase > char）─▶ 状态时间 ─▶ 对象关键帧
                     │                 ─▶ cast 轨 ─▶ 字幕（19 字切分）─▶ 音效（explicit）─▶ 混音
                     ▼
        public/episodes/<期名>/timeline.json + mix.wav；<期>/build/cue-report.json、sfx.json
                     │
        lint-episode.mjs ─▶ build/lint.md（FAIL/WARN/INFO）
        review-states.mjs ─▶ 按状态审片页（可对比旧版）
                     │
        remotion render ─▶ 响度 ─▶ QC.md ─▶ 交付
```

## 这次改进对内存的要求

新增部分都不用模型：停顿对齐只读音量包络（ffmpeg 解码 + 简单计算），自检不渲染，审片页用 Remotion 截静帧。读音核查 `audit.py` 用 Whisper，仍按全局规则经 `/usr/bin/python3 /Users/wzz122/.local/bin/mac-heavy-job.py --` 串行跑。
