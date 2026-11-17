"""阿倍野再开发：手写镜头（图解、原件、账本、计价器、路口两栋楼）。每个函数名 = 镜头号；改完跑 python3 镜头脚本/_生成.py"""
from v6lib import *
from 本期工具 import *
from 本期工具 import _时, _S

RED, NAVY, MUTED = C['red'], C['navy'], C['muted']
官方航拍 = '范围-官方1978航拍'


def tw(w, d=0.0, 默认=1.0):
    return _时((w, d) if d else w, 默认)


# ---------------------------------------------------------------- 第 1 章
def S02():
    s = 开('S02', '很少有人知道：商场这一边……')
    t1, t2, t3, t4 = tw('本来也要'), tw('图纸上'), tw('这栋楼没'), tw('最后改成')
    路口(0, 图纸=t1, 图纸退=t3 + .5)
    楼标('HARUKAS\n300 米', 1540, 150, 0, size=44, color=NAVY)
    楼标('6 层的商场', 430, 815, 0, size=38, color=RED)
    楼标('图纸上：\n63 层 · 290 米', -70, 230, t2, size=50, color=RED, w=460, hideAt=t3 + .5)
    楼标('这栋楼\n没盖起来', -70, 230, t3 + .5, size=64, color=RED, w=460, hideAt=t4)
    楼标('63 层 → 6 层', -110, 250, t4, size=84, color=RED, w=520)
    sound('hit', t4)
    return s


def S04():
    s, ref = 原文('S04', F('雅虎-标题-3'), [290, 280, 1350, 560], w=1300, y=165, rot=-3,
                划=[([740, 538, 374, 50], '最新的数字')])
    a, b, c = tw('挂出', 0, 3.5), tw('粗算', 0, 12), tw('这条新闻', 0, 16)
    条('日本雅虎新闻 · 11 月 15 日：这笔账，一直算到了今天', y=772, at=.8, size=40, hideAt=a)
    条('标题：大阪·阿倍野 也有人说「把故乡还给我」……再开发留下 1822 亿日元的大赤字', y=772, at=a, size=36, hideAt=b, w=1620)
    条('收支不足 约 1822 亿日元 ≈ 76 亿人民币上下', y=772, at=b, size=44, hideAt=c, tone='down')
    条('这条新闻在 X 上一天多，就有 200 多万次浏览', y=772, at=c, size=42)
    return s


# ---------------------------------------------------------------- 第 2 章
def S12():
    s, ref = 原文('S12', F('report_p21'), [230, 195, 1920, 420], w=1560, y=150, rot=-3,
                划=[([1568, 489, 550, 36], '四分之三')], 题文='大阪市后来自己写的报告')
    a, b, c, d = tw('四分之三', -.3, 5), tw('算得上', 0, 8), tw('一千两百', 0, 11), tw('巷子窄', 0, 14)
    y = 590
    字('1950 年以前盖的', x=150, y=y, w=520, size=40, at=a, photo=True)
    字('约 74%', x=150, y=y + 56, w=520, size=110, at=a, big=True, num=True, color='#FFD75E')
    字('算得上耐火的', x=660, y=y, w=480, size=40, at=b, photo=True)
    字('约 16%', x=660, y=y + 56, w=480, size=110, at=b, big=True, num=True, color='#FFD75E')
    字('房子一千两百多栋', x=1150, y=y, w=620, size=40, at=c, photo=True)
    字('八成是木头的', x=1150, y=y + 70, w=620, size=84, at=c, big=True, color='#FFD75E')
    for t in (a, b, c):
        sound('pop', t)
    条('挤在一起：巷子窄，消防车开不进去，公园几乎没有', y=790, at=d, size=40)
    return s


# ---------------------------------------------------------------- 第 3 章
def S18():
    s = 开('S18', '阿倍野用的是另一种')
    图(F('官方-页头-1'), view=[280, 0, 2000, 300], box=(150, 180, 1620, 250), at=.1)
    t = tw('第二种', -.2, 2)
    字('第二种市街地再开发事业', x=150, y=470, w=1620, size=112, at=t, big=True, color=RED)
    sound('hit', t)
    条('只有政府认定非改不可、又特别紧急的地方，才用这种办法', y=700, at=tw('只有政府', 0, 6), size=44)
    return s


