# -*- coding: utf-8 -*-
"""
自动剃废话：已知文稿 + 你的毛坯录音 -> 干净录音 + 剪辑报告
原理：我知道你本来要念什么，所以录音里「多出来的」就是口误/重读/嗯啊。
"""
import os, re, json, subprocess, difflib
import numpy as np, imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
_D = os.path.dirname(FF)
if not os.path.exists(os.path.join(_D, 'ffmpeg')):
    try: os.symlink(FF, os.path.join(_D, 'ffmpeg'))
    except OSError: pass
os.environ['PATH'] = _D + os.pathsep + os.environ.get('PATH', '')

_DIG = str.maketrans('0123456789', '零一二三四五六七八九')
def norm(s):
    # 数字统一成中文，免得「2026」和「二零二六」被当成对不上
    return re.sub(r'[^\w一-鿿]', '', s).lower().translate(_DIG)

# 口头禅：即使很短也剪
FILLERS = ['嗯','呃','啊','唉','额','这个','那个','就是说','就是','然后','其实吧','对吧','是吧','哎']
MIN_GARBAGE = 4      # 对不上的内容至少这么多字才判定是口误；更短的多半是识别错字，要保留

MAX_SIL    = 0.70   # 超过这么长的停顿就压缩
KEEP_SIL   = 0.32   # 压缩成这么长
PAD        = 0.06   # 剪切点往外让一点，别切到字
FADE       = 0.015  # 接缝淡入淡出，防"咔哒"声
MIN_CUT    = 0.10   # 太短的就不剪了

