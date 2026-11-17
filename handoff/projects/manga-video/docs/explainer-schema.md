# 图解模板分镜格式（explainer）

单人主讲 + 图解。分镜文件放在 `episodes/<期名>/storyboard.json`，完整示例见 `episodes/pilot-explainer/storyboard.json`。

```
npm run render:explainer          # 配音 → 时间轴 → 渲染，输出 out/pilot-explainer.mp4 和 .srt
npm run build:explainer           # 只做配音和时间轴（改了台词先跑这个）
node pipeline/render.mjs pilot-explainer --stills   # 只截每个组件的关键帧
npm run studio                                      # 在浏览器里预览（漫画版、图解版都在）
```

## 整体结构

```jsonc
{
  "template": "explainer",
  "title": "年收 500 万，故乡税到底能省多少？",
  "emphasisTerms": ["会社员", "大阪市"],   // 本期额外要在字幕里自动高亮的词
  "timing": { "linePause": 0.35 },          // 可选：改默认停顿（秒）
  "sfxVolume": 1,                            // 可选：效果音整体音量
  "segments": [ /* 一段 = 一张图解 */ ]
}
```

### segment（段）

| 字段 | 说明 |
|---|---|
| `chapter` | 顶部章节条的文字 |
| `label` | 顶部橙色小标签，例如「① 住民税」，可省略 |
| `visuals[]` | 这一段的图解组件（见下） |
| `lines[]` | 这一段的台词，按顺序念 |
| `lead` | 可选，这一段开头的空白秒数，默认 0.35 |

### line（台词）

| 字段 | 说明 |
|---|---|
| `speaker` | 角色 id，对应 `config/characters.json`（`gyudon` 牛丼老师 / `cheese` 芝士） |
| `text` | 字幕文字。用 `**双星号**` 标出要高亮的词，老师说到这里会抬手「指」一下 |
| `ttsText` | 可选，配音念的文字。不写时自动用 `text`，先套 `config/lexicon.json`，再套共用的 `config/pronunciation.yaml` |
| `expression` | 老师表情：`normal` `smile` `serious` `surprised`；漫画模板的 `calm` `smug` 也认 |
| `pauseAfter` | 这句之后停多少秒，默认 0.35 |
| `emphasis` | 可选，额外要高亮的词（数组），效果同 `**` |

数字、金额（如 `24 万日元`、`4,600`、`八倍多`）和 `lexicon.json` 里 `emphasisTerms` 列的术语，不用标也会自动高亮。

### visual（图解组件）

```jsonc
{
  "id": "calc",                 // 可选，被别的组件引用时才需要
  "type": "calculation",        // 组件类型，见下表
  "data": { ... },              // 组件内容
  "enter": { "line": 0 },       // 什么时候出现，可省略（默认第 0 句开口前 0.25 秒）
  "steps": [ ... ]              // 组件里每一步什么时候出现，可省略（自动分布）
}
```

## 两种触发方式

`enter` 和 `steps` 里的每一项都是一个「触发点」，有两种写法：

**1. 按台词触发**：跟着某一句、某个词出现

| 写法 | 意思 |
|---|---|
| `1` 或 `{ "line": 1 }` | 第 1 句（从 0 数起）开口时 |
| `{ "line": 0, "word": "2,000" }` | 第 0 句念到「2,000」时（按字数比例估算） |
| `{ "line": 0, "at": "end" }` | 第 0 句念完时 |
| `{ "line": 0, "offset": 0.5 }` | 再往后推 0.5 秒（可以是负数，表示提前） |

**2. 按步骤触发**：跟着另一个组件的第几步出现

| 写法 | 意思 |
|---|---|
| `{ "after": "calc" }` | `calc` 组件出现时 |
| `{ "after": "calc", "step": 2 }` | `calc` 的第 2 步（从 0 数起）出现时 |
| `{ "after": "calc", "step": 2, "offset": 0.4 }` | 再晚 0.4 秒 |