def S19():
    s = 开('S19', '做法是这样的')
    步([('政府出面', tw('政府自己', 0, 1.5), 0), ('土地房子全买下', tw('把整片', 0, 3), 0), ('推平', tw('推平', 0, 6), 0), ('重新规划、盖楼修路', tw('重新规划', 0, 7), 0)], y=250, size=50, gap=50, h=130)
    a, b = tw('原住户', 0, 9.5), tw('不想留', 0, 12.5)
    字('原住户', x=150, y=470, w=400, size=56, at=a, big=True)
    条('想留下的：拿新楼里的面积抵', x=150, y=560, at=a + .2, size=48, w=1100, tone='up')
    条('不想留的：拿钱走人', x=150, y=690, at=b, size=48, w=1100)
    return s


def S20():
    s = 开('S20', None)
    字('买地盖楼的钱，从哪来？', x=150, y=230, w=1620, size=100, at=0, big=True, anim='fade', dur=.2)
    a = tw('借', 0, 2.0)
    字('借。', x=150, y=420, w=600, size=240, at=a, big=True, color=RED)
    sound('hit', a)
    字('市政府发债', x=640, y=540, w=1000, size=96, at=tw('市政府', 0, 2.8), big=True)
    return s


def S21():
    s = 开('S21', '那拿什么还？')
    a, b, c, d, e = tw('盖出来', 0, 1.5), tw('多出来', 0, 4.5), tw('保留床', -.2, 7.5), tw('字面意思', 0, 9), tw('卖楼的钱', 0, 12)
    字('盖出来的楼', x=150, y=200, w=600, size=44, at=.1, color=MUTED, anim='fade', dur=.2)
    pill('多出来的部分：专门留着卖', 150, 270, at=b, tone='down', size=44, h=130, w=760, sfx='pop')
    pill('一部分：还给原住户', 150, 410, at=max(.3, a - .8), tone='neutral', size=44, h=130, w=760, sfx='pop')
    arrow([(930, 335), (1040, 335)], at=c - .2, dur=.3, width=6, head=20, wobble=0)
    字('保留床', x=1060, y=245, w=700, size=150, at=c, big=True, color=RED)
    sound('hit', c)
    字('字面意思：留着卖钱的楼面', x=1064, y=440, w=700, size=44, at=d)
    步([('卖楼的钱', e, 330), ('＋ 国家的补贴', tw('加上', 0, 13), 400), ('拿去还债', tw('拿去还债', 0, 14), 330)], y=640, h=110, size=50)
    return s


def S23():
    s = 开('S23', '这门生意有个特点')
    字('记住它，后面的事就都好懂了', x=150, y=190, w=1400, size=44, at=.2, color=MUTED)
    a, b = tw('钱是先花', 0, 4), tw('钱是后收', 0, 6.8)
    字('钱是先花的，而且是借的', x=150, y=330, w=1620, size=110, at=0, big=True, color='#C9C2B4', hideAt=a, anim='fade', dur=.2)
    字('钱是后收的，而且主要靠卖楼', x=150, y=560, w=1620, size=110, at=0, big=True, color='#C9C2B4', hideAt=b, anim='fade', dur=.2)
    字('钱是先花的，而且是借的', x=150, y=330, w=1620, size=110, at=a, big=True, color=RED, anim='fade', dur=.3)
    字('钱是后收的，而且主要靠卖楼', x=150, y=560, w=1620, size=110, at=b, big=True, color=NAVY, anim='fade', dur=.3)
    sound('pop', a); sound('pop', b)
    return s


def S24():
    s = 开('S24', '这就像坐出租车')
    a, b, c = tw('债一借', 0, 2), tw('楼卖出去', 0, 5), tw('中间隔', 0, 7)
    图(F('0809-出租车计价器'), box=(150, 190, 760, 440), at=.1)
    字('日本出租车上的计价器', x=150, y=640, w=760, size=32, at=.3, color=MUTED)
    X, Y, Wd = 1010, 200, 740
    表(None, X, Y, Wd, at=.3, 灯='空车', 标='借的债', hideAt=a)
    表(None, X, Y, Wd, at=a, 灯='跳表', 标='借的债：利息在跳', hideAt=b)
    表(None, X, Y, Wd, at=b, 灯='停表', 标='楼卖出去：表才停')
    字('债一借，计价器就开始跳', x=1010, y=650, w=760, size=48, at=a + .2, big=True, color=RED, hideAt=b)
    字('楼卖出去，表才能停', x=1010, y=650, w=760, size=48, at=b + .2, big=True, color=C['green'])
    条('中间隔多少年，表就跳多少年', y=776, at=c, size=46)
    return s


def S25():
    s = 开('S25', '1976 年的计划')
    a, b, c, d = tw('十五年', 0, 2), tw('总花费', 0, 3.5), tw('利息', 0, 7), tw('也就是说', 0, 10)
    行('十五年做完', None, 240, a, size=60, bold=True)
    行('总花费', '约 2220', 370, b, vx=600)
    行('利息（当初估的）', '180', 500, c, color=RED, vx=720)
    表(180, 1050, 210, 700, at=.2, 灯='空车', 标='计划里的利息', 数时=c, dur=.9)
    条('这块表，计划里只打算让它跳 15 年', y=776, at=d, size=46)
    return s


