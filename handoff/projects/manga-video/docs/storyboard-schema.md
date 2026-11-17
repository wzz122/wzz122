# 漫画对谈视频 · 分镜格式说明（storyboard.json）

这份说明写给「帮我写分镜的人或 AI」。按这个格式写好 JSON，放到 `episodes/<期名>/storyboard.json`，流水线就能自动配音、对口型、加字幕、出片。

- 一期 = 一个 JSON 文件。整体结构：`episode`（这一期的设置）+ `cuts`（一格一格的镜头，按播放顺序排）。
- 时间不用自己算：每句台词多长由配音决定，流水线会自动排。你只管「谁在什么场景说什么、做什么表情、出什么效果」。
- 只能用下面列出的取值。写错时 `npm run tts` 会用中文指出是第几个镜头的哪个字段。

---

## 1. 最外层

```json
{
  "schemaVersion": 1,
  "episode": { ... },
  "cuts": [ { ... }, { ... } ]
}
```

## 2. episode：这一期的设置

| 字段 | 必填 | 说明 | 例子 |
|---|---|---|---|
| `id` | 是 | 期名，和文件夹名一致，只用英文、数字、横线 | `"ep01-furusato"` |
| `title` | 是 | 标题（只给人看） | `"故乡税到底划不划算"` |
| `width` / `height` | 否 | 画面尺寸，默认 1920 × 1080 | `1920` |
| `fps` | 否 | 每秒帧数，默认 30 | `30` |
| `defaultPause` | 否 | 句与句之间默认停几秒，默认 0.25 | `0.25` |
| `bgm` | 否 | 背景音乐列表，见下 | |

`bgm` 每一项：

| 字段 | 必填 | 说明 |
|---|---|---|
| `file` | 是 | `assets/` 下的路径，可以不写扩展名，例如 `"bgm/daily_comedy"` |
| `fromCut` / `toCut` | 否 | 从哪个镜头放到哪个镜头（填镜头 id），不写 = 整期 |
| `volume` | 否 | 音量 0–1，默认 0.25 |
| `duckVolume` | 否 | 有人说话时压低到多少，默认 volume × 0.35 |

音乐不够长会自动循环；有人说话时自动压低，说完自动回来。

## 3. cuts：每一格镜头

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 镜头编号，整期不能重复，建议 `c01`、`c02`…… |
| `note` | 否 | 给人看的备注，不影响画面 |
| `background` | 否 | 背景图名，对应 `assets/backgrounds/<名字>.png`，例如 `"office"` |
| `shot` | 否 | 景别：`"wide"`（全景，默认）或 `"closeUp"`（特写，角色放大到上半身占满画面） |
| `camera` | 否 | 镜头运动，见 3.1 |
| `characters` | 否 | 这一格里出现的角色，见 3.2 |
| `props` | 否 | 道具图，见 3.3 |
| `lines` | 否 | 台词，按说话顺序排，见 3.4 |
| `sfx` | 否 | 额外的效果音，见 3.5 |
| `transition` | 否 | 这一格怎么从上一格切过来：`"cut"`（直接切，默认）、`"fade"`（淡入）、`"slide"`（从右边滑进来）。也可以写 `{ "type": "fade", "duration": 0.6 }` 指定秒数 |
| `titleCard` | 否 | 大字标题卡，见 3.6。有它时这一格只显示标题卡 |
| `duration` | 否 | 这一格至少几秒。没有台词的镜头必须写（不写默认 2 秒） |
| `leadIn` | 否 | 镜头开始后等几秒再开口，默认 0.3（有角色进场时 0.55） |
| `tail` | 否 | 最后一句说完后再停几秒，默认取最后一句的停顿，至少 0.2 |

### 3.1 camera：镜头运动

| 字段 | 取值 | 说明 |
|---|---|---|
| `type` | `static` / `zoomIn` / `zoomOut` / `panLeft` / `panRight` | 不动 / 慢慢推近 / 慢慢拉远 / 镜头往左移 / 镜头往右移 |
| `strength` | 0–0.3，默认 0.08 | 力度。0.05 很轻，0.12 明显，0.2 很猛 |
| `focus` | `left` / `center` / `right` | 推近时往哪边推，默认 `center` |

运动从镜头开始持续到镜头结束，速度先慢后快再慢。

