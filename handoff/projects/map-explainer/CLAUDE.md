# 地图解说视频项目规范（map-explainer）

参考风格：Wendao城市漫游——用地图讲城市历史、铁路、地形。每期都从一个旅行中的疑问开场，分章节讲清原因，最后回到实地体验收尾。

本文件是项目的规范，写稿、做画面、配音、混音、发布都按这里执行。

> **2026-10-29 起**：城市漫游这条线的总流程在技能 `city-walk-video`（`~/.claude/skills/city-walk-video/`）。分工：平面地图叙事和总装用模板-v6（已出片）；本项目只负责**立体地形、俯仰、转动、飞行**这类真三维镜头，渲成无字 MP4 再放进 v6 叠字。线条和标签样式以技能里的「看原片后的修正表」为准（3–4 px 细线、无白边、衬线小标签），它优先于下面 3.4 的「8 px + 白描边」。立体镜头的画法、相机参数和验收见技能 `references/02-立体地形与运镜.md`。

---

## 0. 硬规则（先读）

1. **花钱的调用要先确认。** MiniMax 配音和配乐按量计费。每次先跑 `--dry-run` 看分段、字数和估价，用户确认后再正式调用。
2. **不在本项目里写死密钥。** 密钥只放 `.env`（已在 .gitignore 中）或环境变量。不要把密钥打印出来、写进日志，也不要提交。
3. **所有素材都要核实许可。** 没核实的素材在 `credits.md` 标「待核实」，不能进成片。
4. **AI 合成要标注。** 配音、配乐用了 MiniMax，发布时在简介和片尾写明「旁白 / 配乐为 AI 合成」。
5. **16 GB Mac 的内存限制。** 本项目本身不需要跑本地模型。如果要用 Whisper 做字幕对齐，同一时间只跑一个，并通过 `/usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- <命令>` 启动。HyperFrames（Chrome）渲染也一次只跑一个，不要与 Resolve 渲染同时进行。
6. **事实要有出处。** 年份、海拔、里程、人口等数字都要在稿子旁边或 `credits.md` 的「资料来源」里写清来源。查不到的写「待核实」，不要编造。

---

## 1. 选题公式

> **旅行疑问 + 地图反差 + 历史原因**

| 要素 | 要回答的问题 | 例子 |
|---|---|---|
| 旅行疑问 | 游客在当地会碰到什么「奇怪」的事？ | 为什么名古屋站离名古屋城这么远？ |
| 地图反差 | 地图上能直接看到什么对比？ | 车站在老城西边的低地，城堡在台地边缘 |
| 历史原因 | 背后是地形、铁路、战争、政策还是商业？ | 1886 年铺铁路时避开城下町，选了便宜的低湿地（**待核实**） |

选题自查：

- 用一句话能把疑问说清吗？（钩子必须短于 15 秒）
- 地图能**直接看出**反差吗？（只能靠文字解释的选题不适合这个频道）
- 至少有 2 个可核实的历史资料来源吗？
- 有可用的老地图（公有领域或许可清楚）吗？
- 能拍到或者描述亲身体验吗？（坐那条线、走那段坡）

标题模板：`为什么<城市/车站>的<设施>在<反常位置>？`、`<城市>的<铁路/河流>为什么要绕这么一大圈？`、`<A地>和<B地>只隔<距离>，为什么<差异>？`

---

## 2. 章节结构（成片 10–13 分钟）

| 段落 | 时长 | 内容 | 常用组件 |
|---|---|---|---|
| S01 钩子问题 | **≤15 s** | 直接抛出疑问，画面同时给出地图反差。先不讲答案 | `big-title-cover` → `map-flyto` |
| S02 背景 | 60–90 s | 城市在哪儿、怎么到、现在什么样；交代后面需要用到的地理概念 | `map-flyto`、`terrain-compare` |
| S03–S06 正文 2–4 章 | 每章 2–3 min | 每章回答一个子问题，用 `chapter-card` 开头。按「现象 → 证据（老地图/地形/资料）→ 结论」推进 | `chapter-card`、`line-draw`、`old-vs-new`、`terrain-compare` |
| 亲身体验 | 60–120 s | 实地走、坐车、看到的细节；可以用实拍或照片配地图定位 | 实拍 + `map-flyto` 小地图 |
| 总结 + 留言引导 | 30–45 s | 一句话回答开头的疑问，再把结论推广到其他城市；最后抛一个留言问题（例如「你的城市车站离老城远吗？」） | `big-title-cover`（回扣开头） |

段落编号与 `script.md` 中的 `## S01`、`## S02` 等一一对应。配音按段生成，时间线也按段对齐。

**字数预算**：中文旁白约 4–4.5 字/秒。11 分钟约 2,800–3,000 字（不含停顿），可用 `scripts/minimax_tts.py --dry-run` 核对。