def pcm(path, sr=16000):
    raw = subprocess.run([FF,'-v','error','-i',path,'-f','s16le','-ar',str(sr),'-ac','1','-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32)/32768.0, sr

def energy(x, sr, hop=0.01):
    h = int(sr*hop); n = len(x)//h
    e = np.sqrt(np.array([np.mean(x[i*h:(i+1)*h]**2) for i in range(n)])+1e-12)
    thr = max(np.percentile(e,20)*3.5, np.percentile(e,60)*0.18)
    return e, thr, hop

def silences(e, thr, hop, minlen=0.12):
    out, i, n = [], 0, len(e)
    while i < n:
        if e[i] < thr:
            j = i
            while j < n and e[j] < thr: j += 1
            if (j-i)*hop >= minlen: out.append((i*hop, j*hop))
            i = j
        else: i += 1
    return out

def snap_out(t, sils, direction):
    """把剪切点推到最近的静音里，避免切在字中间"""
    for a,b in sils:
        if a-0.05 <= t <= b+0.05:
            return b if direction > 0 else a
    return t

def clean(audio, script, out_wav, model="mlx-community/whisper-large-v3-turbo"):
    import mlx_whisper
    r = mlx_whisper.transcribe(audio, path_or_hf_repo=model, language="zh",
                               word_timestamps=True, condition_on_previous_text=False)
    # --- 识别结果摊平成字符流 ---
    chars, tm = [], []
    for seg in r["segments"]:
        for w in seg.get("words") or []:
            tok = norm(w["word"])
            if not tok: continue
            n = len(tok); a, b = w["start"], w["end"]
            for k,c in enumerate(tok):
                chars.append(c); tm.append((a+(b-a)*k/n, a+(b-a)*(k+1)/n))
    asr = "".join(chars)
    tgt = "".join(norm(s) for s in script)

    # --- 逐句定位：口误重录时，优先保留「最后一遍」 ---
    def locate(sent, start):
        """在 asr[start:] 里找这句话落在哪；分数接近时取靠后的那次（重录的才是好的）"""
        L = len(sent)
        if L == 0: return None
        hi = min(len(asr), start + int(L*4) + 40)
        best, bq, bl = -1.0, None, L
        for q in range(start, max(start+1, hi - L//2)):
            for span in (L, int(L*1.25)+2, max(1, int(L*0.8))):
                seg = asr[q:q+span]
                if not seg: continue
                sc = difflib.SequenceMatcher(None, sent, seg, autojunk=False).ratio()
                if sc > best + 0.03 or (sc > best - 0.03 and q >= (bq if bq is not None else -1)):
                    if sc >= best - 0.03:
                        if sc > best: best = sc
                        bq, bl = q, span
        return (bq, bl, best) if bq is not None and best >= 0.55 else None

    spans, p_ = [], 0
    for sent in [norm(x) for x in script]:
        loc = locate(sent, p_)
        if not loc:                       # 实在找不到就顺延，不乱剪
            spans.append(None); continue
        q, l, sc = loc
        spans.append((q, min(len(asr), q+l)))
        p_ = min(len(asr), q+l)

    # --- 句与句之间的内容 = 口误/重读/废话；句子内部对不上的 = 口头禅/结巴 ---
    def add_cut(k, j, why):
        if j <= k: return
        cuts.append({"t0": tm[k][0], "t1": tm[j-1][1], "text": asr[k:j], "why": why})

    cuts, prev_end = [], 0
    for idx, sp in enumerate(spans):
        if sp is None: continue
        q, e = sp
        if q > prev_end:                                  # 两句之间多出来的
            frag = asr[prev_end:q]
            is_f = any(f in frag for f in FILLERS)
            if len(frag) >= MIN_GARBAGE or is_f:
                add_cut(prev_end, q, "口头禅" if (is_f and len(frag) < MIN_GARBAGE) else "口误/重读")
        # 句子内部
        sent = norm(script[idx]); seg = asr[q:e]
        cov = np.zeros(len(seg), dtype=bool)
        for i2, j2, n2 in difflib.SequenceMatcher(None, sent, seg, autojunk=False).get_matching_blocks():
            cov[j2:j2+n2] = True
        k = 0
        while k < len(seg):
            if cov[k]: k += 1; continue
            j = k
            while j < len(seg) and not cov[j]: j += 1
            f = seg[k:j]
            is_f = any(x in f for x in FILLERS)
            pc = seg[k-1] if k > 0 else ''
            nc = seg[j] if j < len(seg) else ''
            is_st = len(f) <= 2 and (f == pc*len(f) or f == nc*len(f))
            if len(f) >= MIN_GARBAGE or is_f or is_st:
                add_cut(q+k, q+j, "结巴" if is_st else ("口头禅" if is_f and len(f) < MIN_GARBAGE else "口误/重读"))
            k = j
        prev_end = e
    if prev_end < len(asr) and len(asr) - prev_end >= MIN_GARBAGE:
        add_cut(prev_end, len(asr), "多余尾音")

    wav, sr = pcm(audio)
    total = len(wav)/sr
    e, thr, hop = energy(wav, sr)
    sils = silences(e, thr, hop)

    # --- 过长的停顿也压缩掉 ---
    for a,b in sils:
        if b-a > MAX_SIL:
            cuts.append({"t0": a+KEEP_SIL/2, "t1": b-KEEP_SIL/2, "text": "（停顿）", "why": "停顿过长"})

    # --- 剪切点吸附到静音，再合并重叠区间 ---
    for c in cuts:
        c["t0"] = max(0, snap_out(c["t0"], sils, -1) - PAD)
        c["t1"] = min(total, snap_out(c["t1"], sils, +1) + PAD)
    cuts = [c for c in cuts if c["t1"]-c["t0"] >= MIN_CUT]
    cuts.sort(key=lambda c: c["t0"])
    merged = []
    for c in cuts:
        if merged and c["t0"] <= merged[-1]["t1"] + 0.02:
            merged[-1]["t1"] = max(merged[-1]["t1"], c["t1"])
            merged[-1]["text"] += " / " + c["text"]
        else: merged.append(dict(c))

    # --- 反过来得到「要保留的段落」 ---
    keep, p = [], 0.0
    for c in merged:
        if c["t0"] - p > 0.05: keep.append((p, c["t0"]))
        p = c["t1"]
    if total - p > 0.05: keep.append((p, total))

    # --- 拼接（每段加微淡入淡出，防咔哒声） ---
    fc, labs = [], []
    for k,(a,b) in enumerate(keep):
        d = b-a
        fc.append(f"[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=N/SR/TB,"
                  f"afade=t=in:st=0:d={FADE},afade=t=out:st={max(0,d-FADE):.3f}:d={FADE}[s{k}]")
        labs.append(f"[s{k}]")
    fc.append("".join(labs) + f"concat=n={len(keep)}:v=0:a=1[out]")
    subprocess.run([FF,'-y','-v','error','-i',audio,'-filter_complex',';'.join(fc),
                    '-map','[out]','-ar','24000','-ac','1','-c:a','pcm_s16le', out_wav], check=True)
    newdur = sum(b-a for a,b in keep)
    return merged, total, newdur, r.get("text","")

if __name__ == "__main__":
    script = json.load(open("script.json"))["script"]
    cuts, old, new, raw = clean("毛坯录音.wav", script, "干净录音.wav")
    print(f"识别到的原始内容：\n  {raw[:150]}\n")
    print(f"{'#':<3}{'起':>7}{'止':>7}{'时长':>7}   剪掉了什么")
    for i,c in enumerate(cuts,1):
        print(f"{i:<3}{c['t0']:>7.2f}{c['t1']:>7.2f}{c['t1']-c['t0']:>7.2f}s   {c['text'][:34]}  [{c['why']}]")
    print(f"\n原始 {old:.2f}s  →  精剪后 {new:.2f}s   （剃掉 {old-new:.2f}s，压缩 {100*(old-new)/old:.0f}%）")
    json.dump(cuts, open("剪辑报告.json","w"), ensure_ascii=False, indent=1)
