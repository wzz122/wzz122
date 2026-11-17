# v6lib 接口说明（v6 画面层，通用模板版）

> **2026-11-07 用户审片改**：先读 `~/Desktop/视频工厂/制作规范/画面硬规则-2026-11-07.md`（九条）和 `~/Desktop/视频工厂/视觉规范/新闻解说版式规范-v7b.md`。本文件里组件的**默认外观**（宋体/手写体字体、胶带、便签、倾斜白边卡、圆角药丸、回顾墙、便签章卡、`flash()` 插镜、USJ 用量）不再是默认；照水谷 v2 期（`样片/2026-11-06-股神水谷v2/画面v6/`）的 `本期工具.py` 小工具和 `stage.css`「v7b 新闻解说主题」覆盖样式来用。`flash()` 停用。

2026-10-07 从 T009《大阪USJ有多牛逼》v6 固化（用户看过 v6 成片：「做得非常好」），以后每期照这套做。给写分镜的代理用：**每个镜头写一个 `镜头脚本/<镜头号>.py`，里面 `def build():`，调用下面的函数**；`build_storyboard()` 按 `storyboard-audio.json` 的顺序和时间拼成整片分镜；`render()` 渲染；`总装v6.py` 出成片。每期不同的设置（章名、素材目录、证据卡、导航、配乐……）都在同目录 `项目.json`，代码不改。

现成的三个示范在 `示范/`（USJ 原期的镜头，镜头号和句号只对 USJ 时间轴有效，看写法用）：`示范-S19-原件放大镜-USJ.py`（原件 + 圈注 + 荧光笔 + 放大镜译文 + 便签）、`示范-S20-立体横条盖章-USJ.py`（立体横条 + 数字滚动 + 原件条 + 盖章）、`示范-S37-视差计数集中线-USJ.py`（视差照片 + 三个计数器 + 集中线）。USJ 全片 50 个镜头脚本在 `~/Desktop/视频工厂/样片/2026-10-06-大阪USJ/整改v6/镜头脚本/`（只读参考）；组件试验台在那里的 `自测/试验台/`。

---

## 0. 最快上手

```python
# 镜头脚本/S19.py（USJ 示范；新一期的镜头号、句号、素材名换成本期的）
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from v6lib import *

def build():
    s = begin('S19', '审计师连续两年亮了黄牌', '来源：USJ上市说明书（目論見書），2007年2月，p.13')
    doc = docpage('USJ-目論見書-p13-原页.png', view=[300, 898, 1420, 528], x=150, y=196, w=1000, at=0.1, rot=-1, tape='top', fold=True)
    highlighter(doc, [868, 1050, 398, 40], at=T(112))
    lens(doc, [868, 1050, 398, 40], at=T(112) + .45, ja='なお、第10期及び第11期には…', zh='2003、2004年度的财报\n被加注==「持续经营存疑」==',
         card=dict(x=1215, y=420, w=555))
    return s
```

```bash
cd ~/Desktop/视频工厂/样片/<期>/画面v6
python3 v6lib.py S19 S20            # 打印这些镜头每句旁白的时刻（写分镜时对照）
python3 v6lib.py                    # 拼分镜：读 镜头脚本/*.py → 工程/.work/storyboard.json、timeline.js、sfx_events.json、检查报告.txt
python3 -c "from v6lib import *; build_storyboard(); render(['S19'], stills=True, at=[1,4.5,9])"   # 先看静帧（几秒钟）
python3 -c "from v6lib import *; build_storyboard(); render(['S19'])"                              # 正式渲染这个镜头
python3 -c "from v6lib import *; build_storyboard(); render()"                                     # 全片（没变的镜头秒级复用，写 manifest.json）
python3 -c "from v6lib import *; print(grab('S19', [0.3, 3.2, 4.5, 9.3]))"                         # 从镜头 mp4 抽静帧检查
```

`render()` 自动套 `/usr/bin/python3 ~/.local/bin/mac-heavy-job.py --`；退出码 75（别的重任务在跑）自动等 90 秒重试，不删锁、不绕过。**不要自己并发开多个 render**。

---

## 1. 约定

| 项 | 规定 |
|---|---|
| 坐标 | 1920×1008 画布像素（内容区；底部 72px 导航由总装拼） |
| 时间 | 一律「镜头内秒数」，本镜头第 0 帧 = 0。`T(句号)` 取旁白句开始秒数，`T(n, end=True)` 取结束；`Tw('词')` 估算念到某词的时刻（按字数插值，误差约 ±0.3 秒） |
| 时长 | `s.dur`（帧对齐）。镜头顺序、t0/t1、beats 原样来自 `工程/.work/storyboard-audio.json`（`定时间轴.py` 生成），库里断言不改；全片总帧数 = 时间轴帧数 |
| 安全区 | 内容 **y ≤ 870**；出处条 881–921（`begin` 自动放在 150,884）；字幕 925–990（总装烧）；正文、数字放 **x 150–1770**（两侧是暗角） |
| 角标 | 右上：两行章标「第 N 章 / 章名」（`begin` 自动放）；左下：短横 + 出处。不做英文代号、FIG 号、四角取景角 |
| 色板 `C` | `ink #1E1C18` `red #B03A33` `green #326c59` `gold #dec777` `hl #f2dd4e` `navy #34486C` `pen #c0392b` `muted #6B6760` `muted2 #9C978C` |
| 字体 | （2026-11-07 用户审片改）默认改为思源黑体 Source Han Sans（标题 Heavy、正文 Regular/Medium）或得意黑 + 数字 Oswald / Barlow Condensed（OFL，文件和授权放 `素材/字体/`，@font-face 引用）；日文原句 Hiragino Sans。~~原：标题特粗宋 Songti SC；正文 PingFang SC；日文原句 Hiragino Mincho ProN；手写 Hannotate SC / HanziPen SC；圆体 Yuanti SC；行楷 Xingkai SC；数字 Helvetica Neue~~ 宋体、手写、圆体、行楷不再用 |
| 层级 z | 照片/原件/视频卡 5–12 → 卡片 15–22 → 数字 25 → 标注 28–33 → 放大镜 45 → 拟声字 55 → 盖章 60 → 章标/出处 70。集中线默认 18（在照片上、标题和数字下） |
| 素材查找 | `asset(名字)`：按 `项目.json`「素材目录」逐个找（默认 `画面v6/素材`；子目录写成 `'帧/x.png'`、`'原件/x.png'`）→ 绝对路径；找不到或不可读（SSD 未挂载）直接报错 |
| 节拍 | 一屏一个**主效果**（放大镜 / 盖章 / 集中线 / 视差…）；**小变化**（下一项出现、数字落定、标签亮起）每 2.5–4 秒一个。`build_storyboard` 会报「节拍空档」 |
| 音效 | **每个动作都配声**（用户 2026-10-07）：组件参数 `sfx='paper'|'marker'|'click'|'tick'|'whoosh'|'pop'|'shutter'|'hit'|'hit-heavy'|'growl'|'pat3'|…` 登记事件（全片秒数写进 `sfx_events.json`，`总装v6.py` 按 explainer-video-workflow reference 05 对照表选文件、对齐、分档）；`stamp()` 默认登记「stamp」。模板版的 `note` / `panel` / `pop` / `statbar` 也直接收 `sfx=`（USJ 镜头脚本里的 `_card_sfx` 不再需要）。2026-10-07 加：`growl`（卡通吼声，USJ S27「嗷呜！」）、`pat3`（三下快速轻拍，S06「哒哒哒——」）；连续几下（连盖、连击、连拍）用 `ev = s.sound(kind, t, gain=-6.0, el=e); ev['exception'] = '连击'`，总装不做 2.5 秒间隔、0.3 秒合并和次数上限检查（见 USJ S53b、S12、S06） |

---

## 2. 开镜头与时间