写稿要点：

- 每段第一句交代这一段要回答的问题，最后一句为下一段留个钩子。
- 一个画面只讲一件事。地图上同时高亮的元素不要超过 3 个。
- 数字要配参照物，例如「高差 20 米 ≈ 7 层楼」。
- 停顿写成 `<#0.5#>`（秒），用在反差揭晓前和章节切换处。

---

## 3. Motion spec

### 3.1 画布

- 1920×1080，30 fps，SDR / Rec.709。
- 安全区：左右 96 px，上下 64 px。字幕区为底部 160 px，不放关键信息。
- 设计变量统一放在 `components/_shared/tokens.css`。JS 里用到的颜色在 `components/_shared/map-runtime.js` 的 `TOKENS` 中，两边改动要同步。

### 3.2 配色

| 名称 | 色值 | 用途 |
|---|---|---|
| paper | `#F4EFE6` | 背景、卡片底 |
| ink | `#1E2A32` | 正文、标题 |
| ink-soft | `#5B6670` | 次要文字、注释 |
| accent | `#D8452F` | 唯一强调色：疑问、关键地点、答案 |
| accent-2 | `#F2A33A` | 第二强调（少用） |
| highlight | `#FFE36E` | 标题关键词底色块 |

### 3.3 地图配色

| 要素 | 色值 | 说明 |
|---|---|---|
| 陆地 | `#EEE8DA` | 暖米色，与 paper 统一 |
| 水体 | `#AFCBD8` | 灰蓝，饱和度要低 |
| 绿地 | `#A9BF94` | |
| 山地/陰影 | `#C9B79C` | 国土地理院陰影起伏図叠加，透明度 0.45–0.6 |
| 道路 | `#FFFFFF` / `#E2DACB` | 弱化处理，不要抢线路的视觉 |
| 标注文字 | ink-soft，描边 paper | 只保留讲解需要的地名，其他可以隐藏 |

底图默认 OpenFreeMap `positron`（素），需要更多细节时用 `liberty`。

### 3.4 线路色

| 类型 | 色值 | 线型 |
|---|---|---|
| 新干线 | `#1F63B5` | 实线 8 px + 白色描边 |
| JR / 国铁干线 | `#2E8B57` | 实线 6 px |
| 私铁 | `#7B4FB0` | 实线 5 px |
| 地铁 | `#E07B24` | 实线 5 px |
| 路面电车 | `#C2407A` | 实线 4 px |
| 废线 | `#8E8E8E` | 虚线 `[2,1.5]` |
| 规划未建 | `#B0B0B0` | 点线 `[0.5,1.5]` |
| 本期主角线路 | accent `#D8452F` | 实线 8 px，可以覆盖以上颜色 |

讲具体城市时可以改用运营商的官方线路色，但每期都要在 `shot-list.md` 里写明用的是哪套颜色。

### 3.5 字体（只用 OFL / 可商用字体）

| 用途 | 字体 | 字重 |
|---|---|---|
| 大标题 / 章节卡 | Noto Serif SC（思源宋体） | 900 |
| 正文 / 标注 | Noto Sans SC（思源黑体） | 500 / 700 |
| 日文地名 | Noto Sans JP | 500 |
| 数字 / 年份 | Barlow Condensed | 600 |

渲染前把字体文件放到本地（`assets/fonts/`），用 `@font-face` 引用，保证逐帧渲染结果一致。CDN 字体只在预览时使用。

### 3.6 缓动与时长

| 动作 | 缓动 | 时长 |
|---|---|---|
| 镜头移动（同城） | `power2.inOut` | 2.5–4 s |
| 镜头跨城飞行 | `power2.inOut` + 中途拉远（arc 2–4 级缩放） | 4–6 s |
| 线路绘制 | `power1.inOut` | 每 100 km 约 1.5 s，单条线 1.5–5 s |
| 文字入场 | `power3.out` | 0.5–0.7 s，逐字间隔 0.03 s |
| 文字出场 | `power2.in` | 0.3–0.4 s |
| 卷帘对比 | `power2.inOut` | 3–4 s，可以来回各一次 |
| 标注点弹出 | `back.out(2)` | 0.4 s |
| 章节卡 | 整体 3.5–4.5 s | 入场 0.8 s + 停留 ≥2 s + 出场 0.5 s |

- 文字停留时间 ≥ 字数 ÷ 6 秒，且不少于 2 秒。
- 禁止使用 `elastic`、`bounce`，禁止同一画面里两个大动作同时开始。
- 镜头移动一律由 GSAP 时间线驱动，每帧调用 `map.jumpTo`（见 4.2）。

---

## 4. 工具链

### 4.1 HyperFrames（画面）

