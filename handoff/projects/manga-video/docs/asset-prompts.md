# 素材清单与出图提示词

这份文件列出试作分镜（`episodes/pilot/storyboard.json`）要用的全部素材，每张图都配了给图像生成 AI 的英文提示词。
出好的图按「文件名」放进对应文件夹，覆盖同名的占位图，然后重新跑 `npm run analyze && npm run render` 就能看到真实效果。

## 0. 先看这几条（出图前必读）

1. **所有提示词都以这段画风描述开头**（已经写进每一条里，不用自己加）：

   > Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.

2. **角色图规格**（同一个角色的所有图必须完全一致，否则切换表情时人会跳）：
   - 透明背景 PNG，画布 **1600 × 2000 像素（宽:高 = 4:5，竖图）**
   - **腰部以上的半身像**，人物左右居中，身体底边贴着画布下沿
   - 头顶离画布上沿约 6%–10%，头部大约占画布上方 40%（头顶上方要留一点空，放汗珠、感叹号等图标）
   - 身体正面、稍微朝向镜头，不要有地面阴影，不要文字
3. **同一表情的 open / closed / blink 三张图：只改嘴巴（或眼睛），其他像素完全相同。**
   做法：先生成 `<表情>_closed`；然后**拿这张图做局部重绘（inpainting / 图生图编辑）**：只改嘴巴区域得到 `<表情>_open`，只改眼睛区域得到 `<表情>_blink`。不要从头重新生成，否则脸型、衣服都会变。
4. 背景图：**不带人物**，16:9，1920 × 1080，画面下方中间留得简单些（角色站在那里）。
5. 道具图：透明背景，1200 × 1200，物体居中、占画面约八成。
6. 所有图都写了 *no text*：生成 AI 很容易在箱子、袋子、白板上画出乱码字。出图后人工检查一遍，有字就重新生成或涂掉。
7. 不同表情之间可以变化：眉毛、眼睛、嘴型、脸颊（汗、红晕）、手势。手势会改变轮廓，所以同一表情的三张图手势必须一样。

## 1. 文件清单

| 文件 | 用在 | 必需 |
|---|---|---|
| `assets/characters/gyudon/calm_closed.png` · `calm_open.png` · `calm_blink.png` | 镜头 4、5 | 是（blink 可选） |
| `assets/characters/gyudon/smug_closed.png` · `smug_open.png` · `smug_blink.png` | 镜头 6 | 是（blink 可选） |
| `assets/characters/cheese/speechless_closed.png` · `_open` · `_blink` | 镜头 1 | 是（blink 可选） |
| `assets/characters/cheese/panic_closed.png` · `_open` · `_blink` | 镜头 3 | 是（blink 可选） |
| `assets/characters/cheese/surprised_closed.png` · `_open` · `_blink` | 镜头 5 | 是（blink 可选） |
| `assets/characters/cheese/normal_closed.png` · `_open` · `_blink` | 默认表情，正片会用 | 试作不用 |
| `assets/characters/tanaka/happy_closed.png` · `_open` · `_blink` | 镜头 1 | 是（blink 可选） |
| `assets/characters/tanaka/smug_closed.png` · `_open` · `_blink` | 镜头 2 | 是（blink 可选） |
| `assets/backgrounds/office.png` | 镜头 1–3 | 是 |
| `assets/backgrounds/classroom.png` | 镜头 4–6 | 是 |
| `assets/props/crab_box.png` | 镜头 1 | 是 |
| `assets/props/rice.png` | 镜头 6 | 是 |
| `assets/props/wagyu.png` | 镜头 6 | 是 |

合计：角色 24 张（其中 blink 8 张可以先不做，没有 blink 就不眨眼）+ 背景 2 张 + 道具 3 张。

声音素材（不用生成图，放进文件夹就自动生效，没有也能渲染）：