### `begin(sid, title=None, source=None, dark=False, *, title_box=(150,70,1000,120), title_size=74, title_at=0, title_anim='fade', title_color=None, title_cls=None, chapter_mark=True, source_at=0, onphoto=False, vig=None, motion=None) → Shot`
- 放右上章标（两行：「第 N 章」+ 章名；章名来自 `项目.json`「章名」，没写的用时间轴里的稿子 `##` 章名；某镜头要显示别的章用「章标覆盖」，例 USJ 的 S52、S53a 显示第 14 章；「章号文字」可把「第 1 章」改成「引子」）、标题（特粗宋）、左下出处。
- `dark=True` 深墨绿纸（格线变浅）；`onphoto=True` 角标、标题改浅色加投影（满屏照片上用，出处自动加深色底条）；`vig=0.3` 本镜头暗角减到 30%（满屏照片）；`motion='full'` 整镜逐帧截（极少用）。
- 标题估计会折行时检查报告会提醒。标题不提前写出旁白后半段才揭晓的数字。
- 例：`begin('S20', '一边亏钱，一边交品牌费', '来源：USJ上市说明书（2007年2月）')`

### `T(n, end=False)`、`Tw(word, nth=0, end=False)`、`shot_info(sid)`、`Shot.say()`
- `T(124)` → 1.52（S20 第 124 句开始）；句号不在本镜头会报错并列出可用句号。
- `Tw('1270')` → 约 5.19（S37 念到「1270」）。数字落定要对准念到的那个词：`counter(..., at=Tw('1270') - .75, dur=.8)`。

---

## 3. 文字与卡片（舞台已有类型，样式已换成档案纸）

| 函数 | 主要参数（默认） | 说明 / 适合 | 每 10 分钟用量 |
|---|---|---|---|
| `text(t, x=150, y=300, w=1620, h=None, size=44, at=0, kind='label', color=None, anim='up', dur=.4, hideAt=None)` | kind：`label` / `caption` / `smalllabel` / `bigquote` | 支持 `==荧光==` `**红字**` `\n`。结论行、单位说明、小注 | 不限 |
| `title(t, ...)` | 同标题框 | 一屏第二个大标题（少用） | — |
| `panel(t, body='', x=150, y=300, w=760, h=340, at=0, kind='', rot=0, tape=False, clip=False, anim='drop', kicker=None, hideAt=None, sfx=None)` | kind：`''` 绿边 / `red` / `navy` / `dark` / `plain`；`tape=True` 顶部胶带，`tape=2` 两角胶带；`clip=True` 回形针（与 `tape=2` 同用时自动改顶部胶带） | 档案卡：浅纸、左粗色边、浅投影、落下入场。对比卡、概念卡。`sfx='paper'` 落定配纸张声 | 尽量换成照片卡/原件，保留时一屏 ≤3 张 |
| `note(t, x=150, y=700, w=900, size=38, at=0, rot=-1, anim='drop', hideAt=None, sfx=None)` | | 便签：浅黄纸 + 左绿竖线。对照注释（如「第10期 ＝ 2003年度」）、照片上的日期签。`sfx='paper'` 落定配纸张声（at+0.25）。（2026-11-07 用户审片改）默认不用便签，改下三分之一方角字条（水谷 v2 `条()`） | ~~不限~~ 默认 0 |
| `metric(value, label, x=150, y=330, w=760, h=300, at=0, color=green)` | | **静态**大数字（已出现过的数字） | — |
| `statbar(label, value, y, maximum, at=0, color=green, shown=None, count=True, x=150, w=1620, label_w=420, track_w=900, static=False, grow=.65, grow_at=None, unit_suffix='', decimals=0, thick=54, value_color=None, sfx=None)` | | 立体横条（顶面 + 侧面 + 投影），数值跟着条滚；`sfx='tick'` 在条子长满那一刻登记落定声（总装配「叮-落定」）。`grow_at`：标签在 at 先摆好、念到数字时条子才长；`static=True` 重复出现的数字直接显示终值。例：`statbar('累计净亏损', 255, 330, 340, at=T(124), color=C['red'], shown='255亿', unit_suffix='亿', thick=84)` | 数据屏跟随 |
| `stamp(t, x, y, at, rot=-8, size=96, kind='bigstamp', sfx='stamp', hideAt=None)` | x,y 是中心；kind：`bigstamp` 红框印 / `seal` 2×2 方印 | 砸入：160%、40% 不透明 → 0.15 秒落到 100%，落定自身抖 3px。**落地时刻 = at+0.15**（写在元素 `event` 字段，并登记音效） | **约 7 枚**（用户认可的 USJ v6 密度：含核心论点处连盖 3 枚 1 处，其余一章 ≤1 枚） |
| `pop(t, x, y, at, color='y', size=52, rot=-3, hideAt=None, sfx=None)` | color：w/y/r/k | 圆角粗描边贴纸弹字；`sfx='pop'`（出现 +0.05 秒） | 一屏 ≤2，不拿来凑节拍 |
| `sound(kind, at, gain=None)` | | 手动登记音效事件（组件没有 `sfx=` 参数的动作、一串逐个出现的节点、过门 riser 等） | 每个动作都配 |

---

## 4. fx.js 组件（`engine/fx.js`，逐帧确定，均支持 `hideAt=秒` 退场与 `hideDur`）

引用原图的组件（`lens` / `highlighter` / `circle` / `maphl`）用 `ref=原件元素` + `target=[x,y,w,h]`（**原图像素**），自动换算到画面并跟着原件的旋转、推近走。`ref` 支持 `docpage`、`photocard`、v5 的 `evidence`；`videocard` 只能给 `highlighter` / `circle` / `maphl` 定位用（跟卡片几何走），**不能给 `lens`**；不支持 `parallax`、`fullbleed`。

### 4.1 `docpage(name, view=None, x=150, y=200, w=1000, h=None, at=0, rot=-1, pad=26, views=None, enter='drop', enter_dur=.55, tape=None, clip=False, fold=False, label=None, tilt=None, lift=None, sfx=None, hideAt=None)`
- 原件纸页：白纸 + 两级投影 + 轻微倾斜 + 胶带/回形针/折角，落下入场（2026-11-07 用户审片改：写 `rot=0`，不用胶带/回形针/折角，v7b CSS 已隐藏；放大到字看得清）（落地时投影由远到近）。`h` 省略按取景比例算。
- `view` 按**整行**裁（不切半行字）；`views=[{'at':秒,'dur':1,'view':[…]}]` 推近关键句；`tilt={'rx':4,'ry':-6}` 3D 透视（**叠放大镜/荧光笔时别用 tilt**，换算不含透视）。
- 高清原件：PDF 用 `写稿/工具/pdfshot 文件.pdf 页 输出.png 0 1`（不带关键句 = 无高亮干净页），放进 `整改v6/素材/`。已做：`USJ-目論見書-p13-原页.png`（PDF 第 25 页）。
- 适合：S03、S13（道歉页）、S19（继续经营注记）、S17/S27（入園者数表）、品牌费条款页。用量：每个外文原件一次（USJ v6 原件 18 处）。

### 4.2 `photocard(name, view=None, x=150, y=200, w=900, h=None, at=0, rot=-2, border=14, caption=None, style='photo', tv_label=None, tape=None, clip=False, enter='drop', enter_dur=.55, drop_y=-90, drop_rot=-6, views=None, lift=None, dim=None, sfx=None, hideAt=None)`
- 白边照片卡（默认左上右上两条胶带）——2026-11-07 用户审片改：真实图片改用 `style='plain', rot=0, border=0`（即水谷 v2 `图()`），满屏用 `fullbleed`（`满屏()`），原色、不倾斜、宽 ≥65%；`style='tv'` 深色圆角电视框 + `tv_label` 台名日期小签（新闻画面）；`style='plain'` 无边。
- `caption` 写在加宽的下白边（手写体——2026-11-07 用户审片改：v7b 改思源黑体白字压图）；`view` 裁掉台标角、日文字幕条；`lift=[{'at':秒}]` 讲到哪张哪张浮起（放大 4%、投影加深），`dim=[{'at':秒,'to':.45}]` 压暗。多张叠放多次调用（后调用在上，或给 z）。
- 适合：所有真实画面屏（开园档案、甘佩尔、收购会见、任天堂开业…）。用量：全片底色（USJ v6：照片卡 61 张、原件 18、视频卡 13，全片约 9 成时长屏上有照片 / 原件 / 视频卡——用户认可的密度）。