- HyperFrames 用 HTML/CSS 和 GSAP 写画面，用无头浏览器逐帧截图，再由 FFmpeg 编码。
- 组合（composition）写法遵守 HyperFrames 合约：一个 paused 的 GSAP 时间线，时间可以任意 seek，渲染结果是确定的。具体规范见 `hyperframes-core` skill。
- `components/*/index.html` 是可单独打开预览的骨架。每个组件都暴露：
  - `window.__ready`：Promise，地图 load、字体和首帧瓦片都就绪后 resolve；
  - `window.__seek(t)`：async，跳到第 t 秒并**等待所有地图 idle** 后 resolve；
  - `window.__duration`：时长（秒）；
  - `window.__timeline`：GSAP 时间线。
- 预览直接打开 `index.html`，会循环播放。逐帧渲染时加 `?render`，时间线保持暂停，只由 `__seek` 驱动。
- 参数可以写在顶部的 `CONFIG` 对象里，也可以用 `<body data-config='{…}'>` 或 `?config=<urlencoded JSON>` 覆盖，后两者会深合并进 CONFIG。

### 4.2 MapLibre GL JS + OpenFreeMap

- 底图样式用 `https://tiles.openfreemap.org/styles/{positron|liberty|bright}`，免 key。
- 署名：`OpenFreeMap © OpenMapTiles Data from OpenStreetMap`，OSM 数据适用 ODbL。片尾和简介都要写。
- **确定性逐帧渲染**：
  1. **不要用 `flyTo` / `easeTo`。** 它们的动画依赖真实时钟，逐帧截图会不确定。
  2. GSAP 时间线 tween 一个相机代理对象 `{lng, lat, zoom, bearing, pitch}`，在 `onUpdate` 里调用 `map.jumpTo(cam)`。`MapRuntime.addCameraMove` 已经实现了这一步（含飞行的拉远弧线 `arc`）。
  3. 截帧前等地图 idle：`map.loaded() && map.areTilesLoaded() && !map.isMoving()`，或者收到 `idle` 事件，然后再等 2 个 rAF。`MapRuntime.waitMapIdle` 已实现，并带超时告警。
  4. 地图选项：`fadeDuration: 0`（标注不淡入）、`interactive: false`、`canvasContextAttributes.preserveDrawingBuffer: true`。
  5. 中日文字由本地字体渲染（`localIdeographFontFamily`），渲染机上需要装好对应字体。
- CDN 版本：开发阶段用 `maplibre-gl@5`。定版渲染前改成具体版本号，GSAP 已固定为 `3.13.0`。

### 4.3 地形：国土地理院（GSI）

- 陰影起伏図（栅格）：`https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png`，叠加在底图上方、标注下方。
- 標高タイル（DEM PNG）：`https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png`。编码方式是 GSI 自有的，`map-runtime.js` 用 `addProtocol('gsidem')` 在浏览器里转成 terrarium 格式，再交给 MapLibre 的 3D 地形使用。
- 只覆盖日本。署名写「出典：国土地理院」，按 [国土地理院コンテンツ利用規約] 使用。具体条款和是否需要申请，**每期都要核对**，在 credits.md 中记录核实日期。
- 浏览器端跨域（CORS）是否可用：**待核实**，首次使用时实测。

### 4.4 老地图

- 只用公有领域或许可明确允许商用的老地图。来源举例（每张都要逐一核实许可）：
  - Wikimedia Commons：看文件页的许可模板。
  - 美国国会图书馆 Library of Congress：多数标注 "No known restrictions"，逐张核实。
  - 国立国会図書館デジタルコレクション：看「保護期間満了」或「インターネット公開（保護期間満了）」标记。
  - David Rumsey Map Collection：多为 CC BY-NC-SA，**有商用限制**，开启收益的频道默认不用。
  - 国土地理院 旧版地図：使用条件**待核实**。
- 老地图做地理配准时，在 credits.md 记录 4 个角的经纬度和配准方法。

### 4.5 音效

- 只用 Kenney（CC0）和 Freesound 上标为 **CC0** 的音效。Freesound 每个文件的许可不同，下载前看文件页面。CC BY 的音效可以用，但必须署名；CC BY-NC 不用。
- 在 credits.md 记录每个音效的 URL 和许可。

### 4.6 配音和配乐：MiniMax（见第 6 节）

### 4.7 混音：`scripts/mix.sh`（FFmpeg）

- 配音按 `timeline.json` 定位；BGM 循环或裁剪到视频长度，以配音为侧链做 `sidechaincompress` 自动压低（ducking）；可选 `audio/sfx/cues.csv` 音效；最后整体 `loudnorm` 到 **-16 LUFS**、真峰值 -1.5 dBTP。

---

## 5. 授权规则