# ---------------------------------------------------------------- 第 4 章
def S28():
    s = 开('S28', '在日本，租户的权利受法律保护得很重')
    图(F('权利人表-官方'), box=(150, 190, 800, 280), at=.1)
    字('大阪市报告里的统计：权利人 3148 人\n其中租地的 8%、租房的 63%', x=150, y=480, w=820, size=36, at=.6, color=MUTED)
    a, b, c, d = tw('地主要谈', 0, 8), tw('在上面盖', 0, 10), tw('租房开店', 0, 13), tw('一块地上', 0, 15)
    X = 1040
    字('政府想买一块地', x=X, y=190, w=720, size=44, at=tw('政府想买', 0, 6.5), big=True)
    pill('地主：要谈', X, 560, at=a, tone='neutral', size=44, h=100, w=720, sfx='pop')
    pill('在上面盖了房子的租地人：要谈', X, 440, at=b, tone='neutral', size=40, h=100, w=720, sfx='pop')
    pill('租房开店的人：还要谈', X, 320, at=c, tone='down', size=44, h=100, w=720, sfx='pop')
    条('一块地上叠着三四层关系，每一层都是一户人家的生计', y=776, at=d, size=42)
    return s


def S30():
    s = 开('S30', '谈不拢，就带出一个顺序问题')
    a, b, c, d = tw('做开发的道理', 0, 3), tw('早卖楼', 0, 6), tw('这片地里', 0, 9), tw('可那一块', 0, 12.5)
    ref = 图(F(官方航拍), box=(980, 172, 790, 696), at=.1, views=[{'at': .1, 'dur': .05, 'view': [0, 0, 803, 899]}, {'at': c - .4, 'dur': 1.4, 'view': [330, 0, 473, 530]}])
    字('做开发的道理：\n最值钱的地要先做', x=150, y=200, w=820, size=64, at=a, big=True)
    字('早卖楼 → 早回款 → 表早点停', x=150, y=400, w=840, size=46, at=b)
    字('最值钱的：\n车站正对面那一块', x=150, y=500, w=840, size=64, at=c, big=True, color=RED)
    circle(ref, [585, 55, 215, 300], at=c + .3, sfx='marker')
    字('可那一块，偏偏最难谈', x=150, y=720, w=840, size=56, at=d, big=True)
    字('1978 年航拍，黄线是改造范围（大阪市报告）；右上角是车站', x=1010, y=140, w=760, size=26, at=.3, color=MUTED)
    return s