### 4.3 `parallax(name, view=None, x=0, y=0, w=1920, h=1008, at=0, amp=.024, dir=(1,-.35), zoom=(1,1.03), inset=.06, blur=26, frame=None, fg=None, deco='bokeh', start=None, end=None, enter='fade', hideAt=None)`
- 2–3 层视差：同图模糊放大底层（动 0.35 倍）+ 主体层（`inset` 内缩成浮起的白边照片；0 = 满框）+ 前景（`fg` 抠图或 `deco='bokeh'` 淡光斑，动 1.7–1.9 倍）。`amp` = 总位移占框宽比例，**≤0.03**（库里截断）；从 start 到 end 一次性漂移，不循环。
- `fg={'name':'人物-抠图.png','x':..,'y':..,'w':..,'h':..,'depth':1.7}`（框内坐标）；抠图用 `写稿/工具/cutout`，属图像推理，**主任务串行 + mac-heavy-job**。
- 持续运动 → 整段逐帧截（约 56 ms/帧）。
- 适合：人物揭示、情绪高点（S05 施瓦辛格、S37 哈利波特、S38 村山、S02 市长）。用量：≤5 次。

### 4.4 `fullbleed(name, view=None, at=0, amp=.014, dir=(1,-.3), zoom=(1,1.025), scrim_h=260, vig=.3)`
- 满屏照片/新闻画面：parallax 铺满（无白边、无光斑）+ 顶部压暗渐变 + 本镜头暗角降到 30%。配 `begin(…, onphoto=True)`。用 `view` 裁掉台标和字幕条。每屏 2–3 秒，连用 3–4 镜回纸面。

### 4.5 `lens(ref, target, at, ja=None, zh=None, note=None, card=None, shape='bar', zoom=2.0, r=150, pad=(30,22), travel=.7, sweep=0, dim=.28, lensOutAt=None, hideAt=None, from_=None, lift=None, cardAt=None, box=True, sfx=None)`
- 放大镜：镜片里是它压着的那块原件 × `zoom`（相对原件当前显示倍率，真放大不是另一张图），飞入 `travel` 秒到位；原件其余部分压暗 `dim`；到位后原句外出现细红框。
- `shape='bar'` 长条读句镜（整句一次看全，默认）；`'circle'` 圆镜（带木柄，`sweep` 秒从句首扫到句尾）。
- 译文卡：`ja` 日文原句（明朝小字在上）、`zh` 中文（44px 大字在下，可 `==荧光==`）、`note` 出处小字；`card={'x','y','w'}`（默认在目标下方）；卡在右/左边时引线走水平 S 形，上下时走竖直 S 形。
- 时间：`at` → +`travel` 到位 → (+`sweep`) → `cardAt`（默认到位后 0.15 秒）；`lensOutAt` 镜子先撤（卡片和引线留下，改连到红框）；`hideAt` 全部退场。
- 中文只译画面里看得见的字，按证据卡措辞。例见 S19。
- 适合：S03、S13、S19、S47 榜单、S02/S48 新闻字幕（用 photocard 做 ref）。用量：每 10 分钟约 7 次（USJ v6 实际，用户认可）。

### 4.6 `highlighter(ref=None, target=None, at=0, targets=None, rect=None, rects=None, dur=.45, gap=.08, color='#f2d84a', alpha=.62, pad=(6,4), sfx=None, hideAt=None)`
- 荧光笔从左往右划过（两端斜、边缘微抖，正片叠底）。`targets`/`rects` 多行逐行划。`rect=[x,y,w,h]` 画布像素用于纸面上的字。用量：~~每个原件 1–2 处~~ （2026-11-07 用户审片改）全片 ≤3–5 处真正重点。
- 2026-10-07：正片叠底改设在 `.el.highlighter` 这一层（`stage.css` 末尾；原来写在内层 svg 上不生效，等于普通半透明覆盖，会把浅底上的深色字冲淡）。**深色底**（TEA 报告深青底表格、深蓝新闻标题、视频里的白字字幕）上叠底会看不见，这种荧光笔加 `css='mix-blend-mode:normal'` 保持普通叠加（本片 S07b、S42、S43、S48、S49、S52、S53a 各镜头脚本里的 `DARK`）。

### 4.7 `circle(ref=None, target=None, at=0, rect=None, shape='ellipse', dur=.6, color='#c0392b', width=5, pad=14, loops=1.12, seed=None, strokes=1, sfx=None, hideAt=None)`
- 红笔圈注：`ellipse` 手绘椭圆（多绕一点）/ `underline` 波浪下划线 / `box` 手绘方框；描出动画。用量：≤8，一屏 ≤1。

- `shape='strike'` 在目标框中线内横划，`strokes=1` 一笔、`2` 来回两笔；`dur` 是总画线时间，`sfx='marker'` 登记在开始时刻。支持 `ref+target` 跟着图片取景/旋转，也可直接 `rect=[x,y,w,h]`。

### 4.8 `counter(value, x, y, w=700, h=None, at=0, dur=.9, from_=0, decimals=0, group=False, prefix=None, suffix=None, unit=None, size=140, color=None, font=None, align='left', label=None, static=False, sfx=None, hideAt=None)`
- 机械计数器式逐位滚，`at+dur` 落定（元素 `event` 字段）并轻顿一下；还没轮到的高位显示淡 0。`unit` 小一号放后面，`label` 下方说明。
- **只用于第一次出现的数字**；重复出现 `static=True`（或用 `metric`）。例：`counter(220, 1225, 414, prefix='+', unit='万', size=140, color=C['red'], at=T(244)+.05, dur=.75)`。
- 用量：跟随第一次出现的新数字，每 10 分钟约 30 个（USJ v6 实际 33，用户认可）。

### 4.9 `focuslines(cx, cy, at, hold=1.0, rx=300, ry=190, n=110, color=ink, alpha=.85, fps=12, wmin=2, wmax=8, exit=.3, clip=(0,180,1920,700), feather=50, sfx=None, z=18)`
- 漫画集中线：0.2 秒收拢、停 `hold`、`exit` 淡出；12 fps 抖动（固定种子）；中间椭圆留空给主体。默认只画在 y 180–880（让开标题和出处，上下羽化）；`clip=None` 铺满。照片上用 `color='#ffffff'`。
- 用量：每 10 分钟约 4 处（USJ v6：S06、S37、S43、S53b，用户认可），只给正面高点。

### 4.10 `speedlines(x=0, y=0, w=1920, h=1008, at=0, dur=None, angle=0, n=36, speed=1800, length=(140,460), thick=(2,6), color=ink, alpha=.45, reverseAt=None, reverseDur=.7, fade=.2, sfx=None)`
- 平行速度线持续流过（`angle` 运动方向）；`reverseAt` 平滑减速 → 停 → 反向（S30 倒着开），闭式积分，可任意跳帧。持续运动 → 整段逐帧截。用量：**≤3**。

### 4.11 `onoma(t, x, y, at, size=150, font='Hannotate SC', color='#FFE15A', stroke=ink, stroke_w=12, depth=7, rot=-8, stagger=.06, hold=.9, exit=.25, shake=None, sfx=None)`
- 拟声字：描边 + 立体厚度，逐字弹出、衰减抖动，停后放大淡出。字体可用 Hannotate SC / Yuanti SC / HanziPen SC / Xingkai SC。只做装饰，不承载数字或事实，不压字幕。用量：每 10 分钟约 6 个（USJ v6 实际，用户认可；中文为主，动漫章节可用片假名）。

### 4.12 `particles(kind='dust', n=60, at=0, alpha=.22, x=0, y=0, w=1920, h=1008, color=None, speed=1, size=1, hideAt=None)`
- 极淡环境层：`dust` 纸屑 / `sparkle` 光点闪烁 / `confetti` 彩纸飘落；canvas 闭式公式重画。持续运动 → 整段逐帧截。可省就省，用量 ≤3。

