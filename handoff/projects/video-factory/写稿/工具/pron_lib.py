# -*- coding: utf-8 -*-
"""读音工具库（不加载模型，纯文本）：永久词典、本期读音表、配音前的风险词扫描。
被 api配音.py、读音预检.py、读音点检.py 共用。

analyze(text, table) 返回：
  pins   要随配音一起发给 MiniMax 的读音词典条目（['重建/(chong2)(jian4)', …]）
  points 每个风险点：位置、词、期望读音、来源、状态（已定 / 自动 / 待定）
  todo   状态是「待定」的点——有待定就不该花钱配音
  warns  不拦截的提醒（剩余数字、字母、读音不在该字常见读法里……）
"""
import re
from pathlib import Path
from pypinyin import pinyin, Style
from pypinyin.constants import PHRASES_DICT
import jieba
import jieba.posseg as pseg

jieba.setLogLevel(60)
DICT = Path(__file__).with_name('读音词典.tsv')
TAX = Path.home() / 'video-projects/manga-video/config/pron-overrides.json'
ST = dict(style=Style.TONE3, neutral_tone_with_five=True)
SYL = re.compile(r'\(([a-zü:]+[1-5])\)')
HAN = re.compile(r'[一-鿿]')
CLAUSE_END = '，。！？；：\n…—,!?;:'

# 多音字 → 模型不看上下文时最可能念的读法（None = 两种都常见，没有默认）。预测读法和它不同，或者没有默认，就钉住。
RISK = {
    '重': 'zhong4', '长': 'chang2', '行': 'xing2', '还': 'hai2', '得': 'de2', '差': None, '当': 'dang1', '调': None,
    '空': 'kong1', '倒': None, '量': 'liang4', '干': None, '数': 'shu4', '藏': 'cang2', '转': 'zhuan3', '传': 'chuan2',
    '弹': 'tan2', '担': 'dan1', '载': 'zai4', '涨': 'zhang3', '钻': None, '晃': None, '挑': 'tiao1', '扎': 'zha1',
    '冲': 'chong1', '卷': 'juan3', '铺': 'pu1', '散': 'san4', '削': 'xue1', '咽': 'yan4', '晕': 'yun1', '塞': 'sai1',
    '折': 'zhe2', '曲': 'qu1', '降': 'jiang4', '朝': 'chao2', '盛': 'sheng4', '宿': 'su4', '乐': 'le4', '落': 'luo4',
    '薄': 'bao2', '血': 'xue4', '壳': 'ke2', '强': 'qiang2', '假': 'jia3', '教': 'jiao4', '兴': 'xing1', '种': 'zhong3',
    '将': 'jiang1', '尽': 'jin4', '禁': 'jin4', '劲': 'jin4', '蒙': 'meng2', '宁': 'ning2', '丧': 'sang4', '舍': 'she3',
    '吐': 'tu3', '鲜': 'xian1', '处': None, '奔': 'ben1', '冠': 'guan4', '横': 'heng2', '划': 'hua4', '混': 'hun4',
    '夹': 'jia1', '累': 'lei4', '磨': 'mo2', '泊': 'bo2', '喷': 'pen1', '扇': 'shan4', '轧': 'ya4', '炸': 'zha4',
    '占': 'zhan4', '背': 'bei4', '中': 'zhong1', '应': 'ying1', '供': 'gong1', '挨': 'ai1', '刹': 'sha1', '校': 'xiao4',
    '模': 'mo2', '相': 'xiang1', '间': 'jian1', '分': 'fen1', '看': 'kan4', '少': 'shao3', '好': 'hao3', '觉': 'jue2',
    '率': 'lv4', '便': 'bian4', '号': 'hao4', '结': 'jie2', '难': 'nan2', '省': 'sheng3', '似': 'si4', '角': 'jiao3',
    '解': 'jie3', '露': 'lu4', '熟': 'shu2', '属': 'shu3', '载': 'zai4', '著': 'zhu4', '答': 'da2', '恶': 'e4',
    '缝': 'feng2', '给': 'gei3', '几': 'ji3', '济': 'ji4', '监': 'jian1', '壳': 'ke2', '勒': 'le4', '笼': 'long2',
    '抹': 'mo3', '脉': 'mai4', '蔓': 'man4', '泌': 'mi4', '粘': 'zhan1', '炮': 'pao4', '片': 'pian4', '翘': 'qiao4',
    '切': 'qie1', '色': 'se4', '什': 'shen2', '拓': 'tuo4', '吓': 'xia4', '旋': 'xuan2', '殷': 'yin1', '熨': 'yun4',
    '殖': 'zhi2', '轴': 'zhou2', '幢': 'zhuang4', '作': 'zuo4', '压': 'ya1', '踏': 'ta4', '系': 'xi4', '堡': 'bao3',
    '暴': 'bao4', '剥': 'bo1', '伯': 'bo2', '参': 'can1', '曾': 'ceng2', '颤': 'chan4', '场': 'chang3', '车': 'che1',
    '臭': 'chou4', '畜': 'chu4', '创': 'chuang4', '撮': 'cuo1', '囤': 'tun2', '度': 'du4', '坊': 'fang1', '荷': 'he2',
    '哄': 'hong3', '豁': 'huo1', '嚼': 'jiao2', '龟': 'gui1', '卡': 'ka3', '拉': 'la1', '淋': 'lin2', '埋': 'mai2',
    '闷': 'men4', '秘': 'mi4', '尿': 'niao4', '刨': 'pao2', '屏': 'ping2', '瀑': 'pu4', '栖': 'qi1', '圈': 'quan1',
    '任': 'ren4', '撒': 'sa3', '厦': 'sha4', '识': 'shi2', '遂': 'sui4', '提': 'ti2', '帖': 'tie3', '委': 'wei3',
    '尾': 'wei3', '纤': 'xian1', '巷': 'xiang4', '肖': 'xiao1', '叶': 'ye4', '遗': 'yi2', '荫': 'yin1', '择': 'ze2',
}
# 单独成词时也要问一句的字（常见的少数读法本身就是一个词：还钱的还、得去的得、空着的空……）
HOT = set('重长行差当调空倒量干数藏转传弹担载钻晃挑扎卷铺散削塞折曲朝盛乐落薄壳假教种将尽蒙吐处划夹累磨背炸兴')
JP = set('町畷埼咲丼辻峠畑榊堺笹栃薙糀籾苅塙圷垰')      # 日本地名、和制汉字：没在词典里就要定
MEASURE_PREV = set('一二两三四五六七八九十百千几这那哪各某每多同此')       # 「两种」「这种」的种不用问
DEI_PREV = set('还都就也又总只非必才可要便你我他她它们人')


