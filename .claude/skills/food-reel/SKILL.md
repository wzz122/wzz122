---
name: food-reel
description: 探店美食短视频（Instagram Reels / 小红书 / 抖音竖屏）的全流程：拍前根据店铺给出分镜拍摄清单和口播文案；拍后把用户上传的原始素材自动剪成 9:16 成片（按旁白卡点、封面标题、字幕、AI 配音或用户录音、BGM 闪避、响度标准化）。风格参照 aito_osaka（大阪美食号）。当用户说「我要去拍某某店」「怎么拍」「帮我剪」「素材拍好了」「做成视频」时使用。
---

# 探店 Reel：拍前出分镜 → 拍后自动剪

风格依据：`reference/style-aito_osaka.md`（先读）。现场清单：`reference/shot-list-template.md`。

## 0. 环境准备（每个新会话一次）
```bash
bash .claude/skills/food-reel/scripts/setup.sh   # 字体 + 离线中文 TTS 模型(~350MB)，幂等
```

## 模式 A：拍前 —— 用户说「下次去拍 XX 店」

1. 问清/查清：店名、地区、招牌菜、价格、用户想发的平台和语言（中文 / 日语）。
   能联网就搜一下这家店的招牌菜和评价。
2. **先定反差点**（最影响播放量，见 style 文档第 1 节）。给 2–3 个选题角度让用户挑。
3. 输出给用户（直接在聊天里给，手机上好看）：
   - 封面三件套：地名徽章 / 竖排钩子 / 横排主标题（各给 2 个备选）
   - **定制拍摄清单**：基于 shot-list-template，按这家店的具体菜改写（如「B3：把芝士从塔可里拉开，拉到 20cm」）。标出哪条是封面镜头、哪条要收原声。
   - 口播文案草稿：6–8 句，每句 ≤15 字，标注每句对应镜头编号。
   - 现场要记的信息（价格、营业时间等）。

## 模式 B：拍后 —— 用户上传素材

1. 列出素材，`ffprobe` 看时长/分辨率/帧率/HDR；每条抽 3 帧（`ffmpeg -ss … -frames:v 1 -vf scale=360:-1`）拼成联系表用 Read 看，认出每条拍的是什么、
   最好的 1–2 秒在哪（记下 `in` 秒数）、主体在画面哪侧（`focus`）。
2. 定稿文案（结合用户现场感受），写 `reel.json`（格式见 `examples/reel.json`）：
   - 一个 beat = 一句旁白 + 1–2 个镜头；镜头时长自动按旁白长度分配（`w` 调比例）
   - 第一个 beat 用最强动作镜头 + 封面字；最后 beat 是 CTA
   - 动作/煎烤镜头加 `"asmr": 0.5` 保留原声；120fps 素材可加 `"speed": 0.5` 慢放
   - 关键词用 `**价格**` 黄色高亮；`caption` 可写比旁白更短的字幕
   - 信息卡：无旁白 beat + `"dur": 2.5` + `"info": ["📍…","💰…","🕐…"]`
3. 先出草稿：`python3 .claude/skills/food-reel/scripts/make_reel.py reel.json --draft`，
   抽帧检查（封面字有没有挡住食物、字幕有没有被切、镜头选得对不对），调整后再出正式版。
4. 正式版去掉 `--draft`。产物在 `out/`：
   - `reel.mp4`（含 BGM，如果提供了）、`reel_nobgm.mp4`（**推荐**：发 IG 时在 App 里加热门音乐）
   - `cover.jpg`（封面）、`timeline.txt`
   用 SendUserFile 发给用户，同时给出发布文案（标题 + 店铺信息 + 5–8 个话题标签）。

## 配音选项
- **中文**：默认离线 AI 配音（kokoro）。`voice.tts_voice`：女 `zf_xiaoxiao`(默认) `zf_xiaoyi` `zf_xiaobei` `zf_xiaoni`；
  男 `zm_yunxi` `zm_yunjian` `zm_yunyang` `zm_yunxia`；`speed` 1.1–1.25 比较像这类视频的语速。
- **用户自己录音（最推荐，更有人味）**：一口气录完整段，句与句之间停顿 ~0.5 秒 → `"voice": {"file": "vo.m4a"}`，
  脚本按停顿自动切成和 beat 一样多的段；或者每句单独录 → 每个 beat 写 `"line_audio"`。
- **日语**：本环境没有离线日语 TTS，必须用户录音（或在 CapCut 里生成后导出音频上传）。

## 限制（如实告诉用户）
- 云端环境连不上 Instagram/TikTok/免费音乐站；BGM 需要用户上传音频文件，或发布时在 App 内加。
- 不能「听」成片：音频只能用 `volumedetect`/`ebur128` 检查电平和响度；画面靠抽帧检查。
- 会话容器是临时的：素材和成片要及时下载；技能本身已存在仓库里。