### 4.13 `maphl(regions, ref=None, at=0, hideAt=None)`
- 地图逐区高亮：每区 `{'pts':[[x,y]…], 'at':秒, 'dur':.5, 'fill':'#ad4d38', 'fillAlpha':.26, 'hatch':True, 'dash':True, 'width':4, 'label':'约6万㎡（示意）', 'lx':.., 'ly':.., 'labelAt':秒}`，从左擦入、斜线网点、虚线框、小标签弹出。`ref` 给出时 pts 用该原图像素。只画示意，标「示意」。适合 S48、S49、S51、S53b，用量 3–4 屏。

### 4.14 `arrow(pts, at, dur=.5, color='#ad4d38', width=6, head=24, wobble=2.5, dash=False, seed=None, hideAt=None, sfx=None)`
- 手绘箭头沿 `pts`（画布像素，平滑穿过）描出，箭头最后长出；`dash=True` 虚线（用裁切从左露出）。一屏 ≤2。

### 4.15 `quotecard(text_=None, x=150, y=560, w=1000, at=0, segs=None, ja=None, who=None, cps=9, size=56, style='paper', rot=-1, tape=True, align='left', type_at=None, enter='drop', hideAt=None, sfx=None, over=None, gap=14)`
- 金句 / 引语打字卡：卡片落下，逐字出现（`cps` 字/秒），红色光标跟字走。`segs=[{'text':'这家公司，','at':T(113)+.15},{'text':'**可能撑不下去了**','at':T(114)}]` 分段卡在念到的时刻；支持 `**红字**` `==荧光==` `\n`。`ja` 原文小字（有原文才放）、`who` 出处。style：`paper` / `note` / `dark`。
- `over=videocard(...)`（或本镜头照片卡元素/元素 id）：自动借视频卡的 x、宽度，放在卡片下沿 + `gap`；视频本身静音（JPG 序列），引语为一行，待念字淡灰、念到的字亮起。不压出处/字幕：一行放不下或下沿 >870 直接报错，缩小/上移视频卡或字号。自动取消引语旋转、胶带，改为淡入；普通纸卡旧用法不变。
- 每段 `segs` 可带 `end`（按该段首末字均匀点亮）、`cps`（段字速）或 `times=[逐字镜头内秒数]`（优先，长度必须与去掉格式标记后的字数一致）；缺省沿用全局 `cps`。原文/署名太长时应缩短，先出静帧复查。每段打字声另写 `sound('type', 段开始)`。
- 用量：每 10 分钟 2–3 张；真人引语只放有原文出处的话。

### 4.16 `rankboard(rows, x=150, y=260, w=1400, at=0, row_h=88, stagger=.3, focus=None, bars=True, maximum=None, bar_color=None, value_w=230, hideAt=None)`
- 排行榜：逐行出现（先灰），`focus=[{'at':秒,'row':下标}]` 点名那行变墨色 + 红徽章 + 荧光底，其余压淡。`rows=[{'rank':1,'name':'佛州魔法王国','note':'美国','value':1784,'valueText':'1784万','at':可选}]`。适合 S42–S45，用量 2–4。

### 4.17 `timeline(points, x=200, y=620, w=1400, at=0, axis_dur=.6, dim_prev=True, cursor=False, ticks=0, photo_w=440, photo_h=280, photo_gap=70, sfx=None, hideAt=None)`
> 2026-10-23 加：`cursor=True` 红色游标从上一个点缓动滑到当前点（0.6 秒）；`ticks=40` 轴上刻度（每 5 格一长）；
> 点里写 `'photo':'素材名.jpg'`（可加 `'photo_cap'`）时，照片卡在轴上方跟着游标走，换点时旧卡淡出、新卡落下；带照片的点说明文字自动放到轴下。照片卡上沿 = y − photo_h − photo_gap − 24，别压到标题。`sfx='tick'` 每个点一声。

- 时间线：轴从左描出，节点弹出（年份在下、说明在上，`side='down'` 说明在下），新节点出现时旧节点变灰。`points=[{'label':'2014','text':'哈利波特','at':秒,'pos':0–1 可省,'color':'#326c59'}]`。适合 S13、S40、过山车进化，用量 2–3。

### 4.18 `videocard(name, view=None, x=150, y=200, w=900, h=None, at=0, t_in=0, t_out=None, play_at=None, speed=1, reverse=False, badge='auto', rot=-2, border=14, caption=None, style='photo', tv_label=None, scan=None, tape=None, clip=False, enter='drop', enter_dur=.55, drop_y=-90, drop_rot=-6, views=None, lift=None, dim=None, max_w=1280, sfx=None, hideAt=None, z=12)`
- 视频卡：在相片卡里播一段短视频。外观和参数与 `photocard` 相同：白边、投影、左上右上两条胶带、轻倾斜、落下入场（2026-11-07 用户审片改：写 `rot=0`，v7b CSS 去掉胶带和白边，原色、大尺寸）；`style='tv'` 是电视框，配 `tv_label`，自动加横向扫描线（每 3px 一条、6%，`scan=False` 关）；`caption` 写在下白边；`lift` / `dim` / `views` 用法也一样。
- 素材查找顺序：`项目.json`「视频目录」逐个找（默认 `素材` → `素材/生成`（Seedance）；新建一期给了 `--资料` 时再加写稿资料 `素材/视频/片段`、`成品`、`原始`）→ 绝对路径。SSD 未挂载时直接报错，不会生成替代文件。
- **取段与抽帧**：`t_in` / `t_out` 指定取原片的哪一段（秒，默认整段）。第一次用时，ffmpeg 把这段抽成 30fps 的 JPG 序列（q2；宽度超过 `max_w` 才缩小），缓存到 `素材/序列/<文件名>-<源文件 sha256 前 12 位>-<in>-<out>-<宽>w/`。目录里的 `seq.json` 记源文件哈希、抽帧参数和每帧哈希。以后每次拼分镜都会核对每帧哈希：对得上就复用（毫秒级），文件坏了就自动重抽。也可以先调 `vseq(name, t_in, t_out)` 预抽。抽帧是轻任务，不走 mac-heavy-job（5 秒片段约 0.1 秒）。
- **播放**：
  - `play_at`：开始播放的时刻（镜头内秒数）。默认等于 `at`，卡片一出现就播。设得比 `at` 晚，卡片先落定、再开始播；设得比 `at` 早，就从片段中间某一帧开始出现。
  - 帧号 = floor((t − play_at) × 30 × `speed`)。`speed=0.5` 是慢放（帧会重复），`2` 是快放。
  - `reverse=True` 倒放。
  - **不循环**：播完停在最后一帧（倒放时停在原片第一帧）。
  - 返回的元素多一个字段 `playEnd`，即播完时刻（镜头内秒数），用来安排后面的动作，例如 `note(…, at=v['playEnd'])`。
- **小标**：`badge='auto'`（默认）一律不标（2026-10-09 用户要求 Seedance 片段不再标「AI 示意」）。传别的字就显示那几个字，传 `None` 不显示。小标放在画面左上，让开左上角的胶带。
- **逐帧确定**：
  - 舞台每帧只按 t 选帧；换图后把 `img.decode()` 通过 `ctx.wait` 交给舞台的 `pendingVideos`，`__seek` 等解码完才截图。解码失败直接报错，不会截到半帧或上一帧。
  - 全部帧的地址都写进分镜，渲染缓存键按每帧内容哈希（试验镜头的 240 帧全部进了键）。
  - 动画窗口 = 入场段 + 整段播放（逐帧真截），其余时间按阅读定格处理。
