# 文章到视频：源码与交接包

整理日期：2026-11-17（Asia/Tokyo）。目标仓库：`wzz122/wzz122`；目标分支：`handoff-video`。

## 先读：接手顺序与交付边界

1. 通用主线优先接手 `projects/video-factory/`（第 4 节）：写稿 + 模板-v6 提供文章、配音、对齐、分镜、字幕和总装；税务/角色图解则接手 `projects/manga-video/` 的现行 Remotion 流水线。
2. `projects/map-explainer/` 是地图解说及镜头组件流水线。近期阿倍野、难波等地图片段在这里渲染；阿倍野制作说明证实完整长片在视频工厂组装，不能把地图片段当成完整长片。
3. 先处理本文的“云端缺口”，再跑短样片。此包是可继续开发的源码快照，**没有执行配音、渲染或整片验收，不是已在云端跑通的独立成片包**。
4. 这三组项目中的“文章 → 事实卡/分镜/场景”仍需要 AI/编辑生成结构化内容，代码负责后半程。没有发现一个可以直接把任意文章可靠地一键做成合格成片的总入口。
5. 本次只读查找原项目，随后在独立 `/tmp/video-handoff-20261117-52fho2h1/repo` 中整理。没有改原项目、运行原项目生产命令、调用付费模型、创建视频或自动发布。

完整文件清单见 [FILES.md](FILES.md)，来源/大小/哈希见 [SOURCE-MANIFEST.json](SOURCE-MANIFEST.json)，排除项见 [EXCLUSIONS.md](EXCLUSIONS.md)，检查结果见 [VALIDATION.md](VALIDATION.md)。给云端 Claude 的接手提示见 [CLAUDE.md](CLAUDE.md)。

## 1. 查找范围和候选清单

在 `/Users/wzz122` 下按交接文件名、Markdown 内容和流水线关键词检索，另按文件元数据查找 2026-08-17 起修改的 `.mp4`。跳过 Library、依赖、虚拟环境、Git 内部目录、缓存、应用素材库及代理会话缓存；初扫不跟随符号链接。之后用户明确允许读取桌面“视频工厂”和“写稿”指向的两个 Library/CloudStorage 项目目录；仅补查这两个目录，没有扩展到其他 Library 内容。没有修改文件来帮助查找，也没有运行可选的 `claude -p`：直接读取原文和代码，比再次让模型概括更容易核实，且不会触发候选项目的 hooks 或生成会话文件。

| 候选路径 | 最近修改（日本时间） | 用途与主要技术栈 | 选择 |
|---|---|---|---|
| `/Users/wzz122/video-projects/manga-video` | 源码/文档 2026-11-16 02:33:57 | 漫画对谈、单人图解、税务/不动产整期视频；Node 24、React/TypeScript、Remotion、MiniMax、FFmpeg、可选 Python/MLX Whisper | **入选：税务图解主线，复用代码与四组示例** |
| `/Users/wzz122/video-projects/map-explainer` | 源码/配置 2026-11-17 01:48:08；产物 03:36:57 | 城市历史/铁路地图解说与地图镜头；Python、MapLibre、GSAP、Playwright Chromium、FFmpeg、MiniMax，部分镜头为 3D 地图 | **入选：地图镜头模块，源码、模板与配置** |
| `/Users/wzz122/Desktop/视频工厂` + `/Users/wzz122/Desktop/写稿` | 文件元数据最新 2026-11-17 20:36:05 / 20:27:20（传真机在制文件）；所选源码各自时间见清单 | 完整文章/新闻解说流程；Python、Node、HTML/JS、隔离 Chromium、MiniMax、Whisper、FFmpeg；模板-v6 | **首选通用主线，用户授权读取后已打包** |
| `/Users/wzz122/video-projects/gushen-v2-xumu` | 2026-11-06 23:12:16 | 单期股神水谷序幕、HyperFrames HTML/GSAP；有成片，偏单段演示 | 未选；偏单期实现，通用主线已收录 |
| `/Users/wzz122/video-studio/test-video` | 2026-10-20 13:53:41 | HyperFrames 0.8.181 测试项目 | 未选；主要是测试与框架说明 |
| `/Users/wzz122/writing-studio` | 2026-10-24 12:10:09 | NotebookLM 调研、文章写作与风格资料 | 上游写稿候选，未发现独立完整渲染流水线 |
| `/Users/wzz122/Desktop/谜题解说` | 2026-10-01 01:12:52 | 20–30 分钟解说稿、证据卡；AGENTS 明确说配音和渲染流程尚未确定 | 未选 |
| `/Users/wzz122/Documents/核心项目/output/不露脸观点视频工作流-20260915` | 2026-09-15 13:01:15 | 文案、六段分镜 CSV、提示词及 Resolve/生成 API 的实施方案 | 早期方案，不能当作跑通的实现 |
| `/Users/wzz122/Movies/口播工作台` | 本次未汇总全目录时间；录像样例 2026-09-19 21:55:12 | OBS 真人朗读 + Resolve 剪辑/字幕 | 真人口播路径，不是本文的文章自动生成视频主线 |
| `~/ios/FanFan/videos/`、`~/Desktop/核心项目/AIcal/videos/`、`~/Documents/核心项目/TsuideClaude/videos/` 等 | 已找到 2026-10-21 成片 | App 宣传片，HyperFrames/录屏为主 | 未选，避免混入无关产品代码 |

“最近修改”来自文件 mtime，不是最近提交时间、最近使用时间或完成证明。体积统计（不含 node_modules/.git/链接目标）约为 manga-video 8.97 GB、map-explainer 4.05 GB；补查的工厂/写稿目录分别约 179.95 GB / 20.07 GB（逻辑文件大小，非实际占用）；本次只打包小型文本源码。

### 近期 MP4 目录证据

初扫共定位 71 个近三个月修改过 MP4 的目录；获准补查后，视频工厂另有 183 个、写稿另有 42 个（只看元数据）。与本次最相关的结果：

| 目录 | MP4 数量 | 最近 MP4 修改时间 |
|---|---:|---|
| `~/Desktop/视频工厂/样片/2026-11-17-阿倍野再开发/画面v6/渲染-繁体/接缝` | 12 | 2026-11-17 10:00:19 |
| `~/Desktop/视频工厂/样片/2026-11-17-阿倍野再开发/画面v6/镜头` | 215 | 2026-11-17 09:57:16 |
| `~/video-projects/map-explainer/episodes/abeno/renders` | 8 | 2026-11-17 03:36:55 |
| `~/video-projects/map-explainer/episodes/namba/renders` | 14 | 2026-11-16 13:16:25 |
| `~/video-projects/gushen-v2-xumu` | 1 | 2026-11-06 23:12:15 |
| `~/video-projects/map-explainer/episodes/test-s03/renders` | 2 | 2026-10-29 14:13:27 |
| `~/video-projects/map-explainer/episodes/test-s02/renders` | 1 | 2026-10-29 13:18:17 |
| `~/video-projects/manga-video/learning/2026-10-29-両学長-税务图解/样片` | 3 | 2026-10-29 11:46:28 |
| `~/video-projects/map-explainer/episodes/test-s01/renders` | 1 | 2026-10-29 01:23:00 |

`manga-video/out` 是符号链接，目标为 `/Volumes/Extreme SSD/MacBook归档/2026-11-13/manga-video-out`。没有跟随该链接检查外置盘，也没有上传其中的视频。原始视频、所有音频、模型、字体二进制、图片素材均不在本次包中。

## 2. 项目一：manga-video

### 2.1 路径、用途和各代入口

- 本机：`/Users/wzz122/video-projects/manga-video`。
- 包内：`handoff/projects/manga-video`。
- 包含三代代码，不要混用分镜格式：
  - 漫画对谈：`episodes/pilot/storyboard.json` + `scripts/*.ts` + `src/manga/`。
  - 早期单人图解：`episodes/pilot-explainer/storyboard.json` + `pipeline/build-explainer.mjs` + `src/explainer/`。
  - 当前税务/不动产整期：`lines.txt / script.json + states.md + scenes.mjs + visuals.json` + `pipeline/build-episode.mjs` + `src/episode/`。优先用这一代。

源码、模板、提示词、样式均保留。示例保留 `pilot`、`pilot-explainer`、`bank-shinkin` 和 `invoice-2026b`；其他成片期数没有整包复制。历史文章内的税务/利率数据只是原项目输入，**未在本次重新查证，不能直接视为当前政策或重新发布**。

### 2.2 流水线

| 环节 | 输入 → 输出 | 工具、参数与关键位置 |
|---|---|---|
| 文章与核实 | 用户文稿 → `facts.md`、官方资料、`states.md` | AI/编辑整理；每个上屏数字要有出处；一个状态只增加一个新信息和一个视线落点 |
| 分镜/台词 | `lines.txt` → `script.json`；另写 `scenes.mjs`、`visuals.json` | `T:` 老师，`C:` 芝士；`##` 分章；`{tts:...}` 只改变配音读法；模板在 `templates/tax-episode`、`templates/fudosan-episode` |
| 读音预检 | `script.json` → `pron.json`、`pron-report.md` | `pipeline/pron.py`；jieba + pypinyin；未确认项退出码 2，不能把自动猜音当确认 |
| 配音 | `script.json` → `lines/sXX_lYY.wav` | `pipeline/tts-episode.mjs`；MiniMax `speech-2.8-hd`；中文增强、pitch 0、vol 1；API 输出 MP3 44.1 kHz/128 kbps/单声道，FFmpeg 转 PCM WAV |
| 时序与画面 | 音频 + script/scenes/visuals → `public/episodes/<期>/timeline.json` | `build-episode.mjs`；30 fps；关键词时间优先级 `cue-fixes.json > phrase > char`；`cueAlign: phrase`、`sfxPolicy: explicit` |
| 字幕 | 台词按语义切分 → 烧录字幕数据与 `out/<期>.srt` | `pipeline/subtitles.mjs`；现行流程默认 19 字与标点切分；字幕文字可以保留日语，发声文本单独用中文读法 |
| 声音合成 | 配音 + SFX + BGM → `mix.wav` | 构建内部 48 kHz；音效优先读 `cache/sfx`，其次桌面视频工厂；BGM 优先每期 `music/`，其次固定云盘目录；曲目用 2.5 秒 acrossfade |
| 检查 | 时间轴 → lint、状态审片、声音核查 | `lint-episode.mjs`、`review-states.mjs`；机器声音核查为 `voice-review.py` / `pron-verify.py`，不等于人耳听完 |
| 合成 | 时间轴 → MP4 | `npx remotion render src/episode/index.ts Episode ... --concurrency=4`；1920×1080，30 fps；完成后检查响度、黑帧、字幕、连续转场 |

### 2.3 配音、字体、样式与用户偏好

**现行整期配音**（以 `pipeline/tts-episode.mjs` 和 `config/minimax-voices.json` 为准）：

| 角色 | 音色 | 语速 |
|---|---|---:|
| 牛丼老师 `gyudon` | gou，`ttv-voice-2026093000431426-d3T6qk99` | 1.15 |
| 芝士 `cheese` | 芝士机器人，`ttv-voice-2026102800563326-3vxEyPmY` | 1.1 |

音色 ID 是资源标识，不是认证密钥；能否在另一个账户调用尚未验证。模型保留 `speech-2.8-hd`。旧漫画 `config/characters.json` 中的官方音色（Reliable_Executive / Pure-hearted_Boy / Japanese_OptimisticYouth）和 macOS Tingting/Kyoko 是旧占位路径，不能覆盖现行 gou/芝士选择。

- 画幅：主要 16:9 横屏，1920×1080，30 fps。封面代码还有其他比例，不代表正文都改成竖屏。
- 字体：`Noto Sans SC`、`Noto Sans JP`；原代码从 `public/fonts/NotoSansSC.ttf`、`NotoSansJP.ttf` 加载。字体未打包，需要合法来源自行补齐。
- 当前 Episode：暖黄纸色 `#FBEFC8`、大图解、老师和芝士持续在画面上；字幕常规 58 px、强调 64 px、12 px 深色描边。字幕不是唯一的信息呈现，数字和关系也应进入图解。
- 不动产线：`visuals.json` 设 `"look": "fudosan"`，住宅街背景、老师藏青西装、芝士绿色卫衣；不要放射线、格子、胸牌。不要把税务分组的所有房产选题自动换成不动产品牌。
- 橙=支出、绿=省回或抵扣、黄=自己承担；大总额用中性蓝。图标必须语义贴合；Invoice 用户明确不喜欢粉色零钱包，已改普通钱包。
- 中文零基础受众：先举生活例子再给名词；不照搬日语发音。当前 TTS 预检会拒绝假名和括号，字幕仍可保留日语术语。
- 老师与芝士全程在场，不能给 cast 写 `out`。状态中的 `point` 可让老师指向目标。
- YouTube、视频号、RedNote 等有现成封面/发布文案记录，但本次不确认发布状态、不执行发布。
- 不把旧审片文档里的时长当成永远有效的模板：`invoice-2026b/QC.md` 记录 8:52，不同期的目标不能混用；接手时确认目标，不把缩短本身当作验收通过。

### 2.4 原项目运行命令（原样摘录）

以下命令来自 README、源码头部注释和 `learning/2026-10-29-両学長-税务图解/工作流-vNext.md`。`<期名>` / `<期>` 是需要替换的占位符。它们是原项目操作记录，不表示在当前云端环境可直接成功。

```bash
cd ~/video-projects/manga-video
node pipeline/new-episode.mjs <期名>
node pipeline/new-episode.mjs <期名> --line fudosan
node pipeline/tts-episode.mjs episodes/<期名> --dry
python3 pipeline/pron.py episodes/<期名>
node pipeline/tts-episode.mjs episodes/<期名>
node pipeline/build-episode.mjs <期>
node pipeline/lint-episode.mjs <期>
node pipeline/review-states.mjs <期> <目录> [--compare <旧版>]
npx remotion render src/episode/index.ts Episode out/<期名>.mp4 --props='{"episode":"<期名>"}' --concurrency=4
```

`--dry` 仍会写 `script.json`，只是不会调用配音接口。正式配音要在用户授权费用、密钥通过安全渠道提供之后执行。不要为“验证交接包”直接跑真实配音。

**云端操作顺序（为接手补充，未执行）**：

1. 切换到本分支并进入 `handoff/projects/manga-video`；先读 `.gitignore` 和本文缺口。
2. 准备 Node 24、FFmpeg/ffprobe；使用锁文件安装 Node 依赖。安装属于接手操作，本次未执行：

   ```bash
   cd handoff/projects/manga-video
   npm ci
   npm run typecheck
   ```

3. 新期从模板创建，写完 `facts.md`、`states.md`、`lines.txt`、`scenes.mjs` 和 `visuals.json`，保留 `cueAlign: phrase` / `sfxPolicy: explicit`。先完成无付费预检。
4. Python 读音脚本依赖 jieba/pypinyin；声音核查另需 numpy、mlx_whisper、praat-parselmouth。**MLX 路径是 Apple Silicon 专用，Linux 云端不能原样运行**；先换成可用的 Whisper 后端并对照验证，或留到 Mac 串行完成。
5. 安全配置本地 `.env`（没有随包提供，也不要提交），补齐字体、逐句音频、BGM、SFX、图片；真实 TTS 费用重新估算。不要从原机器复制认证文件。
6. 按上面的原命令生成配音、build、lint、状态审片，再渲染。背景音乐列表必须指向实际存在的音频；当前构建没有完整的静音兜底，不要只清空列表就假定可运行。
7. 现行工作流目标响度约 −15 LUFS；历史具体成片为 −15.2/−15.3 LUFS 等。可按最终素材做归一化并用 ebur128 复核，但原记录没有一套适用于所有片子的固定增益命令，所以不要直接抄 `+6.8 dB` 到新片。
8. 连续观看/试听后再交付；机器检查、人耳试听、用户验收和平台发布要分开记录。

**旧模板仍可参考的原命令**：

```bash
npm run placeholders
npm run tts -- --dry-run
npm run tts
npm run analyze
npm run studio
npm run render
npm run render:explainer
npm run build:explainer
node pipeline/render.mjs pilot-explainer --stills
```

注意：旧漫画 `scripts/lib/tts.ts` 有 macOS `say` 占位回退；当前整期 `tts-episode.mjs` 没有同样的无密钥回退。不要混淆两者。

### 2.5 坑、当前状态、下一步

| 已知问题 | 处理办法/接手任务 |
|---|---|
| 旧 handoff 说“没有真实参考、机器声差、图解太静”，新代码已增加状态和双角色 | 把 2026-10-27 原交接当历史问题清单；以当前 `src/episode`、模板、vNext 和期内 QC 为主，别把整个项目退回初代 |
| 2026-10-27 的“付费尚未批准”与后续真实 MiniMax 配音记录冲突 | 历史授权不能代替新任务授权。本次没有费用授权，不做生产调用；声线/模型选择按现行代码保留 |
| 配音括号把日语汉字又念一遍；假名让中文句变成日语腔 | 用 `{tts:中文读法}` 分离字幕与声音；新脚本会拒绝假名、括号 |
| 去掉引号或改成逗号会制造大量断句 | 配音文本保留「」或“”；脚本会警告原文有引号但 TTS 丢失 |
| 多音字/轻声、词中间断开、句间过紧过松 | 跑读音预检和逐句声音评审；机器分数不能代替音色/语气实听；错句局部重配，不重做整期 |
| 关键词按字数估时误差可达一两秒 | 优先 `cue-fixes > phrase > char`；金额首次出现、公式、转折、例外条件要听实际音频 |
| 云盘 SFX/BGM 读取超时；脚本带本机绝对路径 | SFX 已支持 `cache/sfx` 本地副本；BGM 可放每期 `music/`；云端接手应先将外部依赖参数化，不能伪造原路径替代素材 |
| 源码有 macOS 专用 `say`、MLX、Swift PDF 截图工具 | Linux 先做适配；`pipeline/materials/pdf-page.swift` 保留作本机参考 |
| `pipeline/materials/shot-web.sh` 直接无头启动系统 Chrome | 本包排除该脚本；在 Mac 上按当前规则使用隔离 Chromium 的 Playwright CLI，禁止系统 Chrome headless/CDP |
| 原 `out` 在外置 SSD | 需要原视频时让用户挂载磁盘，不在原路径建立假替代目录，不把外置盘完整搬上 GitHub |
| 银行期 QC：117 句、11:09；声音实听和连续转场检查未做 | 仅复述原 QC。素材/成片未收入本包，也没有本轮重新渲染验证 |
| Invoice 易懂版 QC：111 句、8:52；保留原版、部分原版句音轨已重配 | 老成片与现有 lines 可能不同，恢复前先比版本；voice-review 不证明人耳验收通过 |

接手建议：先读最新的 `pipeline/tts-episode.mjs`、`learning/.../工作流-vNext.md`、`templates/tax-episode` 和 `episodes/invoice-2026b/QC.md`；完成外部媒体路径与 Linux 兼容性处理，再用模板做一个用户批准的短验证段。不要自动继续生成已有视频。

## 3. 项目二：map-explainer

### 3.1 路径、用途与流水线

- 本机：`/Users/wzz122/video-projects/map-explainer`；包内 `handoff/projects/map-explainer`。
- 城市历史/铁路/地形解说：“旅行中的疑问 → 地图反差 → 历史原因 → 实地体验”。
- 模板预期 10–13 分钟；`## S01 标题` 分段，钩子 ≤15 秒。实际时长必须由最终配音确定。

| 环节 | 工具与文件 | 参数/边界 |
|---|---|---|
| 文章 | `episodes/<期>/script.md`、`shot-list.md`、`credits.md` | 事实和素材逐项记录出处与许可；`> 画面：...` 不当成旁白 |
| 分镜 | 组件 `CONFIG` 或期内 `shots.json` / `terrain.json` | 已包含阿倍野、难波、纪势线等镜头配置；多数期内这里只保存地图镜头，不保证有完整文章 |
| 配音 | `scripts/minimax_tts.py` | `speech-2.8-hd`；`MINIMAX_VOICE_ID` 通过环境/.env 给出；`--dry-run`、`--only`、`--force`、`--timeline-only`；默认段间 0.6 秒；段内注释可设 speed/emotion/gap |
| 画面 | MapLibre GL JS 5、GSAP 3.13、Playwright Chromium；另有 city-orbit 3D | `__ready`、`__seek(t)`、地图 idle；逐帧 `jumpTo`，避免真实时钟 `flyTo/easeTo` |
| 音频时序 | `audio/vo/timeline.json` | 记录 start、duration、end、start_frame；默认 30 fps |
| 字幕 | 当前模板要求字幕安全区，但没有找到与该文稿入口闭环的独立 SRT 自动生成命令 | 这是缺口，不把 manga-video 的字幕程序说成已经接上。应在整片组装/工厂端核实 |
| 编码 | `scripts/render_shot.mjs` | 默认 30 fps；PNG 帧管道 → libx264、preset medium、CRF 16、yuv420p、faststart |
| 最终混音 | `scripts/mix.sh` | BGM −18 dB；sidechaincompress threshold 0.02、ratio 8、attack 20、release 600；目标 −16 LUFS、−1.5 dBTP；AAC 192k；视频流复制 |

### 3.2 样式、字体、声音

- 横屏 1920×1080、30 fps、SDR/Rec.709；左右安全区 96 px、上下 64 px，底部 160 px 留给字幕。
- 纸底 `#F4EFE6`、深墨 `#1E2A32`、主强调红 `#D8452F`，地图用低饱和米色/灰蓝/绿。路线按铁路类别着色。
- 标题 Noto Serif SC 900；正文 Noto Sans SC 500/700；日文 Noto Sans JP 500；数字 Barlow Condensed 600。定版需本地字体，CDN 只作预览。
- 配音脚本没有写死实际音色。**没有读取 .env 或密钥文件，所以本次不能确定这套通用入口的实际 voice ID 与全局 speed**；这点不能用漫画项目的 gou 配置代替。段内原例 `<!-- tts: speed=1.05 emotion=calm gap=1.0 -->` 只是覆盖示例。
- 配乐为温暖、克制的城市纪录片/lo-fi；素材许可、服务可用性和原文价格描述未在本次重新核实。

### 3.3 原文运行步骤

以下命令原样来自本项目 README/AGENTS。原 `.env.example` 按本次排除规则没有打包；不要执行复制不存在文件的那一步，改为在云端安全设置同名环境变量或自行建立不入库的 `.env`。

```bash
cp -R episodes/_template episodes/ep01
cp .env.example .env
python3 scripts/minimax_tts.py episodes/ep01/script.md --dry-run
python3 scripts/minimax_tts.py episodes/ep01/script.md
python3 scripts/minimax_music.py --episode episodes/ep01 --dry-run
python3 -m http.server 8000
node scripts/render_shot.mjs components/terrain-orbit --out episodes/test-s01/renders/TEST-S01.mp4
bash scripts/mix.sh episodes/ep01 --check
```

完整执行顺序：

1. 在 `handoff/projects/map-explainer` 安装 package-lock 对应依赖，准备 Python 3.9+、FFmpeg/ffprobe。
2. 从 `_template` 新建一期，定稿 `script.md`、镜头表、来源和许可表。先估字数和费用；授权后才配音。
3. 读取配音 `timeline.json`，按时长组装组件。先用 `--stills 0,3,6,12` 看关键帧，再渲染每个地图镜头。
4. **原 README 的第 7 步“在 HyperFrames 组合组件、渲染 video.mp4”是人工/代理编排步骤，没有一个现成的一键全文组装命令。** 最近期内的 `渲染.sh` 是多个镜头命令，不等于完整长片组装器。
5. 完成画面组装后，将视频放到 `episodes/ep01/renders/video.mp4`；旁白/BGM/音效置于 README 指定目录。用 `mix.sh ... --check` 输出 `final.mp4`。
6. 这套独立地图入口的字幕闭环与完整视频组装需接手时补齐；已选阿倍野实际使用第 4 节的工厂总装。不要因为镜头已渲染就标记整片已完成。

### 3.4 已知坑、当前状态与云端待办

- `render_shot.mjs` 自动寻找 `~/Library/Caches/ms-playwright/chromium-*/chrome-mac-arm64/...`，这是 **Mac 路径**。它用的是 Playwright 的 Chrome for Testing，不能改成 `/Applications/Google Chrome.app`。Linux 应适配到隔离 Chromium 的可配置路径；本次没有修改原渲染器。
- 城市 3D 组件通过本地服务器 `/__secret/google-maps-key` 读取本机 `~/.config/google-maps/api_key.txt`。密钥文件没读取也没上传。此服务和密钥端点只可在本机受控环境用，不能未经改造就对公网暴露；云端先参数化并限制绑定地址。
- MapLibre 的 tile idle 和字体就绪必须等待。`flyTo/easeTo` 会导致逐帧结果不确定；已有运行时用 `jumpTo` 和两次 rAF 规避。
- 主 README 写的是通用地图流水线；新 `components/city-orbit` 和期内配置反映后续 3D 镜头扩展，不能只看最初 README。
- 某些期内 shell 脚本写死本机绝对路径，并调用外部 `mac-heavy-job.py`；只保留原样作执行记录，云端先改路径，不能直接批量运行。
- 当前已找到阿倍野与难波近期 MP4 片段；本次仅确认文件元数据，没有解码、看片、核实长片发布或人耳验收。
- 配音/配乐 API 的价格、账户权限、声音资源可用性、地图服务条款，都要在后续真正生产前重新核实。本文不把历史文档的外部服务说法当当前保证。

## 4. 项目三（通用主线）：视频工厂 + 写稿

### 4.1 路径、打包内容和代际

- 入口：`/Users/wzz122/Desktop/视频工厂`、`/Users/wzz122/Desktop/写稿`。两者都是符号链接，实际在 `/Users/wzz122/Library/CloudStorage/GoogleDrive-wzzsgdtc@gmail.com/我的云端硬盘/视频制作/` 下对应子目录。用户已明确允许读取这两个目录；未扩展到 Library 其他位置。
- 包内：`projects/video-factory/视频工厂`、`projects/video-factory/写稿`，保持两者相邻。
- 当前通用主线是 **模板-v6 的 Python 镜头脚本 + HTML/JS 分段渲染 + FFmpeg 总装**；写稿目录提供文章、素材研究、中央 TTS、读音检查与封面工具。不是 Remotion 项目的旧别名。
- 已带入完整模板源码、接口说明、配置示例、质检/自测源码、分段渲染器、生成提示词示例、写稿工具和工作流；另带一组真实阿倍野样例（稿件、事实核对、制作说明、项目配置、镜头脚本和该期渲染源码）。媒体、时间轴运行缓存和外置盘素材均不带入。
- 根 `engine/` 是旧文章解析/外部音频对齐入口，仍供 `新建一期.py` 使用。旧 `CODEX-交接文.md`、10 月 2 日交接和早期工作流里“尚未实现分段缓存 / 外部配音未接入”的描述已被后续代码覆盖。`工作流/AI视频工厂流程.md` 专门讲 **AI 话题视频**，不是另一套通用引擎。

### 4.2 流水线、参数与产物

| 环节 | 原文件与工具 | 输入、输出及参数 |
|---|---|---|
| 文章 | `写稿/成稿/*.md`、`工作流/单期制作工作流.md` | 用户稿/核实后的文章 → 按章按屏的工厂格式；正文、画面指令分开；`工具/稿件检查.py` 查字数、假名、超长行等。AI/编辑仍须做事实核实和分镜决策 |
| 读音预检 | `写稿/工具/读音预检.py`、`pron_lib.py`、`读音词典.tsv` | 分章 `chNN-tts.txt` + 本期 `配音/读音.tsv` → 预检 JSON；存在“待定”退出 1；只用词典与拼音库，不花钱、不加载模型 |
| 配音 | `写稿/工具/api配音.py` | MiniMax `speech-2.8-hd`、gou `ttv-voice-2026093000431426-d3T6qk99`、默认 speed 1.15、pitch 0、vol 1、Chinese；API MP3 44.1 kHz/128 kbps/mono → WAV 48 kHz/16 bit/mono；按文本/模型/音色/速度/读音钉缓存 |
| 对齐 | 根 `engine/run.mjs`、`tts.mjs`、`align_ext.py`、`align.py` | 稿旁同名 `<文案名>.旁白.wav/mp3/m4a` 自动选择外部音轨；Whisper 对齐 → `工程/.work/storyboard.json`、`narration.wav`。没有音轨会走 macOS `say` Tingting 占位，不可当默认成片声音 |
| 定时与搭工程 | `模板-v6/新建一期.py`、`定时间轴.py` | 对齐分镜 → `画面v6/工程/.work/storyboard-audio.json`、`声音/旁白.wav`、`项目.json`、`节拍表.json`、每屏镜头脚本骨架；30 fps、48 kHz，每帧 1600 采样点；默认移除旧 3.2 秒静止片头 |
| 画面 | `v6lib.py`、`镜头脚本/*.py`、`工程/分段渲染.mjs`、HTML/JS engine | 1920×1008 正文区域 + 72 px 底部导航 → 1920×1080、30 fps 横屏；按镜头与素材内容指纹缓存；实拍/截图/图解/地图/生成动画等组合 |
| 字幕与声音总装 | `总装v6.py` | 真实语音时间轴 → ASS 烧录字幕 + SRT；思源黑体 `Source Han Sans CN Medium` 44 px；配乐按章循环/2 秒交叉淡化、声音闪避；两遍 loudnorm −14 LUFS、真峰 ≤−1.5 dBTP |
| 最终输出与验收 | `总装v6.py`、`质检/*.py` | libx264、veryfast、CRF 18、threads 3；先测 30 秒，再全片；检查镜头清单、帧数、音效/BGM覆盖、字幕/接缝、1 fps 全片抽帧与人耳通听 |

配音脚本读取 `~/video-projects/manga-video/.env` 中的环境配置，本包没有这个文件；云端需改成安全注入配置的方式。脚本内价格只是历史估算，不是本次报价。读音点检的 `--参照` 会额外调用 MiniMax，不能把它当免费检查。账号余额不足要停，不自动充值。

### 4.3 原项目完整操作顺序与命令

下面代码块摘录原文件的命令形式，保留中文参数。`<期>`、`<稿子.md>` 等是占位符。**这不是本轮执行记录**。先完成 4.6 的路径、字体、媒体、浏览器和对齐后端适配，再运行；旧根引擎浏览器回退有安全阻断项。

1. 写稿/审稿：原 `工具/README.md` 的入口。

   ```bash
   python3 工具/稿件检查.py 成稿/xxx.md
   python3 工具/改稿.py 成稿/xxx.md
   ```

   后一条会开本地编辑页，并在用户保存时改稿、同步工厂副本；不能当只读预览。准备每章纯配音文本，读音与字幕分离。

2. 在 `写稿/工具` 使用中央配音工具。以下形式来自脚本头部，先预检和估价，确认本次费用后才正式配音。

   ```bash
   python3 读音预检.py 文本/ch01-tts.txt 文本/ch02-tts.txt …
   python3 api配音.py 文本.txt 输出.wav --只估价
   python3 api配音.py 文本.txt 输出.wav --voice ttv-voice-2026093000431426-d3T6qk99 --speed 1.15
   python3 api配音.py 文本.txt 输出-v2.wav --基于 原始/ch02-v1.wav --重配句 7,12
   ```

   `…` 是文档省略记号，实际命令要换成真实文件列表。单期分章音频需按章节顺序拼成与稿件完全一致的同名旁白，不能漏章/重复拼接。阿倍野示例提供 `配音/切屏.py`；不是一条通用的自动写稿命令。

3. 首次只有音轨时，用模板搭建本期工程；脚本会打印本期对齐命令（并不会在这一步替你跑模型）。对齐后的 JSON 已存在时跳过这个初始化分支。

   ```bash
   T=~/Desktop/视频工厂/模板-v6
   python3 $T/新建一期.py <期> <稿子.md> <文案名>.旁白.wav
   ```

   原根引擎入口是 `node engine/run.mjs "1-我的文案/你的文案.md"`，在本期 `工程/` 运行，通常由 `mac-heavy-job.py` 包裹。它会**继续渲染旧画面**，不是只对齐的轻量命令，源码没有 `--align-only`；不要杜撰该开关。按脚本实际打印的路径操作，并先修正旧 `engine/cdp.mjs` 浏览器问题。模型阶段只能串行。

4. 用已对齐分镜重新运行模板初始化，转成 v6 时序与镜头骨架（README 原例）：

   ```bash
   T=~/Desktop/视频工厂/模板-v6
   python3 $T/新建一期.py 2026-10-20-某题 ~/Desktop/写稿/成稿/2026-10-20-某题-v1.md \
     ~/Desktop/视频工厂/样片/2026-10-20-某题/工程/.work/storyboard.json --资料 ~/Desktop/写稿/资料/2026-10-某题
   ```

   填 `项目.json` 的旁白/字体/素材/配乐/导航/输出路径，按 `v6lib-接口说明.md` 写 `镜头脚本`。每次换 TTS 都必须重新对齐；相对词句时间 `T/Tw` 可跟随新轴，写死的秒数需人工复查。

5. 分镜预览、局部改动、完整清单更新（模板 README 原例）：

   ```bash
   cd ~/Desktop/视频工厂/样片/<期>/画面v6
   python3 -c "from v6lib import *; build_storyboard(); render(['S05'], stills=True, at=[1, 4, 8])"
   python3 -c "from v6lib import *; build_storyboard(); render(['S05'])"
   python3 -c "from v6lib import *; print(grab('S05', [0.3, 2.0, 4.5]))"
   python3 -c "from v6lib import *; build_storyboard(); render()"
   ```

   `render(['S05'])` 只更新 `manifest-only.json`；最后必须跑完整 `render()` 刷新 `manifest.json`，其余镜头会命中缓存。不要把局部清单误当整片清单。

6. 总装先 30 秒验证，再全片：

   ```bash
   python3 总装v6.py --start S19 --test 30 --stems --work 自测/总装测试 --out 自测/总装测试/测试-30s.mp4
   python3 质检/校验测试片.py 自测/总装测试/测试-30s.mp4 自测/总装测试/拼接记录-v6.json
   python3 总装v6.py
   ```

   模板支持 `--trad` 字幕/导航切换，但**全繁体还需重建所有文字画面**。阿倍野原文记录 `V6_TRAD=1` 重拼分镜重渲 + `总装v6.py --trad`；该期 `镜头脚本/_生成.py` 是生成入口，简繁镜头清单要分开保存。不要只转 SRT 就宣称全繁体。