def S32():
    s = 开('S32', '范围也越划越大')
    图(F(官方航拍), box=(1010, 172, 760, 696), at=.1)
    a, b, c, d = tw('最初划进来', 0, 2), tw('改了又改', 0, 5), tw('28公顷', -.9, 8), tw('差不多七个', 0, 10)
    字('最初（1976 年）', x=150, y=190, w=700, size=40, at=a, color=MUTED, hideAt=c)
    字('1994 年定下来的', x=150, y=190, w=700, size=40, at=c, color=MUTED)
    counter(7.2, 150, 240, w=560, at=a, static=True, decimals=1, size=150, unit='公顷', hideAt=c)
    counter(28.0, 150, 240, w=560, at=c, dur=.9, from_=7.2, decimals=1, size=150, unit='公顷', color=RED, sfx='tick')
    ys = [('1978', '10.6'), ('1980', '14.6'), ('1981', '20.4'), ('1983', '21.4'), ('1989', '22.1'), ('1994', '28.0')]
    for i, (yr, ha) in enumerate(ys):
        t = b + i * (max(.25, (c + .9 - b) / 6))
        字(f'{yr} 年　{ha} 公顷', x=150 + (i % 2) * 420, y=470 + (i // 2) * 62, w=420, size=38, at=t, color=RED if i == 5 else None, num=False)
    条('差不多七个甲子园球场那么大', x=150, y=700, at=d, size=44, w=800)
    return s


def S33():
    s = 开('S33', '完工时间，跟着往后挪')
    a, b, c = tw('十五年', -.2, 2.2), tw('二十年', -.2, 3.4), tw('三十二年', -.2, 4.8)
    for i, (n, sub, t, col) in enumerate([('15 年', '最初的计划\n（做到 1991 年度）', a, None), ('20 年', '改成\n（做到 1996 年度）', b, None), ('32 年', '再改成\n（做到 2008 年度）', c, RED)]):
        x = 170 + i * 560
        字(n, x=x, y=300, w=470, size=170, at=t, big=True, num=False, color=col)
        字(sub, x=x + 6, y=530, w=464, size=40, at=t + .15, color=MUTED)
        sound('pop', t)
        if i:
            arrow([(x - 110, 400), (x - 30, 400)], at=t - .15, dur=.25, width=6, head=22, wobble=0)
    return s


def S34():
    s = 开('S34', '最后做了 42 年')
    a, b, c = max(.3, tw('四十二年', -.9, .6)), tw('计价器比', 0, 3), tw('而且多跳', 0, 6)
    X, Y, Wd, k = 1010, 200, 740, .74
    表(None, X, Y, Wd, at=0, 灯='跳表', 标='这块表跳了')
    counter(15, X + 250 * k, Y + 232 * k, w=650 * k, at=0, static=True, size=150 * k, color=AMBER, unit='年', align='right', hideAt=a)
    counter(42, X + 250 * k, Y + 232 * k, w=650 * k, at=a, dur=1.0, from_=15, size=150 * k, color=AMBER, unit='年', align='right', sfx='tick')
    行('计划', '15', 240, 0, unit='年', vx=560)
    行('实际', '42', 370, a + 1.0, unit='年', vx=560)
    字('多跳了 27 年', x=260, y=500, w=720, size=96, at=b, big=True, color=RED)
    sound('hit', b)
    条('多跳的这段时间，正好赶上了日本地价最疯的那几年', y=776, at=c, size=44)
    return s


# ---------------------------------------------------------------- 第 5 章
def S36():
    s = 开('S36', '光是买地和补偿这一项')
    a, b, c = min(.9, tw('535', -.5, 2)), tw('2540', -.7, 5), tw('将近五倍', 0, 8)
    statbar('最初的预算', 535, 300, 2700, at=0, color=NAVY, unit_suffix='亿', thick=84, grow_at=a, sfx='tick')
    statbar('后来的预算', 2540, 480, 2700, at=b - .3, color=RED, unit_suffix='亿', thick=84, grow_at=b, sfx='tick')
    字('将近五倍', x=150, y=640, w=900, size=120, at=c, big=True, color=RED)
    sound('hit', c)
    字('单位：亿日元（大阪市报告）', x=1100, y=700, w=670, size=30, at=.4, color=MUTED)
    return s


def S38():
    s = 开('S38', '表还在跳')
    a, b, c, d = tw('当初估的', 0, 4.5), tw('实际付了', 0, 6.5), tw('八倍多', -.2, 9), tw('光是利息', 0, 10.5)
    X, Y, Wd, k = 150, 200, 800, .8
    表(None, X, Y, Wd, at=0, 灯='跳表', 标='利息（亿日元）')
    counter(180, X + 150 * k, Y + 232 * k, w=750 * k, at=a, static=True, size=150 * k, color=AMBER, align='right', hideAt=b)
    counter(1535, X + 150 * k, Y + 232 * k, w=750 * k, at=b, dur=1.6, from_=180, size=150 * k, color=AMBER, align='right', sfx='tick')
    字('几十年的利息，压在中间', x=1010, y=200, w=760, size=48, at=tw('几十年', 0, 1.6), big=True)
    字('当初估的：180 亿', x=1010, y=330, w=760, size=50, at=a)
    字('实际付了：一千五六百亿', x=1010, y=420, w=760, size=50, at=b + .4, color=RED)
    字('（最新的试算是 1535 亿）', x=1010, y=492, w=760, size=34, at=b + .8, color=MUTED)
    字('八倍多', x=1010, y=550, w=760, size=120, at=c, big=True, color=RED)
    sound('hit', c)
    条('光是利息，就够把当年整个工程的预算（2220 亿）再花掉大半', y=776, at=d, size=40)
    return s


def S39():
    s = 开('S39', '总花费，也翻了一倍多')
    a, b = tw('2220', -.5, .8), tw('四千八百', -.6, 2.6)
    statbar('1976 年的计划', 2220, 320, 5200, at=.1, color=NAVY, shown='2220亿', unit_suffix='亿', thick=84, grow_at=a, sfx='tick')
    statbar('最后', 4797, 500, 5200, at=b - .2, color=RED, shown='约 4800亿', unit_suffix='亿', thick=84, grow_at=b, sfx='tick')
    return s


# ---------------------------------------------------------------- 第 6 章
def S42():
    s, ref = 原文('S42', F('report_p24'), [470, 640, 990, 440], w=1240, y=130, rot=-3, 题文='1994 年定下的方案（大阪市报告里的效果图）',
                views=lambda: [{'at': 0.05, 'dur': .05, 'view': [470, 640, 990, 440]}, {'at': tw('请一家', 0, 5), 'dur': 1.2, 'view': [200, 1105, 990, 440]}],
                划=[([700, 1290, 180, 36], ('请一家', 1.5)), ([700, 1353, 180, 36], ('请一家', 2.2))])
    a = tw('请一家', 0, 5)
    条('方案：一座 63 层、将近 300 米高的超高层（图上盖着「没有实现」）', y=772, at=tw('盖一座', 0, 1.2), size=40, hideAt=a)
    条('请一家大百货公司进驻；照这个方案，卖楼的钱能把前面所有的窟窿填上', y=772, at=a, size=38, w=1620)
    return s


def S47():
    s = 开('S47', '为什么不停？')
    X, Y, Wd, k = 1050, 210, 700, .7
    表(None, X, Y, Wd, at=0, 灯='跳表', 标='已经借了')
    counter(27, X + 250 * k, Y + 232 * k, w=650 * k, at=.3, dur=1.2, from_=0, size=150 * k, color=AMBER, unit='年', align='right', sfx='tick')
    字('停工，并不能让表停下来', x=150, y=200, w=860, size=60, at=tw('因为停工', 0, 1.5), big=True, color=RED)
    rows = [('地已经买了', '地已经'), ('房子已经拆了', '房子已经'), ('原来的住户和店主，等着搬回来', '原来的住户'), ('债一天不停地生利息', '债一天')]
    for i, (t, w_) in enumerate(rows):
        条(t, x=150, y=310 + i * 92, at=tw(w_, 0, 4 + i * 1.5), size=42, w=820)
    a, b = tw('停下来', 0, 11), tw('这是这种做法', 0, 15)
    字('停下来：前面花的钱收不回，后面的人没处安置', x=150, y=690, w=1620, size=44, at=a, big=True)
    条('这种做法最硬的一条约束：地一旦全买下来，工程就只能往完工的方向走', y=776, at=b, size=38, tone='down', w=1620)
    return s


def S48():
    s = 开('S48', '最后接手的：日本的东急不动产')
    a, b = tw('方案从', 0, 3), tw('高度从', 0, 5.2)
    路口(0, 图纸=0.05, 图纸退=a + 1.2)
    楼标('HARUKAS\n300 米', 1540, 150, 0, size=44, color=NAVY)
    楼标('63 层 → 6 层', -110, 230, a, size=80, color=RED, w=520)
    楼标('290 米 → 32 米', -110, 370, b, size=64, color=RED, w=520)
    sound('hit', a); sound('pop', b)
    return s


def S49():
    s = 开('S49', '市里的测算，跟着改了')
    ref = 图(F('report_p19'), view=[193, 372, 1250, 1165], box=(150, 172, 760, 696), at=.1)
    a, b, c, d = tw('预计亏', 0, 2), tw('卖楼收入', 0, 5), tw('从盈余', 0, 10), tw('花出去的', 0, 13.5)
    circle(ref, [1295, 1366, 150, 54], at=a, shape='box', sfx='marker')
    X = 970
    字('2004 年：整个工程', x=X, y=190, w=800, size=44, at=.3)
    字('预计亏 2100 亿', x=X, y=250, w=800, size=84, at=a + .2, big=True, color=RED)
    circle(ref, [640, 920, 110, 52], at=b + .6, shape='box', sfx='marker')
    circle(ref, [1340, 920, 110, 52], at=b + 1.6, shape='box', sfx='marker')
    字('卖楼收入的预估', x=X, y=390, w=800, size=44, at=b)
    字('5300 亿 → 2300 多亿', x=X, y=450, w=800, size=68, at=b + .6, big=True)
    circle(ref, [640, 1366, 110, 54], at=c, shape='box', sfx='marker')
    字('盈余 30 亿 → 亏 2100 亿：前后三年', x=X, y=570, w=800, size=44, at=c, big=True)
    字('花出去的钱差得不多\n是进来的钱少了三千亿', x=X, y=660, w=800, size=56, at=d, big=True, color=RED)
    字('大阪市报告：2001 年 11 月公布的（左）和 2004 年 11 月公布的（右）', x=150, y=140, w=900, size=26, at=.3, color=MUTED)
    return s


# ---------------------------------------------------------------- 第 7 章
def S52():
    s = 开('S52', '2025 年 2 月：市里按最新情况又算了一遍')
    图(F('官方-收支表-1'), view=[230, 90, 1300, 1130], box=(150, 172, 800, 696), at=.1)
    字('就是这次新闻里的数字', x=1010, y=260, w=760, size=60, at=tw('就是这次', 0, 3), big=True)
    字('大阪市官方页面\n「事业的收支状况」', x=1010, y=380, w=760, size=40, at=tw('就是这次', .4, 3.4), color=MUTED)
    字('我把这张表\n念成大白话', x=1010, y=560, w=760, size=84, at=tw('我把', 0, 5.5), big=True, color=RED)
    return s


def _账(sid, 段):
    T1 = {1: '花出去的', 2: '收回来的', 3: '一出一进'}[段]
    s = 开(sid, '这张表，念成大白话：' + T1)
    L, LV, R_, RV = 150, 520, 900, 1420
    st = lambda n: 0 if 段 > n else None
    # 花出去
    a0 = st(1)
    字('花出去的', x=L, y=190, w=600, size=44, at=0, big=True, color=RED, anim='fade', dur=.2)
    行('工程本身', '4797', 280, 0 if a0 == 0 else tw('工程本身', 0, 1.5), x=L, vx=LV)
    行('借款利息', '1535', 380, 0 if a0 == 0 else tw('借款利息', 0, 4), x=L, vx=LV)
    行('加起来', '6332', 500, 0 if a0 == 0 else tw('加起来', 0, 6.5), x=L, vx=LV, bold=True, color=RED)
    if 段 >= 2:
        a1 = st(2)
        字('收回来的', x=R_, y=190, w=600, size=44, at=0, big=True, color=NAVY, anim='fade', dur=.2)
        行('国家和市里的补助金', '1879', 280, 0 if a1 == 0 else tw('国家和市里', 0, 1.5), x=R_, vx=RV, size=46)
        行('卖楼等收入', '2280', 370, 0 if a1 == 0 else tw('卖楼等收入', 0, 4.5), x=R_, vx=RV, size=46)
        行('市财政早年转进来的', '190', 460, 0 if a1 == 0 else tw('再加上', 0, 7), x=R_, vx=RV, size=46)
        行('加起来', '4349', 560, 0 if a1 == 0 else tw('加起来', 0, 10), x=R_, vx=RV, bold=True, color=NAVY)
    if 段 == 3:
        a, b, c = tw('差了', 0, 1.2), tw('市里手上', 0, 3.5), tw('最终的', 0, 8)
        字('一出一进，差了将近两千亿', x=L, y=660, w=720, size=44, at=a)
        字('手上还留着的楼和地：约 160 亿', x=L, y=730, w=720, size=44, at=b)
        字('最终的收支不足', x=R_, y=660, w=700, size=44, at=c, big=True)
        counter(1822, R_, 710, w=820, at=c + .3, dur=1.0, from_=1983, size=140, color=RED, prefix='约 ', unit='亿日元', sfx='tick')
    return s


def S53(): return _账('S53', 1)
def S54(): return _账('S54', 2)
def S55(): return _账('S55', 3)


def S56():
    s = 开('S56', '表上还有两行我没念')
    ref = 图(F('官方-收支表-1'), view=[288, 154, 714, 966], box=(150, 172, 560, 696), at=.1)
    a, b, c = tw('借来的钱', 0, 2.5), tw('和还掉', 0, 4), tw('基本对冲', 0, 6)
    circle(ref, [420, 781, 580, 78], at=a, shape='box', sfx='marker')
    circle(ref, [420, 442, 580, 76], at=b, shape='box', sfx='marker')
    字('借来的钱：4224 亿', x=800, y=260, w=960, size=64, at=a, big=True)
    字('还掉的本金：4223 亿', x=800, y=390, w=960, size=64, at=b, big=True)
    字('基本对冲', x=800, y=540, w=960, size=110, at=c, big=True, color=NAVY)
    return s


def S57():
    s = 开('S57', '现在可以回答开头的问题了')
    t0, t1, t2, t3 = tw('一栋楼没盖成', 0, 3), tw('因为这门生意', 0, 7), tw('前面将近', 0, 11), tw('它从63层', 0, 17)
    路口(0, 图纸=t0, 图纸退=t3 + .6)
    楼标('HARUKAS\n300 米', 1540, 150, 0, size=44, color=NAVY)
    字('回款的大头\n只有一处：卖楼', x=150, y=180, w=460, size=46, at=t1, big=True, color=RED)
    for i, (t, w_) in enumerate([('近 30 年借的钱', '前面将近'), ('付的利息', '付的利息'), ('高价买进来的地', '高价买进来')]):
        条(t, x=150, y=340 + i * 88, at=tw(w_, 0, 11 + i), size=38, w=400, hideAt=t3 + .6)
    a = tw('都在等', 0, 14.5)
    arrow([(540, 470), (612, 470)], at=a, dur=.3, width=6, head=20, wobble=0, hideAt=t3 + .6)
    字('都在等这栋楼来还', x=150, y=616, w=420, size=38, at=a, big=True, hideAt=t3 + .6)
    楼标('63 层 → 6 层', -110, 230, t3 + .6, size=76, color=RED, w=520)
    条('前面的窟窿，就没有别的东西可以填了', y=776, at=tw('前面的窟窿', 0, 19), size=44, tone='down')
    sound('hit', t3 + .6)
    return s


def S58():
    s = 开('S58', '再看两个数字')
    a, b, c, d = min(1.2, tw('1822', -.6, 2)), tw('1535', -.6, 5.5), tw('相当于', 0, 7.5), tw('那块多跳', 0, 9.5)
    statbar('最终的亏空', 1822, 250, 2000, at=0, color=RED, unit_suffix='亿', thick=80, grow_at=a, sfx='tick')
    statbar('利息一项', 1535, 410, 2000, at=b - .2, color=C['gold'], value_color=C['ink'], unit_suffix='亿', thick=80, grow_at=b, sfx='tick')
    条('两个数放在一起比大小：利息相当于亏空的八成多', x=150, y=590, at=c, size=40, w=960)
    字('那块多跳了 27 年的表\n分量就在这里', x=150, y=700, w=960, size=50, at=d, big=True)
    表(1535, 1180, 560, 560, at=d, 灯='跳表', 标='利息（亿日元）', static=True, 单位=None)
    return s


def S60():
    s = 开('S60', '不过，它不是一张刚寄到的新账单')
    ref = 图(F('官方-还债注-1'), view=[260, 165, 1420, 160], box=(150, 200, 1620, 240), at=.1)
    a, b, c, d = tw('这些年', 0, 3.5), tw('到2023', 0, 8), tw('2017年那会儿', 0, 12), tw('后来是', 0, 15.5)
    字('这些年：每年从预算里拨一笔钱，还这个工程的债', x=150, y=510, w=1620, size=44, at=a)
    字('到 2023 年度：还债要用的钱，已经全部安排完了', x=150, y=590, w=1620, size=52, at=b, big=True, color=RED)
    字('2017 年那会儿的报道：要还到 2030 年代初', x=150, y=690, w=1620, size=44, at=c)
    条('后来是提前结束的', x=150, y=770, at=d, size=44, w=620, tone='up')
    return s


def S63():
    s = 开('S63', '市里那份报告，把原因归成三条')
    图(F('官方-三条原因-1'), view=[260, 370, 1420, 450], box=(150, 176, 1620, 330), at=.1)
    for i, (t, w_) in enumerate([('① 工期拖得太长', '工期拖'), ('② 经济形势变了：花费涨了，楼又长期卖不掉', '经济形势'), ('③ 开头那几年和形势剧变的时候，管理没跟上', '开头那几年')]):
        条(t, x=150, y=520 + i * 104, at=tw(w_, 0, 3 + i * 3), size=44, w=1620)
    return s


# ---------------------------------------------------------------- 第 8 章
def S74():
    s, ref = 原文('S74', F('雅虎-标题-3'), [290, 440, 1350, 330], w=1480, y=150, rot=-3, 题文='新闻底下吵的，就是这两面',
                划=[([563, 480, 430, 52], '把故乡还给我')])
    a, b, c = tw('一边觉得', 0, 2.5), tw('把故乡还给我', 0, 9), tw('说这话的', 0, 10.5)
    字('一边觉得：街比以前好了', x=150, y=600, w=1620, size=60, at=a, big=True, photo=True)
    字('另一边：「把故乡还给我」', x=150, y=685, w=1620, size=60, at=b, big=True, color='#FFD75E')
    条('说这话的，是一位在金塚长大的人，在酒桌上说的', y=790, at=c, size=40)
    return s


# ---------------------------------------------------------------- 第 9 章
def S79():
    s = 开('S79', '它的问题，出在办法上')
    a, b, c, d = tw('这套办法', 0, 2.5), tw('实际上', 0, 8), tw('要进驻', 0, 12.5), tw('世界不会变', -.2, 6)
    字('这套办法默认了一件事', x=150, y=200, w=900, size=44, at=a, color=MUTED)
    字('从借钱到卖楼的 15 年里', x=150, y=270, w=900, size=60, at=a + .4, big=True)
    字('世界不会变', x=150, y=360, w=900, size=120, at=d, big=True, color=RED)
    sound('hit', d)
    条('实际上：光是地价就变了两回（先涨上天，再跌回来）', x=150, y=580, at=b, size=40, w=1050)
    条('要进驻的商家，前后换了三拨', x=150, y=690, at=c, size=40, w=1050)
    表(15, 1240, 210, 520, at=.3, 灯='空车', 标='计划里的表', static=True, 单位='年')
    return s


def S80():
    s = 开('S80', '2017 年那份报告之后')
    图(F('风险会议-2'), view=[0, 0, 2560, 700], box=(150, 180, 1620, 330), at=.1)
    a, b, c = tw('请会计师', 0, 4), tw('这个会现在', 0, 9.5), tw('官方文件里', 0, 11.5)
    字('大阪市专门设了一个会议（大规模事业风险管理会议）', x=150, y=530, w=1620, size=40, at=tw('大阪市专门', 0, 2), color=MUTED)
    字('请会计师、律师、学者这些外面的人\n定期盯着市里花钱最多的大工程', x=150, y=590, w=1200, size=48, at=a, big=True)
    字('这个会\n现在还在开', x=1370, y=590, w=400, size=48, at=b, big=True, color=RED)
    条('官方文件里的固定说法：「阿倍野再开发的教训」', y=776, at=c, size=42)
    return s


def _问(sid, n):
    s = 开(sid, '看大工程，先问三个问题')
    Q = [('第一，钱是不是借的', '借的钱，有表在跳', '借的钱'), ('第二，回款排在第几年', '排得越靠后，中间能变的事就越多', '排得越'),
         ('第三，中途情况变了，能不能停、能不能改小', '阿倍野讨论过停，结论是接着做', '阿倍野讨论')]
    for i in range(3):
        cur = i == n - 1
        y = 210 + i * 220
        字(Q[i][0], x=150, y=y, w=1300, size=64, at=0, big=True, color=RED if cur else MUTED, anim='fade', dur=.2)
        if i < n:
            字(Q[i][1], x=156, y=y + 96, w=1300, size=44, at=tw(Q[i][2], 0, 2) if cur else 0, color=None if cur else MUTED, anim='fade' if not cur else 'up', dur=.3)
    if n == 1:
        表(None, 1250, 180, 520, at=tw('借的钱', 0, 2), 灯='跳表', 标='利息在跳')
    return s


def S82(): return _问('S82', 1)
def S83(): return _问('S83', 2)
def S84(): return _问('S84', 3)


def S86():
    s = 开('S86', '马路两边，都看一眼')
    a, b, c = tw('一边是300米', 0, .3), tw('另一边', 0, 3.5), tw('按最早', 0, 6)
    路口(0, 图纸=c)
    楼标('HARUKAS · 300 米\n近铁自己盖的', 1540, 150, a, size=40, color=NAVY)
    楼标('6 层的 Q\'s Mall', 430, 815, b, size=38, color=RED)
    楼标('按最早的图纸：\n这一边也该有一栋\n差不多高的楼', -110, 230, c + .3, size=44, color=RED, w=520)
    return s


def S75():
    """同一取景的航拍跨年代叠化（大时：跨年代用同一个物件接）：先今天，念到「从前」叠回 1970 年代。"""
    s = 开('S75', None, photo=True, chapter_mark=False)
    角标(0, photo=True)
    a, b = tw('一个说的是现在', 0, 2.2), tw('一个说的是从前', 0, 4.2)
    photocard(F('航拍裁-最新'), x=0, y=0, w=1920, at=0, rot=0, border=0, style='plain', enter='none', z=6, cls='noshadow',
              views=[{'at': 0, 'dur': .05, 'view': [0, 0, 1920, 1080]}, {'at': .1, 'dur': max(2.0, s.dur), 'view': [60, 34, 1800, 1012]}])
    photocard(F('航拍裁-1974'), x=0, y=0, w=1920, at=b - .3, rot=0, border=0, style='plain', enter='fade', enter_dur=1.2, z=7, cls='noshadow', sfx='whoosh',
              views=[{'at': 0, 'dur': .05, 'view': [0, 0, 1920, 1080]}, {'at': .1, 'dur': max(2.0, s.dur), 'view': [60, 34, 1800, 1012]}])
    _S().add('scrim', 0, 0, 1300, 1008, at=0, cls='left', anim='fade', dur=.2, z=8)
    题('两边说的，是同一条街', at=0, photo=True)
    字('同一片地方 · 国土地理院航拍', x=152, y=136, w=1200, size=34, at=0, photo=True)
    字('现在', x=150, y=330, w=800, size=150, at=a, big=True, photo=True, hideAt=b + .4)
    字('1970 年代', x=150, y=330, w=900, size=150, at=b + .4, big=True, photo=True, num=False)
    return s