- **新闻实拍**：用 `style='tv'`、`tv_label='MBS NEWS｜2026-09-01'`，`view` 裁掉台标角和日文字幕条。字幕要译时另配 `note` 或译文条（`lens` 不能以视频卡为 ref）。视频卡没有声音，原声走总装。能用截图就用截图。
- **检查**：拼分镜时，播放开始、之后每 3 秒、播完各算一次画面变化（节拍检查用）。播放超过镜头结尾时，检查报告会提醒（超出部分看不到）。卡片带 `rot` 或 `lift` 时，四个角会比 h 算出的下沿再低 15–30px，下沿建议 ≤ 850。
- 例（S07b 停车场小动画，按 `素材/生成/选用.json` 取 0–5 秒）：
  ```python
  v = videocard('AI-A-停车场新员工.mp4', x=150, y=200, w=1000, at=0.15, t_in=0, t_out=5.0, rot=-2, sfx='paper')
  # 播完是 v['playEnd'] = 5.15；之后停在最后一帧
  ```
- 成本：只有播放段逐帧真截。7.5 秒试验镜头真截 173/225 帧，约 10 秒。
- 适合：`选用.json` 里的 9 段 Seedance 寓意小动画（S07b、S09、S12、S21、S28、S30、S36、S38、S53a），以及非用不可的新闻动态画面。S38 回扣 S07b 用同一个文件，取 `t_in=0, t_out=2.9`。

---


### 4.19 `chaptercard(no, name, keywords=None, at=0, sfx='paper', *, hold=None, stagger=.35, hideAt=None, z=65)`
- （2026-11-07 用户审片改）**默认不用**，改大字章卡（章名 ≥180px，水谷 v2 `章卡()`）。原：档案纸底 + 左上章号 + 粗宋章名，3–4 张既有便签样式依次落下，每张 ≤8 字；`stagger` ≥.3 秒（默认 .35），章名等最后一张落定后淡入。每张落下登记一次纸声；无磨砂、英文关键词、取景角或坐标。
- `keywords=None` 从项目「章卡」按当前镜头号读，未配置报错。`hold=None` 留到镜头末；`hold=2.6` 在原镜头内作开头、随后 .3 秒淡出，正文安排在 `at+hold+.3` 后。`hideAt` 优先于 `hold`。章卡不能短到漏掉章名。不插入时间。

```python
begin('S08', source='资料：本期证据卡', chapter_mark=False)
chaptercard(3, '转折从哪里来', ['危机','选择','转折','突破'], hold=2.6)
photocard('现场.jpg', at=2.9, sfx='paper')
# 整镜章卡：chaptercard(3, '转折从哪里来', ['危机','选择','突破'])
```

### 4.20 `recapwall(shots, conclusion, focus=None, at=0, *, count=32, zoom=2.4, zoom_dur=2.4, focus_at=None, step=.9, line_dur=.5, sfx='marker', zoom_sfx=None, hideAt=None, z=18)`
- `shots=[('S01',2.0),('S02',3.5),…]` 从本期已渲染 mp4 调 `grab()` 抽帧；缺 mp4、自抽当前镜头、秒数出界明确报错。抽出的 JPG 存 `素材/回顾墙/`，文件名含来源视频哈希，渲染指纹包含抽帧内容。
- （2026-11-07 用户审片改）**回顾墙默认不用**，结尾用干净大画面收住片名。原：`count=20–40` 循环铺满，默认 32 张白边投影胶带卡；从 `zoom` 放大态缓慢拉远到 1 倍。墙整体裁在安全内容区，出处/字幕/导航不进入墙。
- `focus=[0,1,2,3]` 是**输入来源列表**的 0 起下标，需要 4–6 个不同来源；不是铺墙后卡号。各挑一张分散位置，按 `focus_at`（默认拉远结束+.25）与 `step` 逐一高亮，其余压暗；已选卡保留高亮。手绘红线逐一汇入结论框；`conclusion` 一行 ≤28 字。`step ≥ line_dur+.25`。
- `sfx='marker'` 对齐描线开始；拉远默认为无声，可 `zoom_sfx='whoosh'`。结论普通淡入无盖章声。动作必须在本镜头时长内完成，否则报错。所有属性仅由镜头时间计算，逆向 seek 安全；每期片尾 1 次，不当成整片连续墙。

```python
# 先 render(['S01','S02','S03','S04'])，再构建有回顾墙的镜头。
begin('S20','回到最初的问题',source='资料：本片前文')
recapwall([('S01',2),('S02',3),('S03',4),('S04',2)],
          '突破来自一次次选择',focus=[0,1,2,3])
```


### 4.21 `pill(text, x, y, at=0, tone='neutral', size=28, solid=False, dot=True, dur=.4, w=620, h=64, sfx=None, hideAt=None)`
圆角胶囊标签，挂年份、增量、概率。（2026-11-07 用户审片改）v7b CSS 把它改成方角色块字条，不要圆角药丸和圆点；下三分之一字条用水谷 v2 `条()`。`tone`：`up` 绿（正向）/ `down` 红（负向）/ `warn` 黄 / `neutral` 灰。
`solid=True` 实心反白（用于「已核实 / 仅传闻」这类状态戳）。最通用的一个，几乎每屏都能挂一个。
```python
pill('1945 · 收归国有', 300, 700, at=1.0)
pill('+450亿 · 比上一年', 1180, 430, at=3.2, tone='up', sfx='pop')
pill('大概率', 900, 500, at=5.0, tone='warn')
```

### 4.22 `linechart(points, x=260, y=250, w=1400, h=560, at=0, dur=2.2, y_max=None, y_min=None, curve=None, peak=True, area=False, cap=None, grid=3, val_fmt=None, y_fmt=None, val_size=44, peak_size=92, sfx=None, hideAt=None)`
趋势折线：**线自己画出来，线头一个墨点跟着走**，节点按线走到的位置依次冒出，末点标红、数字滚上去。
`points=[{'label':'1999','value':281,'text':'281'(可省)}]`；`curve='straight'` 走折线段，默认平滑（d3 curveMonotoneX，不过冲）。
**最后一句旁白要正好讲最后一个数**：`sfx='tick-滚动'` 配画线，落定处补 `sound('叮-落定', at+dur*1.05)`。

### 4.23 `forkpaths(branches, x=200, y=240, w=1560, h=560, at=0, stagger=.5, dur=.8, ox=70, end_pad=440, seed=None, sfx=None, hideAt=None)`
分叉路径：一个点分出几条曲线通向不同结局，末端画 ❌/✓，中途挂概率胶囊。
`branches=[{'text':'走不通','note':'一句话','mark':'x'|'v'|None,'prob':'大概率','probTone':'warn','y':可省}]`
❌/✓ 用 **rough.js 手绘**（seed 固定，逐帧不抖）。**讲「几种结局」的那一屏用这个，别用文字列。**

### 4.24 `branchmap(head, items, x=200, y=240, w=1520, h=540, at=0, stagger=.35, dur=.5, head_size=104, hy=150, iy=None, sfx=None, hideAt=None)`
分支发散：主体在上（常是一个大数字），向下连线到 N 个子项，逐条点亮。
`head={'text':'4,340亿','sub':'净投资组合 · 截至2025财年'}`，`items=[{'text':'星展银行','note':'金融'}]`。**3–5 个子项最好看。**

### 4.25 `iconrow(items, x=260, y=560, w=1400, h=200, at=0, stagger=.6, dim=.26, hot=True, icon_size=72, text_size=40, mono=True, sfx=None, hideAt=None)`
一排图标 + 标签，**逐个点亮**（整排先压淡出现，再一个个升到满并变红），不是逐个淡入。
`items=[{'icon':'🏭'(可省),'text':'失业','at':可省}]`。
⚠️ **彩色 emoji 跟格子纸的单色体系打架**，默认 `mono=True` 压成灰；不放图标只留词往往更干净。

> 这五个 2026-10-11 加（概念长片拆解）。渲染自测：`样片/_模板自测-2026-10-11-五个新组件/`。
> 依赖 `工程/engine/vendor/`（rough.js / d3-shape / lottie-web，离线、UMD）。
> **rough.js 一律在 build 里用 `generator()+toPaths()` 算好 d 烤进 HTML，并且必须给 seed**，否则逐帧会抖。