| 文件 | 什么时候响 | 找什么样的 |
|---|---|---|
| `assets/sfx/pop.mp3` | 道具弹出、角色 pop 进场 | 短促的「啵」 |
| `assets/sfx/whoosh.mp3` | 角色滑入、滑动转场 | 「嗖」的风声 |
| `assets/sfx/impact.mp3` | 画面抖动（shake） | 「咚」的冲击声 |
| `assets/sfx/exclaim.mp3` | 感叹号 | 漫画式「！」提示音 |
| `assets/sfx/sparkle.mp3` | 闪光 | 「叮铃」亮晶晶的声音 |
| `assets/sfx/sweat.mp3` | 冒汗 | 「啾」或尴尬的滑音 |
| `assets/sfx/title.mp3` | 标题卡 | 有力的「当！」或短小号 |
| `assets/sfx/question.mp3`、`angry.mp3` | 问号、生气（试作没用到） | |
| `assets/bgm/daily_comedy.mp3` | 镜头 1–6 背景音乐 | 轻快的日常喜剧风，可循环 |

文件名可以是 .mp3 / .wav / .m4a，不用改分镜。日本常用的免费素材站有「効果音ラボ」「OtoLogic」（效果音）、「DOVA-SYNDROME」（背景音乐），用之前请确认各站的使用条款（能否商用、是否要署名）。

## 2. 角色

### 2.1 牛丼老师 `gyudon`（主讲，40 多岁的税务老师）

角色设定（每张都一样）：

```
a Japanese man in his mid-40s, a tax teacher; short neat black hair, round thin-rimmed glasses, white long-sleeve dress shirt with a navy blue necktie; calm, composed, slightly sarcastic air
```

**`calm_closed.png`（平静，闭嘴）**

```
Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.
A Japanese man in his mid-40s, a tax teacher; short neat black hair, round thin-rimmed glasses, white long-sleeve dress shirt with a navy blue necktie; calm, composed, slightly sarcastic air.
Expression: calm and composed, relaxed eyebrows, eyes slightly half-closed, mouth closed in a small neutral line. Arms relaxed at his sides.
Waist-up half-body portrait, centered, facing slightly toward the viewer, body cut off at the bottom edge of the canvas, head near the top with a little empty space above it.
Transparent background, 1600x2000 px portrait (4:5). No text, no letters, no ground shadow.
```

**`calm_open.png`**：用 `calm_closed.png` 做局部重绘，只改嘴巴：

```
Edit only the mouth: the same man is mid-sentence, mouth slightly open in a small rounded shape as if speaking. Keep everything else exactly identical (face, eyes, glasses, hair, clothes, pose, outline, size, position).
```

**`calm_blink.png`**：用 `calm_closed.png` 做局部重绘，只改眼睛：

```
Edit only the eyes: both eyes closed (a gentle blink, drawn as short curved lines behind the glasses). Mouth stays closed. Keep everything else exactly identical.
```

**`smug_closed.png`（得意，闭嘴）**

```
Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.
A Japanese man in his mid-40s, a tax teacher; short neat black hair, round thin-rimmed glasses, white long-sleeve dress shirt with a navy blue necktie; calm, composed, slightly sarcastic air.
Expression: smug and confident, one eyebrow slightly raised, eyes narrowed knowingly, a sly closed-mouth smirk. He pushes up his glasses with one finger of his right hand.
Waist-up half-body portrait, centered, facing slightly toward the viewer, body cut off at the bottom edge of the canvas, head near the top with a little empty space above it.
Transparent background, 1600x2000 px portrait (4:5). No text, no letters, no ground shadow.
```

**`smug_open.png`**：局部重绘只改嘴巴：

```
Edit only the mouth: the same smug man is talking, mouth open in a confident half-smile showing a little of the inside of the mouth. Keep everything else exactly identical, including the hand pushing up the glasses.
```

**`smug_blink.png`**：局部重绘只改眼睛：

```
Edit only the eyes: both eyes closed (short curved lines behind the glasses), still smirking with the mouth closed. Keep everything else exactly identical.
```

### 2.2 芝士 `cheese`（助手，20 多岁的「チー牛」风会社员）

角色设定（每张都一样）：

```
a timid Japanese office worker in his mid-20s in the "chii-gyu" nerd stereotype; thick black square-framed glasses, slightly messy short black hair, red-and-navy checkered (plaid) button-up shirt, a company ID badge on a red lanyard around his neck, slightly hunched shy posture
```

**`normal_closed.png`（普通）**