1. **每个素材进入项目前**，都在 `episodes/<ep>/credits.md` 记录：名称、作者或机构、来源 URL、许可、是否允许商用、署名要求、核实日期、状态（✅已核实 / ⚠️待核实 / ❌不可用）。
2. 状态为「待核实」的素材**不进成片**。实在需要，用占位图并在 shot-list 中标红。
3. 片尾字幕和视频简介都要列出署名，文本由 credits.md 末尾的「简介署名」和「片尾署名」两块生成。
4. 地图数据和资料引用的文字，也一并列在 credits.md 的「资料来源」里。
5. 不使用他人视频的画面或截图，参考视频只学结构。
6. AI 合成声明：旁白（MiniMax TTS）、配乐（MiniMax Music）。

---

## 6. MiniMax 配音和配乐

### 6.1 环境变量（`.env`，参考 `.env.example`）

| 变量 | 说明 |
|---|---|
| `MINIMAX_API_KEY` | 必填，只放 .env 或环境变量 |
| `MINIMAX_REGION` | `global` → `https://api.minimax.io`；`cn` → `https://api.minimaxi.com`。默认 `global` |
| `MINIMAX_GROUP_ID` | 可选，填写后会加 `?GroupId=` |
| `MINIMAX_VOICE_ID` | 系统音色 ID，或者**用户本人**的克隆音色 ID |
| `MINIMAX_TTS_MODEL` | 默认 `speech-2.8-hd` |
| `MINIMAX_MUSIC_MODEL` | 默认 `music-3.0` |

### 6.2 配音流程

1. 定稿 `script.md`，所有段落都以 `## S01 标题` 这样的格式开头。旁白写成普通段落，画面提示写成 `> 画面：…`。
2. 估价：`python3 scripts/minimax_tts.py episodes/<ep>/script.md --dry-run`。会打印每段字数、停顿、预计时长和费用（按 $100 / 百万字符估算）。
3. 用户确认后正式生成：`python3 scripts/minimax_tts.py episodes/<ep>/script.md`
   - 每段输出 `audio/vo/S01.mp3`，以及 `S01.json`（时长、trace_id、文本哈希）。
   - 文本没有变化的段落会跳过，不会重复扣费。要强制重做用 `--force`，只做某几段用 `--only S03,S05`。
   - 最后写出 `audio/vo/timeline.json`，记录每段的 start、duration、end（秒）和 start_frame。段间间隔默认 0.6 s，可以用 `--gap` 统一设置，也可以按段写 `<!-- tts: gap=1.2 -->`。
4. 只改了间隔、想重排时间线，不重新合成：`--timeline-only`。
5. HyperFrames 组合按 `timeline.json` 的 start 和 duration 安排各段画面。
6. 段内参数写成 `<!-- tts: speed=1.05 emotion=calm gap=1.0 -->`，放在段标题下面。
7. **音色限制**：只用 MiniMax 系统音色，或者用户本人声音的克隆。不克隆他人声音。克隆的 voice_id 连续 7 天不用会被删除，首次使用时收费 $1.5。
8. 发布时标注「旁白为 AI 合成（MiniMax）」。

### 6.3 配乐流程

- 官方公告：**2026-08-20 起，音乐付费 API 不再向新用户开放，free 版下线**，只有老付费用户能继续调用 `/v1/music_generation`。
- 老付费用户：`python3 scripts/minimax_music.py --episode episodes/<ep> --prompt "calm lo-fi city documentary, no vocals" --dry-run`，确认后去掉 `--dry-run` 再跑。
- 其他用户：在 MiniMax Audio 网页版（https://www.minimax.io/audio）手动生成，下载后放进 `episodes/<ep>/audio/bgm/`。也可以自托管开源的 MiniMax Music 3，但需要 NVIDIA GPU，这台 Mac 跑不了。
- 风格参考：`calm lo-fi city documentary, warm piano, soft vinyl texture, 80 bpm, no vocals, loopable`。章节内容紧张时可以换成 `minimal ambient, light percussion`。

---

## 7. 每期目录结构

```
episodes/<ep>/
  script.md        # 分段稿（## S01 …）
  shot-list.md     # 镜头表
  credits.md       # 素材与授权
  compositions/    # HyperFrames 组合
  assets/          # 老地图、照片、GeoJSON、字体
  audio/vo/        # 配音 + timeline.json（不进 git）
  audio/bgm/       # 配乐（不进 git）
  audio/sfx/       # 音效 + cues.csv（不进 git）
  renders/         # video.mp4、final.mp4（不进 git）
```

## 8. 出片检查清单

- [ ] 钩子 ≤ 15 秒，疑问在第一句就出现
- [ ] 总时长 10–13 分钟
- [ ] credits.md 中没有「待核实」的素材进入成片
- [ ] 片尾署名、简介署名、AI 合成声明都齐了
- [ ] 成片响度 -16 LUFS ±1（`mix.sh --check`）
- [ ] 抽查 10 帧：瓦片都加载完整，没有空白块，标注没有半透明
- [ ] 字幕不压画面上的关键信息