### 4.26 `chatui(windows, x=150, y=150, w=1620, h=700, at=0, gap=28, badge=None, enter='drop', type_cps=9, reply_cps=22, think=.9, sfx=True, hideAt=None)`
仿真聊天界面（AI 片用，2026-10-23）：1–3 个白色应用窗口并排落在纸上。用户消息先在输入框逐字打出（带附件卡），打完停 0.25 秒自动发送进对话；AI 回复先显示「思考」三点，`think` 秒后逐字吐出。
`windows=[{'name':'助手 A','accent':'#c96442','hello':'今天想做点什么？','msgs':[{'role':'user','text':…,'at':T(2),'file':'game.pkg'},{'role':'ai','text':'**您的账户已被封禁**','at':T(3),'style':'error'}]}]`；`style='error'` 红框、`'ok'` 绿边；`role='sys'` 居中灰字。
- 界面自己画，**不贴真实产品截图、不用真实商标**；窗口名写「助手 A」或产品名文字。虚构的回复（玩笑）要一眼看得出，否则 `badge='示意'`。
- `sfx=True`：窗口落下 paper、打字逐字声（总装按 `typeRuns` 排每个字）、发送 click、回复 pop。两个窗口同时打字只出一声（总装自动合并）。
- 窗口内容多了会自动把旧消息顶出上沿（最新的在下面）。

### 4.27 `codecard(code, x=150, y=180, w=1100, h=None, at=0, title='main.py', lang=None, type_at=None, cps=24, line_at=None, static=False, focus=None, hot=(), size=30, style='dark', sfx=True, hideAt=None)`
编辑器卡：标题栏 + 行号，代码逐字打出，语法颜色自动切（关键字 / 字符串 / 数字 / 注释 / 函数名），注释可以写中文。
- `line_at={6: T(12)}`：第 6 行不早于这个时刻开打（卡旁白）；`static=True` 直接全显示；`focus=[{'line':2,'at':Tw('加钱'),'until':可省}]` 行高亮黄底；`hot=['GivePlayerMoney']` 名字反白红底。
- `style='dark'`（默认，暖灰深色）或 `'light'`（纸色）。≤ 14 行、每行 ≤ 60 字符好读；超过 18 行报错。
- 打字声：连续打字（行间停顿 < 0.4 秒）合成一段，每个字的时刻写进 `typeRuns.times`，总装逐字对齐。

### 4.28 `termcard(items, x=150, y=220, w=1100, size=96, list_size=44, sfx='marker', hideAt=None)`
术语大字：红色取景角收拢 + 黄荧光一扫 + 字从左往右露出；下一个术语进来时，前面的自动缩成小号清单（打勾、变淡）。
`items=[{'text':'静态重编译','sub':'提前把整个程序翻译好','at':Tw('静态重编译') - .15}, …]`（at 必填、递增，一屏 ≤ 5 条）。
和拟声字 `onoma` 不同：术语**可以承载事实**。讲「三条路」「三件事」这类清单时，第一次出场用它，后面逐条累加。

> 这三个 2026-10-23 加（AI 片专用，见 `~/Desktop/写稿/工作流/AI视频工厂流程.md`）。自测：`样片/_模板自测-2026-10-23-AI组件/`（静帧、两次渲染 990 帧 0 帧不同、29 秒总装测试片）。

### 4.29 `aiicon(name, x, y, size=120, at=0, label=None, draw_dur=.7, rough=True, sw=5, hot_at=None, color=None, sfx='marker', hideAt=None)`
AI 线稿图标，一笔一笔画出来（rough.js 手绘感，seed 固定，逐帧不抖）；`hot_at` 时刻整只变红「点亮」（配 pop）；`label=True` 用默认中文名。
24 个：model 模型 · gpu 显卡 · chip 芯片 · data 数据 · agent 智能体 · tool 工具 · terminal 终端 · code 代码 · doc 文档 · chat 对话 · server 服务器 · cloud 云端 · user 用户 · lock 加密 · key 钥匙 · globe 网页 · gear 设置 · bolt 算力 · search 搜索 · memory 内存 · eye 视觉 · game 游戏 · book 论文 · phone 手机（`AI_ICONS` 是名单，定义只在 `engine/fx.js` 的 `ICONS` 一处）。
- 线稿图解 = 几个 `aiicon` + `arrow` 连线 + `note`/`pill` 说明，**一次只加一个元素**，跟着旁白点名的那个词出来（`Tw('显卡') - .2`）。
- `iconrow` 的 `icon` 写 `'ai:gpu'` 也能用（静态线稿，点亮时变红），不用彩色 emoji。
- 总览图：`样片/_模板自测-2026-10-23-AI组件/画面v6/镜头/S07-t5.80.jpg`。

### 4.30 `specgrid(cols, rows, x=150, y=220, w=1400, at=0, row_h=76, label_w=260, stagger=.35, focus=None, size=34, cap=None, sfx='paper', hideAt=None)`
参数对比卡：纸面表格，表头先出，每行从左滑入；`focus=[{'row':1,'col':0,'at':Tw('36')}]` 的格子变红 + 荧光笔从左扫过（配 marker）。
`cols=['', 'PS5', 'RX 6700']`（第一个是行名列表头），`rows=[{'label':'计算单元','vals':['36 CU','36 CU'],'note':'小字(可省)','at':可省}]`，最多 8 行；`cap` 左上小字写口径或出处。**只放同口径的数**，数字照证据卡。

> 4.29–4.30 和 timeline 游标 2026-10-23 加。自测同上沙箱（S04 线稿图解、S05 对比卡、S06 时间线、S07 图标总览），7 个镜头两次渲染 2,100 帧 0 帧不同。

### 4.31 `flash(name, at, view=None, dur=.35, sfx='shutter', z=80)`

**2026-11-07 用户审片改：停用，不许调用**（用户：「老是图片一闪而过」；模板和水谷 v2 期的 v6lib 都已改成调用即报错）。图片 ≥2 秒、带字 ≥3.5 秒，用 `fullbleed` / `photocard` 正常停留。以下为历史说明：极短插镜（2026-11-06）：一张图硬切满屏 `dur` 秒（0.2–0.6）再硬切回来，盖住纸面和角标，字幕和底部导航不受影响。只放强段，闪完停 2 秒以上；连闪时 `at` 间隔 ≤ 0.6 秒，只查最后一张后面的停留。规则见 reference 09「节拍强弱表」。

## 5. 拼分镜、检查、渲染

| 函数 | 说明 |
|---|---|
| `build_storyboard(shots=None, fallback='auto', out_dir=工程/.work, quiet=False)` | `shots=None` 读 `镜头脚本/S*.py` 全部（每个文件必须有 `build()`，且一个镜头只能 begin 一次；`新建一期.py` 给每个镜头写了空白骨架）。没写脚本的镜头：`'auto'` 有 `项目.json`「兜底分镜」文件就用旧画面预览，没有就只放章标；`'blank'` 只放章标。写出 `storyboard.json`、`timeline.js`、`sfx_events.json`（全片秒数）、`检查报告.txt`，并打印检查结果 |
| 检查项 | 元素下沿 > 870、正文超出 x 150–1770、出现时间超出镜头、hideAt ≤ 出现时间、标题可能折行、译文卡偏低、**节拍空档 > 4 秒**、第一个画面元素晚于 1 秒、空镜头（「没有任何画面元素」= 骨架还没写）、中重档音效相邻 < 2.5 秒、id 重复；结尾断言镜头顺序/t0/t1/beats 与 storyboard-audio.json 一致、总帧数 = 时间轴帧数 |
| `render(ids=None, stills=False, at=None, out=None, force=False, fonts=False, storyboard=None)` | 套 mac-heavy-job 运行 `工程/分段渲染.mjs`。`ids=None` 全片并写 `镜头/manifest.json`；有 `ids` 时只写 `manifest-only.json`（**不覆盖 manifest.json**，总装前跑一次全量，没变的镜头秒级复用）；`stills=True` 只出静帧（含浏览器字幕，位置与成片 ASS 字幕相近但不完全一样）；`force=True` 不复用缓存；`fonts=True` 打印字体可用性 |
| `grab(sid, times, out_dir=自测, cache=镜头)` | 从最新的镜头 mp4 抽静帧（ffmpeg，轻量） |
| `vseq(name, t_in=0, t_out=None, max_w=1280)` | 把视频片段抽成 30fps JPG 序列并缓存（`videocard` 自动调用），返回 `dir`、`frames`、`n`、`w`、`h` |
| `contact(paths, out, cols=2)` | 几张静帧拼对照图 |
| `latest_mp4(sid)` | 某镜头最新 mp4 |

