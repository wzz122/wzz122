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
