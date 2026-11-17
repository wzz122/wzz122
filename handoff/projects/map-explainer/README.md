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