---

## 6. 引擎快照（`工程/engine/`，只改本期快照，主引擎未动）

- 来源：`模板-v6/工程/engine`（= USJ 整改v6 定稿时的快照，USJ 又是从 整改v5 复制改出来的），新建一期时拷进来，指纹在 `工程/指纹-来源.txt`。模板与 USJ 同步记录在 `模板-v6/_来源快照/`。
- `stage.css` 末尾「T009 v6」两段：档案纸主题变量（`:root` 里调格线 `--grid-minor` `--grid-major`、暗角 `--vig-strength`（现为参考图实测 × 0.75）、投影三级、色板）+ fx 组件样式。
- 纸纹：`工程/做纸纹.py`（固定种子，重跑逐字节相同）→ `engine/assets/paper-light.png`、`paper-dark.png`；格线用 CSS 画（48px 细格、每 5 格粗线，横线过画面中心 y=504）。
- `stage.html`：引入 `fx.js`、加 `#vignette` 暗角层（固定、不跟镜头动）。
- `fx.js`：2026-10-07 04:15 加 `videocard`（逐帧换 JPG + 解码等待）；`highlighter` / `circle` 等的 `ref` 可指向 videocard。`stage.css` 加 `.fx-vcard`（小标、扫描线）。这次改动让 50 个镜头的缓存全部失效，下次全片渲染会全部重渲。
- `stage.js`：`hideAt`（镜头内秒数）退场 + `hideAnim`（fade/up/down/shrink）；入场 `stamp2`（印章砸入）、`drop`（卡片落下）；`statbar` 数字滚动、`growAt`、0 宽隐藏侧面；`eyebrow` 两行章标、`source` 短横；`spec.css` 内联样式；场景级 `vig`；fx 组件拿到 `ctx.lt`（镜头内秒数）和 `ctx.wait(promise)`（换图后交给 `pendingVideos`，`__seek` 等它；videocard 用）；`__windows()`（各元素画面会变的时段）、`__assetsReady()`（等图片解码、报坏图）、`__fontCheck()`。
- `分段渲染.mjs`：指纹加 `fx.js`、`cdp.mjs`、`engine/assets/*`；分镜里**任何位置**的 `file://` 都按文件内容哈希进缓存键；动画窗口 = 浏览器 `__windows()` ∪ 脚本规则（`motion:'continuous'`、CHARTS 全时长、`hideAt` 退场、`growAt`、镜头 `motion:'full'`）；载入后坏图直接报错；记录每镜头耗时与 ms/帧；`--only` 写 `manifest-only.json`；`--at=` 指定静帧时刻；`--force`、`--fonts`。
- **改 `engine/` 任何 deps 文件或 `分段渲染.mjs` = 全部镜头重渲**（10 分钟片约 10–20 分钟）。主题和组件请一次改定，之后只改镜头脚本。
- 2026-10-07 14:00（USJ）：`stage.css` 末尾加 `.el.highlighter{mix-blend-mode:multiply;}`（荧光笔不再冲淡字），USJ 全片重渲一次（50 镜 688 秒），已同步进模板。个别元素要例外时用元素的 `css=` 内联样式覆盖，只重渲那几个镜头。

---

## 7. 自测结果（USJ v6，2026-10-07；模板端到端自测见 `模板-v6/README.md`）

| 镜头 | 时长 | 真截帧 | 用时 | 看过的时刻 |
|---|---|---|---|---|
| S19 原件 + 圈注 + 荧光笔 + 放大镜译文 + 打字卡 | 9.53 s | 172/286 | 11.7 s | 0.25 落下中、3.2 荧光笔划到一半、4.5 镜子到位卡片弹出、9.3 落定 |
| S20 立体横条 + 数字滚动 + 盖章 | 9.23 s | 135/277 | 6.4 s | 1.9 条子长到一半、5.5 第二行先灰、8.0 第二条滚到 291、9.1 盖章落定 |
| S37 视差照片 + 便签 + 三个计数器 + 集中线 | 12.87 s | 386/386 | 21.6 s | 0.3 淡入、6.5 集中线 + 数字滚动、7.9 落定、12.6 末帧 |
| 试验台 A（速度线反向、拟声字、档案卡、弹字、箭头、方框、光点，深色纸） | 12.27 s | 368/368 | 19.6 s | — |
| 试验台 B（电视框、地图高亮、排行榜、时间线、照片叠放浮起/压暗、深色打字卡、hideAt 退场） | 16.77 s | 310/503 | 15.0 s | — |
| 视频卡试验（借 S07b 时长：主卡停车场动画 0–5 秒正放、5.6 秒浮起；小卡同片 0–3 秒倒放 ×1.5） | 7.50 s | 173/225 | 约 10 s | 0.4 落下中、2.5 播放中、3.6 小卡已播完、6.8 主卡停在最后一帧并浮起 |

- 确定性：S37（视差 + 集中线，全程运动）渲两次，386 帧 framemd5 **0 帧不同**。视频卡试验 `--force` 渲两次（`自测/试验台/视频卡/渲染A`、`渲染B`），225 帧 framemd5 **0 帧不同**。
- 视频卡选帧：用条码测试片（每帧画 8 位帧号，24fps，模仿 Seedance）按同样布局渲染，从成片每一帧读回条码，和公式算出的帧号逐帧对照：正放 143 帧、倒放 ×1.5 共 175 帧，**0 帧不符**，说明没有卡帧、错帧或截到上一帧（`python3 自测/试验台/视频卡试验.py barcode`）。缓存复用：未改动重跑 3 个镜头全部「复用」。
- （2026-10-07 自测记录；2026-11-07 起默认字体改思源黑体 + Oswald，见本文件开头）字体：Songti SC、PingFang SC、Hiragino Mincho ProN、Hiragino Sans、Hannotate SC、Yuanti SC、HanziPen SC、Kaiti SC、Xingkai SC、Weibei SC、Helvetica Neue、Menlo、Bodoni 72 全部可用（不回退）。
- 每次运行浏览器启动约 2–3 秒。估算：纸面镜头 6–12 秒/镜，全程运动镜头约 56 ms/帧（10 秒镜头约 17–20 秒）；全片 50 镜约 10–20 分钟。
- 抽帧与渲染：`自测/示范渲染/`（mp4 + 每镜 json）、`自测/成片抽帧/`（mp4 抽帧 + 四帧对照）、`自测/静帧-*`（浏览器静帧）、`自测/试验台/`。

---

## 8. 已知限制