def sylls(s):
    return SYL.findall(s.replace('ü', 'v'))


def fmt(sy):
    return ''.join(f'({x})' for x in sy)


def readings(c):
    """这个字的全部读法（拼音+声调数字），常见的在前。不认识的字返回 []。"""
    r = pinyin(c, heteronym=True, **ST)[0]
    return [x for x in r if x and x[-1].isdigit()]


def predict(text):
    """按上下文预测每个汉字的读法。返回 {文本位置: 读法}。"""
    out = {}
    for m in re.finditer(r'[一-鿿]+', text):
        ps = pinyin(m.group(), **ST)
        if len(ps) == len(m.group()):
            for k, p in enumerate(ps):
                out[m.start() + k] = p[0]
    return out


def _rows(path):
    for n, line in enumerate(Path(path).read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        cols = [c.strip() for c in line.split('\t')] + ['', '', '']
        word, syl = cols[0], sylls(cols[1])
        if not word or len(syl) != len(word):
            raise SystemExit(f'{path} 第 {n} 行：「{word}」{len(word)} 个字，读音给了 {len(syl)} 个（每个字一个括号）')
        yield word, syl, cols[2], cols[3]


def load_dict(path=DICT):
    """永久词典 → [{word, syl, scope('通用'/'看语境'), note}]"""
    out = []
    for word, syl, scope, note in _rows(path):
        if scope not in ('通用', '看语境'):
            raise SystemExit(f'{path}：「{word}」的范围要写 通用 或 看语境')
        out.append(dict(word=word, syl=syl, scope=scope, note=note))
    have = {e['word'] for e in out}
    if Path(path) == DICT and TAX.exists():          # 税务图解那条线的读音表也算数（只读，不改它）；同一个词以本词典为准
        import json
        for w, py in json.loads(TAX.read_text(encoding='utf-8')).get('words', {}).items():
            syl = py.split()
            if w in have or len(syl) != len(w):
                continue
            loose = len(w) <= 2 and (w[0] in '的是就用地' or w == '当了')      # 「的差」「当了」这种两个字的，换个上下文就不对
            out.append(dict(word=w, syl=syl, scope='看语境' if loose else '通用', note='税务图解读音表'))
    return out


def load_table(path):
    """本期读音表（配音/读音.tsv）：词	读音	方式	备注。方式：钉（默认）/ 不钉（只点检不发给接口）/ 钉+通用 / 钉+看语境（顺便入库）。"""
    out = []
    if path and Path(path).exists():
        for word, syl, how, note in _rows(path):
            how = how or '钉'
            if how not in ('钉', '不钉', '钉+通用', '钉+看语境'):
                raise SystemExit(f'{path}：「{word}」的方式要写 钉 / 不钉 / 钉+通用 / 钉+看语境')
            out.append(dict(word=word, syl=syl, how=how, note=note))
    return out


def find_table(*paths):
    """从文本或录音的位置往上找本期读音表 配音/读音.tsv。"""
    for p in paths:
        p = Path(p).resolve()
        for d in list(p.parents)[:3]:
            if (d / '读音.tsv').exists():
                return d / '读音.tsv'
    return None


def _occ(text, word):
    i = text.find(word)
    while i >= 0:
        yield i
        i = text.find(word, i + 1)


def _ctx(text, a, b, n=9):
    return (text[max(0, a - n):a] + '【' + text[a:b] + '】' + text[b:b + n]).replace('\n', ' ')


def alts(c, expect):
    """这个字除了期望读法以外，还可能被念成什么（最多 3 个）。"""
    if c in '一不':
        return []
    return [r for r in readings(c) if r != expect][:3]


def _phrase(text, k, starts):
    """位置 k 的字所在的常见词（拼音库或分词词表里有、两头都落在词边界上的，最长的优先）。返回 (起点, 词) 或 None。"""
    for n in (4, 3, 2):
        for i in range(k - n + 1, k + 1):
            sub = text[i:i + n] if i >= 0 else ''
            if len(sub) == n and i in starts and i + n in starts and (sub in PHRASES_DICT or jieba.dt.FREQ.get(sub, 0) > 0) \
                    and all(HAN.match(x) for x in sub):
                return i, sub
    return None


def _adverbial(toks, ti):
    """「地」是不是结构助词：前面是形容词、副词、叠词或成语，后面跟动词（「一处一处地修」「慢慢地走」）。"""
    if ti == 0 or ti + 1 >= len(toks):
        return False
    pw, pf, _ = toks[ti - 1]
    nf = toks[ti + 1][1]
    redup = len(pw) >= 2 and (pw[:len(pw) // 2] == pw[len(pw) // 2:] or len(set(pw)) < len(pw))
    return (pf[:1] in 'adzli' or redup) and nf[:1] in 'vdp'


def analyze(text, table=()):
    pred = predict(text)
    toks, pos = [], 0
    for w in pseg.cut(text):
        toks.append((w.word, w.flag, pos))
        pos += len(w.word)
    starts = {p for _, _, p in toks} | {pos}
    d_all = load_dict()
    confirmed = {e['word'] for e in table}
    active = [dict(e, src='本期', pin=e['how'] != '不钉') for e in table]
    active += [dict(e, src='词典', pin=True) for e in d_all if e['scope'] == '通用' and e['word'] not in confirmed]
    pending = [e for e in d_all if e['scope'] == '看语境' and e['word'] not in confirmed]
    active.sort(key=lambda e: (-len(e['word']), e['src'] != '本期'))        # 长的优先，本期优先

    cover, points, todo, warns = {}, [], [], []
    for e in active:
        for i in _occ(text, e['word']):
            j = i + len(e['word'])
            if any(k in cover for k in range(i, j)):
                clash = [k for k in range(i, j) if k in cover and cover[k][0] != e['syl'][k - i]]
                if clash:
                    warns.append(f'「{e["word"]}」和别的条目重叠且读音不同：{_ctx(text, i, j)}')
                continue
            for k in range(i, j):
                cover[k] = (e['syl'][k - i], e)
            p = dict(pos=i, word=e['word'], expect=e['syl'], src=e['src'], status='已定', pin=e['pin'], ctx=_ctx(text, i, j))
            # 跨词误伤：这处并不是一个完整的词（比如「严重建筑」里的「重建」），而且预测读法和条目不一样
            if e['src'] == '词典' and (i not in starts or j not in starts):
                bad = [text[k] for k in range(i, j) if len(readings(text[k])) > 1 and text[k] not in JP
                       and pred.get(k) and pred[k] != e['syl'][k - i]]
                if bad:
                    p.update(status='待定', kind='跨词', hint=f'词典条目「{e["word"]}」在这里可能不成词；在本期读音表里写一个更长的词组把这处的读音定下来')
            for k in range(i, j):
                c, s = text[k], e['syl'][k - i]
                if s[:-1] not in {r[:-1] for r in readings(c)} and c not in JP and readings(c):
                    warns.append(f'「{e["word"]}」里「{c}」写的是 {s}，不在常见读法 {readings(c)[:4]} 里（专名可以不管）')
            points.append(p)
    used = {}
    for p in points:
        if p['status'] == '已定' and p['pin']:
            used[p['word']] = p['expect']

    for e in pending:
        for i in _occ(text, e['word']):
            j = i + len(e['word'])
            if all(k in cover for k in range(i, j)):
                continue
            points.append(dict(pos=i, word=e['word'], expect=e['syl'], src='词典·看语境', status='待定', kind='看语境', pin=False,
                               ctx=_ctx(text, i, j), hint=f'词典建议 {fmt(e["syl"])}（{e["note"]}）；确认后写进本期读音表'))
            for k in range(i, j):
                cover.setdefault(k, (e['syl'][k - i], e))

    auto = {}
    for ti, (w, flag, s) in enumerate(toks):
        prev = toks[ti - 1][0] if ti else ''
        for k in range(s, s + len(w)):
            c = text[k]
            if k in cover or not HAN.match(c):
                continue
            p = pred.get(k)
            if c in JP:
                points.append(dict(pos=k, word=c, expect=[p] if p else [], src='扫描', status='待定', kind='日本地名', pin=False,
                                   ctx=_ctx(text, k, k + 1), hint='日本地名用字，词典里没有；把所在的地名写进本期读音表'))
            elif c == '地' and len(w) == 1 and _adverbial(toks, ti):
                points.append(dict(pos=k, word=c, expect=['de5'], src='扫描', status='待定', kind='助词地', pin=False,
                                   ctx=_ctx(text, k, k + 1), hint='结构助词「地」应读 de5；把前面的词连「地」一起写进本期读音表'))
            elif c == '得' and len(w) == 1 and (flag.startswith('v') or (prev and prev[-1] in DEI_PREV)):
                points.append(dict(pos=k, word=c, expect=['dei3'], src='扫描', status='待定', kind='得', pin=False,
                                   ctx=_ctx(text, k, k + 1), hint='「得」在这里是「必须」(dei3) 还是「得到」(de2)？连前后的字写成词组'))
            elif c == '还' and len(w) == 1 and not flag.startswith('d') and not flag.startswith('c'):
                points.append(dict(pos=k, word=c, expect=['huan2'], src='扫描', status='待定', kind='还', pin=False,
                                   ctx=_ctx(text, k, k + 1), hint='「还」在这里像动词（huan2）？连前后的字写成词组'))
            elif c in RISK and p and p[-1] != '5' and len(readings(c)) > 1:
                ph = _phrase(text, k, starts)
                if ph:
                    i0, sub = ph
                    r = pinyin(sub, **ST)[k - i0][0]
                    if RISK[c] is None or r != RISK[c]:
                        auto.setdefault(sub, []).append(i0)
                elif c in HOT and not (c == '种' and k and text[k - 1] in MEASURE_PREV):
                    points.append(dict(pos=k, word=c, expect=[p], src='扫描', status='待定', kind='多音字', pin=False,
                                       ctx=_ctx(text, k, k + 1), hint=f'预测 {p}，其他读法 {alts(c, p)}；把这处的词组写进本期读音表'))
    for w, ss in auto.items():
        if '一' in w or '不' in w:
            continue
        syl = [x[0] for x in pinyin(w, **ST)]
        ok = all([pred.get(i + k) for k in range(len(w))] == syl for i in _occ(text, w))
        for i in _occ(text, w):
            if any(k in cover for k in range(i, i + len(w))):
                continue
            if ok:
                points.append(dict(pos=i, word=w, expect=syl, src='自动', status='自动', pin=True, ctx=_ctx(text, i, i + len(w))))
                used[w] = syl
            elif i in ss:
                points.append(dict(pos=i, word=w, expect=syl, src='扫描', status='待定', kind='多音字', pin=False, ctx=_ctx(text, i, i + len(w)),
                                   hint=f'常见词，预测 {fmt(syl)}，但同一写法在本章别处读法不同；写成更长的词组'))

    digits = sorted(set(re.findall(r'\d[\d.,%]*', text)))
    if digits:
        warns.append('还有阿拉伯数字（读法不受控，建议在配音文本里改成汉字）：' + ' '.join(digits[:12]))
    latin = sorted(set(re.findall(r'[A-Za-z]{2,}', text)))
    if latin:
        warns.append('还有字母词：' + ' '.join(latin[:12]))
    if re.search(r'[぀-ヿ]', text):
        warns.append('有假名：MiniMax 会把整章念成日语腔，必须去掉')
    points.sort(key=lambda p: p['pos'])
    for p in points:
        p['alts'] = [alts(text[p['pos'] + k], s) if p['pos'] + k < len(text) else [] for k, s in enumerate(p['expect'])]
    todo = [p for p in points if p['status'] == '待定']
    pins = [f'{w}/{fmt(s)}' for w, s in sorted(used.items())]
    return dict(pins=pins, points=points, todo=todo, warns=warns)


def promote(table):
    """本期读音表里标了「钉+通用 / 钉+看语境」的条目写进永久词典。返回新加的词。"""
    have = {e['word']: e for e in load_dict()}
    add = []
    for e in table:
        if '+' in e['how'] and e['word'] not in have:
            add.append(f"{e['word']}\t{fmt(e['syl'])}\t{e['how'].split('+')[1]}\t{e['note']}")
    if add:
        with open(DICT, 'a', encoding='utf-8') as h:
            h.write('\n'.join(add) + '\n')
    return [a.split('\t')[0] for a in add]
