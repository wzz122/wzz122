# -*- coding: utf-8 -*-
"""配音后的读音点检（模型，一个进程、一次加载、逐章串行）：对预检定下读音的每个风险点，听录音更像「期望读法」还是「别的读法」。

为什么不用整章转写比对：转写会按上下文把读错的音写回正确的字（声调错、多音字错都看不出来）。
这里的做法：在风险点所在的那半句上，把这个字换成「只有这一种读法的同音字」，期望读法和另一种常见读法各换一组，
让 Whisper 解码器分别打分（对数概率）；再把这个词的声音盖成静音打一次分，扣掉文字本身的偏向（基准校正）。

两类错分开查（2026-11-16 对照测试：同一段文本配读音钉对、故意钉错两版，26 个词；另加日本桥小学两章真实录音 38 个点）：
  1. 读成另一个音节的（行 hang/xing、还 huan/hai、调 diao/tiao、长 chang/zhang、重 chong/zhong）：同音字打分 + 基准校正，不花钱。
     钉错版 7 个全部标出；读对的 26 个点没有误标「读错」，3 个标「可疑」。
  2. 只差声调的（空 kong4/kong1、处 chu3/chu4、数 shu4/shu3、假 jia4/jia3……）和找不到同音字的（得 dei3）：加 --参照。
     让 MiniMax 把那半句各配一版——读音钉对的、钉成另一种读法的——再看真实录音的分数贴近哪一版（同一句话比，文字的偏向抵消）。
     19 个词里 10 个比得出来：钉错版 10 个全部判「声调读错」，钉对版 9 个过、1 个「可疑」，没有判反的。
     另外 9 个两段参照自己就拉不开（多半是 MiniMax 没照错的读音念），记「声调未核对」。
     真实两章 28 个声调点：20 个过、8 个未核对、没有标读错的。
     花钱：每个声调点两段半句，两章（1750 字）约 0.15 美元，大约是配音费的四五成；有缓存，同一句不重复扣。
  3. 光看音高走势自动判声调不行（钉对的也标、钉错的也漏），走势只留在 json 里备查。
  标「读错 / 声调读错」的重配一次再点检；同一处连续两次都标，列入人工听清单，不要无限重配。

用法（内存锁钩子认得这个脚本，会自动套锁，直接跑；报 75 就等）：
  python3 读音点检.py 配音/读音 --参照 原始/ch01-v1.wav:文本/ch01-tts.txt …           # --参照上限 1.0（美元，默认）
  python3 读音点检.py 配音/读音 原始/ch01-v1.wav:文本/ch01-tts.txt --只列            # 不加载模型，只看会查哪些点
输出 chNN.点检.json 和一行汇总；有「读错」「声调读错」或定位失败时退出码 1（「可疑」只提醒）。
读错的句子：python3 api配音.py 文本/chNN-tts.txt 原始/chNN-v2.wav --基于 原始/chNN-v1.wav --重配句 <句号>，再点检一次。
分数差的门槛见 PASS / FAIL（2026-11-16 用故意钉错读音的对照录音校出来的）。"""
import sys, os, re, json, difflib, argparse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pron_lib as P
import jieba

REF_GAP, REF_PASS, REF_FAIL = 2.0, 0.6, 0.45     # 参照比对：两段参照至少差这么多才算数；贴近读对参照 ≥ PASS 过，≤ FAIL 读错
PASS, FAIL = -0.5, -1.5         # 校正后的差 ≤ FAIL 读错（退出码 1）；FAIL～PASS 之间只提醒；其余算过
SENT = re.compile(r'[^。！？!?…\n]+[。！？!?…]*[”」』"]*')      # 和 api配音.py 的切句一致


def homophones():
    jieba.initialize()
    mono, prim = {}, {}
    for c, f in sorted(((c, f) for c, f in jieba.dt.FREQ.items() if len(c) == 1 and P.HAN.match(c) and f > 0), key=lambda x: -x[1]):
        rs = P.readings(c)
        if not rs:
            continue
        (mono if len(rs) == 1 else prim).setdefault(rs[0], []).append(c)
    return mono, prim


def pick(table, s, avoid, n=3):
    mono, prim = table
    cs = [c for c in mono.get(s, []) if c not in avoid][:n]
    return cs + [c for c in prim.get(s, []) if c not in avoid][:n - len(cs)]