```
Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.
A timid Japanese office worker in his mid-20s in the "chii-gyu" nerd stereotype; thick black square-framed glasses, slightly messy short black hair, red-and-navy checkered (plaid) button-up shirt, a company ID badge on a red lanyard around his neck, slightly hunched shy posture.
Expression: neutral and a little awkward, small closed mouth. Hands held together in front of his stomach.
Waist-up half-body portrait, centered, facing slightly toward the viewer, body cut off at the bottom edge of the canvas, head near the top with a little empty space above it.
Transparent background, 1600x2000 px portrait (4:5). No text on the ID badge, no letters, no ground shadow.
```

**`speechless_closed.png`（无语）**：同上，只把 Expression 一句换成：

```
Expression: speechless and fed up, flat half-lidded eyes, mouth a straight flat line, one vertical line of gloom on his forehead. Arms hanging down limply.
```

**`panic_closed.png`（慌张）**：

```
Expression: panicking, wide shaky eyes behind the glasses, eyebrows raised in worry, wavy trembling closed mouth, a few big sweat drops on his face, both hands raised near his cheeks.
```

**`surprised_closed.png`（吃惊）**：

```
Expression: shocked and startled, eyes wide open and round, eyebrows shot up, mouth a small tight "o", leaning back slightly with both hands up in surprise.
```

每个表情的 `_open`（局部重绘只改嘴巴）：

```
Edit only the mouth: same character, mouth open as if talking (for "surprised": a big round open mouth shouting). Keep everything else exactly identical.
```

每个表情的 `_blink`（局部重绘只改眼睛）：

```
Edit only the eyes: both eyes closed for a blink (short curved lines behind the thick glasses). Keep the mouth and everything else exactly identical.
```

（「慌张」「吃惊」通常不眨眼，这两个表情的 blink 可以不做。）

### 2.3 田中 `tanaka`（配角，30 岁左右的日本同事，开朗）

角色设定（每张都一样）：

```
a cheerful Japanese office worker around 30; short light-brown hair, bright friendly face, beige knit cardigan over a white collared shirt, no tie
```

**`happy_closed.png`（开心）**

```
Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.
A cheerful Japanese office worker around 30; short light-brown hair, bright friendly face, beige knit cardigan over a white collared shirt, no tie.
Expression: happy and excited, eyes curved into smiling arcs, big closed-mouth smile, one hand raised in a cheerful "look at this!" gesture.
Waist-up half-body portrait, centered, facing slightly toward the viewer, body cut off at the bottom edge of the canvas, head near the top with a little empty space above it.
Transparent background, 1600x2000 px portrait (4:5). No text, no letters, no ground shadow.
```

**`smug_closed.png`（得意）**：同上，只把 Expression 一句换成：

```
Expression: proud and smug, chin up, eyes closed contentedly, confident closed-mouth grin, giving a thumbs-up with one hand.
```

`_open` / `_blink` 的写法同芝士（局部重绘只改嘴巴 / 只改眼睛）。

## 3. 背景

**`office.png`（办公室）**

```
Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.
Background only, no people: the interior of a bright Japanese office. Rows of light-wood desks with computer monitors and small stacks of documents, office chairs, a big window with a soft city view on the right, a potted plant, a wall clock. Calm daylight, warm cream walls.
Keep the lower-center area simple and uncluttered (characters will stand in front of it). Eye-level camera.
16:9, 1920x1080 px. No text, no letters, no logos.
```

**`classroom.png`（教室，有白板）**

```
Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.
Background only, no people: a small cozy lecture room. A large blank white board fills the center of the back wall, with a marker tray and a couple of magnets; a wooden teacher's desk in front on the left; light green walls, wooden floor, a window on the right side.
Keep the white board completely blank and the lower-center area simple (a teacher will stand in front of it). Eye-level camera.
16:9, 1920x1080 px. No text, no letters, nothing written on the white board.
```

## 4. 道具

**`crab_box.png`（螃蟹箱）**

```
Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.
A single object: an open white styrofoam gift box packed with two big bright red boiled snow crabs on a bed of green leaf garnish, a Japanese hometown-tax return gift. Slight three-quarter view from above.
Centered, the object fills about 80% of the canvas. Transparent background, 1200x1200 px. No text, no letters, no logos on the box.
```

**`rice.png`（十公斤大米）**

```
Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.
A single object: a plump 10 kg paper sack of Japanese rice, standing upright, cream-colored bag with a simple green rice-plant illustration on the front, a few grains of rice next to it. Front view.
Centered, the object fills about 80% of the canvas. Transparent background, 1200x1200 px. No text, no letters, no logos on the bag.
```