### 3.2 characters：这一格里的角色

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | 角色 id：`gyudon`（牛丼老师）、`cheese`（芝士）、`tanaka`（田中）。新角色要先在 `config/characters.json` 登记 |
| `expression` | 否 | 开场表情，不写用该角色的默认表情 |
| `position` | 否 | `left` / `center` / `right`，默认 `center` |
| `x` | 否 | 精确横向位置，0（最左）到 1（最右），写了就不看 position |
| `enter` | 否 | 进场方式：`none`（一开始就在，默认）、`slideIn`（从画面外滑进来）、`pop`（弹出来） |
| `at` / `atLine` / `atText` / `offset` | 否 | 什么时候进场，见第 4 节。不写 = 镜头一开始 |
| `flip` | 否 | `true` 左右翻转 |

现有表情（写别的会报提醒，并退回默认表情）：

| 角色 | 表情 id |
|---|---|
| `gyudon` 牛丼老师 | `calm` 平静、`smug` 得意 |
| `cheese` 芝士 | `normal` 普通、`speechless` 无语、`panic` 慌张、`surprised` 吃惊 |
| `tanaka` 田中 | `happy` 开心、`smug` 得意 |

想加新表情：在 `config/characters.json` 的 `expressions` 里加一行，再准备对应的三张图（见 `docs/asset-prompts.md`）。

画面规则：同一格里有两个以上角色时，没在说话的那个会自动变暗；说话的人嘴巴跟着声音动、身体轻轻上下弹，每隔 3–6 秒眨一次眼。

### 3.3 props：道具图

| 字段 | 必填 | 说明 |
|---|---|---|
| `image` | 是 | 道具图名，对应 `assets/props/<名字>.png` |
| `position` 或 `x` | 否 | 横向位置，同上 |
| `y` | 否 | 纵向位置，0（最上）到 1（最下），默认 0.45 |
| `size` | 否 | 宽度占画面宽度的比例，默认 0.18 |
| `appear` | 否 | 出现方式：`pop`（弹出，默认）、`fade`（淡入）、`slideUp`（从下往上）、`none` |
| `at` / `atLine` / `atText` / `offset` | 否 | 什么时候出现，见第 4 节 |

### 3.4 lines：台词

| 字段 | 必填 | 说明 |
|---|---|---|
| `speaker` | 是 | 说话人的角色 id |
| `text` | 是 | 字幕上显示的文字 |
| `ttsText` | 否 | 送去配音的文字。数字、英文、容易读错的词在这里改写，例如字幕写「500 万」，这里写「五百万」。不写 = 用 text |
| `lang` | 否 | `zh`（中文，默认）或 `ja`（日语） |
| `subtitleZh` | 日语台词必填 | 日语台词下面显示的中文字幕 |
| `kind` | 否 | `say`（说出口，默认）或 `thought`（心声：字幕加括号、名牌显示「（心声）」） |
| `expression` | 否 | 说这句时换成这个表情，之后一直保持，直到下一次换 |
| `fx` | 否 | 效果，可以写一个或一组：`"sweat"` 或 `["shake", "exclaim"]`，见下表 |
| `emotion` | 否 | 只对 MiniMax 配音有效的语气：`happy` / `sad` / `angry` / `fearful` / `disgusted` / `surprised` / `calm` / `whisper`。一般不写，模型会自己判断 |
| `pauseAfter` | 否 | 这句说完停几秒，默认用 `episode.defaultPause` |

fx 效果：

| 值 | 画面 | 持续 |
|---|---|---|
| `sweat` | 头上冒汗珠 | 整句 |
| `exclaim` | 头上弹出红色「！」 | 约 1.3 秒 |
| `question` | 头上弹出「？」 | 约 1.3 秒 |
| `angry` | 头上出现生气的十字青筋 | 整句 |
| `sparkle` | 头旁边闪星星 | 整句 |
| `shake` | 整个画面抖 0.3 秒 | 0.3 秒 |

效果在这句台词开始时出现。图标都显示在说话人的头上；说话人不在画面里时显示在画面上方中间。

字幕规则：中文长句会在句号、逗号处自动拆成几段依次显示，每段大约 22 个字以内。所以 `text` 里正常使用中文标点就行，不要手动换行。

### 3.5 sfx：额外效果音