def plausible(c, expect):
    """这个字真有可能被念成的别的读法：只查出名的多音字，只取最常见的两种读法（冷僻读法不查，只会添误报）。"""
    if c == '地':
        return [r for r in ('di4', 'de5') if r != expect]
    if c not in P.RISK:
        return []
    cand = P.readings(c)[:2] + ([P.RISK[c]] if P.RISK[c] else [])
    return [r for r in dict.fromkeys(cand) if r != expect]


def sentence_no(text, pos):
    n = 0
    for m in SENT.finditer(text):
        if m.group().strip():
            n += 1
            if m.start() <= pos < m.end():
                return n
    return None


def plan(text, table, homo):
    """要查的点：[{pos, word, expect, sent, window(a,b), cands:[{k, alt, exp_texts, alt_texts}]}]"""
    r = P.analyze(text, table)
    pred = P.predict(text)
    out = []
    for p in r['points']:
        if p['status'] == '待定':
            continue
        i, w, E = p['pos'], p['word'], p['expect']
        a = max([text.rfind(x, 0, i) for x in P.CLAUSE_END] + [-1]) + 1
        ends = [text.find(x, i + len(w)) for x in P.CLAUSE_END]
        b = min([e for e in ends if e >= 0] + [len(text) - 1]) + 1
        if len(P.HAN.findall(text[a:b])) < 8:                                  # 半句太短：往前多带一句
            a = max([text.rfind(x, 0, max(a - 1, 0)) for x in P.CLAUSE_END] + [-1]) + 1
        cands = []
        for k, s in enumerate(E):
            nxt = E[k + 1] if k + 1 < len(E) else pred.get(i + len(w), '')
            for alt in plausible(w[k], s):
                if s[-1] == '3' and nxt[-1:] == '3' and alt == s[:-1] + '2':   # 三声连读本来就念成二声，不算读错
                    continue
                ex, al = pick(homo, s, w), pick(homo, alt, w)
                if not al:
                    continue
                kind = 'syl' if ex and alt[:-1] != s[:-1] else 'ref'           # ref = 只差声调，或期望读法找不到同音字（dei3）：要靠参照录音
                mk = lambda c: text[a:i + k] + c + text[i + k + 1:b]
                cands.append(dict(k=k, char=w[k], alt=alt, nxt=nxt, kind=kind, wrong=f'{w}/{P.fmt(E[:k] + [alt] + E[k + 1:])}',
                                  exp_texts=[mk(c) for c in ex or [w[k]]], alt_texts=[mk(c) for c in al]))
        if cands:
            out.append(dict(pos=i, word=w, expect=E, src=p['src'], ctx=p['ctx'], sent=sentence_no(text, i), window=[a, b], cands=cands,
                            clause=text[a:b], right=f'{w}/{P.fmt(E)}', pins=[t for t in r['pins'] if t.split('/')[0] in text[a:b] and t.split('/')[0] != w]))
    return out, r