1. `docpage` 的 `tilt`（3D 透视）不进坐标换算：要叠放大镜/荧光笔/圈注的原件别加 tilt；`parallax`/`fullbleed` 不能当 `ref`（要在新闻画面上放大字幕，用 `photocard` 做 ref）。
2. 放大镜出现期间别让 `ref` 推近（`views` 动），镜片内容会跟，但引线和卡片位置是按当前位置算的，会显得飘。
3. 计数器滚动中各位数字是「转轮」样子（会看到上下半个数字），落定那一帧是精确值；默认数字字体 Helvetica Neue（等宽数字），换比例字体可能对不齐。
4. `parallax`、`speedlines`、`particles` 是持续运动，整段逐帧截，比纸面镜头慢约 2–3 倍；`particles` 可省就省。
5. 旋转过的卡片里的字会被重新采样，略软：文字卡 `rot` 控制在 ±2° 以内；原件小字主要靠放大镜看清。
6. 暗角强度、格线深浅是全片变量（`stage.css` `:root`），按用户看样图再定；改了就是全片重渲。
7. 每镜头仍独立渲染，舞台换场推镜不会发生。默认硬切；可用项目「接缝淡化」在后一镜头开头将前镜末帧冻结淡出（不重播尾段），总帧数、旁白、音效、字幕时间不变。无闪白。
8. `sfx_events.json` 只登记音效时刻和种类；选哪个文件、放置偏移、轻中重分档、0.3 秒合并、中重档 2.5 秒间隔、hit-重 ≤ 6，全在 `总装v6.py` 第 3 步做（对照表见 explainer-video-workflow reference 05）。认不出的种类总装直接报错。
9. 旧画面兜底只供预览：元素位置没按 v6 安全区重排（有的伸进暗角），照片镜头的章标不是浅色。新一期一般没有兜底分镜，没写的镜头只有章标（骨架里有标题时显示标题）。
10. 普通打字卡的光标每帧移动 DOM 节点（零宽、不改排版，确定性已验证）；卡片高度随字数变，排版前先出静帧看。
11. 地图高亮的多边形要手量原图像素；只画示意，角上注明「示意」。
12. 总装默认 `-c copy`。接缝仅重编码目标镜头开头至下一关键帧，余段/其他镜头仍复制；新版渲染器半秒封闭 GOP、无 B 帧。旧缓存关键帧过远会明确报错，需要新版重渲目标镜头。编码参数必须一致。上述复制范围指字幕/底栏烧录前的内容画面；原有最终烧录仍编码整片，实际帧数在 `video.seams` 记录。
13. `videocard` 不能当 `lens` 的 ref（镜片里只会是第一帧）；荧光笔、圈注、地图高亮可以，但它们跟的是卡片位置，不跟画面里的东西走。
14. 序列是 JPG（q2），和原片略有压缩差（平均每像素差约 2/255）。换 `t_in` / `t_out` 会另抽一份目录。`素材/序列/` 只是缓存，删掉后下次拼分镜会自动重抽。

15. 回顾墙抽帧依赖来源镜头 mp4：首次先构建/渲染来源镜头，再构建回顾墙；改来源后要重构分镜，重新抽帧及渲染回顾镜头。普通 `render()` 的整片 manifest 仍需在总装前生成。

16. 2026-10-10 新增组件（章卡、回顾墙、视频引语、删除线、接缝淡化）已在沙盒外实际渲染验收：S01–S05 镜头与 30 秒总装测试片（900 帧，−13.9 LUFS / −1.9 dBTP，音效 16/16 对上，总评通过），对照图 `样片/_模板自测-2026-10-10-章卡回顾墙/画面v6/自测/对照-新组件.jpg`，Claude 逐帧看过文字、安全区、重叠。注意：Codex 的 workspace-write 沙盒起不了 Chromium，渲染要在沙盒外跑（Claude 或终端）；命令里别出现 whisper/torch 等词，否则会被内存锁钩子整条包住、和内部锁互锁。

---

## 9. 地图舞台（2026-10-27 加，`engine/fxmap.js` + v6lib 地图函数）

学 Wendao（城市历史 × 铁道）的**结构**：一张自绘底图贯穿全片，线、点、区域、照片卡按旁白一层层加上去。版式（站卡、路线进度、年份牌样式）是我们自己的，不用他的名字、栏目名、口头禅、章节卡样式。第一次用在 `样片/2026-10-27-日本桥地图试作/`；沙箱 `样片/_模板自测-2026-10-27-地图舞台/`。

**底图**：`python3 地图/做底图.py 底图 --bbox 南,西,北,东 --out 画面v6/素材/地图`（OSM / Overpass，免费免 key；默认 z17 ≈ 1 米/像素，适合 2–4 公里见方；`--粗` 只画主干道做城市全景）。输出 `底图.svg`（米色陆地、灰蓝水、白路、浅黄高架、无文字）+ `底图.json`（投影）+ `底图.osm.json`（数据缓存）。SVG 是矢量，推近 2–3 倍不糊。署名：`地图：© OpenStreetMap contributors`（出处条 + 片尾）。3.4 万栋建筑太重，不画。

| 函数 | 说明 |
|---|---|
| `LL(经度, 纬度)` / `LLs([(经,纬)…])` | 经纬度 → 底图像素 |
| `osmline('堺筋', axis='y', lo=, hi=)` | 按名字从 OSM 缓存取路/河中心线（双向车道自动合成一条；`axis='x'` 东西向） |
| `cam(center, width_m=1500, dx=0, dy=0)` | 取景框 `[x,y,w,h]`：中心（经纬度元组或底图像素）+ 画面横向覆盖多少米 |
| `mapbase(view=cam(...), views=[{'at','dur','view'}…], enter='none')` | 满屏底图（photocard style='map'，叠纸纹）；`views` 推镜（缓入缓出，3 秒左右）。返回元素当 `ref`。推镜声自己 `sound('whoosh', at)` |
| `mapline(ref, [{'ll'/'pts', 'at', 'dur':1.6, 'color', 'width':8, 'casing', 'dash':[16,11], 'tip':True, 'hideAt'}], sfx='marker')` | 线路生长；`dash` = 已消失的河/规划线（用遮罩露出，虚线不变形）；`tip` 生长头；线宽按屏幕像素恒定 |
| `mappins(ref, [{'ll'/'pt', 'at', 'kind':'num'|'dot'|'place'|'big', 'n', 'label', 'sub', 'dir':'r'|'l'|'u'|'d', 'dx','dy', 'to':[画布x,y], 'hideAt', 'checkAt'}], sfx='pop')` | `num` 红圈编号 + 黑底白字标签（看点目录）；`dot` 白点 + 白签；`place` 小地名（带纸色描边，不登记音效）；`big` 粗宋大区名；`to` 细红引线连到照片卡；`checkAt` 编号变绿勾（结尾回扣） |
| `maparea(ref, [(经,纬)…], at, label=, fill=)` | 区域斜线网点 + 虚线框（maphl 的经纬度版），标「示意」 |
| `maptint([(秒, 浓度[, 颜色])…])` | 年代滤色：讲江户/明治时整屏泛黄（默认 #C9A46A、0.35），回到今天给 0 褪掉；z=4（只盖底图，照片卡/线/点都在它上面） |
| `yeartag([(秒, '1891', '长屋建筑规则')…], x=150, y=58)` | 左上年份牌，换年份上翻；每次登记「tick」。地图镜头不写 begin 标题，左上留给它 |
| `bigchapter('第一站', '官道上的桥', '1615 — 1868', stops=[…], cur=0, hideAt=)` | 站卡：纸底 + 红色站号 + 粗宋站名（2026-11-07 用户审片改：字体换思源黑体）逐字由虚到实 + 年代 + 右侧竖向路线进度；整镜头站卡不写 `hideAt` |
| `songtitle('大阪的**南大门**', sub=…, scrim=True)` | （2026-11-07 用户审片改）新闻解说片不用宋体，要用就把字体换成思源黑体 Heavy。原：宋体大标题逐字浮现 + 红短线 + 副标题；`scrim` 背景虚化压淡（叠在地图上） |

**底图 z=3**：其它元素必须有 z（大多数组件自带；`statbar` 没有默认 z，要写 `z=24`，否则被压在地图下面看不见）。
规矩：地图镜头 `begin(sid, None, '地图：© OpenStreetMap contributors')`（不写标题）；一屏一个主动作（推镜 / 一条线 / 一组编号点），小变化 2.5–4 秒一个；同一张底图贯穿全片，颜色全片固定（红 = 主线路，蓝 = 河，虚线 = 已经没了的东西）；照片卡用 `photocard(..., sfx='paper')` + `mappins(..., to=[卡角])` 连回地图上的点，右下写图片署名。
实测（沙箱 S01/S02）：带推镜的地图镜头约 56–73 ms/帧；字、线随推镜移动正确，推近 2.2 倍仍清晰。