```json
"sfx": [ { "file": "sfx/door_open", "atLine": 1, "offset": -0.2, "volume": 0.8 } ]
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `file` | 是 | `assets/` 下的路径，可以不写扩展名 |
| `at` / `atLine` / `atText` / `offset` | 否 | 什么时候响，见第 4 节 |
| `volume` | 否 | 0–1，默认 0.7 |

常用的效果音不用手写：角色 slideIn/pop 进场、道具弹出、各种 fx、标题卡、滑动转场，都会按 `config/sfx-defaults.json` 自动配上（文件放进 `assets/sfx/` 就有声音，没放就安静）。

### 3.6 titleCard：大字标题卡

```json
{ "id": "c07", "duration": 3.2, "titleCard": { "text": "故乡税：", "sub": "2,000 日元换一箱螃蟹？", "animation": "pop" } }
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `text` | 是 | 大标题（建议 8 个字以内） |
| `sub` | 否 | 副标题，在大标题下面稍晚滑入 |
| `animation` | 否 | `pop`（弹出，默认）或 `none` |
| `color` | 否 | 大标题颜色，默认橙色 `#E8743B` |

标题卡自带方格纸背景，不需要 `background`，记得写 `duration`。

## 4. 时机写法（进场、道具、效果音通用）

四个字段可以组合，按这个优先顺序取一个起点，再加 `offset`：

| 写法 | 意思 | 例子 |
|---|---|---|
| `"atLine": 1` | 本镜头第 2 句台词开始时（从 0 数） | 第二个人一开口道具就弹出来 |
| `"atText": "十公斤大米"` | 台词里说到这几个字的时候（按读音位置自动估算） | 说到「十公斤大米」时米袋弹出来 |
| `"at": 1.5` | 本镜头开始后 1.5 秒 | |
| `"offset": 0.3` | 在上面的起点基础上再往后挪 0.3 秒（可以是负数） | |

都不写 = 镜头一开始。

## 5. 写分镜的注意事项（给 AI 的规则）

1. 只用本说明列出的字段和取值，不要自己发明字段。
2. 每格镜头建议 1–3 句台词；换场景（背景变了）时用 `"transition": "fade"`。
3. 同一格里最多放 2 个角色，位置用 `left` 和 `right`；特写（`closeUp`）只放 1 个角色，位置用 `center`。
4. 说话人最好在这一格的 `characters` 里。不在的话就是画外音：有声音、有字幕，但画面里没人张嘴。
5. 日语台词一定要写 `lang: "ja"` 和 `subtitleZh`。
6. 中文台词里的数字：`text` 用阿拉伯数字（好看），`ttsText` 写成汉字读法（「500 万」→「五百万」，「2,000 日元」→「两千日元」）。
7. 中文台词里夹的日语税务词（源泉徴収票、確定申告……）直接写汉字，读音交给 `config/pronunciation.yaml` 处理，不用写进 ttsText。
8. 表情跟着情绪换：用 `lines[].expression` 在开口那一刻换表情，比在 `characters` 里写死更生动。
9. 一期的最后可以放一格 `titleCard`。

## 6. 完整示例（试作冷开场，即 `episodes/pilot/storyboard.json`）