7. 成片抽帧、字体/数字/图片停留/镜头接缝检查、人耳通听和用户审片，然后再决定发布。封面工具默认 `python3 工具/电影感封面.py 样片/<期>/画面v6/项目.json`；生成封面图和发布是后续独立授权事项。

### 4.4 现行风格与用户偏好

依据 `制作规范/画面硬规则-2026-11-07.md`、`视觉规范/新闻解说版式规范-v7b.md`、最新阿倍野制作说明：

- 默认简体；用户要求 YouTube 繁体版时，字幕、导航、屏幕字、计价器图全部繁体。进度条按各段在本导航格内推进，不能按全片比例横扫等宽格子。
- 正片原色照片/截图，统一浅纸色纯底（如 `#ece5d8`）；不加黑白、褐色、颗粒、暗角或格子纹理。旧 `engine/config.json` 仍有 `mediaGrade: 0.75`，只是旧入口参数，**与现行偏好冲突，不能照旧用于新成片**。
- 照片至少 2 秒，含字图片至少 3.5 秒；禁止闪过；主图通常 ≥65% 宽，文字截图 ≥60% 高，主体在 0.5 秒内出现。正文 ≥40 px，标签 ≥32 px，章节大标题 ≥180 px。
- 思源黑体（Heavy/Regular/Medium）为主，得意黑作适量强调，Oswald/Barlow 用于数字。减少胶带、便利贴、堆叠卡片、胶囊标签；荧光笔每片约 3–5 处、盖章约 2–3 处。
- 图解要讲关系和变化，不堆文字。新插画沿用用户“图二”日式圆润参考，人物一致；参考图未上传，接手需要用户提供或另行取得媒体访问。
- 默认声音保留 gou 1.15、speech-2.8-hd，中文叙述；日语专名以合适中文读法配音，原日文可保留在字幕/画面。Kokoro/macOS say 是旧免费试听路径，不等于用户确认的最终声音。
- 16:9 横屏为主，旧引擎另外支持原生 1080×1920 `--竖屏`。平台有 YouTube、视频号、小红书；时长按内容和当期反馈决定，历史样例从 6 分钟到近 30 分钟，不固定压成一种时长。

### 4.5 已做到哪里、坑和未完成事项

本次读取 `写稿/制作/当前进度.md` 的相关记录和阿倍野原制作说明，但没有重新播放视频验证。阿倍野记录 87 镜头、15:39、−14 LUFS、−1.90 dBTP，并已做简体/全繁体两版及导航修复；原说明仍待人耳通听（约 3:32“土地和房子”）、19 处声调未核对、节拍表未填、发布决定。记录互有先后时，以制作说明最后的 11 月 17 日审片追加为准，不能只看上方旧“屏上字还是简体”。近期另有传真机新稿和读音文件在变动，本包没有复制进行中的新期，也没有干预它。

| 坑 | 现有办法 / 接手任务 |
|---|---|
| 20 分钟视频改一句却重跑全片 | 用镜头内容指纹缓存；只改相关镜头，再刷新完整 manifest；引擎改变才可能全片失效 |
| 透明 PNG 进 photocard 黑底 | 先合成到一致纸色底；原色、足够大，并检查最后上屏效果 |
| 分段渲染停在浏览器启动、0% CPU | 先查具体任务进程和命名会话；只处理本任务，不照旧文档宽泛杀整个浏览器。旧系统 Chrome 回退必须修正 |
| `pgrep -f 脚本名` 的等待循环匹配自己 | 用确切 PID/子进程句柄和退出状态；不要无限等自己 |
| 曲目太短无法找到循环点 | 拆配乐段或补合适素材；总装对覆盖率/响度有门槛，不能删除门槛强行交付 |
| 原文屏在 v7b 被摆正 | 已加入 `keep_rot`；只在需要保留倾斜的原件使用，不恢复全片乱斜卡片 |
| 简繁两版混用 manifest | 生成/渲染时区分版本，保留各自清单；该期说明称当前 manifest 为繁体，不得默认简体 |
| 声调/多音字误读 | 先词典预检再局部重配；同一处点检连续两次仍标，进入人工听清单，不无限付费重试 |

### 4.6 云端继续所需准备（尚未执行）

1. Node 24、Python 3、FFmpeg/ffprobe；Python 主链依赖 numpy/scipy/Pillow/imageio-ffmpeg，读音用 jieba/pypinyin，繁体用 opencc，MLX/Whisper 后端为 Mac 特定依赖。原项目没有统一 Python 锁文件，不伪造一份已验证版本表；Linux 先更换对齐/读音后端再做等价验证。
2. 将 `~/Desktop/视频工厂`、`~/Desktop/写稿`、`~/video-projects/manga-video/.env`、外置 SSD、云盘素材、`mac-heavy-job.py` 等硬编码路径参数化。两套目录相邻不代表所有脚本已经支持包内相对路径。
3. **浏览器阻断**：根 `视频工厂/engine/cdp.mjs` 仍有系统 Chrome fallback；原样保存便于审查，但禁止直接执行该路径。模板和阿倍野 `工程/engine/cdp.mjs` 已改为隔离 Playwright CLI、系统浏览器列表为空，仍需准备 CLI/Chromium 并核对关闭命名会话。不要为复现旧命令突破本机 Chrome 安全规则。
4. 补齐字体、参考图、图片/视频素材、旁白、配乐和 SFX。本包保留 `做音效-v6.py` 可供以后生成音效；没有运行它。阿倍野输入素材跨外置盘/云盘，完整素材约束使它不能仅凭公开仓库原样重渲。
5. 新期从 `项目-示例.json` 和示范镜头开始；实际样例先修路径、补时间轴和媒体，再做短段验证。Google 3D 的平台限制在旧说明写“只发油管”，此处记录为生产约束，不对当前外部服务许可作新法律判断。


## 5. 跨项目约束与接手优先级

1. **保护已有主线**：通用引擎已经存在，不要先重写另一套文章转视频框架。先判断要继续税务图解、地图镜头，还是视频工厂模板-v6 的通用解说。
2. **Mac 内存**：本机 16 GB；Whisper/MLX 等本地重模型全机一次一个，通过 `/usr/bin/python3 /Users/wzz122/.local/bin/mac-heavy-job.py -- <原命令>`。退出 75 等待锁持有者，不删锁、不绕锁。包装器不在本包中，云端也不能假定该绝对路径存在。
3. **Chrome 安全**：本机禁止把系统 `/Applications/Google Chrome.app` 当无头/CDP 实例；浏览器自动化用 `/Users/wzz122/.codex/skills/playwright/scripts/playwright_cli.sh` 默认隔离 Chromium，不加 `--browser=chrome`，结束关闭任务新建的命名会话。需要开启前台 Chrome 时用 `ChromeGuard/open_chrome_safely.sh`，保留 `--enable-features=CATransactionV2`。本次没有运行任何浏览器渲染。
4. **凭据和费用**：此公开仓库没有账户凭据。需要时请用户在运行环境安全注入；不从本机认证缓存、cookie、Keychain 或聊天记录搬运密钥。没有授权就不合成付费声音/图片。
5. **验收边界**：源码能解析、静帧不重叠、Whisper 对字、ffprobe 可读，均不等于整片连续观看/实听完成。将通过、失败、未做分开写。

下一步按顺序做：

- 读文件清单和原文附录，确认要继续哪条主线。
- 列出云端缺失资源及所需路径适配；先解决媒体/字体/浏览器/语音后端，不要为了跑通删掉质量关口。
- 对 manga-video 选一个模板级短例；对 map-explainer 先选不需私有 key 的 terrain-orbit。先静态检查，再经用户授权获取素材/费用并渲染。
- 通用长片先读视频工厂模板-v6 README 和阿倍野制作说明，依第 4.6 节解决云端缺口；不要把 10 月早期交接的待办误认为现状。

## 6. 原文附录

下面按原始文件完整附入所选项目的 README、已有 HANDOFF、CLAUDE.md/AGENTS.md，以及现行工作流和 QC。均为历史/本机原文，可能含旧政策、旧授权或未完成状态；不覆盖本文的边界说明和用户当前指令。原文件本体也保留在 `projects/` 中，可逐字比对。

原文附录目录（下方折叠块内为完整文本，展开后阅读；路径链接指向独立原文件）：

1. [projects/manga-video/README.md](projects/manga-video/README.md)
2. [projects/manga-video/docs/HANDOFF-explainer-for-codex.md](projects/manga-video/docs/HANDOFF-explainer-for-codex.md)
3. [projects/manga-video/episodes/bank-shinkin/QC.md](projects/manga-video/episodes/bank-shinkin/QC.md)
4. [projects/manga-video/episodes/invoice-2026b/QC.md](projects/manga-video/episodes/invoice-2026b/QC.md)
5. [projects/manga-video/learning/2026-10-29-両学長-税务图解/工作流-vNext.md](projects/manga-video/learning/2026-10-29-両学長-税务图解/工作流-vNext.md)
6. [projects/map-explainer/AGENTS.md](projects/map-explainer/AGENTS.md)
7. [projects/map-explainer/CLAUDE.md](projects/map-explainer/CLAUDE.md)
8. [projects/map-explainer/README.md](projects/map-explainer/README.md)
9. [projects/video-factory/视频工厂/AGENTS.md](projects/video-factory/视频工厂/AGENTS.md)
10. [projects/video-factory/视频工厂/CODEX-交接文.md](projects/video-factory/视频工厂/CODEX-交接文.md)
11. [projects/video-factory/视频工厂/模板-v6/README.md](projects/video-factory/视频工厂/模板-v6/README.md)
12. [projects/video-factory/视频工厂/制作规范/画面硬规则-2026-11-07.md](projects/video-factory/视频工厂/制作规范/画面硬规则-2026-11-07.md)
13. [projects/video-factory/视频工厂/样片/2026-11-17-阿倍野再开发/制作说明.md](projects/video-factory/视频工厂/样片/2026-11-17-阿倍野再开发/制作说明.md)
14. [projects/video-factory/写稿/AGENTS.md](projects/video-factory/写稿/AGENTS.md)
15. [projects/video-factory/写稿/CLAUDE.md](projects/video-factory/写稿/CLAUDE.md)
16. [projects/video-factory/写稿/CODEX-交接文.md](projects/video-factory/写稿/CODEX-交接文.md)
17. [projects/video-factory/写稿/CODEX-交接文-2026-10-02.md](projects/video-factory/写稿/CODEX-交接文-2026-10-02.md)
18. [projects/video-factory/写稿/CODEX-交接文-2026-10-02-东大收尾与竖屏.md](projects/video-factory/写稿/CODEX-交接文-2026-10-02-东大收尾与竖屏.md)
19. [projects/video-factory/写稿/工作流/单期制作工作流.md](projects/video-factory/写稿/工作流/单期制作工作流.md)
20. [projects/video-factory/写稿/工作流/AI视频工厂流程.md](projects/video-factory/写稿/工作流/AI视频工厂流程.md)

### 附录 1：projects/manga-video/README.md

原始位置：`/Users/wzz122/video-projects/manga-video/README.md`；SHA-256：`a6487f501f7830702cfda7be07ba6a6fd35faac6ca9ff05d6c7ee9aba1989a8f`。

<details>
<summary>展开完整原文</summary>

````markdown
# 漫画风对谈视频流水线（manga-video）

把一份「分镜表」（JSON 文件）自动变成一条漫画风对谈视频：静态插画拼成一格一格的镜头，加上镜头推拉、角色进场、抖动、头顶小图标、字幕、配音、效果音和背景音乐。

这个工程里有两套模板，共用同一份角色素材和配音工具：

| 模板 | 说明 | 文档 |
|---|---|---|
| 漫画对谈版（本文） | 牛丼老师、芝士、田中一格一格地对话 | `docs/storyboard-schema.md` |
| 单人主讲图解版 | 牛丼老师在右下角讲，画面放图解 | `docs/explainer-schema.md` |

---

## 一、五步出片

在终端里进入这个文件夹（`cd ~/video-projects/manga-video`），依次运行：

| 步骤 | 命令 | 做什么 | 结果在哪 |
|---|---|---|---|
| 1 | `npm run placeholders` | 给还没画的角色、背景、道具生成占位图（真图永远不会被覆盖） | `assets/` |
| 2 | `npm run tts` | 逐句配音。改了哪句只重配哪句，没改的直接沿用 | `audio/` |
| 3 | `npm run analyze` | 量每句话多长、算嘴巴什么时候张开、排出整期时间线、生成字幕 | `build/pilot/timeline.json`、`out/pilot.srt` |
| 4 | `npm run studio` | 打开预览窗口（在浏览器里拖进度条看效果） | 浏览器 |
| 5 | `npm run render` | 出成片 | `out/pilot.mp4` |

其他命令：

- `npm run frames -- 120,400,700`：只截这几帧看效果（第几帧 = 秒数 × 30），图片在 `out/frames/`。
- `npm run voices`：列出 MiniMax 账号里能用的音色（需要先填 Key）。
- `npm run tts -- --dry-run`：只列出要配的句子和字数，不合成、不花钱。
- 做别的期：所有命令后面加 `-- --episode <期名>`，例如 `npm run tts -- --episode ep01`。

## 二、文件放在哪

```
manga-video/
  .env                       MiniMax 钥匙（自己建，不会被提交；格式见 .env.example）
  config/characters.json     角色表：名字、字幕颜色、音色、表情列表
  config/pronunciation.yaml  发音词典：日语词 → 假名（只影响配音，不影响字幕）
  config/sfx-defaults.json   自动音效：进场、弹出、抖动等动作配哪个声音
  episodes/pilot/storyboard.json   试作分镜
  assets/characters/<角色>/<表情>_closed.png / _open.png / _blink.png
  assets/backgrounds/  assets/props/  assets/sfx/  assets/bgm/  assets/fonts/
  scripts/                   配音、分析、占位图、渲染脚本
  src/manga/                 画面（Remotion 组件）
  docs/storyboard-schema.md  分镜格式说明（给写分镜的 AI 看）
  docs/asset-prompts.md      素材清单 + 出图提示词
  audio/ build/ out/         自动生成的东西，删了可以重新生成
```

## 三、配音

- **有 MiniMax 钥匙时**：在项目根目录建一个叫 `.env` 的文件，写一行 `MINIMAX_API_KEY=你的钥匙`。不用管是国际版还是国内版，脚本会自动判断（用不扣费的「查询音色」接口两边各试一次）。模型默认 `speech-2.8-hd`。
- **没有钥匙时**：自动改用 Mac 自带的语音占位（婷婷、Kyoko，用降调区分角色），整条流水线照样能跑通。填上钥匙后重新运行 `npm run tts`，所有句子会自动换成 MiniMax 配音。
- 音色写在 `config/characters.json` 的 `voice.minimax.voiceId`。现在填的是 MiniMax 官方系统音色（占位）：牛丼老师 `Chinese (Mandarin)_Reliable_Executive`、芝士 `Chinese (Mandarin)_Pure-hearted_Boy`、田中 `Japanese_OptimisticYouth`。换成自己克隆或设计的音色：先 `npm run voices` 查到 voice_id，再填进去。
- 日语台词会自动带上日语增强参数；中文台词里经发音词典换成了假名的日语词，会让模型自动判断语言。
- 每句话的缓存文件名由「文本 + 音色 + 模型 + 语速等参数」算出来，所以改一个字只会重配那一句。
- 失败会自动重试（2、4、8 秒后），最后仍失败会打印是哪一句、什么原因；成功的句子不受影响。

## 四、画面效果说明

- **镜头**：背景和角色整体缓慢推近、拉远或平移；切镜头可以直接切、淡入、或从右边滑进来。
- **角色**：说话时嘴巴跟着声音一开一合（每帧算一次音量，张嘴、闭嘴用两个阈值，还会在音节之间闭一下嘴），身体轻轻上下弹；每隔 3–6 秒眨一次眼（有 blink 图才眨）；同框时不说话的人自动变暗。
- **效果**：画面抖动 0.3 秒；汗珠、感叹号、问号、生气标记、闪光在头顶弹出（都是代码画的图形，不是 emoji）。
- **字幕**：底部大字加描边，前面是角色颜色的名牌；日语台词下面加黄色中文字幕；心声用括号和虚线名牌。长句自动拆成几段。
- **声音**：配音、效果音、背景音乐三层；有人说话时背景音乐自动压低约 9 分贝，说完再回来。
- **标题卡**：方格纸背景 + 大字弹出 + 副标题滑入（有 `assets/sfx/title.mp3` 时配上效果音）。

## 五、换真图

1. 按 `docs/asset-prompts.md` 出图，文件名和占位图一样，直接覆盖到 `assets/` 对应位置。
2. 运行 `npm run analyze`（不用重新配音），它会告诉你还剩几张占位图。
3. `npm run render`。

同一个表情的 open / closed / blink 三张图必须只差嘴巴（或眼睛），其他像素完全对齐，否则切换时脸会抖。

## 六、常见问题

- **渲染提示「分镜或配音比时间线新」**：改完分镜后要先跑 `npm run tts` 和 `npm run analyze`。
- **提示缺图**：先跑 `npm run placeholders`。
- **效果音、背景音乐没声音**：文件还没放进 `assets/sfx/`、`assets/bgm/`。放进去再跑 `npm run analyze`；文件名对照 `config/sfx-defaults.json`。
- **某个日语词读错**：加进 `config/pronunciation.yaml`，再跑 `npm run tts`（只会重配含这个词的句子）。
- **内存**：渲染默认同时开 4 个浏览器进程。机器忙时可以写 `RENDER_CONCURRENCY=2 npm run render`。

技术栈：Remotion 4.0.539（React + TypeScript）、Node 24（直接运行 .ts 脚本）、ffmpeg、MiniMax T2A v2 接口。
````

</details>

### 附录 2：projects/manga-video/docs/HANDOFF-explainer-for-codex.md

原始位置：`/Users/wzz122/video-projects/manga-video/docs/HANDOFF-explainer-for-codex.md`；SHA-256：`db7b0448fcce6ffe6dbf695dc3f75987ec942261b08a2021d7c3da57783ba1ba`。

<details>
<summary>展开完整原文</summary>

````markdown
# 交接：「单人主讲 + 图解」模板（图解版）

写给：Codex（请先分析，再给改进方案）
交接人：Claude（会话 wzz122-b9）
日期：2026-10-27
项目目录：`~/video-projects/manga-video`
试作成片：`out/pilot-explainer.mp4`（79 秒）；云盘副本在 `视频制作/视频工厂/样片/2026-10-27-故乡税图解试作/`

---

## 0. 一句话现状

技术链路已经跑通：分镜 JSON → 配音 → 口型 → 字幕 → 渲染 → mp4/srt，一条命令就能出片。但**用户觉得效果不太好**。我自己的判断也是：我是**照一段文字描述凭想象做的，没有看过一条真实的参考视频**，所以「像不像那类频道」这一点完全没有校准过。

## 1. 本来要模仿的风格（原话来自用户的需求提示词）

- 参考：日本理财科普频道，提示词点名「リベラルアーツ大学（両学長）」这一类。
- 用户提示词里对这类频道的描述（原文意思）：
  - 一位主讲角色单人讲解；
  - 画面主体是一页页图解：关键数字、对比表、计算过程、要点列表，**跟着讲解节奏逐条出现**；
  - **字幕很大**，节奏明快；
  - 和漫画风格最大的不同：画面重心从「插画」变成「信息图」。
- 用户也说明了，这段风格描述是「按对这类频道的大致印象写的」。角色和品牌都用我们自己的（牛丼老师、芝士），**不模仿**对方的狮子形象和 logo。

**我实际怎么理解的**：明亮米白底 + 白色圆角卡片 + 橙色强调色。中间放一张大卡片，每段只放一个图解组件。老师半身像站在右下角，底部是白字深色描边的大字幕。
**我没做的**：没有去看任何一条リベ大视频，也没有分析它的版式、切换频率、字幕样式、配色和音效。

> 可用素材：用户「下载」文件夹里有一份故乡税讲解视频的字幕。标题是「【これ1本でわかる！】ふるさと納税の仕組みとやり方を初心者にもわかりやすく解説します」，讲者自称「小原先生」，**不是リベ大**。用户的故乡税文稿可能参考过它。

## 2. 我对现在效果的自我诊断（按我认为的严重程度排）

1. **画面太空、太静。** 每一段只有一张卡片，一张图要撑 5–10 秒。卡片只占中间区域的六七成，周围大片留白。真正的理财科普频道大概每一两句话就换一次画面，或者加一层东西，信息密度高得多。
2. **字幕和画面是两套东西。** 大字幕在底部，图解在中间，眼睛要上下来回跳。这类频道常见的做法是把关键词直接放进图解里放大强调，不靠底部字幕。
3. **人物太弱。** 老师是我用代码画的简笔占位，表情少，动作只有「抬手指一下」，存在感低，也不可爱。没有生图，没有正式立绘。
4. **声音是机器声。** 用 macOS 自带的「Tingting」女声压低音调来冒充中年男老师，听感很差，直接拉低了整体观感。按用户规则，不花钱调接口。
5. **没有背景音乐。** 只有程序合成的「啵、叮、嗖」效果音，偏单薄。
6. **视觉语言单一。** 全是「白卡片 + 粗黑字 + 橙色」，没有图标、插图、手绘感、色块分区，也没有照片，看起来像 PPT 模板。
7. **转场单调。** 段与段之间只是淡出淡入，没有推拉、放大、标注这类镜头运动。

## 3. 已经做好的东西（可以复用）

| 部分 | 位置 | 说明 |
|---|---|---|
| 分镜格式 | `docs/explainer-schema.md` | 段 → 台词 + 图解组件；组件可以按「念到第几句的哪个词」出现，也可以按「某个组件的第几步」出现 |
| 试作分镜 | `episodes/pilot-explainer/storyboard.json` | 故乡税第三段「年收 500 万到底能省多少」，9 段、12 句 |
| 构建脚本 | `pipeline/build-explainer.mjs` | 配音、算时间轴、口型、字幕切分、效果音、混音 |
| 字幕和效果音 | `pipeline/subtitles.mjs`、`pipeline/sfx.mjs` | 自动高亮数字和术语；效果音用 ffmpeg 现场合成 |
| 渲染 | `pipeline/render.mjs` | 出 mp4，并截每个组件的关键帧 |
| 11 个图解组件 | `src/explainer/diagrams.tsx` | 章节卡、滚动数字、要点、算式、对比、表格、横条图、时间轴、道具网格、注意框、芝士插话 |
| 主画面布局 | `src/explainer/ExplainerVideo.tsx` | 顶部章节条、中间图解区、右下老师、底部字幕 |
| 占位角色 | `src/explainer/Characters.tsx` | SVG 画的老师和芝士。有正式图时自动换成图（`assets/characters/<id>/<表情>_<open/closed/blink>.png`） |
| 读音修正 | `config/lexicon.json` | 数字、英文词的读法 |
| 能力报告 | `docs/ai-capability-report.md` | 哪些全自动、哪些要生图、哪些要人工 |
| 素材提示词 | `docs/asset-prompts-explainer.md` | 老师立绘、道具图的生图提示词 |

**命令**

```
cd ~/video-projects/manga-video
npm run render:explainer          # 构建 + 渲染，约 1 分钟
npm run build:explainer           # 只重算配音和时间轴
node pipeline/render.mjs pilot-explainer --stills   # 只截关键帧
npm run studio                    # 浏览器预览（漫画版、图解版都在）
```

## 4. 必须知道的约束

- **同一个目录里还有漫画对谈版**，由另一个 Claude 会话「漫画风对谈视频生成流水线」负责。它管 `package.json`、`config/characters.json`、`scripts/*.ts`、`src/Root.tsx`、`src/manga/`、`episodes/pilot`。图解版直接调用它的配音（`scripts/lib/tts.ts`）、口型（`mouth.ts`）、读音词典（`config/pronunciation.yaml`）、占位图判断（`placeholder-manifest.ts`）。**别改它的文件**，要改先说清楚。
- **git**：漫画版已提交（be3c3b6）。图解版的文件**还没提交**，等用户同意。
- **不花钱**：用户规定 2026-08-26 起不调付费接口（MiniMax 配音要不要用，还在等用户决定）。
- **16 GB 内存**：本地模型（Whisper 等）全机同时只跑一个，命令前加 `/usr/bin/python3 ~/.local/bin/mac-heavy-job.py --`。
- **试作里的数字**（住民税约 24 万、上限约 5.7 万、每月约 4,600）是照用户稿子写的，**没有对照 2026 年的官方模拟器核实过**。

## 5. 请 Codex 回答的问题

1. **找真实参考**：找 2–3 条リベラルアーツ大学（或同类日本理财图解频道）的视频，拆出它们的版式。包括：画面分区比例、主讲角色占多大、多久换一次画面、字幕放哪里长什么样（颜色、描边、底条）、图解怎么画（手绘还是扁平、有没有插图、颜色怎么分区）、转场和镜头运动、背景音乐和效果音的密度。最好给截图，或者带时间点的描述。
2. **对照我们的试作**：逐条指出最影响观感的差距，按优先级排，每条说清「改什么、改成什么样」。
3. **判断现在的架构能不能改到位**：数据驱动的 Remotion 组件 + JSON 分镜，能不能改出那种效果？还是有些东西（比如手绘感插图、密集换页）需要换做法？
4. **配音**：在不花钱的前提下，本机有没有比 macOS「say」明显更好的中文男声方案？
5. **给一份改版方案**：先只改 30 秒（比如分镜里的「算式」和「账本」两段），做成对比样片，让用户先看方向对不对，再全面改。

## 6. 和用户沟通的提醒

- 用户希望最大程度自动化，只有必须人工的时候才打扰。
- 解释要用中文大白话，不用术语，结论先说。
- 用户主要在 MacBook Air 上远程看，交付物放谷歌云盘：`视频制作/视频工厂/样片/`。
````

</details>

### 附录 3：projects/manga-video/episodes/bank-shinkin/QC.md

原始位置：`/Users/wzz122/video-projects/manga-video/episodes/bank-shinkin/QC.md`；SHA-256：`28b94570da9eccc47f95d54f2942be50073af6033fc2faeb019d07ed0227a105`。

<details>
<summary>展开完整原文</summary>

````markdown
# 银行和信用金库到底差在哪：QC

稿子：用户 2026-11-06 在对话里给的稿（牛丼 + 芝士，@wu），要求「做个视频」。转写在 `lines.txt`，117 句，成片 11:09。没有停下来走审片关口，直接做到成片（和前几期一样），审片拼图放在成片文件夹里。

## 1. 台词改动（相对用户原稿，依据 `facts.md` / `facts-agent.md`）
| 位置 | 原稿 | 改成 | 依据 |
|---|---|---|---|
| 第 3 段、章节卡、总结 | 利息看银行 | 利息看报价 | 2026-11 公示利率：きのくに信金 1.150%〜、三菱 UFJ 1.195%、auじぶん 1.680%，我打开官网对过きのくに和 au |
| 第 3 段 | 单看利息，银行，特别是网络银行，往往更有优势 | 刚才是平均数，还包括企业贷款。单看房贷各家差得很大，有的信金比网络银行还便宜，看每家的报价 | 同上 |
| 第 3 段 | 从统计来看…高 0.3 到 0.5 | 从日银的统计来看…这里面包括企业贷款 | 日银 2026 年 8 月：差 0.472 / 0.342，全部贷款口径 |
| 第 3 段 | 贷三千万…是十二万 | 假设贷三千万…差不多十二万 | 35 年等额本息第一年约 11.9 万 |
| 第 2 段 | 很多信用金库是几千日元起步；都符合条件 | 一般五千到一万日元起步；都符合入会条件 | 施行令第 4 条の2；入会不等于能借到房贷 |
| 第 3 段 | 政府来检查 | 政府或者指定的检查机构确认 | 建筑基准法第 7 条の2 |
| 第 3 段 | 去大银行、网络银行，很多时候直接就借不了 | 不少银行都要看这份证明，没有的话可能就借不了 | 国交省「求められる場合が多い」；auじぶん 写中古一户建不需要 |
| 第 3 段 | 大银行是总部…没得商量；一般首付要多交 | 大银行一般是总部…很难商量；常见的是首付要多交 | 查不到官方依据，只当经验说 |
| 第 4 段 | 手续费往往低很多 | 买入手续费往往低很多 | 信托报酬不因渠道变低 |

- 配音读法：株式会社 → 股份公司（字幕「股份公司（株式会社）」）；担当者 → 负责人（字幕「负责人（担当者）」）；検査済証 → 竣工检查合格证（字幕同样写法，原稿叫「检查济证」）；NISA → 尼萨；数字写成中文读法。「永住」按原稿直接念。

## 2. 画面
- 17 个动画场景 + 片头标题卡 + 4 张章节卡，理解链在 `states.md`。官方原件 9 张（`facts.md` 第三节）。
- 新增物件（`src/episode/Scene.tsx`，只加不改）：`bldg`（bank / shinkin / diner / shop）。
- 封面：`src/cover/BankCover.tsx`，四个尺寸。片头卡写「牛丼老师的理财课」，圆标写「钱」。

## 3. 检查记录
| 项目 | 结果 | 证据 |
|---|---|---|
| 事实核对 | 14 条：要改口径的都改了；日银两份 PDF、国交省、金融厅、濑户信金、全信协、多摩信金、银行法我打开原件看过 | `facts-agent.md`、`m-raw/` |
| 自检 lint | FAIL 0；WARN 17（焦点稳定时间短于 hold、3 条短字幕、按字数估的触发点） | `build/lint.md` |
| 静帧 | 状态结束帧拼图看过一轮，改动的场景又看第二轮；修了：截图和卡片相压、红框偏位、段落开头 2～5 秒空白、emoji 显示不对。最后一版只抽了 30 帧成片看，166 帧审片拼图没有逐张再看 | `out/bank-sheets*`、`out/bank-final*` |
| 引用 | 9 张原件看过红框；`big-rate.png` 里的小数字在 960 宽下靠红框识别，字偏小 | 拼图 |
| 标题卡 | 片头卡和 4 张章节卡看过，一行不超 12 字 | 拼图 |
| 角色 | 老师、芝士全程在画面上 | lint 无 FAIL |
| 配音读音 | Whisper 逐句转写（mac-heavy-job 串行）：117 句，11 句相似度 < 0.9，看过都是数字写法和同音字；「股东！」转写成「古兜」，单词太短，未实听确认 | `audit.json` |
| 响度 | 静态增益 ＋6.8 dB ＋ 限幅，成片 −15.3 LUFS，峰值 −0.5 dBFS | `ffmpeg ebur128` |
| 成片规格 | 1920×1080 H.264 + AAC 192k，11:09 | `ffprobe` |
| 声音实听 | **未做**（没有人耳听整片）；11 个按字数估的画面触发点也没实听 | |
| 过程检查 | **只看了状态结束帧和成片抽帧**，没有逐段连续看转场 | |

## 4. 留给用户判断
- 口诀「利息看报价」是我改的。想改回「利息看银行」要动 3 句台词、1 张章节卡、1 张总结卡，但「特别是网络银行」按现在的公示利率站不住。
- 日银统计截至 8 月，还没反映 9 月加息；9 月数字的 PDF 11/6 还打不开。
- 公示房贷利率都是最优惠档，有条件；信金低的另算保证料或手续费，简介写了。
- 「信金能谈下来」「首付多、利率高、年限短」「总部统一审」是经验说法，没有官方依据。国交省 2003 年的请求同样发给了全国信用金库协会，信金不一定比银行松。
- 「三十多年来最高」日银声明没写，来自媒体（1995 年以来），基准贷款利率 1.5% 可交叉验证。
- `big-sk.png`、`big-boj.png`、`big-rate.png` 是同一文件几段上下拼的，不是连续截图。
- 700 万以下非会员小额贷款没有上片，金融庁告示原文没查到。
- 配乐借用固定资产税那期的 N1、N2。
````

</details>

### 附录 4：projects/manga-video/episodes/invoice-2026b/QC.md

原始位置：`/Users/wzz122/video-projects/manga-video/episodes/invoice-2026b/QC.md`；SHA-256：`0fad7b708cd7a4c0affc772497247e2b388c255e9ef1137e845b73f12ddf0d3e`。

<details>
<summary>展开完整原文</summary>

````markdown
# Invoice 登记号，小老板到底办不办？（易懂版）：QC

来由：用户看完上一版（`episodes/invoice-2026`，11:38）后提了四点：配音有些字、有些词的连读很奇怪；稿子晦涩、逻辑不顺，要给没学过税的小老板重写；名词（进项税额、销项税额）要用小例子讲；粉色零钱包图标不要。这一版是按这四点重做的，上一版保留没动。

## 1. 稿子

`lines.txt`，9 段 111 句，8 分 52 秒。和上一版比：

- 只留一条线：登记号办还是不办。顺序是算账的顺序：两个词（花店）→ 小生意的优待 → 带号的账单 → 先算不办 → 再算办 → 放一起比 → 三步决定。
- 每个名词先有例子再给名字：销项税额、进项税额、进项抵扣（花店的一束花 100 − 30 = 70）；免税事业者；Invoice；两成特例、三成特例、简易课税。
- 六个小例子：花店、朋友的设计工作室（销项 30 万、进项约 3 万）、客户是广告公司（有号交 70 万、没号交 100 万）、广告公司在各个时期多交多少、正常算 27 万对两成特例 6 万、三步各一个例子（美甲店、用简易课税的小公司、广告公司）。
- 主角从「做副业的芝士」换成「芝士的朋友开小设计工作室」。
- 删掉的内容和编的例子见 `facts.md`「二」「三」。

## 2. 画面

14 个动画场景 + 8 张章节卡（第一张是片头标题卡）。理解链在 `states.md`。