def make_refs(plans, out, cap):
    """给每个「只差声调」的点配两段参照：同一个半句，读音钉对的一版、钉成另一种读法的一版（花钱，有缓存）。"""
    import importlib.util
    spec = importlib.util.spec_from_file_location('api_tts', Path(__file__).with_name('api配音.py'))
    T = importlib.util.module_from_spec(spec); spec.loader.exec_module(T)
    cache = Path(out) / '参照缓存'
    cache.mkdir(exist_ok=True)
    spent, made, skipped = 0.0, 0, 0
    for audio, (text, txt, pts, r) in plans.items():
        meta = Path(audio + '.json')
        mj = json.loads(meta.read_text(encoding='utf-8')) if meta.exists() else {}
        voice, speed = mj.get('voice', T.GOU), mj.get('speed', 1.15)
        for p in pts:
            rc = [c for c in p['cands'] if c['kind'] == 'ref']
            if not rc:
                continue
            clause = p['clause'].strip().rstrip('，；：、,;:—…') or p['clause']
            if clause[-1] not in '。！？!?':
                clause += '。'

            def ref(tones):
                nonlocal spent, made, skipped
                f = cache / (T.fingerprint(clause, voice, speed, tones) + '.mp3')
                if not f.exists():
                    if spent >= cap:
                        skipped += 1
                        return None
                    data, chars, ms = T.call_api(clause, voice, speed, tones)
                    f.write_bytes(data)
                    T.ledger(cache / '参照.wav', '参照', chars, ms / 1000, clause)
                    spent += chars * T.USD_PER_CHAR; made += 1
                return str(f)
            p['ref_plus'] = ref(p['pins'] + [p['right']])
            for c in rc:
                c['ref_minus'] = ref(p['pins'] + [c['wrong']])
    print(f'参照录音：新生成 {made} 段，约 ${spent:.3f}' + (f'；到上限 ${cap} 后有 {skipped} 段没生成' if skipped else ''), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('pairs', nargs='+')
    ap.add_argument('--读音表', dest='table'); ap.add_argument('--只列', dest='dry', action='store_true')
    ap.add_argument('--参照', dest='ref', action='store_true', help='只差声调的点：让 MiniMax 配读对/读错两段参照来比（花钱）')
    ap.add_argument('--参照上限', dest='cap', type=float, default=1.0, help='本次参照录音最多花多少美元')
    a = ap.parse_args()
    pairs = [x.rsplit(':', 1) for x in a.pairs]
    table = P.load_table(a.table or P.find_table(*[t for _, t in pairs]))
    homo = homophones()
    os.makedirs(a.out, exist_ok=True)
    plans = {}
    for audio, txt in pairs:
        text = Path(txt).read_text(encoding='utf-8').strip()
        plans[audio] = (text, txt) + plan(text, table, homo)
        pts, r = plans[audio][2:]
        print(f'{Path(txt).name}：要查 {len(pts)} 处' + (f'，另有待定 {len(r["todo"])} 处没查' if r['todo'] else ''), flush=True)
        if a.dry:
            for p in pts:
                print(f'  第{p["sent"]}句 {p["ctx"]} 期望 {P.fmt(p["expect"])} 对比 ' + ' '.join(sorted({c["char"] + c["alt"] for c in p["cands"]})))
    if a.dry:
        return
    if a.ref:
        make_refs(plans, a.out, a.cap)

    sys.path.insert(0, os.path.expanduser('~/Desktop/视频工厂/engine'))
    from align import load_pcm
    import numpy as np
    import mlx.core as mx
    import mlx_whisper
    from mlx_whisper.load_models import load_model
    from mlx_whisper.audio import log_mel_spectrogram, pad_or_trim, N_SAMPLES, N_FRAMES
    from mlx_whisper.tokenizer import get_tokenizer
    REPO = 'mlx-community/whisper-large-v3-turbo'
    model = load_model(REPO)
    tok = get_tokenizer(model.is_multilingual, num_languages=model.num_languages, language='zh', task='transcribe')
    SOT = list(tok.sot_sequence_including_notimestamps)
    SR = 16000

    def score(af, s):
        toks = SOT + tok.encode(s) + [tok.eot]
        lg = model.logits(mx.array([toks]), af)[0].astype(mx.float32)
        lp = np.array(lg - mx.logsumexp(lg, axis=-1, keepdims=True))
        return float(sum(lp[i, toks[i + 1]] for i in range(len(SOT) - 1, len(toks) - 1)))

    bad, ref_af = 0, {}
    for audio, (text, txt, pts, r) in plans.items():
        w, _ = load_pcm(audio); w = w.astype(np.float32)
        tr = mlx_whisper.transcribe(w, path_or_hf_repo=REPO, language='zh', word_timestamps=True, condition_on_previous_text=False)
        chars, t0, t1 = [], [], []
        for seg in tr['segments']:
            for x in seg.get('words') or []:
                t = re.sub(r'[^\w]', '', x['word'])
                for k, c in enumerate(t):
                    d = (x['end'] - x['start']) / len(t)
                    chars.append(c); t0.append(x['start'] + d * k); t1.append(x['start'] + d * (k + 1))
        keep = [i for i, c in enumerate(text) if re.match(r'\w', c)]
        ref = ''.join(text[i] for i in keep)
        m = {}
        for i, j, n in difflib.SequenceMatcher(None, ref, ''.join(chars), autojunk=False).get_matching_blocks():
            for k in range(n):
                m[keep[i + k]] = j + k

        def when(pos, step, times):                      # 文本位置 → 秒；这个字没对上就顺着 step 方向找最近对上的字
            q = pos
            while 0 <= q < len(text):
                if q in m:
                    return times[m[q]]
                q += step
            return None

        try:                                             # 音高曲线：只差声调的点靠它看走势
            import parselmouth
            pit = parselmouth.Sound(w.astype(np.float64), sampling_frequency=SR).to_pitch(time_step=0.01, pitch_floor=70, pitch_ceiling=450)
            px, pf = pit.xs(), pit.selected_array['frequency']
            med = float(np.median(pf[pf > 0])) if (pf > 0).any() else 0
        except Exception:
            px, pf, med = None, None, 0

        def tone_fit(k, exp, alt, nxt):
            """这个字的音高走势更像期望的声调还是另一个声调。返回 ('相符' / '可疑' / '判不了', 走势[半音])。"""
            if px is None or k not in m or not med:
                return '判不了', []
            sel = (px >= t0[m[k]] - .02) & (px <= t1[m[k]] + .02) & (pf > 0)
            if sel.sum() < 5:
                return '判不了', []
            st = 12 * np.log2(pf[sel] / med); n = len(st)
            level = float(st.mean())
            drop = float(st[:max(2, 2 * n // 3)].max() - st[-max(2, n // 4):].mean())
            rise = float(st[-max(2, n // 4):].mean() - st[:max(2, 2 * n // 3)].min())

            def fit(t):
                t = int(t[-1])
                if t == 3 and nxt[-1:] == '3':
                    t = 2                                         # 三声连读念成二声
                return {1: drop < 3 and rise < 3 and level > -1.5, 2: rise >= 1.5 and drop < 3, 3: level < .5, 4: drop >= 2.5, 5: None}[t]
            e, al = fit(exp), fit(alt)
            trend = [round(float(x), 1) for x in st[::max(1, n // 6)]][:7]
            if e is None or al is None:
                return '判不了', trend
            return ('可疑' if al and not e else '相符' if e and not al else '判不了'), trend

        res = []
        for p in pts:
            a0, b0 = p['window']
            ta, tb = when(a0, 1, t0), when(b0 - 1, -1, t1)
            rec = dict(p)
            if ta is None or tb is None or not 0.4 < tb - ta < 25:
                rec.update(verdict='定位失败'); res.append(rec); bad += 1
                print(f'  ? 第{p["sent"]}句 {p["ctx"]} 定位失败', flush=True)
                continue
            syl_c = [c for c in p['cands'] if c['kind'] == 'syl']        # 音节不同：Whisper 打分 + 基准校正
            tone_c = [c for c in p['cands'] if c['kind'] == 'ref']       # 只差声调：和参照录音比
            emb = lambda x: model.embed_audio(pad_or_trim(log_mel_spectrogram(mx.array(x), n_mels=model.dims.n_mels, padding=N_SAMPLES), N_FRAMES, axis=-2).astype(mx.float16)[None])
            raw = lambda f, c: float(np.mean([score(f, x) for x in c['exp_texts']])) - float(np.mean([score(f, x) for x in c['alt_texts']]))
            s0 = max(0, int((ta - .2) * SR))
            seg = w[s0:int((tb + .25) * SR)]
            af = emb(seg)
            worst, wv = None, None
            if syl_c:
                i, j = p['pos'], p['pos'] + len(p['word']) - 1
                wa = t0[m[i]] if i in m else when(i - 1, -1, t1)      # 这个词在录音里的起止
                wb = t1[m[j]] if j in m else when(j + 1, 1, t0)
                if wa is None or wb is None or wb <= wa:
                    wa, wb = ta, tb
                blank = seg.copy()                                     # 把这个词盖成静音：量出「光看文字」时两种写法差多少
                blank[max(0, int((wa - .04) * SR) - s0):max(0, int((wb + .04) * SR) - s0)] = 0
                af0 = emb(blank)
                for c in syl_c:
                    c.update(raw=round(raw(af, c), 2), prior=round(raw(af0, c), 2))
                    c['margin'] = round(c['raw'] - c['prior'], 2)
                    if worst is None or c['margin'] < worst['margin']:
                        worst = c
                wv = '过' if worst['margin'] >= PASS else '读错' if worst['margin'] <= FAIL else '可疑'
            tbad = None
            for c in tone_c:
                c['tone'], c['trend'] = tone_fit(p['pos'] + c['k'], p['expect'][c['k']], c['alt'], c['nxt'])    # 音高走势只记录备查
                c['ref'] = '没有参照'
                if p.get('ref_plus') and c.get('ref_minus'):
                    key = p['ref_plus']
                    if key not in ref_af:
                        ref_af[key] = emb(load_pcm(key)[0].astype(np.float32))
                    if c['ref_minus'] not in ref_af:
                        ref_af[c['ref_minus']] = emb(load_pcm(c['ref_minus'])[0].astype(np.float32))
                    real, rp, rm = raw(af, c), raw(ref_af[key], c), raw(ref_af[c['ref_minus']], c)
                    gap = rp - rm
                    c.update(real=round(real, 2), ref_right=round(rp, 2), ref_wrong=round(rm, 2))
                    if gap < REF_GAP:
                        c['ref'] = '判不了'                              # 两段参照自己都拉不开，说明这个字这样比不出来
                    else:
                        c['near'] = round((real - rm) / gap, 2)          # 1 = 和读对的参照一样，0 = 和读错的参照一样
                        c['ref'] = '过' if c['near'] >= REF_PASS else '读错' if c['near'] <= REF_FAIL else '可疑'
                        if c['ref'] != '过' and (tbad is None or c['near'] < tbad['near']):
                            tbad = c
            if wv == '读错':
                v = '读错'
            elif tbad and tbad['ref'] == '读错':
                v = '声调读错'
            elif wv == '可疑' or tbad:
                v = '可疑'
            elif tone_c and not all(c['ref'] == '过' for c in tone_c):
                v = '声调未核对'
            else:
                v = '过'
            tsus = None
            rec.update(t=[round(ta, 2), round(tb, 2)], margin=worst['margin'] if worst else None, verdict=v,
                       heard_like=worst['char'] + worst['alt'] if wv in ('读错', '可疑') and v in ('读错', '可疑') else tbad['char'] + tbad['alt'] if tbad and v in ('声调读错', '可疑') else None)
            for c in rec['cands']:
                c.pop('exp_texts'); c.pop('alt_texts')
            res.append(rec)
            bad += v in ('读错', '声调读错')
            if v in ('声调读错', '可疑') and tbad and wv not in ('读错', '可疑'):
                print(f'  {"✗" if v == "声调读错" else "?"} 第{p["sent"]}句 {round(ta, 1)}秒 {p["ctx"]} 期望 {P.fmt(p["expect"])}，声调更像 {tbad["char"]}={tbad["alt"]}（贴近读对参照的程度 {tbad["near"]}）', flush=True)
            elif v in ('读错', '可疑'):
                print(f'  {"✗" if v == "读错" else "?"} 第{p["sent"]}句 {round(ta, 1)}秒 {p["ctx"]} 期望 {P.fmt(p["expect"])}，更像 {worst["char"]}={worst["alt"]}（差 {worst["margin"]}）', flush=True)
            elif v == '声调可疑':
                print(f'  ~ 第{p["sent"]}句 {round(ta, 1)}秒 {p["ctx"]} 期望 {P.fmt(p["expect"])}，音高走势更像 {tsus["char"]}={tsus["alt"]} {tsus["trend"]}', flush=True)
        name = Path(txt).stem.replace('-tts', '')
        n = dict(过=0, 声调未核对=0, 可疑=0, 声调读错=0, 读错=0, 定位失败=0)
        for x in res:
            n[x['verdict']] += 1
        redo = sorted({x['sent'] for x in res if x['verdict'] in ('读错', '声调读错') and x['sent']})
        listen = [dict(sent=x['sent'], t=x.get('t'), ctx=x['ctx'], verdict=x['verdict']) for x in res if x['verdict'] == '可疑']
        json.dump(dict(audio=audio, text_file=txt, summary=n, redo_sentences=redo, listen=listen, points=res),
                  open(f'{a.out}/{name}.点检.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'{name}：' + '，'.join(f'{k} {v}' for k, v in n.items()) + (f'；建议 --重配句 {",".join(map(str, redo))}' if redo else ''), flush=True)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