```json
{
  "schemaVersion": 1,
  "episode": {
    "id": "pilot",
    "title": "故乡税：2,000 日元换一箱螃蟹？（冷开场试作）",
    "width": 1920,
    "height": 1080,
    "fps": 30,
    "defaultPause": 0.25,
    "bgm": [
      { "file": "bgm/daily_comedy", "fromCut": "c01", "toCut": "c06", "volume": 0.28 }
    ]
  },
  "cuts": [
    {
      "id": "c01",
      "note": "办公室。田中炫耀螃蟹，芝士无语",
      "background": "office",
      "camera": { "type": "zoomIn", "strength": 0.06 },
      "characters": [
        { "id": "tanaka", "expression": "happy", "position": "left" },
        { "id": "cheese", "expression": "speechless", "position": "right" }
      ],
      "props": [
        { "image": "crab_box", "x": 0.42, "y": 0.6, "size": 0.2, "appear": "pop", "atLine": 0, "offset": 0.3 }
      ],
      "lines": [
        {
          "speaker": "tanaka",
          "lang": "ja",
          "text": "見て見て、今年もカニ届いた！",
          "subtitleZh": "快看快看，今年的螃蟹也到了！",
          "expression": "happy"
        },
        {
          "speaker": "cheese",
          "lang": "zh",
          "text": "又是螃蟹……上周是和牛，上上周是大米。你家是开超市的吗？",
          "expression": "speechless"
        }
      ]
    },
    {
      "id": "c02",
      "note": "田中特写，得意",
      "background": "office",
      "shot": "closeUp",
      "camera": { "type": "zoomIn", "strength": 0.04 },
      "characters": [
        { "id": "tanaka", "expression": "smug", "position": "center" }
      ],
      "lines": [
        {
          "speaker": "tanaka",
          "lang": "ja",
          "text": "ふるさと納税だよ。実質2,000円！",
          "subtitleZh": "是故乡税啦。实际只花 2,000 日元！",
          "expression": "smug",
          "fx": "sparkle"
        }
      ]
    },
    {
      "id": "c03",
      "note": "芝士特写，慌张的心声",
      "background": "office",
      "shot": "closeUp",
      "camera": { "type": "zoomIn", "strength": 0.12 },
      "characters": [
        { "id": "cheese", "expression": "panic", "position": "center" }
      ],
      "lines": [
        {
          "speaker": "cheese",
          "lang": "zh",
          "kind": "thought",
          "text": "两千日元？税我也交得一样多啊……为什么只有我什么都没有？",
          "expression": "panic",
          "fx": "sweat"
        }
      ]
    },
    {
      "id": "c04",
      "note": "教室。牛丼老师滑入登场",
      "background": "classroom",
      "transition": "fade",
      "camera": { "type": "static" },
      "characters": [
        { "id": "gyudon", "expression": "calm", "position": "center", "enter": "slideIn" }
      ],
      "lines": [
        { "speaker": "gyudon", "lang": "zh", "text": "因为你没用故乡税。", "expression": "calm" }
      ]
    },
    {
      "id": "c05",
      "note": "两人同框，芝士吓一跳",
      "background": "classroom",
      "camera": { "type": "static" },
      "characters": [
        { "id": "cheese", "expression": "surprised", "position": "left" },
        { "id": "gyudon", "expression": "calm", "position": "right" }
      ],
      "lines": [
        {
          "speaker": "cheese",
          "lang": "zh",
          "text": "牛丼老师！？你什么时候在的？",
          "expression": "surprised",
          "fx": ["shake", "exclaim"]
        }
      ]
    },
    {
      "id": "c06",
      "note": "牛丼老师特写，抛出本期问题",
      "background": "classroom",
      "shot": "closeUp",
      "camera": { "type": "zoomIn", "strength": 0.05 },
      "characters": [
        { "id": "gyudon", "expression": "smug", "position": "center" }
      ],
      "props": [
        { "image": "rice", "x": 0.2, "y": 0.4, "size": 0.17, "appear": "pop", "atText": "十公斤大米" },
        { "image": "wagyu", "x": 0.8, "y": 0.4, "size": 0.17, "appear": "pop", "atText": "一公斤和牛" }
      ],
      "lines": [
        {
          "speaker": "gyudon",
          "lang": "zh",
          "text": "同样年收 500 万，人家每年花 2,000 日元，拿回十公斤大米、一公斤和牛。今天就把这笔账算给你看。",
          "ttsText": "同样年收五百万，人家每年花两千日元，拿回十公斤大米、一公斤和牛。今天就把这笔账算给你看。",
          "expression": "smug",
          "pauseAfter": 0.5
        }
      ]
    },
    {
      "id": "c07",
      "note": "标题卡",
      "duration": 3.2,
      "titleCard": { "text": "故乡税：", "sub": "2,000 日元换一箱螃蟹？", "animation": "pop" }
    }
  ]
}
```

## 7. 写完以后

```bash
npm run tts -- --episode <期名>        # 配音（改了哪句只重配哪句）
npm run analyze -- --episode <期名>    # 排时间线、算口型、出 SRT 字幕
npm run render -- --episode <期名>     # 出 out/<期名>.mp4
```

要加新的背景、道具、表情：先跑 `npm run placeholders` 生成占位图，确认画面没问题，再按 `docs/asset-prompts.md` 的写法出真图替换。