- **全片一种图**：一根「销项」长条，绿 = 能减掉的进项，橙 = 交出去的税，黄 = 减不掉。花店、广告公司、设计工作室都用它。
- **图表**：名词表（讲到一个出现一行）；广告公司「有号 / 没号」两根长条上下对比；办 / 不办对照表；客户亏多少（同一根 30 万，绿色一级一级变短，下面的表逐行出现）；你交多少（27 万 → 6 万 → 9 万）；行业表；**成对柱状图**（黄 = 不办客户最多亏，橙 = 办了自己交，四个时期并排）；三步决定表（每步的结论落进一行）。
- **钱包**：新画了一个普通皮夹（`Scene.tsx` 的 `prop` 加了 `wallet`），文字写「自己的钱包」。粉色零钱包图标没有再用。
- **官方原件 5 张**（国税厅），沿用上一版截好的，清单在 `facts.md`「四」。

## 3. 检查记录

| 项目 | 结果 | 证据 |
|---|---|---|
| 事实 | 制度数字和上一版核对过的是同一批；新加的只有例子里的假设数字，画面都标「例」 | `facts.md` |
| 自检 lint | FAIL 0；WARN 29，全部是「焦点稳定时间短于 hold」（连续的词触发，对象没退场） | `build/lint.md` |
| 触发时间 | 全部按配音里的停顿对到短语，没有按字数估的 | `build/cue-report.json` |
| 静帧 | 141 个状态结束帧按 9 张一页逐页看过；改了 9 处：结论印章压到长条、「两遍税」卡片压到进项条、Invoice 名词卡停留太短（多留一句并加 1.2 秒）、三个办法卡片提前消失、三成特例提示贴着名词卡、「2029 年以后」开头空屏（加了时间条）、对比图虚线框压到时间标签、对比图说明卡压到「21 万」、三步开头空屏（加了三步总览）。改完重截 17 个状态复查 | `成片/审片拼图/` |
| 引用 | 5 张原件各在状态中段按半幅（960 宽）看过：字读得清、红框没压字；简易课税那张原来压到上面的名词卡，下移后重新构建 | 同上 |
| 章节卡 | 8 张看过，标题都在白卡里，一行不超过 12 字 | 同上 |
| **配音评审（本机）** | `pipeline/voice-review.py`：111 句全部转写对稿子、量停顿和语速。**没有多字、漏字、词中间断开**。4 句个别字被听成别的音（抵扣、呢、往后、不办了），改断句重配后复查都对。另有 8 句按「配音文本保留引号」的规则补回「」重配 | `voice-review.md`、`voice-review.json` |
| 读音指定 | 这一版一个都没带（`pron.json` 是空的）；措辞上避开了「行 háng、就当、教课、空子、得 děi、差了」这些容易读错的字 | `lines.txt` 开头的说明 |
| 响度、规格 | 见文末「成片」 | |
| 封面 | 16:9、视频号 3:4 / 4:3 / 9:16、YouTube 缩略图；四张拼在一起看过 | `src/cover/InvoiceBCover.tsx` |

### 未做 / 机器确认不了的

- **声音没有人耳听过。** 评审查的是字对不对、停在哪、快慢，查不出声调自然不自然、语气怪不怪。
- 「进项」在 9 句里被转写成「镜像」（同一句里别的「进」字都转写对）。我的判断是转写模型偏向常见词，不是读错；机器确认不了。
- 每句语速有快有慢（老师 4.5 〜 8.1 字 / 秒，中位 5.9）：列举的句子慢、短句快。没有重配。
- 转场过程没有逐个抽连续帧，只看了状态结束帧、中段帧和成片抽帧。
- 审片页（HTML）没有出，用拼图代替。

## 4. 成片

| 项目 | 结果 | 证据 |
|---|---|---|
| 规格 | 1920×1080 H.264 + AAC 192k，8:52（531.8 秒），61 MB | `ffprobe` |
| 响度 | 静态增益 +6.9 dB + 限幅，成片 −15.2 LUFS，峰值 −0.3 dBFS | `ffmpeg ebur128` |
| 黑帧、静音 | 无黑帧，无 2.5 秒以上静音 | `blackdetect`、`silencedetect` |
| 成片抽帧 | 按状态从成片抽 141 帧拼成 16 页；改过的 9 个位置另拼一页看过 | `成片/审片拼图/` |

上一版（`episodes/invoice-2026`）的成片没有动。它的 `lines/` 里有 48 句在排查读音指定时重配过，和上一版成片的声音不再一致；原来的配音备份在 `episodes/invoice-2026/lines-before-review/`。
````

</details>

### 附录 5：projects/manga-video/learning/2026-10-29-両学長-税务图解/工作流-vNext.md

原始位置：`/Users/wzz122/video-projects/manga-video/learning/2026-10-29-両学長-税务图解/工作流-vNext.md`；SHA-256：`c5eafa5c24cc14ab51540f10183b12b854c8d429ad094f3344924049f53794f6`。

<details>
<summary>展开完整原文</summary>

````markdown
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
````

</details>

### 附录 6：projects/map-explainer/AGENTS.md

原始位置：`/Users/wzz122/video-projects/map-explainer/AGENTS.md`；SHA-256：`bfc7e6c4ec0afd3d0e33652e8de0efbc95f243431f65ccacaefb3cdbff3f1f90`。

<details>
<summary>展开完整原文</summary>

````markdown
# 地图解说视频项目规范（map-explainer）

参考风格：Wendao城市漫游——用地图讲城市历史、铁路、地形。每期都从一个旅行中的疑问开场，分章节讲清原因，最后回到实地体验收尾。

本文件是项目的规范，写稿、做画面、配音、混音、发布都按这里执行。

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
````

</details>

### 附录 7：projects/map-explainer/CLAUDE.md

原始位置：`/Users/wzz122/video-projects/map-explainer/CLAUDE.md`；SHA-256：`3d7af3d77be30fdce6781fc626ecd5f2fe3708be98514bc936f6dd195e44f32f`。

<details>
<summary>展开完整原文</summary>

````markdown
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
````

</details>

### 附录 8：projects/map-explainer/README.md

原始位置：`/Users/wzz122/video-projects/map-explainer/README.md`；SHA-256：`71ae73742a31452763518295499d19708887b9e62f3465d7aa82c0c1a4d26c00`。

<details>
<summary>展开完整原文</summary>

````markdown
# map-explainer · 地图解说视频项目

参考 Wendao城市漫游 的风格：用地图讲城市历史、铁路和地形。每期以一个旅行疑问开场，分章节讲清原因，最后回到实地体验。完整规范见 [CLAUDE.md](CLAUDE.md)。

## 目录

```
CLAUDE.md                 规范：选题、结构、motion-spec、工具链、授权、MiniMax 流程
components/
  _shared/                tokens.css（设计变量）、map-runtime.js（逐帧渲染运行时）
  map-flyto/              镜头飞行 + 地点标注
  line-draw/              线路按时间绘制 + 车站弹出 + 图例
  terrain-compare/        左右两地地形对比（国土地理院陰影起伏図 + 3D DEM）
  terrain-orbit/          立体地形运镜：高程配色 + 阴影 + 远景雾，俯视→斜视→绕转（TEST-S01 上町台地）
  old-vs-new/             老地图 / 现代地图卷帘对比
  chapter-card/           章节卡
  big-title-cover/        开场大标题 / 封面
episodes/_template/       script.md、shot-list.md、credits.md 模板
scripts/
  minimax_tts.py          分段配音 + timeline.json
  minimax_music.py        BGM 生成（仅老付费用户可用，见下文）
  mix.sh                  配音 + BGM 闪避 + 音效 + 响度标准化 → 成片
```

## 快速上手

```bash
# 1. 新建一期
cp -R episodes/_template episodes/ep01

# 2. 配置密钥（只写在 .env，不提交）
cp .env.example .env    # 填 MINIMAX_API_KEY / MINIMAX_REGION / MINIMAX_VOICE_ID

# 3. 写稿：episodes/ep01/script.md，每段以 "## S01 标题" 开头

# 4. 估算配音字数和费用（不发请求）
python3 scripts/minimax_tts.py episodes/ep01/script.md --dry-run

# 5. 确认后生成配音 → episodes/ep01/audio/vo/S01.mp3 … + timeline.json
python3 scripts/minimax_tts.py episodes/ep01/script.md

# 6. BGM：老付费用户用 API，其他用户去 MiniMax Audio 网页版生成后放进 audio/bgm/
python3 scripts/minimax_music.py --episode episodes/ep01 --dry-run

# 7. 画面：按 timeline.json 在 HyperFrames 里组合 components/*，渲染到 episodes/ep01/renders/video.mp4

# 8. 混音出片 → episodes/ep01/renders/final.mp4
bash scripts/mix.sh episodes/ep01 --check
```

## 组件预览与逐帧渲染

- **预览**：用本地静态服务器打开组件（`file://` 下 fetch 和协议可能受限），例如在项目根目录运行 `python3 -m http.server 8000`，再访问 `http://localhost:8000/components/map-flyto/`。页面会循环播放。
- **逐帧**：访问 `index.html?render`，先 `await window.__ready`，然后每帧 `await window.__seek(frame / 30)` 再截图。`__seek` 会等所有地图 idle（瓦片加载完、已绘制）之后才返回。
- **改参数**：编辑顶部的 `CONFIG`，也可以用 `<body data-config='{"duration":6}'>` 或 `?config=<urlencoded JSON>` 覆盖。
- 镜头移动都由 GSAP 时间线驱动，每帧调用 `map.jumpTo`。不要用 `flyTo` / `easeTo`。
- **出视频**：`node scripts/render_shot.mjs components/terrain-orbit --out episodes/test-s01/renders/TEST-S01.mp4`（先 `--stills 0,3,6,12` 看静帧）。依赖 `npm i` 装的 playwright-core + 本机 Playwright Chromium + ffmpeg。

## 音频

| 步骤 | 文件 |
|---|---|
| 配音 | `audio/vo/Sxx.mp3`、`Sxx.json`、`timeline.json` |
| 配乐 | `audio/bgm/*.mp3`（取按文件名排序的第一个，或 `--bgm` 指定） |
| 音效 | `audio/sfx/*.wav` + `audio/sfx/cues.csv`（每行：`时间秒,文件名,增益dB`） |

`mix.sh` 的默认设置：BGM -18 dB，以配音为侧链 sidechaincompress 压低；整体响度标准化到 -16 LUFS / -1.5 dBTP。`bash scripts/mix.sh --help` 可查看全部参数。

## MiniMax 音乐 API 说明

官方公告：**2026-08-20 起音乐付费 API 不再向新用户开放，free 版下线**，只有老付费用户可以调用。其他用户可以：