`steps` 还可以写成 `{ "every": 0.5 }`，表示从出现起每 0.5 秒出一步。`steps` 没写满时，剩下的步骤自动在出现那句台词里均匀分布。

## 组件一览（全部用代码绘制）

| type | 步骤数 | data 示例 |
|---|---|---|
| `chapterTitle` 章节标题卡 | 1 | `{ "no": "03", "kicker": "算一笔账", "title": "第一行\n第二行", "tags": ["年收 500 万"] }` |
| `keyNumber` 关键数字 | 有 `sub` 时 2，否则 1 | `{ "label": "…", "value": 5.7, "decimals": 1, "unit": "万日元", "sub": "≈ 57,000 日元", "countDuration": 1.2 }` 第 0 步开始滚动，第 1 步出副文字 |
| `bulletReveal` 要点列表 | 条目数 | `{ "title": "三个要点", "items": ["…", { "text": "…", "icon": "✓" }] }` |
| `calculation` 算式 | 项数 + 1 | `{ "terms": [{ "value": "57,000", "label": "捐款" }, { "op": "−", "value": "2,000", "label": "自己负担" }], "result": { "value": "55,000", "label": "…" }, "unit": "日元" }` 最后一步出结果并响「叮」 |
| `compare` 左右对比 | 3 | `{ "left": { "title": "用", "tone": "good", "items": [] }, "right": { "title": "不用", "tone": "bad", "items": [] }, "highlight": { "left": [1], "right": [1] } }` 步骤：左卡、右卡、高亮差异 |
| `table` 表格 | 行数 + 高亮 + 角标 | `{ "columns": ["项目", "金额"], "rows": [["…", "57,000"]], "highlight": [2, 3], "callout": "约 8.5 倍" }` |
| `barChart` 横条图 | 条数 | `{ "title": "…", "unit": " 日元", "highlight": 1, "bars": [{ "label": "年收 500 万", "value": 57000 }] }` |
| `timeline` 时间轴 | 节点数 + 底部说明 | `{ "nodes": [{ "date": "2026 年", "label": "今年捐款" }], "footer": "每月少扣约 4,600 日元" }` |
| `iconGrid` 道具网格 | 道具数 | `{ "title": "…", "items": [{ "label": "大米 10 公斤", "img": "assets/props/rice.png", "glyph": "米" }] }` 找不到图时显示带字的占位块 |
| `warningBox` 注意事项 | 1 | `{ "level": "red", "title": "注意", "text": "…", "sub": "…" }`，`level` 可选 `red` / `yellow` |
| `cheeseCameo` 芝士插话 | 1 | `{ "line": 1, "side": "left" }`：在第 1 句（芝士的台词）前滑入，念完退出；气泡默认显示这句台词，可用 `"text"` 改 |

主画面同一时间只放一个组件：后出现的会替换前一个。`cheeseCameo` 是叠加层，可以和主组件同时出现。

## 画面布局（1920×1080，30fps）

- 顶部：章节条 + 段标签 + 进度点
- 中央：图解区（约 1400×700）
- 右下：牛丼老师半身像（口型跟配音、自动眨眼、说到 `**重点**` 时抬手）
- 底部：大字幕，白字深色描边，重点词黄字放大
- 芝士插话时，底部不再重复显示他的字幕，台词放在他的气泡里；.srt 里照常有这句

## 产物

| 文件 | 内容 |
|---|---|
| `public/episodes/<期名>/timeline.json` | 每帧该出什么：组件步骤、口型、字幕 |
| `public/episodes/<期名>/mix.wav` | 配音 + 效果音混好的音轨（−15 LUFS） |
| `out/<期名>.mp4` / `.srt` | 成片、字幕 |
| `out/<期名>-frames/` | 每个组件出完时的截图，用来快速检查 |
| `audio/` | 配音缓存（和漫画模板共用 `scripts/lib/tts.ts`）。改了哪句只重配哪句 |