**`wagyu.png`（一公斤和牛）**

```
Irasutoya-style illustration (いらすとや style): simple, cute Japanese free-clip-art look, soft pastel flat colors, thin brown outlines, round face, small dot eyes, light pink cheeks, gentle hand-drawn feel, no shading.
A single object: a shallow wooden gift box holding neatly arranged slices of beautifully marbled pink-and-white Japanese wagyu beef, a sprig of green garnish in the corner. Slight three-quarter view from above.
Centered, the object fills about 80% of the canvas. Transparent background, 1200x1200 px. No text, no letters, no logos.
```

## 5. 换上真图以后

```bash
npm run analyze      # 重新扫描素材（不用重新配音）
npm run render       # 出 out/pilot.mp4
```

- 只想先看几帧：`npm run frames -- 120,400,700`，图片在 `out/frames/`。
- `npm run placeholders` 永远不会覆盖真图；它只补缺的图。`--force` 也只重画以前它自己画的占位图（记录在 `assets/.placeholders.json`）。
- 嘴巴位置在 open / closed 之间差了几个像素，会看到脸在抖：说明两张图没有对齐，重新用局部重绘做。

---

## 图解模板素材（单人主讲 + 图解）

> 这一节以后要并进 `docs/asset-prompts.md` 的末尾（那份文件由漫画模板会话来建）。
> 素材都放在根目录 `assets/` 下，渲染时从 `public/manga/assets/` 读。没有图时，画面用代码画的占位，照样能完整渲染。

### 1. 牛丼老师半身像（右下角，主讲）

- 位置：`assets/characters/gyudon/<表情>_<口型>.png`，口型分 `open`（张嘴）、`closed`（闭嘴），可以再加一张 `blink`（闭眼）
- 需要的表情：`normal`（平常）、`smile`（笑）、`serious`（严肃）、`surprised`（吃惊）、`point`（举起一只手竖食指）
- 尺寸：透明背景 PNG，1600×2000（4:5，两个模板共用），人物从腰部往上，底边贴画布下沿，左右留白一样

通用提示词（每个表情只改最后一句）：

```
いらすとや風のシンプルなイラスト。40代の男性の税理士の先生、短い黒髪、丸メガネ、白いワイシャツに紺色のネクタイ。
腰から上の半身像、正面、少し体を左に向ける。太めの茶色い輪郭線、フラットな塗り、影なし、ほっぺに薄いピンク。
背景は完全な透明（または真っ白）。文字・ロゴ・枠線は入れない。
表情：〈穏やかに微笑む、口を閉じる〉
```

表情这一句可以换成：

| 文件 | 表情这一句 |
|---|---|
| normal_closed | 穏やかな顔、口を閉じる |
| normal_open | 穏やかな顔、話している途中で口を半分開ける |
| smile_closed / smile_open | 目を細めてにっこり、口を閉じる / 口を開けて笑う |
| serious_closed / serious_open | 眉を少し寄せた真剣な顔 |
| surprised_closed / surprised_open | 目を丸くして驚く |
| point_closed / point_open | 画面左側の手を顔の横まで上げて人差し指を立てる |

同一个表情的 open 和 closed 必须是同一张图只改嘴：先生成 closed，再用局部重绘（inpainting）只改嘴部区域，得到 open。

### 2. 芝士小头像（插话用）

- 位置：`assets/characters/cheese/normal_open.png`、`normal_closed.png`（漫画模板已经有全身/半身的话，直接用同一套，圆形头像由代码裁切）
- 要求：脸在画面上三分之一，裁成圆形后头部完整

### 3. 道具图（iconGrid）

- 位置：`assets/props/<文件名>.png`，透明背景，约 600×600，物体占画面八成
- 本期需要：`rice.png`（10 公斤大米袋）、`wagyu.png`（1 公斤和牛，装在木盒或托盘里）、`toilet-paper.png`（一大箱卫生纸）

```
いらすとや風のシンプルなイラスト。〈10kgのお米の袋〉を一つだけ、正面から。
太めの茶色い輪郭線、フラットな塗り、影なし。背景は完全な透明。袋や箱に文字・ロゴを入れない。
```

注意：生图很容易在米袋、纸箱上画出乱码文字。提示词里要写「不要文字」，出图后还要人工看一眼，有字的重新生成，或者手动涂掉。