1. 在 [MiniMax Audio 网页版](https://www.minimax.io/audio) 手动生成，下载后放进 `episodes/<ep>/audio/bgm/`；
2. 自托管开源的 MiniMax Music 3（需要 NVIDIA GPU）。

## 授权

- 所有素材登记在 `episodes/<ep>/credits.md`，没核实的标「待核实」，不能进成片。
- 片尾和简介都要列出署名，并标注「旁白 / 配乐为 AI 合成（MiniMax）」。
- 配音只用 MiniMax 系统音色或本人声音克隆。克隆的 voice_id 7 天不用会被删除，首次使用收费 $1.5。

## 依赖

- Python 3.9+（只用标准库）
- ffmpeg / ffprobe ≥ 4.4
- 浏览器端组件从 CDN 加载 MapLibre GL JS 5 和 GSAP 3.13。定版渲染前锁定版本，字体改为本地文件。
````

</details>

### 附录 9：projects/video-factory/视频工厂/AGENTS.md

原始位置：`/Users/wzz122/Desktop/视频工厂/AGENTS.md`；SHA-256：`9cd7e800415265bebea7a13bedc90f30a1d3bbd4f0776bb2b87627b89c6543a4`。

<details>
<summary>展开完整原文</summary>

````markdown

## 默认图像风格与复查（用户指定，2026-10-02）

- 以后所有需要自行生成图像的地方，默认采用用户指定图二的圆润、亲切日式素材插画风；人物、物件、场景、封面背景等均沿用。后续用户另行指定时按新要求。
- 生成前查看永久参考图 `/Users/wzz122/Desktop/视频工厂/视觉规范/默认风格参考-图二-日式圆润插画.png`，支持参考图输入时传入此图。
- 每张图检查两遍：生成后检查风格、角色、面部/手脚、裁切和透明边缘；放入实际画面后再查位置、基线、比例、对齐、重叠与出界，并查看最终导出。发现问题先修正再交付。
- 用户接受更慢的生成和复查，优先画面质量与一致性。详见 `/Users/wzz122/Desktop/写稿/工作流/图像风格与复查规范.md`。

## 长视频必须便于局部修改（用户指定，2026-10-02）

- 制作20分钟左右样片前，按 `/Users/wzz122/Desktop/写稿/工作流/分段制作与局部修改.md` 先通过分段缓存/局部重渲验收。当前主引擎尚未实现此能力，不能直接宣称已支持。
- 按稳定镜头编号保留源文件、可编辑参数、素材、分段视频和修改版本；画面、字幕、旁白、音乐分开保存。
- 修改只重做实际受影响镜头；改变时长后重新计算总装时间，复用其余镜头。共享素材与转场须计入关联影响；全局改动可能需要较大范围重渲。
- 区分局部动画重渲与完整MP4重新输出；每次交付说明实际复用/重渲范围，保留旧版本与可编辑工程。

## 成片文字面向观众（2026-10-02用户审片修正）

- 制作流程、镜头指令、审稿备注和内部提示只放在分镜/修改单或预览界面外层，不画入视频。例如“原件 → 关键句 → 中文解释”“本样片先看…”“区间展开，方便…”不得作为成片字幕。
- 每遍画面复查同时检查文字是否适合观众；保留可核实的来源、日期、必要规则条件、示意或假设标识，表达简洁自然。
- 检查最终导出的关键帧，确认制作说明未烧入视频；源码和文字边界检查不能代替内容检查。
````

</details>

### 附录 10：projects/video-factory/视频工厂/CODEX-交接文.md

原始位置：`/Users/wzz122/Desktop/视频工厂/CODEX-交接文.md`；SHA-256：`78a8805810a14ff04f7bbc4bdf9f626a2f88ed14844ecaac3d11045c6adfbac7`。

<details>
<summary>展开完整原文</summary>

````markdown
> ⚠️ 本文已过期（2026-10-02）。最新交接见 `~/Desktop/写稿/CODEX-交接文-2026-10-02.md`。

# 交接文 · 给 Codex

> 写于 2026-09-21。交接人：Claude（Opus 5），在 `~/Desktop/写稿/` 这个会话里做完了一期片子。
> 读者：Codex。你接手的是一条**已经跑通、但有明确短板**的生产线。
> 这份文档告诉你：系统长什么样、我想最终做成什么、以及你该动哪里。

---

## 0. 三十秒版本

- 两个目录：`~/Desktop/写稿/`（写稿）和 `~/Desktop/视频工厂/`（出片）。**故意分开，不要合并。**
- 一条链路：`资料 → 稿子(.md) → 看版面校对 → 渲染 → 成片(.mp4)`，全程离线、零成本。
- 引擎代码是好的。**这次翻车翻在稿子层，而且系统没有任何闸门拦住它。**
- 你最该做的不是加功能，是**加校验**。详见第 5 节 P0。

---

## 1. 目录与职责

```
~/Desktop/写稿/                        ← 写稿。这里不许跑视频渲染（CLAUDE.md 有约束）
├── CLAUDE.md                          项目规则
├── 资料/<话题>/                        证据
│   ├── 数据.md                        ⭐ 证据卡片，每个数字带年份+出处+强度标注
│   ├── 我的观点.md                     ⭐ 用户口述的立场，风格是学的，观点只能是他的
│   ├── 报道摘录.md                     链接清单
│   └── 图/                            截图、图表
└── 成稿/YYYY-MM-DD-话题.md             ⭐ 产出，同时复制一份到视频工厂

~/Desktop/视频工厂/                     ← 出片。CPU 密集，单独开对话
├── 1-我的文案/                         .md 文案 + 素材/ + bgm.mp3
├── 2-成片/                             .mp4
├── 3-校对/<话题>/                      看版面生成的校对页
├── .work/                             中间产物（timeline.js / 逐帧 / 音频）
├── engine/                            ⭐ 引擎，见第 3 节
├── 看版面.command                      快（十几秒），只出版面不配音
├── 开始做视频.command                  慢（10 分钟片约 25 分钟）
└── 说明书.md                          给零基础用户看的

~/.claude/skills/news-explainer/        ← 写稿技能，见第 2 节
```

**为什么分开**：渲染很占上下文和 CPU。写稿那个对话要留着改稿，不能被渲染日志淹掉。
`~/Desktop/写稿/CLAUDE.md` 明确写了「不要在本项目里跑视频渲染」。**请保留这条约束。**

还有一件事：用户的原始素材放在
`~/Library/CloudStorage/GoogleDrive-wzzsgdtc@gmail.com/我的云端硬盘/写作/<话题>/`，
不在项目的 `资料/` 里。接活时先去云盘那个路径找。

---

## 2. Skills 说明

### 2.1 news-explainer

位置 `~/.claude/skills/news-explainer/`。触发词：「写稿」「写视频文稿」「新闻大写风格」。

```
SKILL.md                    主流程：6 步，严禁一步直出终稿
references/论证骨架.md       结构（五幕 + 3 个变体）
references/语言规范.md       句子、词表、信息强度、禁忌清单
references/版式速查.md       视频工厂的文案格式和 16 种版式
```

**SKILL.md 的六步**（这是硬流程，别跳）：

1. 读资料 → 压成证据卡片：`【事实】什么 ·【数字】多少（年份/来源）·【强度】已证实/有报道/仅传闻`
2. 选骨架（读 `论证骨架.md`）
3. 出 20~30 节大纲 → **先给用户过目**（用户说"直接写完"可跳）
4. 逐章写旁白（读 `语言规范.md`）
5. 配版式（读 `版式速查.md`）
6. 自查 → 交付，报告时长/章节数/用了哪些数据

### 2.2 四条铁律（违反其中任何一条，整支片子作废）

| 铁律 | 具体含义 |
|---|---|
| **论证学风格，观点只用用户的** | 语言和结构可以模仿，立场必须来自 `我的观点.md` |
| **数字必须来自资料** | 不得编造，**不得为行文顺畅改数字** |
| **信息强度如实标注** | 传闻写「网传」，未证实写「公开渠道找不到可靠报道」 |
| **用户说"不像"时要沉淀** | 问清是哪一类（用词/节奏/论证顺序/语气），把结论**写回 references**，再重写 |

第 4 条这次执行了：`语言规范.md` 新增第九节，`论证骨架.md` 新增「变体三 · 排除法」。
**这是这套技能能越用越准的唯一机制，请继续维护。**

### 2.3 风格要点（2026-09-21 新增，血泪换的）

**每一屏都必须有画面。** 参考文案（`视频工厂/1-我的文案/示例-*.md`）每一屏都是：

```
[版式] 数据或结构
# 大标题（判断句，带一处 ==高亮==）
3~5 句短旁白
```

大标题是**提炼**，不是旁白的复述。两者语域完全不同：

| 旁白（进字幕，被念出来） | 大标题（上屏幕） |
|---|---|
| 全国城市低保人数，从两百八十一万开始。一年后涨到四百零三万。 | `最疯狂的==一组曲线==` |
| 过去它是零敲碎打的。现在它变成了流水线。 | `这不是普通蒸馏` / `而是**工业化生产**` |

**必须删的第二类词：元话语。** 任何谈论这支片子本身的句子：
「这支片子…」「后面还要用到」「先说结论」「下面是三个推论」「记住这一点」。
参考文案里这类句子接近于零。这次删掉 52 句，一个信息点都没丢。

**句长目标 12 字上下**（原来 14~18 偏长）。参考实测 7~14 字。

---

## 3. 引擎（`视频工厂/engine/`）

### 3.1 文件与职责

| 文件 | 职责 | 行数量级 |
|---|---|---|
| `run.mjs` | 总指挥。找 ffmpeg → 扫素材 → 拆稿 → 配音 → 渲染 → 合成 | 中 |
| `parse.mjs` | ⭐ `.md` → 分镜 JSON（scenes/beats/elements） | 大 |
| `tts.mjs` | 逐句 `say` → aiff → wav，用真实时长对齐时间轴 | 中 |
| `render.mjs` + `cdp.mjs` | 驱动 headless chrome，逐帧 `__seek(t)` + 截图，管道喂 ffmpeg | 中 |
| `stage.html/.css/.js` | ⭐ 舞台。`window.__seek(t)` 给任意 t 返回确定的一帧 | 大 |
| `charts.js` | 图表按 0~1 进度自己画 | 大 |
| `mux.mjs` | 合成 + BGM 闪避 + 响度归一 | 小 |
| `preview.mjs` | 看版面（校对页） | 中 |
| `media.mjs` | 素材扫描 + 做旧 + 缩略图 | 小 |
| `align.py` / `clean.py` | 录音对齐 / 文案清洗 | 小 |

### 3.2 核心设计（三条，都很关键，别破坏）

**① 逐帧定格，不录屏。** 页面暴露 `window.__seek(t)`，渲染器按 `t = 0, 1/30, 2/30…`
逐帧调用并截图。机器再慢也不会掉帧。

**② 一整面连续的纸墙，摄像机在上面走。** `stage.js` 里那句注释是灵魂：

> 整面墙先铺一张连续的纸，这样镜头平移时两屏之间不会露出空白

所有 scene 摆在 `(x, y)` 上，换场 = 摄像机从上一幕终点插值到下一幕起点，
`TRANS = 0.72` 秒，中间加运动模糊 `blur = sin(q·π) × 5`。

```js
wall.style.transform =
  `translate(${VW/2}px, ${VH/2}px) scale(${cam.zoom}) translate(${-cam.cx}px, ${-cam.cy}px)`;
```

**③ 元素跟着旁白出现。** `beat.show = [id…]`，每句旁白揭开它对应的元素。
不是整屏一起淡入。图表则按幕内进度 `p = (t - appearT) / (endT - appearT)` 逐段画。

### 3.3 设计系统（`stage.css` 头部，复刻「纸质版画 / 复古印刷」）

```css
--paper:#ece5d8   --paper-hi:#f6f1e6   --card:#f7f3e9   --doc:#fffdf8
--ink:#1c1a17     --ink-soft:#3d3931   --muted:#8d8474
--red:#b23a25     --red-deep:#8e2c1b   --olive:#5f6b46
--hl:#f2dd4e      --line:#c9c0ae
--serif:"Songti SC"   --sans:"PingFang SC"   --hand:"Kaiti SC"
1920 × 1080
```

**只有一个强调色（砖红）。中文大标题用粗宋体，不是黑体——这条最关键。**

### 3.4 config.json

```json
{ "fps":30, "voice":"Tingting", "rate":168, "gap":0.3, "coverHold":3.2, "tail":1.2,
  "mediaGrade":0.75, "duck":true, "duckRatio":8, "duckRelease":500,
  "loudness":-14, "bgmFade":2.5, "bgmLoudness":-33, "bgmVolume":1 }
```

---

## 4. 最终想做成什么

### 4.1 目标

**一个人，用一台离线的 Mac，稳定产出「新闻大写 / 正确君」那个水准的 20~35 分钟深度解说视频。**

不是「能出片」，是**能出好片**。判断标准是并排放在参考片旁边不露怯：

1. 排版像印刷品，不像商务 PPT
2. 大标题是粗宋体
3. 强调色只有一个
4. 动画有语义（折线图是画出来的，方块图是填出来的）
5. 换屏是镜头移动，不是硬切
6. 数据图讲到最后一个数时镜头推近那个点
7. 每个数字都能追到一手来源

### 4.2 完整流程

```
① 攒资料      用户把截图/PDF/链接丢进云盘 写作/<话题>/
      ↓
② 整理证据    → 资料/<话题>/数据.md（每个数字带年份+出处+强度）
              → 资料/<话题>/我的观点.md（用户口述，最重要）
              ⚠ 这一步要做真研究：用户给的两三份材料只是线索，
                必须自己查到一手来源（官方统计表、原始 CSV、同行评议论文）
      ↓
③ 写稿        news-explainer 六步 → 成稿/YYYY-MM-DD-话题.md
              ⚠ 每一屏都要有 # 或 [版式]
      ↓
④ 自查        句长 / 禁用词 / 元话语 / 每屏有画面 / 图表数字可溯源
      ↓
⑤ 看版面      双击 看版面.command（十几秒）→ 3-校对/<话题>/ 校对页
              用户在校对页写意见 → 点「复制全部意见」→ 粘回来改
              ⚠ 循环这一步，直到版面顺了再往下
      ↓
⑥ 出片        双击 开始做视频.command → 2-成片/<话题>.mp4
      ↓
⑦ 发布        （目前还是手动）
```

### 4.3 这一期做到哪了

话题「日本人为什么停止长高」。当前状态：

| 项 | 值 |
|---|---|
| 成稿 | `成稿/2026-09-21-日本人身高.md` |
| 规模 | 27 章 / 121 屏 / 447 句 / 5446 字 / 约 21.6 分钟 |
| 画面覆盖 | 121/121 |
| 角度 | 一份劝孕妇少长肉的官方指导，压住了一代人的身高，2021 年官方认账，但不可逆 |
| 结构 | 变体三 · 排除法（排除「穷」→ 排除「吃得差」→ 逼进产房 → 那份文件） |
| 证据 | `资料/2026-09-日本人身高/数据.md`，25 张卡片，含「查不到/不可用」一节 |
| 配图 | 9 张 Wikimedia CC/公有领域 + 2 张用户提供，逐张署名 |
| 未做 | **还没出过片**（没跑 `开始做视频.command`） |

另有两个网页预演（不是成片，只是给用户看效果）：
- 静态 PPT `claude.ai/artifact/8wE7hdH8n1yD1MoxprQkFv` —— **已过期，是旧稿 33 章那一版**
- 动画预演 `claude.ai/artifact/9vUa48usBiTudSRBu5MpT1` —— 当前稿，浏览器 TTS 自动播

---

## 5. Codex 可以优化的

按优先级。每条给：**现状 / 问题 / 建议 / 验收**。

### P0 — 质量闸门（这次就是栽在这儿，最值钱）

#### P0-1 「无画面屏」没有任何警告 ★ 最高优先级

- **现状**：`parse.mjs` 的 `LAYOUTS._bare` 处理没写 `#` 也没写 `[版式]` 的屏，
  注释写着「不重复旁白」——设计是对的，它会渲染「标题 + 红线 + 淡淡的大号序号」。
- **问题**：`sc.head` 为空时，这一屏就是**一个序号加一条红线的近乎空白版面**。
  这次 159 屏里有 124 屏是这样，没有任何环节提醒。用户看到成品才发现。
- **建议**：
  1. `parse.mjs` 统计 `!sc.head && !sc.items.length` 的屏，`run.mjs` 打印
     `⚠ 第 N 屏无画面（文案第 X 行）`，并给出占比。
  2. 占比 > 20% 时 `开始做视频.command` **直接拒绝出片**，提示先补标题
     （给 `--force` 逃生口）。
  3. 校对页（`preview.mjs`）把这类屏的卡片描红，标「⚠ 这屏没有画面」。
- **验收**：拿一份故意只写旁白的文案跑 `看版面`，每一屏都描红且命令行有汇总。

#### P0-2 图表数字无溯源

- **现状**：`[折线图] 1994:170.9 | 2001:170.9` 里的数字，从文案到画面无任何校验。
- **问题**：`版式速查.md` 写了「每一个数字必须来自证据卡片」，但这是**纪律不是机制**。
  我这次写第一版时，有 11 张图表里塞了插值点（为了让折线好看），自查才发现。
  一旦漏掉，就是带着编造数据的成片。
- **建议**：
  1. 支持可选标注 `[折线图|src=数据.md#A] 1985:170.4 | 2019:172.1`。
  2. 没有 `src` 时，至少在校对页末尾自动汇总一张「本片全部图表数字」清单
     （屏号 / 版式 / 数字串 / 文案行号），方便人工逐条核。
  3. 进阶：把 `资料/<话题>/数据.md` 当数据源，做子串匹配，标出**在数据.md 里找不到的数字**。
- **验收**：校对页底部出现数据清单；故意写一个资料里没有的数字，被标黄。

#### P0-3 长句切不动

- **现状**：字幕超 18 字时在逗号处切（`splitLines`）。
- **问题**：没有逗号的长句切不动。这次 22 句切不动，全靠人工改写。
- **建议**：逗号切完仍超长时，退化到虚词边界（`的/是/在/和/与/从/到/把/被/就/都`），
  再不行就硬切并**打警告**，不要静默放过。
- **验收**：`一九八〇年日本新生儿平均体重三千一百八十九克。`（23 字，无逗号）能被切成两条。

---

### P1 — 动画表现力（拉开和参考片差距的地方）

#### P1-1 推镜只覆盖两种版式

- **现状**：`parse.mjs` 里 `FOCUS_LAYOUTS = { 折线图:{dx:.70,dy:.34,zoom:1.45}, 柱状图:{dx:.74,dy:.46,zoom:1.4} }`
- **问题**：只有折线图和柱状图会在最后一句推近。其余版式全程不动。
- **建议**：补这几种，每种推的地方不一样——
  | 版式 | 推向哪里 |
  |---|---|
  | `[方块图]` | 最后填上的那一格 |
  | `[下坠]` | 跟着小人往下摇（不是推近，是纵向跟随） |
  | `[流程]` | 横向跟随箭头，念到哪一环推到哪一环 |
  | `[公文]` | 推近正文里被引用的那一段 |
  | `[汇聚]` | 从多路起点拉到汇聚点 |
- **验收**：截中途帧能看到镜头位置随旁白推进，且目标始终在画面内（边界夹取已有，别破坏）。

#### P1-2 入场动画没有语义分配

- **现状**：`stage.js` 支持 8 种（`up/down/left/right/pop/stamp/fade/draw`），
  但 `parse.mjs` 基本按默认 `up` 发。
- **建议**：让 `LAYOUTS` 每种版式自己指定，例如
  `[列表]` 条目 `left` 依次推入；`[对比]` 左块 `left` 右块 `right` 对推；
  `[公文]` 用 `draw`（clip 擦除，像打印出来）；`[靶心]` 用 `pop` 由内向外。
- **验收**：并排看两屏不同版式，入场方式明显不同。

#### P1-3 换场是直线插值

- **现状**：`camOf` 用 `easeInOut` 直线 lerp。
- **建议**：加一点弧度（二次贝塞尔控制点垂直偏移 6~10%），
  以及换场时先微退再推进（pull-back 4% → push-in），更像真实运镜。
  **幅度要克制**，过了就晕。
- **验收**：转场那一帧能看到两屏同框，且轨迹不是纯直线。

---

### P2 — 流水线效率

#### P2-1 渲染慢

- **现状**：10 分钟视频约 25 分钟渲染（说明书自述）。单实例串行 `__seek` + 截图。
- **建议**：
  1. **分段并行**：按 scene 边界切成 N 段，起 N 个 headless 实例各渲一段，ffmpeg concat。
     这是收益最大的一条，N=4 大概能到 3 倍。
  2. **静帧去重**：旁白中段画面常常完全不动。检测连续相同帧，只编码一次，
     用 `-vsync vfr` + 时间戳。
  3. 截图用 JPEG q=92 而不是 PNG（如果现在是 PNG）。
- **验收**：21 分钟的这份稿子，渲染时间从预计 ~50 分钟降到 20 分钟以内。

#### P2-2 TTS 逐句起进程

- **现状**：`tts.mjs` 每句写一个 txt、起一次 `/usr/bin/say`、再起 ffmpeg 转 wav。
- **问题**：这份稿 447 句 = 约 900 次进程启动。
- **建议**：`say` 支持一次读整个文件；可以用标记词分段后一次合成再按静音切分，
  或至少把 aiff→wav 那步合并成一次 ffmpeg concat。保留「用真实时长对齐」这个正确设计。
- **验收**：配音阶段耗时降一半以上，且时间轴对齐精度不变（字幕误差 < 0.1 秒）。

#### P2-3 无增量缓存

- **现状**：`.work/` 每次全量重建。改一行文案 → 全片重渲。
- **建议**：按 scene 算内容哈希（elements + beats 的 say），只重渲哈希变了的段，
  音频同理（改一句只重配那一句）。
- **验收**：改一句旁白后重跑，耗时应该是分钟级而不是小时级。

---

### P3 — 素材与合规

#### P3-1 素材没有授权字段

- **现状**：`媒体扫描 media.mjs` 只认文件，没有元数据。
- **问题**：这次用了 9 张 Wikimedia 的 CC 图，**署名只能手写进版式参数**，
  容易漏。漏了就是侵权。
- **建议**：约定 `素材/图名.jpg.txt` 存 `作者 · 许可 · 来源URL`，
  渲染时自动打在右下角小字（已有 `.el.tag` 样式可复用）。没有这个文件就警告。
- **验收**：放一张带 `.txt` 的图，成片右下角自动出现署名；不带的，命令行警告。

**顺带一条纪律**：新闻社照片（共同社/朝日/路透/Getty）**不要下载使用**。
可用来源是 Wikimedia Commons 的 CC/公有领域、日本政府统计（政府標準利用規約，
需署名）、以及用户自己的截图。

---

### P4 — 稿件工具链（跨两个目录）

#### P4-1 写稿侧缺一个 lint

- **建议**：在 `~/Desktop/写稿/` 加一个 `check.py`，出片前跑一遍，输出一张体检表：

```
屏数 / 章数 / 旁白句数 / 字数 / 估算时长（字数÷4.2）
⚠ 无画面的屏         → 屏号 + 文案行号
⚠ 超 18 字的句子      → 行号 + 原句
⚠ 禁用词             → 语言规范.md 第二节那张表
⚠ 元话语             → 语言规范.md 第 9.2 节那张表
⚠ 图表数字在数据.md 里找不到 → 屏号 + 数字
⚠ 章节标题是名词短语（应为判断句）
```

- **验收**：对当前这份稿跑，应该全绿（我已经手工过了一遍）。
  对 git 里的旧版本跑，应该能报出 124 个无画面屏。

#### P4-2 时长估算不准

- **现状**：预览模式用 `fakeTiming`，按字数 ÷ 4.2 估。
- **问题**：跟真配音有偏差（数字念得慢，标点停顿也算）。
- **建议**：抽样跑 20 句真 TTS，拟合一条「字数 → 秒数」的回归（对数字和标点单独加权），
  用它替换 4.2 这个常数。
- **验收**：预览估算和成片实际时长误差 < 5%。

---

## 6. 环境事实（直接用，别自己找，这些都是坑）

```bash
# ffmpeg：系统没装 brew，用 Python 包里自带的
python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"

# 无头浏览器：必须用这个。普通 Chrome 加 --headless=new 在这台机器上启动即退
~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell

# 中文 TTS：macOS 自带，免费离线
say -v Tingting -r 168 -f 文本.txt -o 输出.aiff --data-format=BEI16@24000
#   ⚠ 必须 BEI16（大端）。LEI16 会报 "Opening output file failed: fmt?"

# 音频时长
afinfo 文件.aiff | grep "estimated duration"

# 本地语音识别（录音对齐用，模型已缓存，离线可跑）
python3 -c "import mlx_whisper"     # mlx-community/whisper-large-v3-turbo
#   ⚠ mlx_whisper 会在 PATH 里找名为 ffmpeg 的可执行文件，记得自己补
```

**这台机器上 python3 是 /usr/bin/python3（3.9），没有 poppler、没有 pyobjc/Quartz。**
读 PDF 别指望 `pdftotext`，我这次是自己写 zlib + 正则抽的 FlateDecode 流。

---

## 7. 不要做的事

1. **不要把写稿和出片合并到一个目录/一个对话。** 渲染会淹掉写稿上下文。
2. **不要改 `stage.css` 的调色板和字体**，除非用户明确要求。
   粗宋体 + 单一砖红是这套风格的命根子。
3. **不要把旁白原文搬上屏幕。** `_bare` 的「不重复旁白」是对的，别改。
   屏幕缺内容时，正确做法是**回去给文案补标题**，不是让引擎把旁白贴上去。
4. **不要为了图表好看插值补点。** 资料里没有的数字就不用这个版式，改用 `[卡片]` 或 `[列表]` 描述。
5. **别把这份交接文和 A/B 对比任务书搞混。**
   `视频工厂/对比实验/给CODEX的任务书.md` 是另一件事：让你**从零独立实现**一套，
   放在 `~/Desktop/视频工厂B/`，并且明令禁止读 `engine/` 的代码，目的是做 A/B 对比。
   截至今天 `视频工厂B/` **还不存在**，那个任务没开始。
   **这份交接文说的是 A 方案——是让你读 `engine/` 并改进它。两者互斥，先跟用户确认做哪个。**
6. **不要用付费 API、不要联网依赖。** 运行时必须离线可用。

---

## 8. 建议的接手顺序

```
第 1 步  跑一遍现有流程，建立手感
        cd ~/Desktop/视频工厂 && ./看版面.command
        （文案已经在 1-我的文案/2026-09-21-日本人身高.md）
        看校对页，感受一下 121 屏长什么样

第 2 步  出一次片，测基线
        ./开始做视频.command
        记录：总耗时、峰值内存、字幕对齐误差
        ⚠ 这是这份稿第一次出片，可能会暴露新问题，如实记下来

第 3 步  做 P0-1（无画面警告）
        这条最便宜、收益最大，而且能防止同类事故重演

第 4 步  做 P0-2 和 P4-1（数据溯源 + check.py）
        这两条是一件事的两头

第 5 步  做 P2-1（分段并行渲染）
        在动画之前先把迭代速度提上来，后面调动画才不痛苦

第 6 步  再做 P1 那一组动画
```

---

## 9. 一句话总结

这条流水线的工程部分已经跑通了，**短板不在代码能力，在没有闸门**。

用户的原话是「PPT 出来这种动画效果，不是让你一行一行地显示，是抓重点显示」。
事故的完整链条是：稿子 124 屏没给画面 → 引擎按设计渲染成近乎空白的版面 →
没有任何环节报警 → 一路走到用户眼前。

**你加的第一个 assert，比你加的前十个动画都值钱。**
````

</details>

### 附录 11：projects/video-factory/视频工厂/模板-v6/README.md

原始位置：`/Users/wzz122/Desktop/视频工厂/模板-v6/README.md`；SHA-256：`8cf3283468885d5c3821a428984f29d173521f8f5521b56c3052bcaf6671117b`。

<details>
<summary>展开完整原文</summary>

````markdown
# 模板-v6：每期视频画面与总装的固定做法

**一句话**：用户看完大阪 USJ v6 成片说「做得非常好，非常非常好」（2026-10-07），这套做法从那期原样固化下来。以后每期都用 `新建一期.py` 从这里搭，照着写镜头脚本、渲染、总装，不再从 USJ 目录拷文件。

流程：稿子 md → MiniMax 配音 `<文案名>.旁白.wav` → 视频工厂 `run.mjs` 对齐出真实每句时间 → `新建一期.py`（建目录、拷模板、定时间轴、写 `项目.json`、每屏一个镜头脚本骨架）→ 写 `镜头脚本/*.py` → `render()` 分镜头渲染 → `总装v6.py`（配乐、音效、字幕、底部导航）→ 质检 → 封面。

**每期不同的东西全写在 `画面v6/项目.json`**（期名、片名、成片路径、旁白、时间轴、素材目录、章名、导航 8 段、配乐分段、刻意音乐动作、封面钩子字），代码文件不改。

---

## 画面硬规则（2026-11-07 用户审片「股神水谷 v7」后定，优先于本文其他写法）

用户原话：「老是图片一闪而过；背景统一，不要黑白；图片正常颜色；图片有时不能全屏；少点 Claude 痕迹，特别是字体」。

1. **停留**：图片最短停 2 秒；带字要读的（推文、截图、券商弹窗、海报、新闻字幕）≥3.5 秒或跟念到它的旁白停够。禁止一闪而过的插镜（`flash()` 停用：水谷 v2 那期的 v6lib 调用即报错；模板 v6lib 也不许再调）。节拍「强」用数字砸停、推近、少量盖章表现，不用快切。
2. **原色**：真实图片、截图、新闻画面一律原色，不做黑白、去饱和、红黑调色、做旧、duotone、filter。
3. **背景统一**：全片一个底（纯色或极淡纸色，如 `#ece5d8`）；片头/序幕不单独换黑底；不加纸纹、格线、暗角、颗粒。
4. **图要大**：图是主角时满屏铺满（左侧压暗保证标题可读），或宽 ≥ 画面 65% 居中；截图放大到字看得清（高 ≥ 画面 60%，横条形截图铺满宽度）。说明标签压在图上或放图旁，不要一张小卡配一堆小字。
5. **不空屏**：每屏 0.5 秒内主体上屏；章节卡用大字章卡（章名 ≥180px），不用几个小方框；结尾用干净大画面收住片名；不用 32 张缩略图的回顾墙。
6. **字号（1080p）**：正文 ≥40px，标签 ≥32px；日文原文可小，中文翻译必须大；屏上日文都要有中文。
7. **数字**：折线终点数字不能从「0」滚起（线画到终点后再出现，或从起始值滚）；跌幅/负数滚动全程带「−」。
8. **去 AI 模板味**：字体用可免费商用的思源黑体 Source Han Sans（标题 Heavy，正文 Regular/Medium，OFL）或得意黑 Smiley Sans；数字用 Oswald 或 Barlow Condensed（OFL）；字体文件和授权放工程 `素材/字体/`，用 @font-face 引用；不用宋体/楷体/手写体。荧光笔全片 ≤3–5 处真正重点；去掉胶带、便签纸、手写旁注、圆角药丸标签（改方角色块字条）、「——」落款、做旧暗角、倾斜和堆叠投影卡片；盖章全片 ≤2–3 个。版式学正经新闻解说频道：大图 + 简洁下三分之一字条 + 大号数字，层级靠字号和粗细。封面同样换字体、去荧光笔。
9. **交付前**：1 秒一帧全片抽帧逐张看（无空屏、主图够大、字可读、无黑白、无闪图、无数字 bug、无日文无翻译）；另起只读子代理按同一清单独立复查；附每张图停留时长表。

**照着做的样板**：`~/Desktop/视频工厂/样片/2026-11-06-股神水谷v2/画面v6/`——`本期工具.py`（`开 / 图 / 满屏 / 条 / 字 / 章卡 / 推文 / 题 / 角标`）、`工程/engine/stage.css` 末尾「v7b 新闻解说主题」、`质检/v7b检查.py`（自动查停留时长和禁用项）、`质检/图片停留表-v7b.md`。新一期把这几样拷进本期再用，不改样板原件。全文：`~/Desktop/视频工厂/制作规范/画面硬规则-2026-11-07.md`、`~/Desktop/视频工厂/视觉规范/新闻解说版式规范-v7b.md`。

**模板已同步 v7b**（2026-11-07 04:50，Claude）：`工程/engine/stage.css` 末尾「v7b 新闻解说主题」、`fx.js`（折线终点数字/节点按线走到才出现）、`stage.js`（开头硬切元素第 0 帧就完整显示）、`engine/assets/` 思源黑体 + Oswald、`v6lib.py`（`flash()` 调用即报错、卡片不倾斜不落下、跌幅条滚动带负号、计数器不露前导 0、镜头开头元素硬切）、`总装v6.py`（字幕/导航用思源黑体）、`新建一期.py`（复制 `素材/字体/`）。版式小工具参考 `示范/本期工具-v7b新闻解说版式参考.py`（开/图/满屏/条/字/章卡/推文/题/角标），自动质检 `示范/图片停留检查-v7b.py`（带字图片的文件名规则按本期改）。旧版备份为各文件 `.bak-20261107`。模板本身未单独跑自测，改动已在水谷 v2 期 56 镜头全片渲染、总装、逐秒抽帧验证。

---

## 1. 模板里有什么

| 文件 | 干什么 |
|---|---|
| `新建一期.py` | 一键搭一期（见第 2 节） |
| `定时间轴.py` | 工厂对齐分镜 → v6 时间轴 `storyboard-audio.json`（直接转 / 精剪 / 照抄，见第 4 节） |
| `v6lib.py` + `v6lib-接口说明.md` | 写镜头脚本用的组件库（放大镜、荧光笔、数字滚动、盖章、拟声字、视差、打字卡、视频卡等组件）、拼分镜、检查、渲染、抽帧 |
| `总装v6.py` | 分镜头 mp4 + 旁白 + 配乐 + 音效 + 字幕 + 底部导航 → 成片（只用 ffmpeg + numpy；`--start/--test` 出测试片） |
| `工程/engine/` | 档案纸主题舞台快照：`stage.html/css/js`、`charts.js`、`fx.js`（v6 组件）、`cdp.mjs`（无头浏览器）、`assets/paper-*.png`（纸纹） |
| `工程/分段渲染.mjs` | 按镜头逐帧截图、按指纹缓存（没改的镜头秒级复用）；平时由 `render()` 调用。缓存键与电脑无关（2026-10-08 起分镜里的 `file://` 路径按文件内容哈希算），Mac mini 和笔记本共用云盘里的镜头缓存 |
| `工程/做纸纹.py` | 重新生成纸纹 PNG（固定种子，重跑逐字节相同） |
| `声音/做音效-v6.py` + `声音/音效/` | 程序合成音效库（无采样、无版权）；`音效/说明.md` 有每个文件的用途和对齐方法 |
| `声音/做闪避对比.py` | 60 秒闪避对比样（压 7 dB / 3 dB / 不压），用户听后定 `配乐.闪避dB` |
| `质检/章节自查图.py` | **（2026-10-23）每章渲染后**：每章一张按时间对齐的大图（每秒缩略图 + 静止 ≥ 4 秒橙条 + 旁白波形 + 逐句字幕 + 音效 + 镜头分界），Claude 读图挑错；`python3 质检/章节自查图.py --章 2`，`--镜头 S06-S10`，`--出 目录` |
| `质检/抽帧拼图.py`、`质检/校验测试片.py` | 成片每 2 秒抽帧拼图、每镜末帧；测试片 / 成片的响度、配乐、音效时刻校验 |
| `示范/` | USJ 的三个示范镜头脚本（S19 原件放大镜、S20 立体横条盖章、S37 视差计数集中线），**只看写法**，镜头号和句号只对 USJ 时间轴有效 |
| `封面/提示词-示例-电影感.txt` | **默认封面**（大時叔叔电影感版式）的 Codex 背景图提示词示例（股神水谷定稿）；配合 `~/Desktop/写稿/工具/电影感封面.py` |
| `封面/提示词-示例-USJ-v2连续轨道.txt` | 封面主体图的 Codex 提示词示例（一次 6 张不同构图、轨道必须连续、左上留出标题位；配合 `~/Desktop/写稿/工具/格子纸封面.py`） |
| `项目-示例.json` | USJ v6 如果用模板搭，`项目.json` 就长这样（所有字段的真实例子） |
| `_来源快照/` | 从 USJ v6 拷模板时的原文件和 SHA256（以后 USJ 再改时，用它对比、合并改动） |

## 2. 新一期怎么搭

```bash
T=~/Desktop/视频工厂/模板-v6
# ① 推荐：本期工程已经用视频工厂对齐过（工程/.work/storyboard.json 在）
python3 $T/新建一期.py 2026-10-20-某题 ~/Desktop/写稿/成稿/2026-10-20-某题-v1.md \
        ~/Desktop/视频工厂/样片/2026-10-20-某题/工程/.work/storyboard.json --资料 ~/Desktop/写稿/资料/2026-10-某题
# ② 只有配音：脚本会搭好 样片/<期>/工程/（引擎快照 + 稿子、配音链接），打印对齐命令；对齐完再跑一次 ①
python3 $T/新建一期.py 2026-10-20-某题 <稿子.md> <文案名>.旁白.wav
# ③ 复用现成的 v6 时间轴（自测、换期复用）
python3 $T/新建一期.py <期> <稿子.md> 旁白.wav --时间轴 某期/画面v6/工程/.work/storyboard-audio.json
```

- 第一个参数可以只写期名（= `~/Desktop/视频工厂/样片/<期名>`）。`--资料` 让 `项目.json` 自动带上证据卡、截图目录、视频目录。
- 对齐（②那一步）要跑 Whisper：`mac-heavy-job.py` 包着跑，退出码 75 = 别的重任务在跑，等，不删锁。日志出现「正在渲染画面」时 `.work/storyboard.json` 已写好，可以等工厂成片跑完（当兜底预览，10 分钟片约半小时），也可以 Ctrl-C 停掉。
- 重跑安全：已有的 `项目.json` 字段、镜头脚本、素材都不覆盖，只补空着的。`--更新模板` 才会用模板新版覆盖代码文件（改了 engine 等于全片重渲）。

搭好之后的 `样片/<期>/画面v6/`：

```
项目.json                本期设置（第 3 节）
v6lib.py  v6lib-接口说明.md  总装v6.py  定时间轴.py
工程/engine/  工程/分段渲染.mjs  工程/做纸纹.py  工程/指纹-来源.txt
工程/.work/storyboard-audio.json   时间轴（定时间轴.py 写）；同目录还有 时间轴-屏信息.json、时间轴-报告.txt
镜头脚本/S01.py …        每屏一个骨架（注释里有该屏旁白的句号与时刻、时长、稿子原文）
镜头/                    每个镜头一个 mp4（按指纹缓存）+ manifest.json
素材/ 帧/ 原件/ 生成/ 序列/   截图帧、原件页、Seedance 片段、视频卡 JPG 序列缓存
声音/ 旁白.wav  音效/  做音效-v6.py  做闪避对比.py  配乐-M1…mp3（按音乐表生成后放这里）
封面/ 候选/ 成品/        质检/ 抽帧拼图.py 校验测试片.py       自测/        示范/
```

## 3. `项目.json`（每期改这一个文件）

相对路径都按 `画面v6/` 目录算。完整例子：`项目-示例.json`（就是 USJ v6 的设置）。

| 字段 | 例子 | 用在哪 | 改了要重渲吗 |
|---|---|---|---|
| `期名` | `2026-10-06-大阪USJ` | 字幕文件名、默认成片名 | 否 |
| `片名` | `大阪USJ有多牛逼` | 记录 | 否 |
| `稿子`、`证据卡` | md 路径 | 记录、写镜头脚本时查数字 | 否 |
| `成片输出` | `~/Desktop/视频工厂/2-成片/<期名>-v6.mp4` | 总装输出 | 否 |
| `旁白` | `声音/旁白.wav` | 总装、闪避对比（与时间轴对齐的那条，定时间轴写出） | 否 |
| `时间轴` | `工程/.work/storyboard-audio.json` | v6lib、总装 | — |
| `兜底分镜`（可省） | 旧画面分镜 json | 没写脚本的镜头拿它预览 | — |
| `素材目录` | `["素材", "~/Desktop/写稿/资料/<期>/素材/截图"]` | `asset()` 按顺序找图 | 换了图才重渲 |
| `视频目录` | `["素材", "素材/生成", …/素材/视频/片段, 成品, 原始]` | `videocard()` 找视频 | 同上 |
| `章名` | `{"1": "从谷底，到世界第一的射程", …}`（≤10 字，与稿子 `##` 一致） | 右上章标 | **是**（画在镜头里） |
| `章号文字`（可省） | `{"1": "引子"}` | 把「第 1 章」那行换掉 | 是 |
| `章卡`（可省） | `{"S08": ["起点","危机","转折","突破"]}` | `chaptercard(..., keywords=None)` 按当前镜头读取；不会自动插镜头或时间 | 是（使用该字段的镜头） |
| `接缝淡化`（可省） | `[{"镜头":"S08","秒":0.25}]` | 指定镜头开头冻结前镜末帧，交叉淡化到本镜原有帧；省略或 `[]` 全硬切 | 仅总装 |
| `章标覆盖`（可省） | `{"S52": 14}` | 某镜头的章标显示别的章 | 是 |
| `导航` | `[{"标签": "开园盛况", "起镜头": "S02"}, …]` 默认 8 段，标签 4 个字左右 | 底部导航栏 | 否 |
| `配乐.闪避dB` | `3.0`（按闪避对比样用户定） | 说话时音乐再压几 dB | 否 |
| `配乐.分段` | `[{"名": "M1", "曲子": "配乐-M1-开场到开园.mp3", "起镜头": "S02", "止镜头": "S07b", "对齐": "开头", "比人声低dB": 20}, …, {"…", "对齐": "结尾", "src_end": 128.0}]` | 按结构段铺配乐（段与段首尾相接；曲子不够长会在乐句处循环；`src_end` = 让曲子这一秒落在段末；`最多接缝` 默认 3，曲子比段落短很多续不够时写 4） | 否 |
| `配乐.刻意动作` | `[{"种类": "收住", "曲段": "M2", "淡出秒": 1.5}, {"种类": "上扬", "曲段": "M3", "锚点": "美国人", "后延秒": 0.2}, {"种类": "抽空再进", "锚点": "所以我的判断是", "提前秒": 0.8, "退秒": 0.25, "进秒": 0.3}]` | 12 分钟以内 2–3 次，对准结构转折；锚点是旁白原文片段，全片只能出现一次；每种最多一次 | 否 |
| `配乐.刻意动作区间` | `[[211.0, 216.2], [565.0, 567.8]]` | 配乐床电平骑行不碰的全片秒数区间（刻意动作前后各留 0.3–0.5 秒） | 否 |
| `封面` | `{"主体图": "封面/候选-v2/原图-02.png", "标题": {"行": [{"片段": [["目标","墨"],["全球第一！","红"]], "字号": "大"}, …]}, "尺寸": {"yt": {…}, "16x9": {…}, "4x3": {…}, "3x4": {…}, "9x16": {…}}, "文件名": "…"}`（完整见 `项目-示例.json`；不写「尺寸」= 旧的钩子字用法） | `格子纸封面.py` | 否 |
| `色板`（可省） | `{"red": "#B03A33"}` | 组件默认颜色（同时改 `stage.css` 的 `:root`） | 是 |

## 4. 定时间轴（`定时间轴.py`，新建一期会自动跑）

- **直接转（默认）**：每屏一个镜头，`stable_id` 按稿内顺序编号 S01、S02…；工厂片头 3.2 秒静止屏默认去掉、旁白同步剪掉（`--保留片头` 留作 S00）；镜头边界吸附到 1/30 秒帧边界（向前取整，镜头一定在它第一句开口之前开始）；beats（每句时间、文字）原样，只整体平移；核对「各镜头帧数之和 = 总帧数」。只有标题、没有旁白的屏在外部配音模式下时长是 0，会被并掉（报告里列出）。
- **精剪（需要时）**：句间停顿太长、要删句 / 调顺序 / 一屏拆几个镜头时用。先 `--生成精剪计划 计划.json` 拿一份起点（每屏一个镜头），在里面删改「句」区间，再 `--精剪 计划.json --旁白输出 声音/旁白.wav` 重剪旁白。做法和 USJ `整改v5/剪辑v5.py` 一样：每段前留 ≤0.14 秒、后留 0.09–0.34 秒、5 ms 淡入淡出，每个镜头补零到整帧，末尾留 36 帧。2026-10-07 实测：把 USJ 的计划喂进去，**输出的时间轴与 USJ v5 的 storyboard-audio.json 完全相同、旁白 wav 逐字节相同**。
  - 精剪要在**工厂对齐结果上**做（要用 `.work/audio/aligned.json` 的每句开口、收口时刻），不要在已经精剪过的时间轴上再剪。
  - 精剪改了旁白 → 字幕、时间全跟着变；剪完先整段听一遍再写镜头脚本。
- **照抄**：输入已经是 v6 时间轴时只核对、原样写出（换期复用、自测）。
- 改了旁白（重配某几句）= 时间轴变了：重新对齐 → 重新定时间轴 → 镜头脚本里 `T()`/`Tw()` 写的时刻自动跟着走，手写的秒数要重查，全部镜头重渲。

## 5. 写镜头脚本 → 渲染

```bash
cd ~/Desktop/视频工厂/样片/<期>/画面v6
python3 v6lib.py S05 S06                     # 打印这几个镜头每句旁白的句号和时刻，照着写 镜头脚本/S05.py
python3 v6lib.py                             # 拼分镜 + 检查报告（工程/.work/检查报告.txt）
python3 -c "from v6lib import *; build_storyboard(); render(['S05'], stills=True, at=[1, 4, 8])"   # 先看静帧（几秒）
python3 -c "from v6lib import *; build_storyboard(); render(['S05'])"                             # 正式渲染这一个镜头
python3 -c "from v6lib import *; print(grab('S05', [0.3, 2.0, 4.5]))"                             # 从 mp4 抽「动作中」「落定后」
python3 -c "from v6lib import *; build_storyboard(); render()"                                    # 全片：没改的镜头秒级复用，写 镜头/manifest.json
```

- 写法、组件参数、用量看 `v6lib-接口说明.md` 和 explainer-video-workflow reference 09；三个示范在 `示范/`。
- `render()` 自己套 `mac-heavy-job.py`，退出码 75 自动等 30 秒重试；**不要同时开两个 render**，也不让子代理各自渲染。
- **帧数锁定**：不改 `storyboard-audio.json` 的 t0/t1 就不会改帧数；每镜头帧数 = round(t1×30) − round(t0×30)，总装断言总和。
- **缓存**：缓存键 = 镜头局部分镜 + 所有素材文件内容哈希 + engine 文件哈希 + 渲染器哈希。改哪个镜头脚本只重渲哪个；改 `工程/engine/` 或 `分段渲染.mjs` = 全部重渲（10 分钟片约 10–20 分钟）。
- `render(['S05'])` 只写 `manifest-only.json`，**不更新** `manifest.json`；总装前一定再跑一次全量 `render()`（其余复用）。

### 节拍表（2026-11-06）

`新建一期.py` 写 `节拍表.json`，每屏一行，写镜头脚本前填 `强弱`（强 / 中 / 松）。（2026-11-07 用户审片改：「强」用数字砸停、推近、少量盖章表现，不用 `flash()` 插镜或快切。）它管三件事：检查报告的「节奏：」、松段放宽静止时长、总装的落点前留空。没有这个文件时三件事都不做，旧期不受影响。

## 6. 总装

```bash
python3 总装v6.py                                            # 全片 → 项目.json「成片输出」；记录 渲染/拼接记录-v6.json
python3 总装v6.py --start S19 --test 30 --stems --work 自测/总装测试 --out 自测/总装测试/测试-30s.mp4   # 测试片：从 S19 起 30 秒
python3 质检/校验测试片.py 自测/总装测试/测试-30s.mp4 自测/总装测试/拼接记录-v6.json                   # 响度、配乐在不在、音效时刻
```

- 做的事：串接镜头（`-c copy`，核对帧数和编码参数）→ 按结构段铺配乐（乐句处循环、段间 2 秒交叉淡化、刻意动作、闪避、逐段校准到说话时比人声低约 20 dB）→ 按 `sfx_events.json` 放音效（对照表、分档、0.3 秒合并、中重档 ≥2.5 秒、hit-重 ≤ 6）→ 两遍 loudnorm 到 −14 LUFS、真峰 ≤ −1.5 dBTP → ASS 字幕烧在内容区 → 1920×72 底部导航 vstack → 1920×1080 成片。
- **接缝淡化（默认关）**：`项目.json` 写 `"接缝淡化": [{"镜头":"S08","秒":0.25}]`。以 30fps 四舍五入（0.25 秒 = 8 帧），允许 2 帧到 1 秒、短于目标镜头；首镜头、重复/未知镜头、无效秒数报错。前镜头没有余尾：取**最后一帧冻结**，在后镜头前 N 个原有帧内从旧画面淡到新画面；不重播旧尾段，不删后镜头头段，不改总帧数、旁白、音效、字幕或导航时刻。
- 接缝只编码后镜头开头到下一个独立关键帧，之后 `-c copy`；其他镜头整段 `-c copy`。新版分段渲染器用半秒封闭 GOP（15 帧、无 B 帧），接缝编码最多比淡化多 14 帧。旧缓存 GOP 过长会报错，先用新版重渲目标镜头；不会为了淡化默默重编码整镜。`拼接记录-v6.json` 的 `video.seams` 记录实际淡化/重编码/复制帧数。
- 此范围指**内容画面的接缝处理**；原有字幕和底栏烧录仍需全片编码，最终 MP4 的视频包不可能保留为原镜头包。声音继续原时间混合；新增淡化不触碰音频。无闪白、无自动转场声。
- 硬性校验：配乐、音效、旁白文件缺一个就停；音效种类认不出就停；音乐覆盖 < 85% 或音效为 0 就停；loudnorm 退成 dynamic 就停。跑完看 `拼接记录-v6.json` 的 `bgm.sections`、`music_coverage`、`sfx_count`。
- 改了 `项目.json` 的导航、配乐，或者只改了音效：只重跑总装，不用重渲镜头。

## 7. 声音、封面、质检

- 配乐：按音乐表用 MiniMax 生成约 4 首纯器乐（每首约 300 积分，先报价），`查人声.py` 粗筛 + 人耳听，放 `声音/`，填进 `项目.json` 配乐分段。先用 `声音/做闪避对比.py 配乐.mp3` 出 60 秒对比样给用户定闪避。细则 reference 05。
- 封面（2026-10-16 起默认「大時叔叔」电影感版式；2026-11-07 用户审片改：标题字换思源黑体 Heavy / 得意黑，去荧光笔，`电影感封面.py` 写死的兰亭黑要先换）：Codex 出 6 个写实电影感背景（提示词模板 `封面/提示词-示例-电影感.txt`）→ 讲真实人物时叠真实截帧抠图（`~/Desktop/写稿/工具/cutout`，不用 AI 真人脸，封面不写出处）→ `项目.json`「电影感封面」→ `python3 ~/Desktop/写稿/工具/电影感封面.py 画面v6/项目.json` 出 5 尺寸 + 检查图。细则 skill video-assembly 第 1 步。下面是旧的格子纸做法，用户点名才用。
- （备选，2026-11-07 起同样换字体、去荧光笔）封面：主体图要**故事完整**（USJ：轨道连续、列车冲上坡顶奖杯；断轨版被否），Codex image_gen 一次出 6–7 个构图的纯白底写实桌面微缩模型让用户挑 → `项目.json`「封面」写本期标题和各尺寸 → `python3 ~/Desktop/写稿/工具/格子纸封面.py 画面v6/项目.json`，一次出齐 YouTube `yt` 和视频号 `3x4`、`4x3`、`9x16`（横屏再加 `16x9`），自动查安全区，出检查图和 yt 缩略对照；不放标识、不写 AI 示意。细则 reference 07 第 3 节。
- 质检：`工程/.work/检查报告.txt`、`python3 质检/抽帧拼图.py`、reference 07 的检查脚本；2026-11-07 起再加 1 秒一帧全片抽帧逐张看 + 只读子代理独立复查 + 图片停留时长表（照水谷 v2 期 `质检/v7b检查.py`、`质检/v7b逐秒抽帧.py`）。成片阶段只查画面、声音、技术与合规；事实在写稿阶段按证据卡锁定。

## 8. 模板怎么维护

- 模板代码改了要再跑一遍自测（第 9 节同样的步骤）。已经开工的期不自动跟着变：要用新版就在那一期跑 `新建一期.py … --更新模板`（engine 改了 = 那一期全片重渲）。
- 从 USJ 同步：`_来源快照/` 里按时间存着每次同步时的 USJ 原文件和 `SHA256SUMS.txt`，**以最新的为基准**（现在是 `USJ-v6-20261007-1410/`）。USJ 那边再改时，逐个文件和最新快照比：模板里没改过的（engine 全部、音效 wav、音效清单）直接覆盖；模板改过的（`v6lib.py`、`总装v6.py`、`做音效-v6.py`、`v6lib-接口说明.md`、`音效/说明.md`）用 `git merge-file -p 模板版 快照版 USJ新版` 三方合并，冲突手工解决；USJ 写死的数值（配乐分段、刻意动作区间等）挪进 `项目-示例.json`；然后存一份新快照、重跑第 9 节自测。
- 同步记录：2026-10-07 14:10 同步了 USJ 修复代理的改动——`stage.css` 荧光笔正片叠底（`.el.highlighter`）、`总装v6.py` 配乐床电平骑行（不碰区间改从 `项目.json`「配乐.刻意动作区间」读，没写就按刻意动作自动算）+ 例外音效不计次数不合并 + 接缝时刻修正 + 新音效种类 `growl`/`pat3`、`做音效-v6.py` 重档加中高频（hit-轻、hit-重、盖章-两下重做，新增 吼-嗷呜、轻拍-三下；合并后的脚本重生成 22 个 wav 与 USJ 逐字节相同）、接口说明两处补充；USJ 定稿的 M4b `src_end: 145`、各段 `比人声低dB` 19.8–20.1 写进了 `项目-示例.json`。

## 9. 端到端自测记录（2026-10-07）

自测目录 `~/Desktop/视频工厂/样片/_模板自测-2026-10-07/` 是**测试，不是正式一期**：时间轴、旁白、配乐、两个示范镜头借自大阪 USJ（只读拷贝），可以删。USJ 目录一个文件都没改。

| 测了什么 | 怎么测 | 结果 |
|---|---|---|
| 定时间轴·直接转 | USJ v4 的工厂对齐分镜 `样片/2026-10-06-大阪USJ/工程/.work/storyboard.json` + `narration.wav` → `/private/tmp/claude-501/定时间轴测试/直接转/` | 53 个镜头、361 句、26342 帧 = 878.067 秒，核对通过；去掉片头 3.2 秒（旁白同步剪掉 153600 个采样点）；`storyboard-audio.json` 的顶层 / meta / 镜头 / 句子字段与 USJ v5 那份完全一致；镜头一定在第一句开口前 0–1 帧开始 |
| 定时间轴·精剪 | 把 USJ `整改v5/剪辑v5.py` 的 50 镜头计划原样写成 `精剪计划.json` → `/private/tmp/claude-501/定时间轴测试/精剪复现v5/` | 输出的 `storyboard-audio.json` 与 USJ v5 那份**整个 JSON 相等**，`旁白-精剪.wav` 与 USJ `旁白-v5.wav` **逐字节相同**（50 镜头、254 句、17793 帧） |
| 新建一期 | `新建一期.py _模板自测-2026-10-07 <USJ v5 文案> <USJ 旁白-v5.wav> --时间轴 <USJ storyboard-audio.json>`（照抄模式），再原样重跑一次 | 建好全部目录、拷 46 个模板文件、写 项目.json 骨架、50 个镜头脚本骨架；重跑后 项目.json、镜头脚本、时间轴都没被改动（只补了新加的 素材/生成/ 工具） |
| 镜头脚本 | 示范 S19、S37 拷成 `镜头脚本/S19.py`、`S37.py`，素材拷进 `素材/`；`项目.json` 填 USJ 的章名、章标覆盖、导航、配乐 | 拼出的 S19、S37 元素与 USJ v6 分镜**逐项相同**（只差素材路径）；音效事件 14 个，时刻相同（模板版便签多登记了元素 id，总装会给便签配「纸张滑入」） |
| 渲染 | `render()` 全片 50 镜（48 个骨架 + S19 + S37），套 mac-heavy-job（先排队等了另一个渲染） | 132 秒渲完；manifest 50 行、17793 帧；S19 真截 161/286 帧、S37 386/386 帧；抽帧看过：原件、圈注、荧光笔、放大镜译文卡、便签；视差照片、三个计数器、集中线都在 |
| 总装·测试片 | `总装v6.py --start S19 --test 30 --stems` → `画面v6/自测/总装测试/总装测试-30s.mp4` | 900 帧 30.00 秒，1920×1080；−14.00 LUFS、真峰 −2.20 dBTP、linear；配乐覆盖 96%（M2）、成片里没有 0.3 秒以上的静音；S19 的 7 个音效全部放进、`校验测试片.py` 在成片里 ±0.3 ms 找到 7/7；字幕、底部导航（「丑闻崩盘」高亮、进度线在全片 31% 处）、右上章标都在；总评「通过」 |
| 总装·片头 | 不加 `--start`，出前 20 秒 | 片头没有写好的镜头 → 音效 0 个 → 总装按硬性校验**拒绝出片**（防 USJ v5 那种无音效交付）；补 4 个测试音效后通过：−14.00 LUFS、配乐在、音效 4/4 |
| 封面 | `~/Desktop/写稿/工具/格子纸封面.py 画面v6/项目.json`（USJ 的主体图和摆放参数） | 1280×720 输出与 USJ 定稿封面**逐像素相同**（最大差 0） |
| 新建一期·只有配音 / 工厂分镜两支 | 在 `/private/tmp` 搭一个假期：先只给旁白 wav，再给 USJ v4 的工厂对齐分镜（只读） | 只给配音：搭好 `工程/`（主引擎快照 + 稿子、配音链接）、打印对齐命令、写 项目.json 骨架，不跑任何模型；给分镜后：定时间轴（53 镜头）、自动补章名 / 导航 8 段 / 配乐 4 段占位、53 个骨架带屏标题和稿子原文，`python3 v6lib.py` 拼分镜通过（测完已删） |

**同步 USJ 修复之后重跑（2026-10-07 14:10 起）**：

| 测了什么 | 结果 |
|---|---|
| 渲染 | 改了 `stage.css` 所以 50 镜全部重渲，126 秒；S19 真截 161/286、S37 386/386；S19 被荧光笔划过的「継続企業の前提に関する注記」字色和没划的一样深（像素最深 0–3），叠底生效 |
| 30 秒测试片（从 S19 起） | −14.00 LUFS、真峰 −2.20 dBTP、linear；电平骑行在跑（不碰区间读 项目.json：211.0–216.2、565.0–567.8），说话时音乐比人声低 20.2 dB（同步前 21.8）；配乐覆盖 96.3%，成片没有 0.3 秒以上静音；音效 7/7 在 ±0.3 ms 找到；总评「通过」 |
| 30 秒测试片（从 S36 起，含 S37 全部音效） | −14.00 LUFS、真峰 −2.00 dBTP；hit-重、嗖都在成片里显著找到，分轨 7/7 逐条吻合；模拟手机喇叭（300 Hz 高通）hit-重 比旁白 −2.7 LU、嗖 −5.5 LU（验收线：重档 ≥ −6、中档 ≥ −9；USJ 修复前 hit-重 是 −14.4）；总评「通过」 |
| 封面·标题版 | 用 USJ 的 `原图-02.png` 和定稿参数（写进 项目.json「封面」）一次出 yt、16x9、视频号 4x3/3x4/9x16 + 检查图 + yt 缩略对照：5 张封面和缩略对照与 `整改v6/封面/标题版/定稿/` **逐字节相同**，安全区无警告 |
| 封面·旧用法 | 不写「尺寸」的钩子字用法照旧，与 USJ 第一版封面逐像素相同 |

（`校验测试片.py` 同步后加了一条：`--start` 测试片开头截掉一部分的音效不算错。）

没覆盖、要等第一期真用时再看的：真正跑一次 Whisper 对齐（按 16 GB 规矩这次没跑，用的是 USJ 已有的对齐结果）、Seedance `生成.mjs`（会花钱，只做了语法检查）。
- 2026-10-09（AI数学722篇）：`总装v6.py` 循环点修两处——跳距接近整首曲长时不再报 `v cannot be empty`；`配乐.分段` 可写 `最多接缝`（默认 3）。

## 2026-10-10 模板修改（T019 日本诺奖 v10 质检发现）

- `工程/engine/stage.css` 末尾加两组样式：便签（note2）、档案卡标题/正文、label/caption/smalllabel 里的 `==荧光==`、`**红字**` 现在会显示（原来只有标题、译文卡、打字卡有样式，其余按普通字出来）；深色打字卡（style='dark'）上的荧光改成黄字、红字提亮。只影响以后新建的期（各期用自己的引擎快照）；旧期要用就把这几行拷进那期的 `工程/engine/stage.css`，代价是全片重渲。


## 10. 2026-10-10 新组件与回归自测

**画面验收已通过**：2026-10-10 新增组件（章卡、回顾墙、视频引语、删除线、接缝淡化）已在沙盒外实际渲染验收：S01–S05 镜头与 30 秒总装测试片（900 帧，−13.9 LUFS / −1.9 dBTP，音效 16/16 对上，总评通过），对照图 `样片/_模板自测-2026-10-10-章卡回顾墙/画面v6/自测/对照-新组件.jpg`，Claude 逐帧看过文字、安全区、重叠。注意：Codex 的 workspace-write 沙盒起不了 Chromium，渲染要在沙盒外跑（Claude 或终端）；命令里别出现 whisper/torch 等词，否则会被内存锁钩子整条包住、和内部锁互锁。

新增 `chaptercard`、`recapwall`、`quotecard(over=视频卡)`、`circle(shape='strike')`；接口和例子见接口说明第 4 节。章卡开头使用 `hold=2.6` 并让正文在退场后入场；整镜头只放章卡则不写 `hold`。回顾墙先渲染被抽帧的镜头，再构建回顾镜头；`focus` 是输入来源的 0 起下标。抽帧、视频序列和所有总装 ffmpeg 操作也走 `mac-heavy-job.py`，75 等待，不删除锁。

自测：`样片/_模板自测-2026-10-10-章卡回顾墙/说明.md`；首次创建可运行 `python3 模板-v6/自测/华为期功能自测.py`（目录存在时拒绝覆盖）。仅复用已有采访、配音、配乐；无付费调用。备份在 `_来源快照/2026-10-10-华为期改动前/`。

## 9. 实拍满屏（2026-10-20 从夕张、311 固化）

`实拍/` 目录（`新建一期.py` 拷到每期 `画面v6/实拍/`）：`实拍设置.py`（读 `项目.json`「实拍」）、`做实拍片段.py`（视频段 + 照片段 → 满屏底片，防抖、裁切、竖拍铺底、调色、原声、三种人脸检查）、`加喘气.py`、`删镜头.py`、`选段图.py`、`人脸复查图.py`、`写实拍表-示例-311.py`、`工具/`（facecheck、personcheck、yolo人检.py）。引擎：镜头脚本 `bgvideo()` → 舞台透明，渲染器 PNG 截图叠到底片上（编码参数与其他镜头一致）。总装：自动混 `<片段目录>/<镜头号>.wav` 原声；loudnorm LRA 目标跟实测。完整步骤见 explainer-video-workflow reference 09「实拍满屏」。

自测：`样片/_模板自测-2026-10-20-实拍/`（借 311 v2 时间轴，S04 照片段、S34 照片 + DJI 带原声，静帧对过；总装原声 + LRA 用 311 工程 30 秒测试片验过：linear、−13.9 LUFS、真峰 −1.6）。
`新建一期.py` 也改了：章名自动去掉「第N章」前缀、「章号文字」照稿子写（有引子时不再错位），引子/尾声的章名取该章第一屏大标题；`定时间轴.py` 照抄模式的帧边界容差放到 1e-4 帧（加喘气写出的 6 位小数时间能直接照抄）。

## 2026-11-17 补：简体默认版 + 油管繁体版、进度条按段走、原文屏斜放

- **两个版本**（用户 2026-11-17 定）：默认成片是简体（屏上字、字幕都简体）；油管版全繁体（台湾用语）。做法：
  1. 简体：照常 `render()` → `python3 总装v6.py`（`项目.json`「字幕繁体」留 false）。
  2. 繁体：`V6_TRAD=1` 下重拼分镜并 `render()`（屏上字经 opencc s2twp + 「字幕繁体词表」转换，旁白和时间不动；画在图片里的中文要另备繁体图）→ `python3 总装v6.py --trad --work 渲染-繁体 --out <…-油管繁体.mp4>`（字幕、导航也转繁体）。
  3. 两版共用镜头缓存；先渲哪版，`镜头/manifest.json` 就是哪版，总装前确认最后一次 render 是对应版本。
  - 台湾用语放进「字幕繁体词表」，例如 `日元→日圓`、`300 米→300 公尺`。
- **进度条**：原来按全片时间匀速走，章节长短不一时线头和高亮的导航格对不上；现在第 i 段播放时线头在第 i 格里从左走到右。
- **原文屏斜放**：v7b 默认把卡片摆正；深色底原文屏要斜放时 `docpage(..., rot=-3, keep_rot=True)`。
````

</details>

### 附录 12：projects/video-factory/视频工厂/制作规范/画面硬规则-2026-11-07.md

原始位置：`/Users/wzz122/Desktop/视频工厂/制作规范/画面硬规则-2026-11-07.md`；SHA-256：`17eb9c437466a0403e8f1519a61da64aca39e351c980a809274c3ca9a4c4630f`。

<details>
<summary>展开完整原文</summary>

````markdown
# 画面硬规则（2026-11-07 用户审片「股神水谷 v7」后定）

**适用**：以后每期解说视频（v6 镜头脚本、旧视频工厂、达芬奇总装、封面）。和任何旧规范（档案纸主题规范、reference 09 的 USJ 密度表、v6lib 接口说明里的默认样式）冲突时，以本文件为准。

**起因**：用户原话「老是图片一闪而过；背景统一，不要黑白；图片正常颜色；图片有时不能全屏；少点 Claude 痕迹，特别是字体」。根子在我们自己的规则：技巧卡 13「前段快切插镜」、视觉规范「强 = 极短插镜」、红黑去饱和的冷开场、`flash()` 极短插镜组件，以及「AI 模板味」——宋体粗标题 + 每个标题都划荧光笔 + 楷体手写旁注 + 胶带 + 便签 + 圆角药丸标签 +「—— 某某」落款 + 纸纹暗角 + 倾斜堆叠卡片；图缩到画面 1/4、字太小、空屏。

## 九条

1. **停留**：图片最短停 2 秒；带字要读的（推文、截图、券商弹窗、海报、新闻字幕）≥3.5 秒，或跟念到它的旁白停够。禁止一闪而过的插镜：水谷 v2 期的 v6lib 里 `flash()` 已改成调用即报错；**模板 `模板-v6/v6lib.py` 里的 `flash()` 代码还在，但同样不许再调用**。节拍「强」用数字砸停、推近、少量盖章表现，不用快切。
2. **原色**：真实图片、截图、新闻画面一律原色，不做黑白、去饱和、红黑调色、做旧、duotone、任何 CSS/ffmpeg filter。老黑白资料片按原样放，不再染褐、加颗粒闪烁。
3. **背景统一**：全片一个底（纯色或极淡纸色，如 `#ece5d8`）；片头/序幕不单独换黑底；不加纸纹、格线、暗角、颗粒。
4. **图要大**：图是主角时满屏铺满（左侧压暗保证标题可读），或宽 ≥ 画面 65% 居中；截图类放大到字看得清（高度 ≥ 画面 60%，横条形截图铺满宽度）。说明标签压在图上或放图旁，不要一张小卡配一堆小字。
5. **不空屏**：每屏 0.5 秒内主体上屏，不留空屏/半空屏；章节卡用大字章卡（章名 ≥180px），不用几个小方框；结尾用干净大画面收住片名；不用 32 张缩略图的回顾墙。
6. **字号（1080p）**：正文 ≥40px，标签 ≥32px；日文原文可小，但中文翻译必须大；屏上日文都要有中文。
7. **数字**：折线终点数字不能从「0」滚起（线画到终点后再出现，或从起始值滚）；跌幅/负数滚动全程带「−」号。
8. **去 AI 模板味**：
   - 字体：可免费商用的思源黑体 Source Han Sans（标题 Heavy，正文 Regular/Medium，OFL）或得意黑 Smiley Sans；数字 Oswald 或 Barlow Condensed（OFL）。字体文件和授权放本期工程 `素材/字体/`，用 @font-face 引用。不用宋体、楷体、行楷、手写体。
   - 荧光笔全片 ≤3–5 处真正重点；去掉胶带、便签纸、手写旁注、圆角药丸标签（改方角色块字条）、「——」落款、做旧暗角、倾斜和堆叠投影卡片；盖章全片 ≤2–3 个。拟声大字、集中线、弹字默认不用。
   - 版式参考正经新闻解说频道：大图 + 简洁下三分之一字条 + 大号数字，信息层级靠字号和粗细。
   - 封面同样换字体（思源黑体 Heavy / 得意黑）、去荧光笔。
9. **交付前验收**：
   - 1 秒一帧全片抽帧，逐张看：无空屏、主图够大、字可读、无黑白、无闪图、无数字 bug、无日文无翻译。
   - 另起只读子代理按同一清单独立复查（只看抽帧图和 JSON，不加载模型）。
   - 附每张图停留时长表（如 `质检/图片停留表-v7b.md`）。

## 样板（新一期照这个做）

`~/Desktop/视频工厂/样片/2026-11-06-股神水谷v2/画面v6/`（只读参考，不改原件，拷进本期再用）：

| 文件 | 用途 |
|---|---|
| `本期工具.py` | v7b 小工具：`开`（开镜头，思源黑体标题）、`图`（无边框不倾斜大图，自动放到内容区最大）、`满屏`（原色满屏 + 左侧压暗）、`条`（下三分之一方角字条）、`字`（≥40px 文字）、`章卡`（大字章卡，章名 210px）、`推文`（推文卡：中文大字 + 日文小字）、`题`、`角标` |
| `工程/engine/stage.css` 末尾「v7b 新闻解说主题」 | 统一 `#ece5d8` 底、关掉纸纹格线暗角颗粒、思源黑体 + Oswald @font-face、去胶带/回形针/折角/药丸圆角/落款破折号、`img{filter:none}`、标题不画荧光 |
| `素材/字体/` | 思源黑体 4 个字重 + Oswald + 两份 OFL 授权文本 |
| `质检/v7b检查.py` | 读 storyboard.json，逐镜列每张图停留时长（≥2 秒、带字 ≥3.5 秒）、首个主体 ≤0.5 秒、禁用组件（flash、onoma、pop、chaptercard、recapwall、note2、滤镜）、盖章 ≤3、荧光笔 ≤5；输出 `质检/图片停留表-v7b.md`。其中「带字图」按文件名正则判断，是本期专用，新一期要改正则 |
| `质检/v7b逐秒抽帧.py` | 1 秒一帧抽帧，用于第 9 条 |

## 相关文件

- 版式细则：`~/Desktop/视频工厂/视觉规范/新闻解说版式规范-v7b.md`
- 改了哪些旧规则：`~/Desktop/视频工厂/样片/2026-11-06-股神水谷v2/返修记录-规则改动清单.md`
````

</details>

### 附录 13：projects/video-factory/视频工厂/样片/2026-11-17-阿倍野再开发/制作说明.md

原始位置：`/Users/wzz122/Desktop/视频工厂/样片/2026-11-17-阿倍野再开发/制作说明.md`；SHA-256：`9dc25ce08aa5f7ba813d9ff7bd20b15c18602229999f3e751037c27f00e6bbdb`。

<details>
<summary>展开完整原文</summary>

````markdown
# 街修好了，账烂了：阿倍野再开发 制作说明（2026-11-17，Claude 全自动，「大时风格」第一期）

- **稿**：用户交来的口播稿《阿倍野再开发（重写版）》，原样存 `写稿/成稿/阿倍野再开发-重写版.md`；定稿 `写稿/成稿/2026-11-17-阿倍野再开发-v1.md`（87 屏，旁白只按事实核对改 7 处，切屏脚本 `配音/切屏.py`）。没找到 11 月 16 日的原稿文件，事实直接对官方原件核。
- **事实核对**：`写稿/资料/2026-11-阿倍野再开发/00-事实核对.md`（子代理原表同目录）。8 处待核：核到 5 处不改（63 层 290 米、2001→2004 盈余 30 亿到亏 2100 亿、利息 180 亿、工期 15→20→32 年、还债 2023 年度 / 2030 年代初）；改 3 处（人民币 76 亿；「两千七百来栋木造」→「一千两百多栋房子，八成是木头的」；天桥改成「后来计划中止」、连锁店改成「转租给了别人」、店主「像是被骗了」整句删）。另外顺手改 2 处：Ponte / Marche 开业年写反了；市长那句话是 2016 年。
- **配音**：MiniMax API gou 1.15，九章，整条 15:00。读音预检定了 64 个词；英文名 Q's Mall 照念，HARUKAS、Ponte、Marche、Via…Walk 在配音文本里写成中文音译（字幕仍是原文）。点检标 2 句：ch05「行情」确实读错，换同音字重配后通过；ch03「土地和房子」连续两次仍被标（多半是误报）→ **人工听：约 3:32**。另有 19 处「声调未核对」。版本表 `配音/版本表-v2.json`。
- **素材**（外接硬盘 `视频工作区/2026-11-17-阿倍野再开发/素材/`）：维基共享资源照片 429 张（成片用 37 张，明细 `画面v6/质检-用图许可.json`）；大阪市报告和官方网页截图（CC BY 4.0）；雅虎新闻标题截图（引用）；国土地理院 1945–现在各年代航拍；自己画的图解（路口两栋楼、计价器，`素材/图解/画图解.py`）。搜来的图有几张名不副实（北京的计价器、根室空袭、冲绳旭町等），核对后没用。
- **三维**：`~/video-projects/map-explainer/episodes/abeno`，8 个谷歌实景镜头进了成片（路口南北各一、Q's Mall、再开发区全景、商场背后、结尾、咲洲厅舍、临空门大厦），当天约 12 次请求。**只发油管。**
- **画面**：v7b 版式，87 镜头。照片 / 视频镜头的分段表 `画面v6/镜头数据.py`，图解 / 原件 / 账本类 `画面v6/手写镜头.py`，改完跑 `python3 镜头脚本/_生成.py`。大时风格的几样：
  - 开头的物件「马路两边的楼」图解回来 5 次（S02、S48、S57、S86，加开场结尾的实景）；
  - 计价器在第 3、4、5、6 章各一次（S24–25、S34、S38、S47），第 7、9 章又各回来一次（S58、S79、S82）；
  - 收支表一行一行出（S53–S55）；一张原件分两步揭（S42 效果图 → 层数高度表；S49 表格三处圈）；
  - 深色底 + 斜放原件 + 荧光笔 4 屏（S04 新闻标题、S12 报告、S42 方案、S74「把故乡还给我」）；
  - 接缝淡化 6 处（第 2、4、6、7、8、9 章开头，各 0.6 秒）。
- **字幕**：片内字幕出台湾繁体（`总装v6.py` 新加「字幕繁体」开关，opencc s2twp + 词表）；屏上的标题和字条仍是简体。
- **配乐**：沿用日本桥小学那批 6 首，10 段，覆盖 98.2%。音效 240 / 247。
- **封面**：Codex 出 6 个构图，选 01（亮灯的超高层 + 矮商场上方脚手架勾出的空楼，AI 生成示意，非实景）；标题「63层变6层 / 1822亿怎么没的」，另出繁体油管版。
- **成片**：云盘 `写作/阿倍野再开发/成片/2026-11-17-阿倍野再开发-v6.mp4`，15:39（938.87 秒），−14.00 LUFS，真峰 −1.90 dBTP。
- **费用**：MiniMax 约 $1.47（配音 $0.95、试读和重配 $0.05、点检参照 $0.49）；谷歌三维约 12 次（免费额度内）；Seedance 未用。
- **踩坑**：透明 PNG 进 photocard 会变黑底，要先合到纸色底上；`pgrep -f 脚本名` 写在等待循环里会匹配到自己，循环永远不结束；分段渲染偶尔会卡在起浏览器（0% CPU），杀掉重跑即可；配乐曲子比段落短太多会报「找不到循环点」，把段落拆开。
- **没做**：人耳通听；节拍表没填；发布（只发油管，要用户明说才传）。
- **质检**：成片 1 秒一帧共 939 帧拼图，另起只读子代理独立复查：数字前后一致、无制作痕迹、无黑白滤镜；提出 8 处必改（4 处开头空一两秒、3 处图太小、1 处照片一闪而过），已全部改完重渲 30 个镜头后重新总装。没改的建议：收支表整体偏上偏小；屏上字是简体而字幕是繁体；深色底的原件设了倾斜但 v7b 样式下看不出斜。最长静止段 12 秒（澡堂那屏）。
- **11-17 用户审片后改**（「没用大时叔叔的更新技能吗；进度条对不上；默认应该是简体，油管版是繁体」）：
  - 进度条：原来按全片时间匀速走，和等宽的导航格对不上；改成每段在自己那一格里走（`总装v6.py`，已同步进模板）。
  - 两版成片：`成片/…-v6.mp4` 简体（屏上字和字幕都简体）；`成片/…-v6-油管繁体.mp4` 全繁体（屏上字、计价器图、字幕、导航都转台湾繁体，「米」→「公尺」）。做法：`V6_TRAD=1` 重拼分镜重渲 + `总装v6.py --trad`。两版镜头清单分别备份为 `镜头/manifest-简体.json`、`manifest-繁体.json`（现在 `manifest.json` 是繁体那份）。字幕文件简繁各一份。
  - 大时那几条再补：深色底原文屏的原件真正斜放了（v7b 默认会把卡片摆正，加了 `keep_rot`）；第 8 章结尾改成同一取景的航拍从今天叠化回 1970 年代（跨年代用同一个物件接）。
````

</details>

### 附录 14：projects/video-factory/写稿/AGENTS.md

原始位置：`/Users/wzz122/Desktop/写稿/AGENTS.md`；SHA-256：`1d8bd661bb3f1f9a64cc59ea111427cd40c27dcbfe4760732b3a13d12a3c49d0`。

<details>
<summary>展开完整原文</summary>

````markdown
# 写稿

写「新闻大写」风格的长视频解说稿。

- 用户说「写稿」「写视频文稿」→ 调用 skill **news-explainer**（写作）
- 用户说「搜索材料」「查资料」「核查」「做证据卡」「拆一下这个视频」→ 调用 skill **material-research**（搜索材料）；资料阶段和写作阶段分开
- 资料在 `资料/<话题>/`，产出写到 `成稿/`，并复制一份到 `~/Desktop/视频工厂/1-我的文案/`
- **不要在本项目里跑视频渲染**，那是「视频工厂」目录另开对话的事

## 视频创作入口与推进

- 本项目也是 Codex 侧边栏「🎬 视频创作」中的写作入口。开始工作先读 `00-视频创作入口.md` 与 `制作/当前进度.md`，按需再读 `工作流/协作方式.md`。
- 用户说「继续制作」「下一步」「今天做什么」：先恢复当前选题、稿件版本与待处理项，只推荐一个具体的下一步，并继续完成已授权、无需用户补充的工作。不要要求用户重复背景。
- 用户说「收一下资料」：先把资料登记到 `资料/00-收件箱/资料登记.md`，再按主题归档；保留原件与出处，不把参考资料直接视为已核实证据。
- 用户说「记个选题」：更新 `选题/选题台账.md`，默认放候选；每日建议与正式采用的题目分开。
- 每阶段结束更新 `制作/当前进度.md`；每期独立进度采用 `制作/单期模板.md`。项目文件记录决定和版本，对话不作为唯一状态来源。
- 沿用现有 news-explainer 写作步骤、来源核查和人工审稿。优先本地与已有订阅；不自行购买服务、使用付费模型 API 或发布内容（例外：用户这次明确说「用 Gemini 写」时，可用 `工具/gemini执笔.py` 调 Gemini 3.8 Flash 执笔，一期约 100 日元、超 300 日元先问；不主动提议）。
- 写稿、素材整理和制作规划可在本项目推进；渲染缓存与执行仍在视频工厂，达芬奇操作通过既有 MCP，能力与成片验收分别说明。

## Codex 接手先读（2026-10-02）

- **先读 `CODEX-交接文-2026-10-02.md`**：当前状态、三个 skill（material-research → news-explainer → video-assembly）、用户偏好、按优先级的下一步（P0 达芬奇模板库收尾、P1 刘欢 v4、P2 视频工厂引擎改进）。旧 `CODEX-交接文.md` 已过期。
- **东大这期（T003）的收尾**（两支成片的质检、谷歌云盘、YouTube 不公开上传）以及竖屏引擎、截图卡工具、抽帧质检的细节，见 `CODEX-交接文-2026-10-02-东大收尾与竖屏.md`。
- 回复用户一律中文；观点稿只查事实/数字/听不懂/配音风险，不提语气和平衡性。
- 16 GB 内存：本地模型全机只跑一个，走 `~/.local/bin/mac-heavy-job.py`；达芬奇开着时不跑模型。

## 默认图像风格与复查（用户指定，2026-10-02）

- 以后所有需要自行生成图像的地方，默认采用用户指定图二的圆润、亲切日式素材插画风；人物、物件、场景、封面背景等均沿用。后续用户另行指定时按新要求。
- 生成前查看永久参考图 `/Users/wzz122/Desktop/视频工厂/视觉规范/默认风格参考-图二-日式圆润插画.png`，支持参考图输入时传入此图。
- 每张图检查两遍：生成后检查风格、角色、面部/手脚、裁切和透明边缘；放入实际画面后再查位置、基线、比例、对齐、重叠与出界，并查看最终导出。发现问题先修正再交付。
- 用户接受更慢的生成和复查，优先画面质量与一致性。详见 `/Users/wzz122/Desktop/写稿/工作流/图像风格与复查规范.md`。

## 长视频必须便于局部修改（用户指定，2026-10-02）

- 制作20分钟左右样片前，按 `/Users/wzz122/Desktop/写稿/工作流/分段制作与局部修改.md` 先通过分段缓存/局部重渲验收。当前主引擎尚未实现此能力，不能直接宣称已支持。
- 按稳定镜头编号保留源文件、可编辑参数、素材、分段视频和修改版本；画面、字幕、旁白、音乐分开保存。
- 修改只重做实际受影响镜头；改变时长后重新计算总装时间，复用其余镜头。共享素材与转场须计入关联影响；全局改动可能需要较大范围重渲。
- 区分局部动画重渲与完整MP4重新输出；每次交付说明实际复用/重渲范围，保留旧版本与可编辑工程。

## 成片文字面向观众（2026-10-02用户审片修正）

- 制作流程、镜头指令、审稿备注和内部提示只放在分镜/修改单或预览界面外层，不画入视频。例如“原件 → 关键句 → 中文解释”“本样片先看…”“区间展开，方便…”不得作为成片字幕。
- 每遍画面复查同时检查文字是否适合观众；保留可核实的来源、日期、必要规则条件、示意或假设标识，表达简洁自然。
- 检查最终导出的关键帧，确认制作说明未烧入视频；源码和文字边界检查不能代替内容检查。
````

</details>

### 附录 15：projects/video-factory/写稿/CLAUDE.md

原始位置：`/Users/wzz122/Desktop/写稿/CLAUDE.md`；SHA-256：`053f3bb9435eca79d823495b56cf0a25b46c003b1b637f7be03a9c47f141111f`。

<details>
<summary>展开完整原文</summary>

````markdown
# 写稿

写「新闻大写」风格的长视频解说稿。

- 用户说「写稿」「写视频文稿」→ 调用 skill **news-explainer**（写作）
- 用户说「搜索材料」「查资料」「核查」「做证据卡」「拆一下这个视频」→ 调用 skill **material-research**（搜索材料）；资料阶段和写作阶段分开
- 用户说「总装」「进达芬奇」「插原声」「加音乐」「出片」→ 调用 skill **video-assembly**（达芬奇总装；按本文件下一条，在「视频工厂」目录另开对话里用）
- 资料在 `资料/<话题>/`，产出写到 `成稿/`，并复制一份到 `~/Desktop/视频工厂/1-我的文案/`
- 稿子交给用户审：开**改稿页**（`python3 工具/改稿.py 成稿/xxx.md`，纯文字、用户直接改、自动存回 .md；用户也可以双击 `改稿.command`）。不再默认出视频工厂校对页（用户 2026-10-12 定）
- **不要在本项目里跑视频渲染**，那是「视频工厂」目录另开对话的事

## 视频创作入口与推进

- 开始工作先读 `00-视频创作入口.md` 与 `制作/当前进度.md`，协作方式见 `工作流/协作方式.md`。
- 选题统一登记在 `选题/选题台账.md`；新资料先登记 `资料/00-收件箱/资料登记.md`。参考和正式采用、文件存在和事实已核实分别记录。
- 用户说「继续制作」时，恢复当前题目与版本，只推荐一个具体下一步；继续已授权工作，避免重复询问已知背景。
- 每阶段结束更新 `制作/当前进度.md`，按 `制作/单期模板.md`保存本期记录。避免与其他助手同时覆盖同一稿件。
- 保留来源、原件和修订记录；优先本地与已有订阅，不自行购买服务、使用付费模型 API 或发布（例外：用户这次明确说「用 Gemini 写」时，可用 `工具/gemini执笔.py` 调 Gemini 3.8 Flash 执笔，一期约 100 日元、超 300 日元先问；不主动提议）。
````

</details>

### 附录 16：projects/video-factory/写稿/CODEX-交接文.md

原始位置：`/Users/wzz122/Desktop/写稿/CODEX-交接文.md`；SHA-256：`78a8805810a14ff04f7bbc4bdf9f626a2f88ed14844ecaac3d11045c6adfbac7`。

<details>
<summary>展开完整原文</summary>

````markdown
> ⚠️ 本文已过期（2026-10-02）。最新交接见 `~/Desktop/写稿/CODEX-交接文-2026-10-02.md`。

# 交接文 · 给 Codex

> 写于 2026-09-21。交接人：Claude（Opus 5），在 `~/Desktop/写稿/` 这个会话里做完了一期片子。
> 读者：Codex。你接手的是一条**已经跑通、但有明确短板**的生产线。
> 这份文档告诉你：系统长什么样、我想最终做成什么、以及你该动哪里。

---

## 0. 三十秒版本

- 两个目录：`~/Desktop/写稿/`（写稿）和 `~/Desktop/视频工厂/`（出片）。**故意分开，不要合并。**
- 一条链路：`资料 → 稿子(.md) → 看版面校对 → 渲染 → 成片(.mp4)`，全程离线、零成本。
- 引擎代码是好的。**这次翻车翻在稿子层，而且系统没有任何闸门拦住它。**
- 你最该做的不是加功能，是**加校验**。详见第 5 节 P0。

---

## 1. 目录与职责

```
~/Desktop/写稿/                        ← 写稿。这里不许跑视频渲染（CLAUDE.md 有约束）
├── CLAUDE.md                          项目规则
├── 资料/<话题>/                        证据
│   ├── 数据.md                        ⭐ 证据卡片，每个数字带年份+出处+强度标注
│   ├── 我的观点.md                     ⭐ 用户口述的立场，风格是学的，观点只能是他的
│   ├── 报道摘录.md                     链接清单
│   └── 图/                            截图、图表
└── 成稿/YYYY-MM-DD-话题.md             ⭐ 产出，同时复制一份到视频工厂

~/Desktop/视频工厂/                     ← 出片。CPU 密集，单独开对话
├── 1-我的文案/                         .md 文案 + 素材/ + bgm.mp3
├── 2-成片/                             .mp4
├── 3-校对/<话题>/                      看版面生成的校对页
├── .work/                             中间产物（timeline.js / 逐帧 / 音频）
├── engine/                            ⭐ 引擎，见第 3 节
├── 看版面.command                      快（十几秒），只出版面不配音
├── 开始做视频.command                  慢（10 分钟片约 25 分钟）
└── 说明书.md                          给零基础用户看的

~/.claude/skills/news-explainer/        ← 写稿技能，见第 2 节
```

**为什么分开**：渲染很占上下文和 CPU。写稿那个对话要留着改稿，不能被渲染日志淹掉。
`~/Desktop/写稿/CLAUDE.md` 明确写了「不要在本项目里跑视频渲染」。**请保留这条约束。**

还有一件事：用户的原始素材放在
`~/Library/CloudStorage/GoogleDrive-wzzsgdtc@gmail.com/我的云端硬盘/写作/<话题>/`，
不在项目的 `资料/` 里。接活时先去云盘那个路径找。

---

## 2. Skills 说明

### 2.1 news-explainer

位置 `~/.claude/skills/news-explainer/`。触发词：「写稿」「写视频文稿」「新闻大写风格」。

```
SKILL.md                    主流程：6 步，严禁一步直出终稿
references/论证骨架.md       结构（五幕 + 3 个变体）
references/语言规范.md       句子、词表、信息强度、禁忌清单
references/版式速查.md       视频工厂的文案格式和 16 种版式
```

**SKILL.md 的六步**（这是硬流程，别跳）：

1. 读资料 → 压成证据卡片：`【事实】什么 ·【数字】多少（年份/来源）·【强度】已证实/有报道/仅传闻`
2. 选骨架（读 `论证骨架.md`）
3. 出 20~30 节大纲 → **先给用户过目**（用户说"直接写完"可跳）
4. 逐章写旁白（读 `语言规范.md`）
5. 配版式（读 `版式速查.md`）
6. 自查 → 交付，报告时长/章节数/用了哪些数据

### 2.2 四条铁律（违反其中任何一条，整支片子作废）

| 铁律 | 具体含义 |
|---|---|
| **论证学风格，观点只用用户的** | 语言和结构可以模仿，立场必须来自 `我的观点.md` |
| **数字必须来自资料** | 不得编造，**不得为行文顺畅改数字** |
| **信息强度如实标注** | 传闻写「网传」，未证实写「公开渠道找不到可靠报道」 |
| **用户说"不像"时要沉淀** | 问清是哪一类（用词/节奏/论证顺序/语气），把结论**写回 references**，再重写 |

第 4 条这次执行了：`语言规范.md` 新增第九节，`论证骨架.md` 新增「变体三 · 排除法」。
**这是这套技能能越用越准的唯一机制，请继续维护。**

### 2.3 风格要点（2026-09-21 新增，血泪换的）

**每一屏都必须有画面。** 参考文案（`视频工厂/1-我的文案/示例-*.md`）每一屏都是：

```
[版式] 数据或结构
# 大标题（判断句，带一处 ==高亮==）
3~5 句短旁白
```

大标题是**提炼**，不是旁白的复述。两者语域完全不同：

| 旁白（进字幕，被念出来） | 大标题（上屏幕） |
|---|---|
| 全国城市低保人数，从两百八十一万开始。一年后涨到四百零三万。 | `最疯狂的==一组曲线==` |
| 过去它是零敲碎打的。现在它变成了流水线。 | `这不是普通蒸馏` / `而是**工业化生产**` |

**必须删的第二类词：元话语。** 任何谈论这支片子本身的句子：
「这支片子…」「后面还要用到」「先说结论」「下面是三个推论」「记住这一点」。
参考文案里这类句子接近于零。这次删掉 52 句，一个信息点都没丢。

**句长目标 12 字上下**（原来 14~18 偏长）。参考实测 7~14 字。

---

## 3. 引擎（`视频工厂/engine/`）

### 3.1 文件与职责

| 文件 | 职责 | 行数量级 |
|---|---|---|
| `run.mjs` | 总指挥。找 ffmpeg → 扫素材 → 拆稿 → 配音 → 渲染 → 合成 | 中 |
| `parse.mjs` | ⭐ `.md` → 分镜 JSON（scenes/beats/elements） | 大 |
| `tts.mjs` | 逐句 `say` → aiff → wav，用真实时长对齐时间轴 | 中 |
| `render.mjs` + `cdp.mjs` | 驱动 headless chrome，逐帧 `__seek(t)` + 截图，管道喂 ffmpeg | 中 |
| `stage.html/.css/.js` | ⭐ 舞台。`window.__seek(t)` 给任意 t 返回确定的一帧 | 大 |
| `charts.js` | 图表按 0~1 进度自己画 | 大 |
| `mux.mjs` | 合成 + BGM 闪避 + 响度归一 | 小 |
| `preview.mjs` | 看版面（校对页） | 中 |
| `media.mjs` | 素材扫描 + 做旧 + 缩略图 | 小 |
| `align.py` / `clean.py` | 录音对齐 / 文案清洗 | 小 |

### 3.2 核心设计（三条，都很关键，别破坏）

**① 逐帧定格，不录屏。** 页面暴露 `window.__seek(t)`，渲染器按 `t = 0, 1/30, 2/30…`
逐帧调用并截图。机器再慢也不会掉帧。

**② 一整面连续的纸墙，摄像机在上面走。** `stage.js` 里那句注释是灵魂：

> 整面墙先铺一张连续的纸，这样镜头平移时两屏之间不会露出空白

所有 scene 摆在 `(x, y)` 上，换场 = 摄像机从上一幕终点插值到下一幕起点，
`TRANS = 0.72` 秒，中间加运动模糊 `blur = sin(q·π) × 5`。

```js
wall.style.transform =
  `translate(${VW/2}px, ${VH/2}px) scale(${cam.zoom}) translate(${-cam.cx}px, ${-cam.cy}px)`;
```

**③ 元素跟着旁白出现。** `beat.show = [id…]`，每句旁白揭开它对应的元素。
不是整屏一起淡入。图表则按幕内进度 `p = (t - appearT) / (endT - appearT)` 逐段画。

### 3.3 设计系统（`stage.css` 头部，复刻「纸质版画 / 复古印刷」）

```css
--paper:#ece5d8   --paper-hi:#f6f1e6   --card:#f7f3e9   --doc:#fffdf8
--ink:#1c1a17     --ink-soft:#3d3931   --muted:#8d8474
--red:#b23a25     --red-deep:#8e2c1b   --olive:#5f6b46
--hl:#f2dd4e      --line:#c9c0ae
--serif:"Songti SC"   --sans:"PingFang SC"   --hand:"Kaiti SC"
1920 × 1080
```

**只有一个强调色（砖红）。中文大标题用粗宋体，不是黑体——这条最关键。**

### 3.4 config.json

```json
{ "fps":30, "voice":"Tingting", "rate":168, "gap":0.3, "coverHold":3.2, "tail":1.2,
  "mediaGrade":0.75, "duck":true, "duckRatio":8, "duckRelease":500,
  "loudness":-14, "bgmFade":2.5, "bgmLoudness":-33, "bgmVolume":1 }
```

---

## 4. 最终想做成什么

### 4.1 目标

**一个人，用一台离线的 Mac，稳定产出「新闻大写 / 正确君」那个水准的 20~35 分钟深度解说视频。**

不是「能出片」，是**能出好片**。判断标准是并排放在参考片旁边不露怯：

1. 排版像印刷品，不像商务 PPT
2. 大标题是粗宋体
3. 强调色只有一个
4. 动画有语义（折线图是画出来的，方块图是填出来的）
5. 换屏是镜头移动，不是硬切
6. 数据图讲到最后一个数时镜头推近那个点
7. 每个数字都能追到一手来源

### 4.2 完整流程

```
① 攒资料      用户把截图/PDF/链接丢进云盘 写作/<话题>/
      ↓
② 整理证据    → 资料/<话题>/数据.md（每个数字带年份+出处+强度）
              → 资料/<话题>/我的观点.md（用户口述，最重要）
              ⚠ 这一步要做真研究：用户给的两三份材料只是线索，
                必须自己查到一手来源（官方统计表、原始 CSV、同行评议论文）
      ↓
③ 写稿        news-explainer 六步 → 成稿/YYYY-MM-DD-话题.md
              ⚠ 每一屏都要有 # 或 [版式]
      ↓
④ 自查        句长 / 禁用词 / 元话语 / 每屏有画面 / 图表数字可溯源
      ↓
⑤ 看版面      双击 看版面.command（十几秒）→ 3-校对/<话题>/ 校对页
              用户在校对页写意见 → 点「复制全部意见」→ 粘回来改
              ⚠ 循环这一步，直到版面顺了再往下
      ↓
⑥ 出片        双击 开始做视频.command → 2-成片/<话题>.mp4
      ↓
⑦ 发布        （目前还是手动）
```

### 4.3 这一期做到哪了

话题「日本人为什么停止长高」。当前状态：

| 项 | 值 |
|---|---|
| 成稿 | `成稿/2026-09-21-日本人身高.md` |
| 规模 | 27 章 / 121 屏 / 447 句 / 5446 字 / 约 21.6 分钟 |
| 画面覆盖 | 121/121 |
| 角度 | 一份劝孕妇少长肉的官方指导，压住了一代人的身高，2021 年官方认账，但不可逆 |
| 结构 | 变体三 · 排除法（排除「穷」→ 排除「吃得差」→ 逼进产房 → 那份文件） |
| 证据 | `资料/2026-09-日本人身高/数据.md`，25 张卡片，含「查不到/不可用」一节 |
| 配图 | 9 张 Wikimedia CC/公有领域 + 2 张用户提供，逐张署名 |
| 未做 | **还没出过片**（没跑 `开始做视频.command`） |

另有两个网页预演（不是成片，只是给用户看效果）：
- 静态 PPT `claude.ai/artifact/8wE7hdH8n1yD1MoxprQkFv` —— **已过期，是旧稿 33 章那一版**
- 动画预演 `claude.ai/artifact/9vUa48usBiTudSRBu5MpT1` —— 当前稿，浏览器 TTS 自动播

---

## 5. Codex 可以优化的

按优先级。每条给：**现状 / 问题 / 建议 / 验收**。

### P0 — 质量闸门（这次就是栽在这儿，最值钱）

#### P0-1 「无画面屏」没有任何警告 ★ 最高优先级

- **现状**：`parse.mjs` 的 `LAYOUTS._bare` 处理没写 `#` 也没写 `[版式]` 的屏，
  注释写着「不重复旁白」——设计是对的，它会渲染「标题 + 红线 + 淡淡的大号序号」。
- **问题**：`sc.head` 为空时，这一屏就是**一个序号加一条红线的近乎空白版面**。
  这次 159 屏里有 124 屏是这样，没有任何环节提醒。用户看到成品才发现。
- **建议**：
  1. `parse.mjs` 统计 `!sc.head && !sc.items.length` 的屏，`run.mjs` 打印
     `⚠ 第 N 屏无画面（文案第 X 行）`，并给出占比。
  2. 占比 > 20% 时 `开始做视频.command` **直接拒绝出片**，提示先补标题
     （给 `--force` 逃生口）。
  3. 校对页（`preview.mjs`）把这类屏的卡片描红，标「⚠ 这屏没有画面」。
- **验收**：拿一份故意只写旁白的文案跑 `看版面`，每一屏都描红且命令行有汇总。

#### P0-2 图表数字无溯源

- **现状**：`[折线图] 1994:170.9 | 2001:170.9` 里的数字，从文案到画面无任何校验。
- **问题**：`版式速查.md` 写了「每一个数字必须来自证据卡片」，但这是**纪律不是机制**。
  我这次写第一版时，有 11 张图表里塞了插值点（为了让折线好看），自查才发现。
  一旦漏掉，就是带着编造数据的成片。
- **建议**：
  1. 支持可选标注 `[折线图|src=数据.md#A] 1985:170.4 | 2019:172.1`。
  2. 没有 `src` 时，至少在校对页末尾自动汇总一张「本片全部图表数字」清单
     （屏号 / 版式 / 数字串 / 文案行号），方便人工逐条核。
  3. 进阶：把 `资料/<话题>/数据.md` 当数据源，做子串匹配，标出**在数据.md 里找不到的数字**。
- **验收**：校对页底部出现数据清单；故意写一个资料里没有的数字，被标黄。

#### P0-3 长句切不动

- **现状**：字幕超 18 字时在逗号处切（`splitLines`）。
- **问题**：没有逗号的长句切不动。这次 22 句切不动，全靠人工改写。
- **建议**：逗号切完仍超长时，退化到虚词边界（`的/是/在/和/与/从/到/把/被/就/都`），
  再不行就硬切并**打警告**，不要静默放过。
- **验收**：`一九八〇年日本新生儿平均体重三千一百八十九克。`（23 字，无逗号）能被切成两条。

---

### P1 — 动画表现力（拉开和参考片差距的地方）

#### P1-1 推镜只覆盖两种版式

- **现状**：`parse.mjs` 里 `FOCUS_LAYOUTS = { 折线图:{dx:.70,dy:.34,zoom:1.45}, 柱状图:{dx:.74,dy:.46,zoom:1.4} }`
- **问题**：只有折线图和柱状图会在最后一句推近。其余版式全程不动。
- **建议**：补这几种，每种推的地方不一样——
  | 版式 | 推向哪里 |
  |---|---|
  | `[方块图]` | 最后填上的那一格 |
  | `[下坠]` | 跟着小人往下摇（不是推近，是纵向跟随） |
  | `[流程]` | 横向跟随箭头，念到哪一环推到哪一环 |
  | `[公文]` | 推近正文里被引用的那一段 |
  | `[汇聚]` | 从多路起点拉到汇聚点 |
- **验收**：截中途帧能看到镜头位置随旁白推进，且目标始终在画面内（边界夹取已有，别破坏）。

#### P1-2 入场动画没有语义分配

- **现状**：`stage.js` 支持 8 种（`up/down/left/right/pop/stamp/fade/draw`），
  但 `parse.mjs` 基本按默认 `up` 发。
- **建议**：让 `LAYOUTS` 每种版式自己指定，例如
  `[列表]` 条目 `left` 依次推入；`[对比]` 左块 `left` 右块 `right` 对推；
  `[公文]` 用 `draw`（clip 擦除，像打印出来）；`[靶心]` 用 `pop` 由内向外。
- **验收**：并排看两屏不同版式，入场方式明显不同。

#### P1-3 换场是直线插值

- **现状**：`camOf` 用 `easeInOut` 直线 lerp。
- **建议**：加一点弧度（二次贝塞尔控制点垂直偏移 6~10%），
  以及换场时先微退再推进（pull-back 4% → push-in），更像真实运镜。
  **幅度要克制**，过了就晕。
- **验收**：转场那一帧能看到两屏同框，且轨迹不是纯直线。

---

### P2 — 流水线效率

#### P2-1 渲染慢

- **现状**：10 分钟视频约 25 分钟渲染（说明书自述）。单实例串行 `__seek` + 截图。
- **建议**：
  1. **分段并行**：按 scene 边界切成 N 段，起 N 个 headless 实例各渲一段，ffmpeg concat。
     这是收益最大的一条，N=4 大概能到 3 倍。
  2. **静帧去重**：旁白中段画面常常完全不动。检测连续相同帧，只编码一次，
     用 `-vsync vfr` + 时间戳。
  3. 截图用 JPEG q=92 而不是 PNG（如果现在是 PNG）。
- **验收**：21 分钟的这份稿子，渲染时间从预计 ~50 分钟降到 20 分钟以内。

#### P2-2 TTS 逐句起进程

- **现状**：`tts.mjs` 每句写一个 txt、起一次 `/usr/bin/say`、再起 ffmpeg 转 wav。
- **问题**：这份稿 447 句 = 约 900 次进程启动。
- **建议**：`say` 支持一次读整个文件；可以用标记词分段后一次合成再按静音切分，
  或至少把 aiff→wav 那步合并成一次 ffmpeg concat。保留「用真实时长对齐」这个正确设计。
- **验收**：配音阶段耗时降一半以上，且时间轴对齐精度不变（字幕误差 < 0.1 秒）。

#### P2-3 无增量缓存

- **现状**：`.work/` 每次全量重建。改一行文案 → 全片重渲。
- **建议**：按 scene 算内容哈希（elements + beats 的 say），只重渲哈希变了的段，
  音频同理（改一句只重配那一句）。
- **验收**：改一句旁白后重跑，耗时应该是分钟级而不是小时级。

---

### P3 — 素材与合规

#### P3-1 素材没有授权字段

- **现状**：`媒体扫描 media.mjs` 只认文件，没有元数据。
- **问题**：这次用了 9 张 Wikimedia 的 CC 图，**署名只能手写进版式参数**，
  容易漏。漏了就是侵权。
- **建议**：约定 `素材/图名.jpg.txt` 存 `作者 · 许可 · 来源URL`，
  渲染时自动打在右下角小字（已有 `.el.tag` 样式可复用）。没有这个文件就警告。
- **验收**：放一张带 `.txt` 的图，成片右下角自动出现署名；不带的，命令行警告。

**顺带一条纪律**：新闻社照片（共同社/朝日/路透/Getty）**不要下载使用**。
可用来源是 Wikimedia Commons 的 CC/公有领域、日本政府统计（政府標準利用規約，
需署名）、以及用户自己的截图。

---

### P4 — 稿件工具链（跨两个目录）

#### P4-1 写稿侧缺一个 lint

- **建议**：在 `~/Desktop/写稿/` 加一个 `check.py`，出片前跑一遍，输出一张体检表：

```
屏数 / 章数 / 旁白句数 / 字数 / 估算时长（字数÷4.2）
⚠ 无画面的屏         → 屏号 + 文案行号
⚠ 超 18 字的句子      → 行号 + 原句
⚠ 禁用词             → 语言规范.md 第二节那张表
⚠ 元话语             → 语言规范.md 第 9.2 节那张表
⚠ 图表数字在数据.md 里找不到 → 屏号 + 数字
⚠ 章节标题是名词短语（应为判断句）
```

- **验收**：对当前这份稿跑，应该全绿（我已经手工过了一遍）。
  对 git 里的旧版本跑，应该能报出 124 个无画面屏。

#### P4-2 时长估算不准

- **现状**：预览模式用 `fakeTiming`，按字数 ÷ 4.2 估。
- **问题**：跟真配音有偏差（数字念得慢，标点停顿也算）。
- **建议**：抽样跑 20 句真 TTS，拟合一条「字数 → 秒数」的回归（对数字和标点单独加权），
  用它替换 4.2 这个常数。
- **验收**：预览估算和成片实际时长误差 < 5%。

---

## 6. 环境事实（直接用，别自己找，这些都是坑）

```bash
# ffmpeg：系统没装 brew，用 Python 包里自带的
python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"

# 无头浏览器：必须用这个。普通 Chrome 加 --headless=new 在这台机器上启动即退
~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell

# 中文 TTS：macOS 自带，免费离线
say -v Tingting -r 168 -f 文本.txt -o 输出.aiff --data-format=BEI16@24000
#   ⚠ 必须 BEI16（大端）。LEI16 会报 "Opening output file failed: fmt?"

# 音频时长
afinfo 文件.aiff | grep "estimated duration"

# 本地语音识别（录音对齐用，模型已缓存，离线可跑）
python3 -c "import mlx_whisper"     # mlx-community/whisper-large-v3-turbo
#   ⚠ mlx_whisper 会在 PATH 里找名为 ffmpeg 的可执行文件，记得自己补
```

**这台机器上 python3 是 /usr/bin/python3（3.9），没有 poppler、没有 pyobjc/Quartz。**
读 PDF 别指望 `pdftotext`，我这次是自己写 zlib + 正则抽的 FlateDecode 流。

---

## 7. 不要做的事

1. **不要把写稿和出片合并到一个目录/一个对话。** 渲染会淹掉写稿上下文。
2. **不要改 `stage.css` 的调色板和字体**，除非用户明确要求。
   粗宋体 + 单一砖红是这套风格的命根子。
3. **不要把旁白原文搬上屏幕。** `_bare` 的「不重复旁白」是对的，别改。
   屏幕缺内容时，正确做法是**回去给文案补标题**，不是让引擎把旁白贴上去。
4. **不要为了图表好看插值补点。** 资料里没有的数字就不用这个版式，改用 `[卡片]` 或 `[列表]` 描述。
5. **别把这份交接文和 A/B 对比任务书搞混。**
   `视频工厂/对比实验/给CODEX的任务书.md` 是另一件事：让你**从零独立实现**一套，
   放在 `~/Desktop/视频工厂B/`，并且明令禁止读 `engine/` 的代码，目的是做 A/B 对比。
   截至今天 `视频工厂B/` **还不存在**，那个任务没开始。
   **这份交接文说的是 A 方案——是让你读 `engine/` 并改进它。两者互斥，先跟用户确认做哪个。**
6. **不要用付费 API、不要联网依赖。** 运行时必须离线可用。

---

## 8. 建议的接手顺序

```
第 1 步  跑一遍现有流程，建立手感
        cd ~/Desktop/视频工厂 && ./看版面.command
        （文案已经在 1-我的文案/2026-09-21-日本人身高.md）
        看校对页，感受一下 121 屏长什么样

第 2 步  出一次片，测基线
        ./开始做视频.command
        记录：总耗时、峰值内存、字幕对齐误差
        ⚠ 这是这份稿第一次出片，可能会暴露新问题，如实记下来

第 3 步  做 P0-1（无画面警告）
        这条最便宜、收益最大，而且能防止同类事故重演

第 4 步  做 P0-2 和 P4-1（数据溯源 + check.py）
        这两条是一件事的两头

第 5 步  做 P2-1（分段并行渲染）
        在动画之前先把迭代速度提上来，后面调动画才不痛苦

第 6 步  再做 P1 那一组动画
```

---

## 9. 一句话总结

这条流水线的工程部分已经跑通了，**短板不在代码能力，在没有闸门**。

用户的原话是「PPT 出来这种动画效果，不是让你一行一行地显示，是抓重点显示」。
事故的完整链条是：稿子 124 屏没给画面 → 引擎按设计渲染成近乎空白的版面 →
没有任何环节报警 → 一路走到用户眼前。

**你加的第一个 assert，比你加的前十个动画都值钱。**
````

</details>

### 附录 17：projects/video-factory/写稿/CODEX-交接文-2026-10-02.md

原始位置：`/Users/wzz122/Desktop/写稿/CODEX-交接文-2026-10-02.md`；SHA-256：`4dd47ec51525318d1b601fdce1b5c2eab5c6f3a3fcee65c7497c553c12e2fe35`。

<details>
<summary>展开完整原文</summary>

````markdown
# 交接文 · 给 Codex（2026-10-02）

> 交接人：Claude（写稿项目主会话）。读者：Codex（gpt-6.1-sol，推理强度 xhigh）。
> 旧版 `CODEX-交接文.md`（2026-09-21）已过期，只作历史参考；以本文为准。
> 回复用户一律用**中文**。

---

## 0. 三十秒版本

- 三个目录各管一段：`~/Desktop/写稿/`（资料、稿件、素材）→ `~/Desktop/视频工厂/`（图解 + 旁白 + 字幕渲染）→ 达芬奇（原声插入、特效、配乐、导出）。不要合并。
- 三个 skill 串成一条线：**material-research**（找资料、证据卡、找画面素材）→ **news-explainer**（写稿）→ **video-assembly**（达芬奇总装）。都在 `~/.claude/skills/`，已同步 `~/.agents/skills/`。
- 当前在做 **T005「刘欢只领了三年养老金？换到日本，他一分都拿不到」**：v3 稿已上传谷歌文档等用户手改；15 张官方截图、9 段新闻切段、4 段新闻成品片段已就绪。
- 你接手的头号任务：**把达芬奇模板库收尾**（第 5 节 P0），然后**改视频工厂引擎**（P2）。
- 用户要的是**有立场、有情绪**的观点视频；你复核稿子时**只查事实、数字、听不懂的地方和配音风险，不提语气和平衡性**。

---

## 1. 目录与职责

```
~/Desktop/写稿/                          写稿项目（这里不跑整片渲染）
├── CLAUDE.md / AGENTS.md                项目规则
├── 00-视频创作入口.md                    入口
├── 制作/当前进度.md                      ⭐ 每阶段结束必须更新，按时间追加
├── 选题/选题台账.md                      T001–T005
├── 资料/<YYYY-MM-话题>/                  证据卡、核查文件、原件、素材
│   └── 2026-10-刘欢养老金/               ← 本期，见第 2 节
├── 成稿/                                 稿件 .md + 同名 .html（给用户看）
├── 工作流/                               单期制作工作流、协作方式、改进清单
├── 工具/                                 每期通用脚本（README.md 有清单）
└── 制作/模板库_解说视频/                 达芬奇模板库源码暂存（已复制到视频工厂）

~/Desktop/视频工厂/                       出片项目
├── 1-我的文案/  .md 文案 + 素材/（截图、新闻片段，文件名带期号前缀）
├── 2-成片/      工厂成片 .mp4
├── 3-校对/      看版面预览
├── .work/storyboard.json                 每屏 t0/t1、每句 beat（总装时间码来源）
├── engine/                               引擎（parse.mjs / stage.js / stage.css / run.mjs / mux.mjs …）
└── 达芬奇/模板库/                         模板库：宏源文件、build_resolve.py、mcp_driver.py、build-state.json

~/.claude/skills/{material-research,news-explainer,video-assembly}/   三个 skill
谷歌云端硬盘「写作」文件夹（id 1YCraJm0sa_XMaCNlfKdkP0wNLHQds-Wu）     用户放素材、手改稿
```

---

## 2. 当前状态（截至 2026-10-02）

### T005 刘欢养老金（写稿中）
| 项 | 状态 | 位置 |
|---|---|---|
| 证据卡 | A–J 十组，已核 | `资料/2026-10-刘欢养老金/00-证据卡.md`（核查原文 01–04、09、10；推算 07） |
| 角度 | Claude 与 Codex 各 4–5 个，用户选「1 主线 + 并入 2、3、4」+ 寿命/标普500/通胀 | `05-角度-Claude.md`、`06-角度-Codex.md` |
| 稿件 | **v3**：11 章 59 屏，旁白约 4,900 字、约 19.5 分钟；Codex 12 条必改已处理 | `成稿/已生成/刘欢养老金/2026-10-02-刘欢养老金-Claude版-v3.md`（.html 同名） |
| 谷歌文档 | 已上传，**等用户手改**；改完要读回 | fileId `1PrudwA_nm5ie3cvdPrKKFaORI3vXUplpB34s0XczyPg`；回读工具 `工具/谷歌文档回读.py` |
| 稿件自查 | 59 屏里 **21 屏只有大字（36%，目标 ≤10%）**；NISA 字母 1 处；「其实」4 次 | `python3 工具/稿件检查.py 成稿/…v3.md` |
| 截图 | 15 张（P01–P07 官方 PDF 高亮、W01–W08 网页高亮） | `资料/…/素材/`，来源 `素材/00-来源.md`；已复制工厂素材库 |
| 新闻切段 | 9 段（ANN/TBS/日テレ 官方 YouTube），弃 2 段 | `素材/视频/片段/`，说明 `素材/视频/00-视频来源.md` |
| 新闻成品 | 4 段：N01 开场快切 28.1 秒、N02 麻生拒收 11.5 秒、N03 年金实际缩水 9.3 秒、N04 米价顾客 13.3 秒；Codex 质检已过 | `素材/视频/成品/`；规格 `成品/规格/*.json` |
| 写作包（给 Gemini） | v1 已写，Gemini 免费额度当天耗尽未出稿 | `资料/…/08-写作包-v1.md` |

### 其他题目
- **T003 东大**：第 6 版成片已交付（`视频工厂/2-成片/2026-10-01-东大黑箱-Gemini版.mp4`），描述栏/发布未做。
- **T004 马斯克与火星**：资料中，等用户定角度与时长。

### 达芬奇模板库（进行中，见 P0）
- 8 个模板已装进 `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Templates/Edit/{Effects,Titles,Transitions}/解说视频/`。
- 工程「模板库_解说视频」已建（1920×1080/30，V1 工厂成片 / V2 覆盖画面 / V3 标题层；A1 旁白 / A2 原声 / A3 音乐 / A4 音效，立体声），空白时间线「模板_总装空白」。
- **E02 证据推近**已装到「小样_E02_证据推近」并通过连线检查；其余 7 个未装。
- 状态文件：`视频工厂/达芬奇/模板库/build-state.json`（记录每条时间线、每个片段的 UID，脚本靠它防重复）。

---

## 3. 工作流与 skill

| 阶段 | skill / 工具 | 产出 | 谁 |
|---|---|---|---|
| 选题 | — | `选题/选题台账.md` | 用户定 |
| 资料 | **material-research** 模式一 | 证据卡（年份、单位、口径、核实状态、允许表述） | Claude；**Codex 独立反查**主张清单 |
| 角度 | news-explainer 2.5 | 05/06 角度文件 → 合并表 → 用户挑 | Claude + **Codex 各自独立**想 |
| 写稿 | **news-explainer**（或 Gemini 按 `references/写作包模板.md` 执笔） | 视频工厂格式 .md | Claude / Gemini |
| 自查 | `工具/稿件检查.py` → **Codex 只读复核**（只查事实/数字/听不懂/配音风险） | 必改清单 | Claude 改 |
| 给用户看 | `工具/稿件网页.py` 生成 .html 并 `open`；要手改就上传谷歌文档 | — | Claude |
| 画面素材 | **material-research** 模式三：截图（`工具/pdfshot`、浏览器高亮）、新闻视频（yt-dlp → 看帧选段 → Codex 商议 → `工具/新闻片段.py` 成品 → Codex 质检） | 素材库 + 预览页 | Claude + Codex |
| 配音 | MiniMax 网页「gou」语速 1.1、音高 1，**每次生成前手动锁 Chinese (Mandarin)** | `文案名.旁白.wav` | 用户/Claude |
| 读音审计 | `工具/pron_transcribe.py` **单进程串行**转写 → 子代理只读 JSON 判断 | 不一致清单 | 主任务 |
| 渲染 | 视频工厂 `看版面.command` / `开始做视频.command`（外部配音模式用 `文案名.旁白.wav`） | 工厂成片 | 视频工厂会话 |
| 总装 | **video-assembly**：装配清单 → 脚本切片拼 V1（Resolve 没有波纹插入）→ 原声插入、覆盖、章节卡、特效宏、音乐表 → 导出 −14 LUFS | 成片 + .drp 备份 | Claude/Codex |
| 质检 | Codex 抽帧 + 波形（不跑模型） | 必改清单 | Codex |

skill 要点：
- **news-explainer**：`SKILL.md` 步骤 1–6；`references/语言规范.md` 第十一节是用户最新口味（立场情绪、给中国观众普及概念、配音规则、预判反驳）；`版式速查.md` 末尾有「配画面五条规则」和「待引擎支持的版式」；`写作包模板.md` 给外部模型执笔用。
- **material-research**：模式一证据卡；模式二拆参考视频；**模式三找画面素材**（2026-10-02 新增，含新闻视频全流程）。
- **video-assembly**：轨道约定、装配清单字段、已核过的 Resolve 21.1 脚本接口、导出与质检。

---

## 4. 用户偏好与硬规则（必须遵守）

**内容**
- 观点视频要**站队、有情绪**，可以反问、讽刺、选择性呈现、顺着刻板印象写。底线两条：**数字和事实不改不编**；**没证据的指控不安在真人头上**。对逝者（刘欢）保持尊重。
- 给中国观众写：外国制度名词第一次出现要解释；不压时长，流畅优先。
- 旁白里**不出现日文假名、不用括号夹外文、字母缩写首次写中文说法**（MiniMax 遇假名会整章念成日语腔，东大期返工过）。日文原句只放画面。

**协作**
- **派给 Codex 的任务一律 `--model gpt-6.1-sol --effort xhigh`**。不要改用户 `~/.codex/config.toml` 的全局默认。
- Gemini 执笔用 **AI Studio 免费 Key**（`~/.gemini/.env`，绝不读出或打印；项目 huatu 未开结算）。免费档约 20 次/天，CLI 遇 503 会自动重试烧额度：**只跑一次，失败就停**，改让用户贴进 Gemini 网页版。不开结算。
- 角度阶段 Claude 与 Codex **各想各的**再合并；用户挑完再执笔。
- 新闻视频素材：用户已授权「自己商议下载」，从电视台官方频道下载、短时间引用、标来源。
- 给用户看文件：**不要让用户看变更面板/文件夹链接**（写稿目录不是 git，面板永远空）。稿件生成 .html 用 `open` 打开；素材做预览页。
- 回复和汇报**全部中文**。
- 不买服务、不调付费 API、不发布。

**本机资源（16 GB 统一内存）**
- 本地 Whisper / MLX / PyTorch / 图像模型**全机同时只跑一个**，用 `/usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- <命令>`；退出码 75 = 别的模型任务在跑，稍后重试，**不要删锁**。
- 子代理、Codex 只读转写结果和抽帧图片，不各自加载模型（10-01 六个子代理同时加载 Whisper 把内存撑爆过）。
- 达芬奇开着时不跑模型、不并行渲染。

---

## 5. 接下来的事（按优先级）

### P0 达芬奇模板库收尾 ← 先做这个
**目标**：8 个模板各有一条小样时间线、各渲染一段 5 秒小样；做一次「验收_东大开头90秒」并导出 `视频工厂/达芬奇/模板库/验收-东大开头90秒.mp4`。

**前提**：达芬奇必须**一直开着**，并打开工程「模板库_解说视频」。（10-02 下午启动两次都在 6 秒后被正常退出，疑似用户手动关的，等用户说「开着了」再做。）

**怎么做**（已踩过的坑都在这里）：
1. 连 Resolve 两条路，任选：
   - **DaVinci MCP**（`run_script_unsafe`，单次 ≤ 60 秒）：用 `视频工厂/达芬奇/模板库/mcp_driver.py`，每个模板分两次调用：`setup(resolve,'E03')`（建时间线、放片段、切 Fusion 页）→ `paste(resolve,'E03')` + `finish(resolve,'E03')`。
   - **外部 Python**：需要用户在 达芬奇 → 偏好设置 → 系统 → 常规 → **External scripting = Local**（不要替用户改）；之后可以跑 `build_resolve.py samples` 一次做完。
2. **剪辑页里 `comp.Paste(宏)` 返回 False**；必须先 `resolve.OpenPage('fusion')`、播放头放到目标片段上、用 `resolve.Fusion().GetCurrentComp()` 粘贴。粘贴后宏变成 GroupOperator，MediaOut 的输入来自组内节点（如 `Result`），检查时按 `ParentTool` 认。
3. **E03 盖章那次粘贴后 Resolve 脚本接口卡了 30 分钟无响应**（进程空闲）。最可能是窗口里弹了对话框（字体缺失/宏警告），用户拒绝了屏幕控制、未能确认。重试时：先对 E03 的 `.setting` 检查字体名（Songti SC / PingFang SC 是否本机存在），必要时在宏里换成 Hiragino Sans GB 再粘贴；一次只粘一个，卡住就请用户看一眼窗口。
4. `build_resolve.py` 已修两处：静帧源入点 Resolve 报 1（不比较）；视频 `AppendToTimeline` 的 endFrame 是**开区间**。
5. E10 快推转场需要 Resolve 重启后才能被 `AddTransition` 认出（10-02 下午已重启过）。
6. 验收的音乐抽离要**听核**：工厂成片里已混了 BGM（`engine/mux.mjs`），A3 清空不等于静音；干净旁白在 `视频工厂/.work/narration.wav`（但它属于最后一次渲染，用前确认与东大成片同步）。
7. 渲染用 `build_resolve.py render-samples / render-acceptance`；导出后用 ffmpeg `ebur128` 测 −14 LUFS、真峰 ≤ −1 dBTP；抽帧查文字重叠、出界、说明条左对齐。
8. 每步更新 `build-state.json` 和 `制作/当前进度.md`。

**验收**：8 段小样 + 90 秒验收视频 + 响度数字 + 抽帧拼图；README 里的 SVG 示意换成实际静帧。

### P1 刘欢 v4 定稿
1. 用户说「改好了」→ Drive `read_file_content(fileId, includeComments=true)` → 存成文本 → `python3 工具/谷歌文档回读.py 回读.txt 成稿/2026-10-0X-刘欢养老金-v4.md`；评论逐条处理。
2. 跑 `稿件检查.py`；按 `工作流/新闻大写-手法对照与改进清单-2026-10-02.md` 第四节的 10 个关键屏方案，把 **21 个只有大字的屏补上画面**（目标 ≤ 6 屏）；N01–N04 新闻成品按 `素材/视频/00-视频来源.md` 的位置写占位。
3. Codex 只读复核（只查事实/数字/听不懂/配音风险）→ 改完 → `稿件网页.py` 打开给用户 → 复制到 `视频工厂/1-我的文案/`。

### P2 视频工厂引擎改进（Codex 主做，改 `engine/`）
来自改进清单，按收益排：
| # | 改什么 | 提示 |
|---|---|---|
| 1 | 去掉每屏常驻的大标题（片名 + 副题占画面上方约 20%），改左上角「第 N 章 · 小标」 | `stage.css` + `parse.mjs` 的头部元素 |
| 2 | 截图「证据三步」：整页 → 推近关键句 → 译文条 | 引擎已有推近机制 `FOCUS_LAYOUTS`（parse.mjs:307，目前只对折线图/柱状图）；给 `[画中画]`/新版式 `[原件] 文件 \| 高亮框(x,y,w,h) \| 译文` 加焦点区 |
| 3 | 一个变量驱动的组件：`[填充条] 总额 \| 已填 \| 缺口`、`[圆环] 35 \| 说明`、`[双线] 年份:a,b \| …` | 数字和图形读同一份数据；最后一个元素落定后停 ≥1.5 秒 |
| 4 | `[人物] 教授 \| 歌手` 立绘 + 状态标签（贯穿人物） | 先用 PNG 立绘 + 标签，复用到各对比屏 |
| 5 | 章节卡 1.5–2 秒（编号 + 判断句 + 英文小标） | 工厂已有封面逻辑，扩成章节卡 |
| 6 | 预览/渲染入口改用隔离 Chromium，去掉系统 Chrome 回退 | `engine/cdp.mjs`；`~/.codex/AGENTS.md` 规定不能用系统 Chrome 跑无头 |
**验收**：用刘欢 v4 跑 `看版面`，抽帧证明：无常驻大标题、至少 3 屏原件推近、回本条/年金 vs 物价/所得替代率用新组件；文字不重叠、不出界。改完同步更新 `news-explainer/references/版式速查.md` 的「待引擎支持」表和 `视频工厂/说明书.md`。

### P3 配音与音乐
- MiniMax「gou」1.1/1，**每段生成前手动选 Chinese (Mandarin)**；三个日语词旁白不念。
- 读音审计：无提示转写 + 与稿逐字对齐，单进程串行（`工具/pron_transcribe.py`），差异只放过同音字/人名/数字格式。
- 音乐：MiniMax 出 3 首（章节曲、铺底、片尾）；写**音乐表**（每章进 / 抽离 2–5 秒 / 三个反转点静默 2 秒 / 原声段 ≤ −35 LUFS）。音乐生成会花用户积分，**先问用户**。

### P4 总装（video-assembly）
- 从稿件 + `.work/storyboard.json` 生成 `装配清单.csv`（屏号/起止/动作/文件/源入出点/时长/说明，含插入后的顺延时间）。
- `assemble.py`：切片拼 V1（插入片段夹在中间，顺延自然发生）→ V2 覆盖 → V3 章节卡/来源条/盖章 → A3 音乐按音乐表 → A4 音效；每个动作 `AddMarker`。
- 导出 −14 LUFS → Codex 抽帧 + 波形质检 → 发用户 + `.drp` 备份。

### P5 零碎
- 东大期：YouTube 描述栏、封面已定（视频开头 3.15 秒帧）。
- T004：等用户定角度；Flight 15（不早于 10-19）结果可能改开头。
- puzzle-explainer（`~/Desktop/谜题解说/`）还没按新规则同步。

---

## 6. 已知坑（别再踩）

- 写稿目录**不是 git**，变更面板永远空。
- 旁白假名 → MiniMax 判日语；括号 → 念出来或跳过；字母缩写 → 逐字母念。
- Gemini CLI：免费额度会被自动重试烧光；`-preview` 模型名不存在，用 `gemini-3.8-flash`；必须加 `--skip-trust`。
- yt-dlp：系统 Python 3.9 装的太旧（YouTube 报 page needs reload），用官方单文件 `~/.cache/material-research/yt-dlp_macos`。
- 新闻选段**一定看帧**：曾把美国大米试吃会当成超市米价；TBS 节目的标普走势图只到 2023，不能当「60 年」证据。
- 节目里的数字（回报 8%、美国 62.7%）只当画面，旁白数字以证据卡为准。
- 成品新闻片段**不走视频工厂**（会被做旧、去声、再压字幕），由达芬奇放。
- Resolve：剪辑页不能粘贴宏；静帧源入点 = 1；endFrame 开区间；新转场模板要重启才认。
- 中国男性预期寿命「69.9 岁」是谣言；「2026 年养老金上调 2%」无出处；社保法继承条款是第 14 条（不是 49 条）。
- 日本家庭现金存款占比现在 44.9%，不能再说「过半」（2022 方案原话除外）。

---

## 7. 交接规则

- **主稿同一时间只有一方在改**；改前看 `制作/当前进度.md` 最后几条，改完追加一条（时间、版本、改了什么、下一步）。
- Codex 对稿子的意见写成修改单（章节·原句 → 问题 → 可直接替换的句子），由 Claude 合并；用户在谷歌文档改的版本优先。
- 新文件放进对应期的 `资料/<话题>/` 或 `成稿/`，不要散在根目录；工具放 `工具/` 并更新 `工具/README.md`。
- 用户已授权的范围：写稿、找资料、下新闻素材、本地渲染、达芬奇里只动「模板库_解说视频」和每期新建的工程。**不打开、不修改其他达芬奇工程**；不改达芬奇偏好；不关用户的应用。

---

## 8. 关键文件索引

| 文件 | 用途 |
|---|---|
| `制作/当前进度.md` | 全部决定与进度（按时间） |
| `工作流/单期制作工作流.md` | 7 阶段、效果清单 E01–E10、声音规则 A01–A06 |
| `工作流/新闻大写-手法对照与改进清单-2026-10-02.md` | 参考片手法、我们的差距、12 条改进、刘欢 10 个关键屏 |
| `资料/2026-10-刘欢养老金/00-证据卡.md` | 本期唯一数字来源 |
| `资料/2026-10-刘欢养老金/素材/00-素材预览.html` | 素材总览（截图 + 新闻片段 + 成品） |
| `资料/2026-10-刘欢养老金/素材/视频/00-视频来源.md` | 新闻片段出处、区间、放哪一屏、覆盖/插入、说明条 |
| `成稿/已生成/刘欢养老金/2026-10-02-刘欢养老金-Claude版-v3.md` | 当前稿 |
| `视频工厂/达芬奇/模板库/README.md` | 模板参数说明（SVG 示意待换成实拍） |
| `视频工厂/达芬奇/模板库/mcp_driver.py`、`build_resolve.py`、`build-state.json` | 模板库搭建 |
| `~/.claude/skills/*/SKILL.md` | 三个 skill |
| `工具/README.md` | 通用工具清单（pdfshot、imgtool、新闻片段、稿件检查、稿件网页、谷歌文档回读…） |
````

</details>

### 附录 18：projects/video-factory/写稿/CODEX-交接文-2026-10-02-东大收尾与竖屏.md

原始位置：`/Users/wzz122/Desktop/写稿/CODEX-交接文-2026-10-02-东大收尾与竖屏.md`；SHA-256：`73bc835e3fdc63bce24a635a880ceea1313143e8964e469defe1ed4bc8187905`。

<details>
<summary>展开完整原文</summary>

````markdown
# 交接文 · 给 Codex（2026-10-02）· 东大收尾与竖屏

> 交接人：Claude（Opus 5.5），东大那期的制作会话。读者：Codex。
> 这份是 `CODEX-交接文-2026-10-02.md`（主交接文：模板库 P0、刘欢 P1、引擎改进 P2 等）的补充，专讲东大这期收尾、竖屏引擎和新工具；两份冲突时以主交接文的优先级为准，东大收尾的具体做法以本文为准。
> 先读第 0 节和第 1 节就能接手；后面是整套工作流、skill、引擎、工具和硬规则的参考。
> **所有给用户看的文字一律用中文**（用户多次要求）。

---

## 0. 三十秒版本

- 两个目录分工不变：`~/Desktop/写稿/`（资料、稿件、截图卡、进度）和 `~/Desktop/视频工厂/`（引擎、渲染、成片）。达芬奇做总装（skill `video-assembly`）。
- 一期的链路：**选题 → 查资料（material-research）→ Claude 与 Codex 各想角度 → Gemini 执笔（news-explainer 的写作包）→ Claude 事实锁 + Codex 复核 → MiniMax 配音 → 逐字读音核对 → 视频工厂出横屏 + 原生竖屏 → 抽帧质检（含 Codex）→ 交付（谷歌云盘 / YouTube）**。
- **正在收尾的是 T003 东大这期**（`成稿/已生成/东大首位女总长/2026-10-01-东大黑箱-Gemini版.md`）：横屏、竖屏两支成片正在做最后一轮渲染，之后质检、上传谷歌云盘、上传 YouTube（不公开）。见第 1 节。
- 16 GB 内存：**本机模型任务（Whisper/MLX 等）和渲染全机只跑一个**，一律走 `mac-heavy-job.py` 运行锁。子代理和 Codex 只看图、读文本，不加载模型。

---

## 1. 接下来要做的事（东大这期，按顺序）

### 1.1 交接时的状态（2026-10-02）

> **最新状态（2026-10-02 16:00）**：竖屏第 4 版已定稿并上传云盘（[竖屏](https://drive.google.com/file/d/1ro4x1BSfxB2aq078SNiSlzGk0l80DFH-/view)，Codex 复查后的两处已改）。横屏最后一版正在渲染：截图屏改用竖屏那套 `-竖` 截图卡（`parse.mjs` 的横屏 `画中画`：非 C 编号的素材优先找 `-竖` 卡，按比例摆、说明条贴卡片底边），第 20 屏标题与第 26 屏日文引语按 `横屏断行.json` 断行，引用首行左挂半字。渲完 → 抽帧 → Codex 复查 → **用同名文件替换云盘里的横屏旧版**（`写作/东大首位女总长/成片/2026-10-01-东大黑箱-Gemini版.mp4`，云端文件 id `1U5Wi1vakW2x6cWpBj79dVFdN15hCzbx_`）→ YouTube 不公开上传（用户拖文件）。第 14、15 屏横屏里表格卡较窄、译文条约 21px，Codex 标为「建议」，暂未改。


| 项 | 状态 |
|---|---|
| 竖屏版第 3 版渲染 | 进行中（交接时约 80%）。改了：13 张截图卡译文全部手动断行、按画面可见内容完整翻译；第 05 屏高亮框；两张竖版图表（白票注、高被引「连续5年」）；3 句字幕断行 |
| 横屏版重渲 | 排队中，竖屏渲染一结束自动开始。改了：17 个窄栏标题按词断行（`横屏断行.json`）、第 11 屏对比卡正文断行、第 26 屏引用块上移避开字幕、6:36 那句短引号字幕合并、山尾志樱里引语译文、标准色彩范围 |
| 横屏旧版 v9 | 备份在 `视频工厂/2-成片/旧版-横版v9/` |
| 旧竖屏（横屏居中合成，用户否定） | 在 `视频工厂/2-成片/旧版-竖屏横屏居中/`，不要再用 |
| YouTube 发布信息 | 已定稿：`成稿/已生成/东大首位女总长/2026-10-01-东大黑箱-YouTube发布信息.md`。用户选了标题 3「东京大学的“黑箱”：首位女总长诞生背后的程序之死」，**不公开**上传，用户看过再自己改公开 |
| 谷歌云盘 | 未上传 |

查渲染是否完成：看 `视频工厂/2-成片/` 里两个文件的修改时间（竖屏 `2026-10-01-东大黑箱-Gemini版-竖屏.mp4`、横屏 `2026-10-01-东大黑箱-Gemini版.mp4`），或 `ps aux | grep "engine/run.mjs"` 看还有没有在跑。日志在 Claude 的临时目录（`/private/tmp/claude-501/…/scratchpad/vc/render3.log`、`render-h2.log`），重启后会消失，不要依赖。

### 1.2 抽帧质检（两支都做）

1. **渲染一结束就复制 `视频工厂/.work/timeline.js`**（下一次渲染或「看版面」会覆盖它）。这次竖屏渲完后横屏紧接着开始，竖屏的 timeline 已由排队脚本复制到 Claude 临时目录 `…/scratchpad/vc/timeline-v3.js`（横屏的是 `timeline-h2.js`）。万一丢了，竖屏就改用每 2 秒均匀抽帧检查（`--预览` 没有真实时间，不能代替）。
2. 抽帧：`python3 ~/Desktop/写稿/工具/抽帧质检.py 成片.mp4 timeline.js 输出目录 v`（横屏用 `h`）。产出每屏结束前一帧 `scene/NN.jpg`、每句字幕一帧 `subs/NNN.jpg`、拼图和 `subs.json`。
3. 看什么（用户硬规则）：文字不重叠、不出界；标题/字幕/译文条**不在词中间断、不留 1–2 个字或孤立引号括号单独一行**；【译】条只翻画面里看得见的日文，不多不少；字幕与旁白原文一致；手机上关键信息看得清。
4. 上一轮竖屏质检（36 个代理 + 对抗复核）确认的问题，这版都已处理；**已知但按设计保留的小问题**见第 8 节，不要当新问题反复报。
5. 技术检查：`ffmpeg -i 成片.mp4` 应为 `yuv420p(tv, bt709)`，30 fps，竖屏 1080×1920 / 横屏 1920×1080；响度约 −14 LUFS（工厂日志里有）。

### 1.3 上传谷歌云盘

- 用户的 Google Drive for Desktop 已挂载：`~/Library/CloudStorage/GoogleDrive-wzzsgdtc@gmail.com/我的云端硬盘/`。**复制进去就是上传**。
- 目标：`我的云端硬盘/写作/东大首位女总长/成片/`（文件夹还没建；「写作」下已有「名古屋」「日本人身高」「被讨厌的勇气」）。放两支成片，可附横屏封面 `-封面.jpg`。
- 复制后核对大小一致；再用 Google Drive 连接器搜文件名，确认云端已出现（同步需要时间）。

### 1.4 上传 YouTube（横屏）

- 用户 Chrome 已登录 YouTube Studio，频道显示「我的频道 / ZZ ZZ」（`UCOkYm-cDjmdPxUGfr_WwPEA`）。
- **视频约 255 MB，浏览器自动化的文件上传上限 10 MB**，所以：打开 Studio 上传窗口 + 在访达里 `open -R` 定位成片，**请用户把文件拖进上传框**；之后标题、简介（含章节和来源）、标签、缩略图（`2-成片/…-封面.jpg`，151 KB，可以用工具传；自定义缩略图需要频道已验证）、「不是面向儿童」、类别「新闻与政治」、语言中文、可见性「不公开」都按发布信息文件填，保存。
- 发布（改公开）是用户的事；我们只做到「不公开」并把链接给他。

### 1.5 收尾

- 竖屏版建议另做封面：竖屏开头标题画面（约 3.15 秒处）抽一帧存 `2-成片/…-竖屏-封面.jpg`（小红书/视频号要竖封面）。
- 需要的话重做手机预览版（旧的 `-手机预览.mp4` 是 v9 的）：720 宽、CRF 28、AAC 96k，控制在 30 MB 内。
- 更新 `制作/当前进度.md`（东大那节追加：两支成片版本、云盘与 YouTube 链接、已知问题）。

---

## 2. 其他在制的题目与事项

以主交接文 `CODEX-交接文-2026-10-02.md` 第 2、5 节为准（P0 达芬奇模板库收尾、P1 刘欢 v4、P2 引擎改进、P3 配音音乐、P4 总装、P5 零碎）。主文里「T003 东大：第 6 版已交付、发布未做」是旧状态，**东大以本文第 1 节为准**。

与主文 P2（改视频工厂引擎）的衔接：
- P2 第 1 条「去掉每屏常驻大标题」会动到 `parse.mjs` 的标题元素；竖屏版式（`V_LAYOUTS`、`vBreakTitle`、安全区居中）也依赖它。改完请同时跑 `--竖屏 --预览` 和横屏 `--预览` 做回归，并保留 `竖屏断行.json` / `横屏断行.json` 的用法。
- P2 第 6 条要求用隔离 Chromium、不用系统 Chrome 跑无头：本会话画竖版图表（`charts-竖.html`）和 `mshot.mjs` 手机截图时用的是 `cdp.mjs` 找到的浏览器（无 Playwright 缓存时会落到系统 Chrome）。Codex 重跑这两样时按你那边的规定换成隔离 Chromium。

## 3. 整套工作流（谁做什么）

总表见 `工作流/单期制作工作流.md`（7 阶段、效果编号 E01–E10、声音规则 A01–A06）和 `工作流/协作方式.md`。2026-10-01/02 之后的实际做法：

1. **选题**：用户定。登记 `选题/选题台账.md`。
2. **查资料**（skill `material-research`）：Claude 收素材 → 待证主张清单 → 追一手来源 → 证据卡（`资料/<话题>/00-证据卡.md`，带核实状态、独立信源数、允许表述）→ Codex 独立反查。原始素材常在云盘 `我的云端硬盘/写作/<话题>/`。
3. **角度**：Claude 写 `05-角度-Claude.md`，同时派 Codex 只读证据卡独立写 `06-角度-Codex.md`；合并去重给用户挑。
4. **写稿**：**Gemini 执笔**（用户认为它敢站队、有情绪）。Claude 按 `news-explainer/references/写作包模板.md` 做写作包，用户贴进 Gemini（CLI 免费档每天约 20 次，常不够用）。稿子回来 Claude 做**事实锁**：只标事实错误和「把无证据的指控当事实写在真人身上」，**不改语气和立场**。Gemini 不可用时 Claude 自写，也可以有立场。
5. **自查**：`python3 工具/稿件检查.py 成稿/xxx.md`；派 Codex 只查事实、数字、配音风险；`python3 工具/稿件网页.py` 出 .html 给用户看（用户看不到 .md 面板）。
6. **配音**：MiniMax 网页版，音色「gou」，语速 1.1，音高 1，模型 speech-2.8-hd，按章生成。**语言下拉框每次手动选 Chinese (Mandarin)**（清空文本会复位；稿里有假名会被自动判成日语）。旁白里括号中的日语原词不念，只上屏。停顿可写 `<#0.35#>`。
7. **读音核对**：`工具/pron_transcribe.py` 一个进程逐章转写（走运行锁），无提示转写与稿子逐字对齐，列出不一致逐条复听。
8. **出片**（视频工厂，第 5 节）：外部旁白 `文案名.旁白.wav` + 自带 BGM `文案名.bgm.mp3`；横屏和原生竖屏各渲一次。
9. **质检**：抽帧 → 图片审查（Claude 子代理 + Codex，gpt-6.1-sol / xhigh）→ 对抗复核 → 修 → 重渲。
10. **总装**（skill `video-assembly`，可选）：插新闻原声、音乐抽离、章节卡、特效宏，导出 −14 LUFS。
11. **交付**：云盘 + YouTube（不公开）；发布由用户决定。

---

## 4. 三个 skill

位置 `~/.claude/skills/<名字>/`（同步在 `~/.agents/skills/`）。

### news-explainer（写稿）
- 触发：「写稿」「写视频文稿」「新闻大写风格」等。
- 步骤：证据卡（由 material-research 负责）→ 选骨架（`references/论证骨架.md`）→ 2.5 角度（Claude 与 Codex 各想）→ 大纲 20–30 节（含「画面任务」，先给用户过目）→ 逐章写（`references/语言规范.md` 第十、十一节：口语整句、可以站队）→ 配画面（`references/版式速查.md` 的五条规则：只有大字的屏 ≤ 10%、证据三步、贯穿物件、彩色间歇）→ 自查交付（稿件检查、Codex 只查事实、音乐表、素材清单）。
- 铁律：观点只用用户的；数字不改不编；信息强度如实标注。

### material-research（查资料、拆视频、找素材）
- 模式一 为一期找证据（主张清单 → 一手来源 → 证据卡 → Codex 反查）。
- 模式二 拆参考视频（逐字稿、抽帧、结构、来源 → `00-拆解.md`）。
- 模式三 找画面素材：官方 PDF 截图 `工具/pdfshot`（自动黄底红框）、网页截图；新闻视频用 `~/.cache/material-research/yt-dlp_macos` 从电视台官方 YouTube 下载，`工具/新闻片段.py` 剪成成品（中文字幕、来源条、原声）。用户已授权 Claude 与 Codex 自行选段，不必逐条问。

### video-assembly（达芬奇总装）
- 装配清单（`屏号/起止/动作/文件/入出点/说明`）→ Resolve 脚本建时间线（没有波纹插入，用「切片拼 V1」）→ 手工听看 → 导出 −14 LUFS / 真峰 ≤ −1 dBTP → Codex 抽帧+波形质检。
- 四轨：A1 旁白、A2 原声、A3 音乐、A4 音效。只建新时间线，不覆盖用户精修的工程。

---

## 5. 视频工厂引擎（`~/Desktop/视频工厂/engine/`）

### 命令
```bash
cd ~/Desktop/视频工厂
node engine/run.mjs "1-我的文案/文案.md" --预览            # 只出版面（不配音、不跑模型），3-校对/<文案名>/屏/NN.jpg
node engine/run.mjs "1-我的文案/文案.md" --竖屏 --预览      # 竖屏版面，3-校对/<文案名>-竖屏/
/usr/bin/python3 ~/.local/bin/mac-heavy-job.py --wait 900 -- node engine/run.mjs "1-我的文案/文案.md"          # 横屏成片
/usr/bin/python3 ~/.local/bin/mac-heavy-job.py --wait 900 -- node engine/run.mjs "1-我的文案/文案.md" --竖屏   # 竖屏成片
```
- 正式渲染会加载 Whisper 对齐字幕 → **必须走运行锁**；退出码 75 = 锁被占，稍后重试，不许删锁。
- 「看版面」与渲染都会覆盖 `.work/timeline.js`、`storyboard.json`：**渲染进行中不要跑预览**。
- 7:49 的片子，单支渲染约 20–25 分钟。

### 文案旁边的同名文件（都在 `1-我的文案/`）
| 文件 | 作用 |
|---|---|
| `文案名.旁白.wav` | 外部旁白（不用系统 TTS）；Whisper 对齐字幕；每次换屏前补停顿到 0.8 秒（`config.json` 的 `sceneGap`） |
| `文案名.bgm.mp3` | 本期 BGM；自动闪避，结尾 5 秒淡出，成片 −14 LUFS |
| `文案名.竖屏断行.json` | 竖屏手动断行 `{原句: "上|下"}`：字幕、标题（键去掉 `==`）、日文引用（可多个 `|`）、对比卡正文 |
| `文案名.横屏断行.json` | 横屏手动断行：截图旁窄标题栏（约 6 字一行）、对比卡正文；放不下自动缩字号 |
| `素材/xxx-竖.png` | 竖屏优先用同名 `-竖` 素材（重新取景的截图卡、竖版图表），没有才用原图 |

### 竖屏（原生 1080×1920）要点
- 标题在上，内容块在 y 280–1300 安全区内整体上下居中；字幕两行、每行 ≤16 字、底边距 380；页眉固定在取景框上（不随推镜跳）；推镜幅度 1.035。
- 竖屏不加截图下方的说明条、不加对比卡的英文小标（用户：「不需要加这些字」）；只有章节首屏放淡色大号章节序号。
- 热搜卡竖屏一条两行（词条 + 释义）；引用是「原文 → 译文 → 出处」；第二项不是出处时与第一句同框、红色加粗。
- 标题里句中全角逗号/冒号的右半边空白被收掉（只竖屏）。

### 本会话改过的引擎文件
`parse.mjs`（竖屏版式、`insertBreaks` 多处断行、横屏断行表、引用块避让字幕）、`stage.js`（竖屏固定页眉、标题标点收紧）、`stage.css`（竖屏样式、字幕框宽 1000）、`charts.js`（竖屏热搜两行）、`media.mjs`（读图片宽高）、`render.mjs`（**输出改为标准范围 bt709**，原来是全范围 yuvj420p，平台转码易发灰）、`run.mjs`（读横屏断行表）。横屏行为除断行表与第 26 屏外未变。`说明书.md` 已更新竖屏段落。

---

## 6. 工具（`~/Desktop/写稿/工具/`，说明见同目录 README）

| 工具 | 用途 |
|---|---|
| `pdfshot` | 官方 PDF 页面渲染成 1920 宽截图，关键句自动黄底红框（框会略长半个字，挑短语时注意） |
| `imgtool` | 横屏截图卡：裁切 + 底部【译】条 |
| `reframe.py` | 竖长截图按高亮取景成 1.6:1（横屏画中画用） |
| `vcard.py` | **竖屏截图卡**：从原始截图重新取景（多段拼接、右边渐隐、表格分两列），34px 大字【译】条；译文写 `|` 就按手动断行。东大配置：`资料/2026-09-东大新总长/截图/竖屏卡片.json` |
| `mshot.mjs` | **手机宽度网页截图**（430 宽、3 倍像素、正文自动重排变大，关键句加框）。东大配置：`截图/手机截图.json` |
| `抽帧质检.py` | 成片抽帧与拼图（第 1.2 节） |
| `稿件检查.py` / `稿件网页.py` | 稿件自查 / 生成给用户看的 .html |
| `新闻片段.py` | 新闻原片剪成新闻大写式成品片段 |
| `pron_transcribe.py`、`sync_check.py` | 读音转写、字幕同步核对（都加载模型，走运行锁） |
| `cover_compose.py`、`cover_people.py`、`cutout` | 封面合成、人物抠图（用户最后选了视频开头画面做封面） |

竖版数据图源码：`资料/2026-09-东大新总长/图表/charts-竖.html`（`#c01/#c02/#c03`，Chrome 无头 2 倍截图后裁掉底部空白，存成 `素材/东大-C0x-…-竖.png`）。

---

## 7. 硬规则（违反会被用户直接发现）

1. **中文回答**。
2. **16 GB 内存**：模型任务与渲染全机串行，走 `mac-heavy-job.py`；不并发、不绕锁、不删锁文件；不让子代理/Codex 加载模型。开工前看 `memory_pressure`。
3. **画面**：文字不重叠、不出界；标题/字幕/译文不在词中间断、不留 1–2 字或孤立引号；截图下的说明条（横屏）左对齐；日文原话保留并附准确中文译文，**译文只翻画面里看得见的部分**；找不到原文的不编。
4. **配音**：MiniMax 每次手动锁「Chinese (Mandarin)」；生成后逐字核对读音；日语词不念。
5. **事实**：数字不改不编；核查只管事实不管语气；不把无证据的指控写成事实。
6. **交付前 Codex 检查**：派 Codex 用 gpt-6.1-sol、推理强度 xhigh（prompt 首行写明）。只看图/读文本。
7. **钱与发布**：只用本地与已有订阅；不开付费 API、不买服务；发布（公开）由用户决定。
8. **给用户看文件**：只给单个文件链接；多图做 HTML 预览页；稿子出 .html；视频直接 `open` 用 QuickTime 打开并 `open -R` 定位。
9. 不在 `写稿/` 项目里乱跑渲染（东大这期用户特批过在本会话渲染）；视频工厂的渲染缓存不要手动删。
10. 媒体若迁到 Extreme SSD，原路径可能是符号链接，先检查能否读；SSD 没挂载就报告，不在原路径造替代大文件。

**Codex 侧的已知限制**：上一次 Codex 会话不能写 `视频工厂/` 和 `~/Library`、连不上 Resolve。需要写这些位置或跑渲染时，请用户在 Codex 设置里放开权限，或把这一步交回 Claude。

---

## 8. 已知问题与待用户决定（不要反复当新问题报）

- **旁白里的意译**（旁白是用户选定的 Gemini 稿，已录音，没改）：
  - 第 22 屏「这让我感到非常受鼓舞」：会见原话是「550票ぐらい取っている。少なくとも4分の1には届いているということは、非常に自信になりました」（[sn-jp.com](https://sn-jp.com/archives/292100) 转引会见视频推文）；「自信」译成「受鼓舞」属于意译。若用户要改，只需重配这一句。
  - 第 20 屏旁白引上野千鹤子「努力了也不一定能得到回报」漏了「公正」；画面译文条是准确的。
  - 第 05 屏旁白说理由「只有四个字：综合考虑」，而画面截图（官方文件）其实列了具体理由；资料核查时已告诉过用户，用户选择不改稿。
- 第 13、17 屏的高亮框略压到相邻字：源自 `pdfshot`，原 PDF 在旧会话临时目录已丢，重做需重新下载 PDF（要用户同意下载）。横屏同样存在且已过审。
- 第 23、24 屏是连续两屏只有大字（约 40 秒）；第 19、25 屏热搜卡没有来源行；第 08 屏标题「近百倍」与图表「约106倍」（跟旁白一致，故保留）。
- 第 16 屏「？」与「」」之间有空隙（字体字距）。

---

## 9. 关键路径索引

| 东西 | 路径 |
|---|---|
| 本期稿 | `写稿/成稿/已生成/东大首位女总长/2026-10-01-东大黑箱-Gemini版.md`（= `视频工厂/1-我的文案/` 同名文件）；改屏幕字前备份 `成稿/…改屏幕字前备份.md` |
| 证据卡 | `写稿/资料/2026-09-东大新总长/00-证据卡.md`；染谷关联法人报道核查 `延伸-染谷关联法人报道核查.md` |
| 截图原件 | `资料/…/截图/raw/`（PDF 渲染、桌面网页）、`raw-m/`（手机宽度）、`final/`（横屏卡） |
| 配音 | `资料/…/配音-Gemini版/`（ch1–ch6，ch1 V3 拼接、ch4 普通话重配）；整条旁白 `视频工厂/1-我的文案/…旁白.wav` |
| 成片 | `视频工厂/2-成片/2026-10-01-东大黑箱-Gemini版.mp4`（横）、`…-竖屏.mp4`（竖）、`…-封面.jpg` |
| 发布信息 | `写稿/成稿/已生成/东大首位女总长/2026-10-01-东大黑箱-YouTube发布信息.md` |
| 进度 | `写稿/制作/当前进度.md`、`写稿/选题/选题台账.md`、`写稿/00-视频创作入口.md` |
| 工作流 | `写稿/工作流/单期制作工作流.md`、`协作方式.md`、`新闻大写-手法对照与改进清单-2026-10-02.md` |
| 引擎说明 | `视频工厂/说明书.md` |
````

</details>

### 附录 19：projects/video-factory/写稿/工作流/单期制作工作流.md

原始位置：`/Users/wzz122/Desktop/写稿/工作流/单期制作工作流.md`；SHA-256：`14d185a06bef7d3f09114787428ff7139af20e19628bf2ddc2afa277312e95e2`。

<details>
<summary>展开完整原文</summary>

````markdown
# 单期制作工作流

2026-09-29 · Claude 与 Codex（GPT-6-Astra）三轮讨论后的合并版。参考片：《新闻大写》何立峰期、《正确君》稀土期。依据见 [07 号拆解](/Users/wzz122/Documents/新媒体小红书写文章。/博主调研/07-新闻大写何立峰期+正确君稀土期-制作拆解与复现方案.md)、[09 号实施方案](/Users/wzz122/Documents/新媒体小红书写文章。/博主调研/09-两期整合分析与个人制作实施方案-2026-09-28.md)、[三轮讨论记录](附-2026-09-29-Claude与Codex三轮讨论.md)。

**原则：先用 6–10 分钟做完一期，再补自动化。** 画面分三类分别制作：图解、真实资料、可选动画。三类画面共用一份场景清单，最后在达芬奇里合成。前两期不以"像参考片"为目标。

> **2026-09-30 修订（用户确认）**：①配音默认改用 MiniMax 设计音色「gou」，自录保留为备选（见第 4 步）；②参考片中难度为低到中的画面与声音效果全部纳入工作流，统一编号、做成达芬奇模板复用（见第三节之二、第五节）；③依据：[配乐分析](../资料/参考-新闻大写-配乐分析/00-配乐分析.html)、06/07 号特效拆解、本机达芬奇 Studio 21.1。

> **2026-10-07 修订（用户授权直接落地）**：依据男女对立期、不消费期两期拆解和[技能改进提案](技能改进提案-2026-10-07-两期拆解.md)的[审查](技能改进提案-2026-10-07-审查.md)。画面主模板改为**档案纸**（米色细格子纸，用户指定），规格在 `视频工厂/视觉规范/档案纸主题规范.md`。本文 A03、A04、E03、E04、E06、E17、E19 和三之三「段落」「图解占比」两行改成指向技能里的现行规则；同一条规则只在技能里写全，本文只留一句。

---

## 一、从参考片学什么，不学什么

**学：**

- **一处有解释价值的核查上屏。** 让观众看到依据在哪里、能支持什么、还缺什么。首期做一处就够，不设配额。
- **一个贯穿母题。** 开头建立，中段变化，结尾回收。参考片用的是"面线"。
- **一屏只承担一个画面任务**：证据、关系、现场、比喻，四选一。
- **场景编号稳定。** 重新排序不改编号，新增的场景另外编号。编号只在制作中使用，不印到观众看到的画面上。
- **描述栏三段式**：导语 + 📚 精确来源链接 + ⏱ 章节时间点，素材需要署名的也写上。

**不学：**

- 用示意报纸冒充出处。参考片里讲"1992 年专访"时，放的是一张 1930 年的报纸。
- 让 AI 生成带文字的"文件"。生成出来是乱码，还容易被误认成真文书。
- 30 分钟的长度和画面密度、角色小剧场、电影感片头。

---

## 二、阶段表

| # | 阶段 | 负责 | 产出 | 过关标准 | 有效工时 |
|---|---|---|---|---|---|
| 1 | 定题与核查 | 用户定题；Claude 研究；Codex 独立反查 | `资料/<题>/数据.md`（证据卡，并标出源头、转引、独立佐证、未知）；`制作/<期>/进度.md` | 每个要上屏的主张都能追到原文，年份、单位、口径齐全；转引不算独立来源 | 3–5 h |
| 2 | 定稿 + 画面任务 | Claude 起草；用户确认 | `成稿/<日期>-<题>-v1.md`，每段附画面任务草案 | 只有一个主问题；母题出现三次；选定一处核查上屏；统计旁白字数，估算时长 | 2–3 h |
| 3 | 分镜与素材 | Claude 起草场景清单；Codex 补编号、查素材能否拿到、校验格式；用户挑素材 | `制作/<期>/scenes.csv`（**每个场景填「效果编号」一列**，从第三节之二的清单里选，一屏只选一个主效果）、`assets.csv` | 关键画面找得到；使用条件和截取语境已核对；画面撑不住论断时回去改稿，不靠配图补证据；每个结构转折点标出音乐动作（规则 A04，不再按章节点抽离）；**通过后冻结录音稿** | 2–4 h |
| 4 | 配音与对齐 | **默认**：Claude 用 MiniMax 网页版生成（音色「gou」，语速 1.15（2026-10-06 起；旧期补配沿用原语速），音高 1，模型 speech-2.8-hd），按章节分段生成、下载；**备选**：用户自录。Codex/Claude 跑对齐 | `voice/*.mp3`、逐句时间 `aligned.json`、字幕 | 先生成 60 秒试听；专名、数字、日文人名读对，读错的改写法（如「1107」写成「一千一百零七」）后重生成；对不上的句子要报警，不能悄悄用估算时间顶替。费用：汉字 2 积分/字，数字标点 1 积分，30 分钟约 1.7 万积分（Starter 每月 10 万） | 1–2 h |
| 5 | 图解渲染（先做 90 秒） | Codex + 视频工厂 | 校对页 → 按真实录音渲染的章节视频 | 先从本期取 90 秒验收：音画同步、手机上看得清、证据按"原件 → 高亮 → 解释"展示。通过后再按章扩展 | 3–6 h |
| 6 | 达芬奇合成（半自动） | Codex 或 Claude 跑脚本（限 2 小时，没跑通就改手工）；用户放素材、精修 | **新建**一条时间线：按章建素材箱；图解和旁白顺序排好；每个场景编号的起点打一个标记，备注写"放什么素材、覆盖还是插入、效果编号"；按效果编号从「模板库_解说视频」套用模板；按第三节之二的声音规则建四条音轨 | 只建新时间线，不覆盖已精修的版本；插入素材后检查后面的标记是否跟着移动；保存、重新打开后没有离线媒体；整片 −14 LUFS、真峰值不高于 −1 dBTP | 2–4 h |
| 7 | 审片与交付 | 用户审；Claude 校文字、写描述栏；Codex 做技术检查 | 成片、`描述栏.md`、达芬奇工程、来源档案 | 完整回看一遍；复查数字、年份、"示意"标签；描述栏三段式齐全 | 1–2 h |

**第一期约 18–32 个有效工时**，含首次接线和返工，不含机器渲染等待；前提是资料现成、不用补拍。开工前还有一次性准备，见第五节。第三期以后能快多少不预设，先把前两期的实际工时记下来。

---

## 三、素材放进时间线的两种方式

在第 3 步（场景清单）里标好，第 6 步执行：

| 方式 | 效果 | 例子 |
|---|---|---|
| **覆盖** | 只换画面，旁白照常往下说，节目总长不变 | 讲供应链时，画面切成矿山空镜 |
| **插入** | 旁白停下来，播一段完整原声，之后的声音、图解、字幕全部往后顺延 | 播 8 秒记者会原声，后面所有内容顺延 8 秒 |

插入的原声视频**直接放进达芬奇的原声音轨**，不经过视频工厂，因为工厂的素材处理会把声音去掉。

---

## 三之二、效果清单（低到中难度，全部纳入）

来源：《新闻大写》低保期、何立峰期的画面拆解（06/07 号）与配乐测量。**一屏只用一个主效果**；动完要留读图时间；不要每屏都加效果，新闻段直接切、照片慢放、静止读图同样重要。

### 画面效果

| 编号 | 效果 | 什么时候用 | 用什么做 | 模板名（模板库工程内） | 过关标准 | 难度 |
|---|---|---|---|---|---|---|
| E01 | 数字、柱子、折线、方块逐项长出来 | 讲数据、对比 | 视频工厂 `[柱状图]` `[折线图]` `[方块图]` `[数字]` | —（工厂出片） | 数字全部来自证据卡；最后一个数据点镜头推近 | 低 |
| E02 | 原件截图推近到关键句，黄色扫过高亮 | 核查上屏、引用官方文件 | 截图用 `工具/pdfshot`、网页截图去广告，再用 `工具/imgtool` 底部加中文译文条；达芬奇缩放关键帧＋高亮扫过 | `证据推近` | 走「原件 → 高亮 → 解释」三步；日文原件必须带中文译文和来源 | 低 |
| E03 | 盖章落定 | 结论、反转、「没有当选」这类节点 | Fusion：6–10 帧从 2 倍缩到原位、轻微旋转与震动，配一下音效 | `盖章` | 次数按《档案纸主题规范》第 14 节「次数按片长」（2026-10-07 起按每 10 分钟算，不再是「一章最多一次」）；写法见 skill explainer-video-workflow reference 02 特效表；印章文字是作者判断时不能伪装成官方文件 | 低 |
| E04 | 照片慢推慢移 | 人物、历史照片、建筑 | 剪辑页动态缩放或关键帧＋贝塞尔缓动 | `慢推` | 只给停留超过 15 秒的屏，推一次，不默认、不循环（用户 2026-10-06；细则见 reference 06「画面节拍和换屏」）；速度慢到察觉不出「在动」；人脸不出画 | 低 |
| E05 | 底层放影像、上层叠数字/图标 | 讲现场同时给数据 | 多轨叠加；21 版自带画中画特效 | `画中画叠加` | 上层文字在手机上可读；影像不能冒充事件现场，示意画面标「示意」 | 低 |
| E06 | 章节标题卡＋英文小标 | 每章开头（可选：10 分钟上下默认角标换章，不做章节卡，见 news-explainer 版式速查「换章的两种方式」） | Text+/MultiText 标题模板（与视频工厂同字体、同配色） | `章节标题` | 标题是判断句，和稿子章节名一致 | 低 |
| E07 | 字幕 | 全片 | 视频工厂字幕，或达芬奇 Studio 转写生成后按定稿校对 | 字幕样式预设 | 以定稿为准，人名、数字逐一核对 | 低 |
| E08 | 地图路线一段段画出来＋定位点 | 讲履历、迁移、地点 | Fusion：真实底图＋路线描边逐段显现（Write On）＋定位点弹出 | `路线描绘` | 底图来源可用且准确；不让生成模型画地图轮廓 | 中 |
| E09 | 物件拆层、前后纵深 | 讲场景、平面图、桌面物件 | Fusion：多层合成，各层移动速度不同，加投影；PSD 可直接拆层导入 | `拆层纵深` | 各层素材许可已核；动作服务于说明 | 中 |
| E10 | 快速推移＋运动模糊转场 | 章节之间、图解场景相连 | Fusion 变换＋运动模糊，或自带转场 | `快推转场` | 只在章节或大段落之间用，不连续使用 | 中 |
| E11 | 人群透视：路两旁的人由远到近站出来 | 讲排场、动员、「群众也要去」 | 视频工厂 `[人群]` | —（工厂出片） | 人数是装饰，不当统计数字用；标签不超过三个 | 低 |
| E12 | 做旧印章逐枚盖下＋墨圈圈住结论 | 罗列几种现成说法，再点出真正的问题 | 视频工厂 `[印章]`（`注：` `圈：`）、`[墨圈]` | —（工厂出片） | 一句旁白一枚；印章文字不伪装成官方定性；（2026-11-07 用户审片改）盖章/印章全片 ≤2–3 个 | 低 |
| E13 | 话筒声波＋毛笔大字 | 口号、喊话、宣传用语 | 视频工厂 `[声波]` | —（工厂出片） | 最多三个词；最后一个词落定后停 1.5 秒 | 低 |
| E14 | 线稿一笔一笔描出来再上色＋竖排题字 | 地点、建筑、贯穿物件 | Claude 手写 SVG → 视频工厂 `[线描]` | —（工厂出片） | SVG 按图像风格规范查两遍；不画真实人物的脸；一期 1–3 张 | 中 |
| E15 | 折线图批注：虚线、红色弯箭头、图内大数字 | 指出转折点、门槛线 | 视频工厂 `[折线图]` 的批注项 | —（工厂出片） | 示意数据在图题里写「示意」；真实数据来自证据卡 | 低 |
| E16 | 老影像分级处理：原样黑边 / 褐色满屏 / 电视框 / 羽化黑边 | 引用历史资料片、通讯社素材 | `python3 工具/老影像.py 输入 输出 预设 --来源 "频道｜日期"` | —（脚本出片，再进工厂或达芬奇） | ~~越老、画质越差，缩得越小、框越重~~ （2026-11-07 用户审片改）一律原样原色、尽量大，不染褐、不缩成电视框小窗；通讯社素材用「原样黑边」保留台标；每段都标来源 | 低 |
| E17 | 墨迹转场：墨团盖满再散开 | 话题大转折、进片名、进片尾 | 达芬奇自带 Luma Wipe + 一张墨迹晕开的黑白素材；工厂暂无 | `墨迹转场`（待做） | 次数按《档案纸主题规范》第 14 节「次数按片长」（2026-10-07 起按每 10 分钟算，不再按「全片 3 次」） | 中 |
| E18 | 进出喘气段的闪白与胶片烧片 | 进、出小剧场或原声新闻段 | 达芬奇自带：闪白用 Dip To Color（选白色）或 Brightness Flash；烧片用 Burn Away 或 Film Strip | —（自带 + 素材） | 各 0.25–0.5 秒；只用在喘气段两头 | 低 |
| E19 | 暗色图解：暗底页 | 一节里最压抑的一小段 | 工厂暂无（档案纸主题的暗底变体，待做） | —（待做） | 只作点缀；规格和次数见《档案纸主题规范》第 10 节「暗底变体」、第 14 节「次数按片长」（2026-10-07 起主模板是档案纸） | 中 |

### 声音规则

| 编号 | 规则 | 参数（按参考片实测） |
|---|---|---|
| A01 | 四条音轨分开 | A1 旁白、A2 新闻原声/采访、A3 音乐、A4 音效与环境 |
| A02 | 原声插播时旁白让位 | 原声成为焦点时音乐降低，两条完整人声不能同时出现 |
| A03 | 背景音乐垫底 | 2026-10-07 起：约 95% 以上时长有垫乐，铺底不能单薄；音量、闪避、按结构段换曲见 skill explainer-video-workflow reference 05「规则」 |
| A04 | 结构转折处的音乐动作 | 2026-10-07 改：不再「章节切换、关键结论前抽离 2–5 秒」。刻意的音乐动作 12 分钟以内只做 2–3 次，对准结构转折（冷开结束、核心转折、进入收尾），章节交界不换曲、不抽乐；细则见 reference 05「规则」 |
| A05 | 音效只放在少数点 | 章节点、数字落定、盖章；不给每次文字出现都加 |
| A06 | 响度 | 整片 −14 LUFS，真峰值不高于 −1 dBTP（参考片实测约 −14.2 LUFS） |

**BGM 来源**：优先 MiniMax「音乐」生成（Starter 方案新生成曲目可商用，约 300 积分一首）；其次 YouTube 音频库。选曲要极简、无明显旋律、几乎无鼓点。参考片曲名目前未查到，可用 Shazam 识别 [配乐分析页](../资料/参考-新闻大写-配乐分析/00-配乐分析.html) 中的纯音乐片段后再查授权。

> **2026-10-05 补充**：E11–E15 来自参考片「仪式感」一期的五张截图（人群透视、印章与墨圈、线描建筑、话筒声波、带批注的折线图）。这些画面是代码画的矢量动画，和视频工厂是同一路做法，不需要 Seedance 之类的视频生成模型；已做成引擎版式，写法见视频工厂《说明书》第三节 ⑧ 和 skill news-explainer 的《版式速查》。参考片实际用什么软件、是不是 Claude 写的，成片里看不出来，仍无法确认。

**不纳入**：卡通小剧场与角色口型动画、三维楼群生长（中高难度，等题材需要时单独评估）。

---

## 三之三、节奏与包装规则（仪式感期实测，2026-10-05）

依据：[仪式感期拆解](../资料/参考-新闻大写-仪式感期/00-拆解.md)（35 分 40 秒，713 帧抽样、419 次硬切、逐秒量垫乐）。数字是那一期的实测，当作起点，不当作配额；我们 6–10 分钟的片子按比例缩。

| 项 | 参考片实测 | 我们怎么用 |
|---|---|---|
| 段落 | 引子 3 分半 + 六节（每节 2 分 40 秒–7 分）+ 终章 3 分 | 10 分钟片：引子 1 分 + 三节（各 2–3 分）+ 终章 1 分；换章用章节卡或角标换章二选一，10 分钟上下默认角标换章（2026-10-07 改，见 news-explainer 版式速查「换章的两种方式」） |
| 图解占比 | 纸面图解 44%，真实影像和照片约 45%，其余是卡通和短片 | 2026-10-07 改为按题型定：事件题图解不超过一半；机制题可以八成在纸面，但以字为主的屏 ≤ 20%，能配截图或照片就配。完整写法见 news-explainer 版式速查「长片的段落和喘气点」 |
| 换画面 | 画面类型平均 18 秒换一次；一段图解中位 15 秒，最长约 1 分钟 | 同一种画面连续不超过 25 秒；超过的必须是一张图在累积变化 |
| 喘气点 | 三段卡通，各 37–38 秒，都在节尾、紧接章节卡；间隔 8–9 分钟；合计占 5.5% | 每 3–5 分钟一次，放在节尾：原声新闻、一组照片或一段小剧场；内容是把刚讲完的演一遍，不带新信息 |
| 音乐 | 约 95% 时间有垫乐；小剧场全程无乐；章节卡前后各空约 2 秒 | 音乐表照此写：喘气段抽离，章节卡前后各空 2 秒，其余一直垫（规则 A04） |
| 转场 | 硬切 419 次；花哨转场不到 15 次，全在段落边界 | 节内只用硬切和工厂自带的平移；E10、E17、E18 只放在节与节之间、喘气段两头 |
| 老影像 | 五种处理，越老越小、框越重 | E16 |
| 封面 | 固定吉祥物 + 一个动作的场面，不放标题字 | 我们的封面用日式圆润插画并标「AI 示意」；可以学「一个固定角色 + 一个动作」，不学写实画真实人物 |

**不学**：带水印的素材库预览片、不标来源的资料影像、27 秒电影感片头。

**本机已装的相关插件（2026-10-05）**：

| 插件 | 来源 | 用来做什么 | 备注 |
|---|---|---|---|
| anidoodle | GitHub `alexgreensh/anidoodle`（Anthropic 插件目录收录；装之前看过内容：只有技能文档和渲染引擎，没有钩子和联网服务） | 代码画插画、手绘过程动画，几十种画风 | 第一次渲染会从 npm 装依赖和一个 Chromium；给 `[线描]` 画线稿、做小插图时用 |
| hyperframes | Anthropic 官方插件市场（HeyGen 出品） | 「写 HTML 出视频」框架，带转场和动效的现成写法 | 和视频工厂是两套引擎，不替换工厂；只在需要参考某个转场、动效怎么写时翻它 |

不想要时：`claude plugin disable <名字>`。

---

## 四、分工与交接

| 谁 | 负责 |
|---|---|
| 你 | 定题、观点、确认稿件、录音、挑素材、审片、发布 |
| Claude | 研究、写稿、画面任务、场景清单草案、核查上屏的文案、描述栏 |
| Codex | 独立反查证据、补编号并查素材能否拿到、写下载和截图脚本、引擎接线、对齐、渲染、达芬奇脚本、技术验收 |

**交接规则：**

- **主稿只由 Claude 改。** Codex 有修改意见时，按段落或场景编号写成修改单，记进 `进度.md`；Claude 合并后升版本号，你确认；再更新受影响的录音和画面。
- 每一轮只允许一方改主稿。`进度.md` 记录当前版本和当前编辑者。
- 交接包：批准版稿 + 证据卡 + `scenes.csv` + `assets.csv` + `进度.md`。
- "查证可信"和"可以使用"分开审：事实可信，不代表那段素材你有权用。

---

## 四之二、总装怎么做

达芬奇总装的轨道约定、装配清单、脚本接口（切片拼 V1 代替波纹插入）、导出与质检，统一写在 skill `video-assembly`（`~/.claude/skills/video-assembly/SKILL.md`，2026-10-02）。本节不再重复。

---

## 五、开工前的一次性准备

以下由 Codex 在视频工厂里做，做完用本期 90 秒验收：

| 项 | 为什么 | 工时 |
|---|---|---|
| 渲染入口改用隔离的 Chromium，去掉系统 Chrome 回退 | `~/.codex/AGENTS.md` 规定不能用系统 Chrome 跑无头模式，会弄崩你正在用的浏览器；`engine/cdp.mjs` 目前还留着这条回退路径 | 1–2 h |
| 把录音对齐接进主流程 | `engine/align.py` 已能把"稿子 + 你的录音"对齐成逐句起止时间（本机 mlx-whisper 可用），但主流程 `run.mjs:105` 仍走系统配音。要补五件事：给对齐脚本加测试入口；接入外部 WAV、绕开系统配音、保护原录音；把逐句时间写回场景；对不上的句子要报警；做一次 90 秒同步回看 | 2–4 h |

| 搭「模板库_解说视频」达芬奇工程 | 把 E02–E10 做成 Fusion 宏/标题模板，建 A01 四轨布局与混音设置、1080p＋−14 LUFS 导出预设；新建独立工程，不碰其他工程 | 4–8 h |
| 用东大 T003 开头 90 秒验收模板库 | C 版配音＋现成截图与三张对比图＋一首 BGM，在达芬奇完整合成导出一次 | 1–2 h |

**不需要改引擎、用手工绕过的：**

- **原声**：原片直接进达芬奇原声轨。
- **核查上屏**：首期用"原件截图 + 达芬奇高亮框 + 状态标签"完成；引擎的公文版式现在还不能解析高亮。如果把原文重新排版，要标"摘录"。
- **帧级时间线清单、全自动插入与顺延**：前两期不做。

两期之后按实际需要再补这些组件：信源关系图、删除线改写、数字与面积联动、地铁线时间轴。

---

## 六、前两期不做

1. 30 分钟长片。
2. 角色小剧场、口型动画、AI 片头、三维楼群。
3. 两套视觉模板（模板库只做一套，即第三节之二的 E02–E10）。
4. 工作台软件（10 号方案）、一键全自动。
5. 没试听就整篇配音；没核使用条件就渲染。

---

## 七、下一步

当前在做 T003《东大首位女总长》：总稿、截图（去广告＋中文译文）、三张对比图、C 版配音 30 秒样片已完成（见 `制作/当前进度.md`）。下一步是第五节新增的两项：搭「模板库_解说视频」，并用本期开头 90 秒验收。按项目约定，达芬奇合成与渲染另开对话进行。
````

</details>

### 附录 20：projects/video-factory/写稿/工作流/AI视频工厂流程.md

原始位置：`/Users/wzz122/Desktop/写稿/工作流/AI视频工厂流程.md`；SHA-256：`fc76d0a7990935dd1c70d38a62aa979305d8f20c29a2a027ca7c51ecded78203`。

<details>
<summary>展开完整原文</summary>

````markdown
# AI 视频工厂流程（专门做「讲 AI」的视频）

> 2026-10-23 建。依据：
> - 拆林亦《为什么说AI正在帮玩家夺回游戏？》（`资料/参考-lyi-AI夺回游戏/00-拆解.md`）
> - 10-10 拆的他三期 AI 片（技术讲解、实验故事、模型测评）
> - 10-23 调研的 GitHub 和网上 Agent 做视频的方法：HyperFrames、Remotion 技能、video-use、Code2Video、mlx-audio 等
>
> 原则：**不另起一套引擎**。资料、写稿、配音、对齐、v6 画面、总装、封面，全部沿用现有工具；这份只写「AI 片和普通解说片不一样的地方」，以及要补的几个零件。

## 一句话

一期 AI 片 = 选一个「AI 让谁的什么变了」的问题 → 亲手跑一遍拿到真实结果 → 按 4 种骨架之一写稿 → 配音对齐 → v6 镜头脚本（加 AI 专用组件和真实录屏）→ 每章渲染后让 Claude 看拼图自查 → 总装出片。

## 总流程（9 步）

| 步 | 做什么 | 用什么（现有的标 ✅，要新做的标 🆕） | 过关标准 |
|---|---|---|---|
| 0 | 开工：读进度，建本期目录 | ✅ `制作/当前进度.md`；✅ ai-explainer-video 的 `new_episode.py` 建策划包 | 一句话说清现在在哪、下一步 |
| 1 | AI 选题雷达 → 方向包 | ✅ material-research 模式零；✅ X 资料员；✅ AI 信源清单（见第 1 节） | 3–5 个方向，每个都过「撬棍测试」 |
| 2 | 资料 + **亲手复现** | ✅ 证据卡；✅ 实验记录（ai-explainer-video 模板 `02-实验记录.json`）；✅ `工具/录屏.mjs` | 每个「AI 能做到 X」都有自测记录或原始出处 |
| 3 | 写稿（4 种骨架选 1） | ✅ news-explainer + 本文第 3 节；✅ 改稿页 | 过第 3 节检查表 |
| 4 | 配音 | ✅ MiniMax 网页版（现行）；可选：本地 TTS 试验（第 4 节） | 读音审计通过 |
| 5 | 对齐出每句时间 | ✅ 视频工厂 `run.mjs` | 每句有真实时间 |
| 6 | v6 镜头脚本 | ✅ v6lib 现有组件 + ✅ `chatui` `codecard` `termcard` `aiicon` `specgrid`、`timeline` 游标（10-23 已做）；✅ 真实录屏（`录屏.mjs` → `videocard`） | 每段用对视觉系统（第 5 节映射表） |
| 7 | 分章渲染 + **Claude 看图自查** | ✅ `render()`、`质检/抽帧拼图.py`；✅ `质检/章节自查图.py`（第 6 节） | 自查表全过，最多重做 3 轮 |
| 8 | 总装、质检、封面、云盘、发布 | ✅ `总装v6.py`、电影感封面、video-assembly、youtube-upload | 照现有 07-质检与交付 |

分工：
- Claude（Opus）：选题判断、写稿、镜头脚本、看图自查。
- Codex：独立反查事实、质检挑错（组件代码 Claude 自己写，用户 10-23 定）。

一切本地跑，不调付费 API。Seedance 小动画照现有额度规则用。本地模型照 16 GB 规则一次只跑一个。

---

## 1. AI 选题雷达

### 信源清单（每周扫一次，交给 material-research 模式零）

| 类 | 去哪看 | 看什么 |
|---|---|---|
| 开源 | GitHub Trending、新出的高星仓库、Hacker News 首页 | 「以前要一个团队、现在一个人加 AI 就做成」的项目 |
| 官方 | Anthropic、OpenAI、Google、DeepSeek、Qwen、字节的博客和发布会 | 新模型、新能力、价格变化 |
| 论文 | arXiv 热门、Papers with Code | 能用一个画面讲清楚的发现 |
| 舆论 | X（X 资料员自动查）、B站、小红书（social-platforms-local） | 大家在吵什么，误解在哪 |
| 现实影响 | 新闻里的行业、就业、版权、教育事件 | AI 落到具体人身上的变化 |

### 撬棍测试（方向包里每个方向都要回答这三问）

1. **老问题是什么？** 没有 AI 之前就存在、观众本来就关心的事（例：买来的游戏不归自己、老软件没人维护、看病排队）。
2. **AI 改变了哪一环？** 说得出具体环节，最好有一个能亲手复现的例子。
3. **改变之后谁得、谁失、还剩什么没解决？** 这就是结尾的那一层判断。

三问答不出来的，就是「AI 新闻快讯」，不进长视频，最多做短视频。

### 四种片型（方向包里标明是哪种）

| 片型 | 主问题 | 例子 | 骨架见 |
|---|---|---|---|
| A 撬棍型（AI 社会议题） | AI 让谁的什么处境变了？ | AI 帮玩家夺回游戏 | 3.1 |
| B 原理型 | 它为什么能这样？ | 大模型怎么学会讲人话 | 3.2（ai-explainer-video `mechanism.md`） |
| C 实验型 | 加了这个变量会怎样？ | 让 AI 打骗子酒馆 | 3.3（`experiment.md`） |
| D 测评型 | 这个模型能不能干这件事？ | 某视频模型强在哪 | 3.4（`model-review.md`） |

---

## 2. 资料 + 亲手复现

照 material-research 模式一做证据卡，AI 片另加三条规矩：

1. **能自己跑的就自己跑一遍。** 用 Claude Code、Codex 或本地模型复现片中要讲的能力，记进 `资料/<期>/实验/实验记录.md`：
   - 日期、工具和模型的名字与版本、完整输入
   - 原样输出（不改字）、跑了几次、成功几次
   - 录屏文件名
2. **三种来源分开写，不混用**：
   - 「我们自测」：可以说「我们试了 5 次，3 次成功」
   - 「官方说」：只能说「官方称」
   - 「开发者自述」：只能说「据开发记录」
3. **会过时的东西标日期**：模型版本、价格、排行榜、「目前最强」。旁白里写成「截至 X 月」。

录屏的原料（第 5 节画面要用）在这一步就录好：
- 真实网页界面：Playwright 录屏，或现有的 `工具/wshot.mjs` 截图
- 终端操作：VHS 或直接录屏
- 模型内部：Transformer Explainer、LLM Visualization 这类开源可视化网页录屏

---

## 3. 写稿：AI 片的四种骨架

通用规矩（四种都适用，写进 news-explainer 稿件时照做）：

- **开头 30 秒**：一个具体的人或事，先给观众一个直觉判断，再推翻（先抬后拆）。
- **一个贯穿隐喻**：开头埋、中段用、结尾兑现。每期换新的，不用参考片的原话。
- **每个技术词配一个生活类比**，并且同一句或下一句说清边界（「这只是打个比方，模型内部不是真的在……」）。
- **问句间隔 60–100 秒**；每段最后一句能单独截出来当小结。
- **讲 AI 能力的固定三步**：先讲没有 AI 时要多少人、多久 → 再讲 AI 帮了哪几件事，每件配一个真实案例 → 最后讲哪些还得靠人。
- **结尾分两层**：技术上能做到什么 + 技术之外还剩什么问题。不以「AI 太强了」收尾。
- **不吹不贬**：数字带口径；「取代」「颠覆」这类词只有证据够才用。

### 3.1 撬棍型骨架（17 分钟片按比例换算）

| 段 | 占比 | 写什么 |
|---|---|---|
| 冷开场 | 5% | 争议人物或事件 → 推翻 → 点出「委屈 / 问题是真的」 |
| 老问题史 | 25–30% | 2–3 个名场面，证明这个问题由来已久；找同一主体前后打脸的对照 |
| 为什么没解决 | 10% | 「为什么？钱 / 规则 / 技术门槛」，自问一字答，再拆细节 |
| 困境 | 5% | 先报数后解释（「给大家看两个数字……」），推到「难道只能干等？」 |
| **AI 出场** | 30–35% | 放在片长 40–50% 处。先用排除法讲为什么别的路不行，再讲 AI 这条路，然后走「基线 → 三件事 → 边界」 |
| 情绪反转 | 8% | 「本来以为会很爽，结果……」，接一个具体物件或场景 |
| 答案 + 收尾 | 10% | 回答标题问题（最好不是骂某一家），兑现隐喻，结尾两层 |

### 3.2 原理型 / 3.3 实验型 / 3.4 测评型

照 ai-explainer-video 的 `mechanism.md`、`experiment.md`、`model-review.md`。补一条：三种都在开头加一个「老问题」钩子，不直接从术语讲起。

### 写完自查（交改稿页前）

- [ ] 撬棍测试三问在稿里都有答案
- [ ] AI 出场位置对（撬棍型在 40–50%）
- [ ] 「基线 → 三件事 → 边界」齐全
- [ ] 每个技术词都有类比，并说了边界
- [ ] 隐喻首尾兑现
- [ ] 每个「AI 能做到」都对得上证据卡或实验记录，允许表述没有被拔高
- [ ] 会过时的说法都标了日期

---

## 4. 配音和对齐

- **现行不变**：MiniMax 网页版配音 → 读音审计 → `run.mjs` 对齐（explainer-video-workflow reference 04、09）。
- AI 片特别注意读音：
  - 英文模型名、产品名统一读法，写进本期读音表（例如 Claude、Codex、GPU、Transformer、token）
  - 代码名不要念，交给画面
- **可选试验（要用户同意才做）**：本地 TTS
  - 用 mlx-audio 跑 Qwen3-TTS 或 VoxCPM2，用 4 位或 8 位压缩版，16 GB 能跑
  - 和 MiniMax 盲听对比一章，好才换
  - 字幕对齐可试 Qwen3-ForcedAligner 或 stable-ts，作为 `run.mjs` 的备选
  - 要走 `mac-heavy-job.py`，一次只跑一个模型

---

## 5. 画面：段落类型 → 视觉系统 → 组件

我们没有真人出镜，用「**固定回归画面**」代替主持人当标点：
- 格子纸上一个固定的「研究台」镜头（同一张桌面、同一位置的便签和终端）（2026-11-07 用户审片改）：底改为全片统一纯色、不画格子、不用便签纸，见 `~/Desktop/视频工厂/制作规范/画面硬规则-2026-11-07.md`
- 或者用 `termcard` 把本段的关键词钉上去

每 40–90 秒回来一次，用在转折句和问句上。

| 段落在讲什么 | 用哪个视觉系统 | 组件（✅现有 / 🆕新做） | 规矩 |
|---|---|---|---|
| 观点句、转折、问句 | 固定回归画面 | ✅ `termcard`；✅ `note`、`stamp` | 一期固定一个样子 |
| 新术语第一次出现 | 术语大字 | ✅ `termcard`：大字 + 取景框 + 一道扫光；第二次起变成清单逐条累加 | 术语可以承载事实；拟声字 `onoma` 不行 |
| 原理、流程、结构 | 线稿图解，一次加一个元素 | ✅ rough.js、`forkpaths`、`branchmap`、`iconrow`；✅ `aiicon` 24 个 AI 线稿图标（接口说明 4.29；`iconrow` 也可写 `'ai:gpu'`）+ `arrow` 连线 | 一屏一个强调色；完成后停够读的时间 |
| AI 在干活（对话、生成、改代码） | 仿真界面 | ✅ `chatui`：并排窗口、拖入文件、逐字打字、回复弹出；✅ `codecard`：编辑器逐字打代码 + 中文注释 + 语法高亮 | 界面自己画，不拼真实截图冒充；虚构回复（玩笑）要一眼看出是玩笑，否则角标写「示意」 |
| 真实产品、真实结果 | 真实录屏 / 截图 | ✅ `videocard`、`photocard`、`docpage` + `lens` / `highlighter`；✅ `写稿/工具/录屏.mjs`（动画光标、逐字输入、滚动、高亮；字小就放大页面） | 角标写工具名、版本、日期；自测的标「本频道实测」 |
| 参数、成绩、对比 | 对比卡 | ✅ `specgrid`（接口说明 4.30：逐行出现、关键格点红 + 荧光笔）；✅ `statbar`、`counter`、`rankboard`、`linechart` | benchmark 写清口径；同口径才放一张图 |
| 历史、过去的事 | 年代标尺 + 旧素材 | ✅ `timeline`（✅ `cursor=True` 游标、`ticks` 刻度、点带 `photo` 照片卡跟随）；✅ `老影像.py` 电视框 | 用我们自己的电视框，不用参考片的 CRT 房间 |
| 比喻、情绪、个人场景 | 寓意小动画 / 换画风 | ✅ Seedance `videocard`；✅ `parallax`、`quotecard` | 整段换画风一期最多 1 次，放在情绪最高点 |
| 引语 | 打字卡 | ✅ `quotecard` | 真人的话要有原文出处 |

画面密度沿用 USJ v6（reference 09「用户认可的画面密度」）。只改一处：
- 「照片 / 原件占 9 成」在 AI 片里改成「**真实素材 + 仿真界面 + 线稿图解合计 9 成**」，纯文字屏照旧要少。

---

## 6. 每章渲染后：Claude 看图自查

学 video-use 和 Code2Video 的「看图挑错」，零费用：

1. 每章 `render()` 完，用 `grab()` / `contact()` 出该章拼图。
2. 再出一张按时间对齐的合成图：`python3 质检/章节自查图.py --章 N`（每秒缩略图、静止 ≥ 4 秒橙条、旁白波形、逐句字幕、音效、镜头分界；终端列出自动发现的静止段）。
3. Claude 读图，逐项打勾：
   - [ ] 仿真界面里的字在 1080p 下读得清，打字速度不快过旁白
   - [ ] 术语大字出现的时刻和旁白念到这个词对齐（±0.3 秒）
   - [ ] 线稿每次只加一个元素，没有一屏同时动三处
   - [ ] 强调色一屏只有一个
   - [ ] 没有元素压到字幕带和出处条
   - [ ] 真实录屏的角标有工具名、版本、日期
   - [ ] 空档不超过 4 秒（v6 检查报告也会报）
4. 不过就改镜头脚本重渲；同一章最多 3 轮，还不过就记进「待用户看」。
5. 全片总装后照现有 07-质检与交付 做终检。

---

## 7. 要新做的零件（按顺序；Claude 自己做，Codex 只做独立复查）

| # | 零件 | 放哪 | 大小 | 先后 |
|---|---|---|---|---|
| 1 | ✅ `chatui` 仿真聊天组件（10-23 完成，接口说明 4.26） | `模板-v6/工程/engine/fx.js` + `v6lib.py` | 中 | 已完成 |
| 2 | ✅ `codecard` 编辑器卡（10-23 完成，4.27） | 同上 | 小 | 已完成 |
| 3 | ✅ `termcard` 术语大字 + 清单累加（10-23 完成，4.28） | 同上 | 小 | 已完成 |
| 4 | ✅ `specgrid` 参数对比卡（10-23 完成，4.30） | 同上 | 小 | 已完成 |
| 5 | ✅ AI 线稿图标库 24 个 + `aiicon` 组件（10-23 完成，4.29；定义在 `engine/fx.js` 的 `ICONS`） | 同上 | 中 | 已完成 |
| 6 | ✅ `工具/录屏.mjs`（10-23 完成；复用视频工厂 cdp.mjs，不装 Playwright） | `写稿/工具/` | 中 | 已完成 |
| 7 | ✅ `质检/章节自查图.py`（10-23 完成，正式期 311 第 2 章实测） | `模板-v6/质检/` | 小 | 已完成 |
| 8 | ✅ `timeline` 游标 + 刻度 + 照片卡跟随（10-23 完成，4.17） | v6lib | 小 | 已完成 |
| 9 | 本地 TTS 试验（mlx-audio，Qwen3-TTS / VoxCPM2） | 单独试验目录 | 中 | 用户同意后 |

每个组件做完都要过 v6 自测（`模板-v6/自测/`），并写进 `v6lib-接口说明.md`，再在这里把 🆕 改成 ✅。

## 8. 不做的事

- **不换引擎**：HyperFrames、Remotion 都很好，但会和 v6 重复（用户 10-06 明确反对重复造轮子）。只在要单独做一段宣传动画时，才考虑用 HyperFrames 出一段 mp4，再用 `videocard` 放进来。
- **不照搬参考片外形**：不搬黑底白线 + 绿荧光这套组合外观、CRT 房间、卡通黑客形象、光盘片尾，也不搬比喻原话（清单见拆解「不进成片的痕迹」）。
- **不付费**：不用 ElevenLabs、HeyGen、付费转写服务。
````

</details>
