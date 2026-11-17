# -*- coding: utf-8 -*-
"""强制对齐：已知文稿 + 你的录音 -> 每句话的真实起止时间"""
import sys, json, re, time, difflib
import numpy as np, os, imageio_ffmpeg

# mlx-whisper 会在 PATH 里找 ffmpeg，这里自己补上，用户不用配环境
_FFDIR = os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())
_LINK = os.path.join(_FFDIR, 'ffmpeg')
if not os.path.exists(_LINK):
    try: os.symlink(imageio_ffmpeg.get_ffmpeg_exe(), _LINK)
    except OSError: pass
os.environ['PATH'] = _FFDIR + os.pathsep + os.environ.get('PATH', '')

def load_pcm(path, sr=16000):
    """读波形，用来找「声音真正响起」的时刻"""
    import subprocess, imageio_ffmpeg
    FF = imageio_ffmpeg.get_ffmpeg_exe()
    raw = subprocess.run([FF,'-v','error','-i',path,'-f','s16le','-ar',str(sr),'-ac','1','-'],
                         capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32)/32768.0, sr

def onset_curve(x, sr, hop=0.01):
    h = int(sr*hop)
    n = len(x)//h
    e = np.sqrt(np.array([np.mean(x[i*h:(i+1)*h]**2) for i in range(n)]) + 1e-12)
    floor = np.percentile(e, 20)          # 噪声底
    thr = max(floor*3.5, np.percentile(e, 60)*0.18)
    return e, thr, hop

def snap_onset(e, thr, hop, t, back=0.95, fwd=1.10, min_gap=0.10):
    """在 whisper 给的边界附近找最长的一段静音（换气），把句子起点定在静音结束处"""
    i0 = max(0, int((t - back) / hop)); i1 = min(len(e), int((t + fwd) / hop))
    if i1 - i0 < 3: return t
    quiet = e[i0:i1] < thr
    best_len = best_end = 0; cur = 0
    for k in range(len(quiet)):
        if quiet[k]:
            cur += 1
        else:
            if cur > best_len: best_len, best_end = cur, k
            cur = 0
    if cur > best_len: best_len, best_end = cur, len(quiet)
    if best_len * hop >= min_gap:
        return (i0 + best_end) * hop
    return t

def norm(s):
    return re.sub(r'[^\w\u4e00-\u9fff]', '', s).lower()

def align(audio, sents, model="mlx-community/whisper-large-v3-turbo", snap_back=0.95, snap_fwd=1.10):
    import mlx_whisper
    t0 = time.time()
    r = mlx_whisper.transcribe(
        audio, path_or_hf_repo=model, language="zh",
        word_timestamps=True, condition_on_previous_text=False,
        initial_prompt="".join(sents)[:200],     # 把文稿喂给它，识别准很多
    )
    asr_t = time.time() - t0

    # 1) 把识别结果摊平成「字符流 + 每个字的时间」
    chars, times = [], []
    for seg in r["segments"]:
        for w in seg.get("words") or []:
            tok = norm(w["word"])
            if not tok: continue
            n = len(tok)
            for k, c in enumerate(tok):
                chars.append(c)
                times.append((w["start"] + (w["end"] - w["start"]) * k / n,
                              w["start"] + (w["end"] - w["start"]) * (k + 1) / n))
    asr = "".join(chars)

    # 2) 文稿也摊平，同时记住每句的字符区间
    script, spans = "", []
    for s in sents:
        a = len(script); script += norm(s); spans.append((a, len(script)))

    # 3) 文稿字符 <-> 识别字符 对齐（容忍识别错字/漏字）
    sm = difflib.SequenceMatcher(None, script, asr, autojunk=False)
    m = {}
    for i, j, n in sm.get_matching_blocks():
        for k in range(n): m[i + k] = j + k

    def t_of(idx, end=False):
        for d in range(0, 60):
            for cand in ((idx - d, idx + d) if end else (idx + d, idx - d)):
                if cand in m and 0 <= m[cand] < len(times):
                    return times[m[cand]][1 if end else 0]
        return None

    # 用波形能量把每句的起点吸附到「真正开口」的瞬间
    wav, sr = load_pcm(audio)
    e, thr, hop = onset_curve(wav, sr)

    out, prev = [], 0.0
    for i, (a, b) in enumerate(spans):
        s0 = t_of(a) or prev
        s0 = snap_onset(e, thr, hop, s0, back=snap_back, fwd=snap_fwd)
        s1 = t_of(b - 1, end=True) or (s0 + 1.5)
        if s0 < prev: s0 = prev
        if s1 <= s0: s1 = s0 + 0.8
        out.append({"i": i, "text": sents[i], "t0": round(s0, 2), "t1": round(s1, 2)})
        prev = s1
    return out, asr_t, r.get("text", "")[:120]

if __name__ == "__main__":
    d = json.load(open("truth.json"))
    res, asr_t, head = align("录音.wav", d["sents"])
    print(f"识别+对齐耗时 {asr_t:.1f}s（音频 {d['total']:.1f}s，速度 {d['total']/asr_t:.1f}x 实时）")
    print(f"识别开头: {head}\n")
    print(f"{'句子':<22}{'真实起点':>9}{'对齐起点':>9}{'误差':>8}")
    errs = []
    for a, b in zip(d["truth"], res):
        e = b["t0"] - a["t0"]; errs.append(abs(e))
        print(f"{a['text'][:20]:<22}{a['t0']:>9.2f}{b['t0']:>9.2f}{e:>+8.2f}s")
    print(f"\n平均误差 {sum(errs)/len(errs):.3f}s   最大误差 {max(errs):.3f}s")
    json.dump(res, open("aligned.json", "w"), ensure_ascii=False, indent=1)
