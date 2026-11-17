import numpy as np, scipy.io.wavfile as w, sys, re
def f0_track(x,sr,fmin=70,fmax=350,hop=0.01,win=0.04):
    H=int(sr*hop);N=int(sr*win);out=[]
    for i in range(0,len(x)-N,H):
        f=x[i:i+N]*np.hanning(N)
        if np.sqrt(np.mean(f**2))<0.01: out.append(np.nan);continue
        ac=np.correlate(f,f,'full')[N-1:];ac/=ac[0]+1e-9
        lo,hi=int(sr/fmax),int(sr/fmin);k=lo+np.argmax(ac[lo:hi])
        out.append(sr/k if ac[k]>0.45 else np.nan)
    return np.array(out)
def feats(path,chars):
    sr,x=w.read(path);x=x.astype(np.float32)/32768
    hop=int(sr*0.01);e=np.array([np.sqrt(np.mean(x[i:i+hop]**2)) for i in range(0,len(x)-hop,hop)])
    thr=max(np.percentile(e,15)*3,0.008);voiced=e>thr
    # pauses: runs of silence >=0.25s
    runs=[];c=0
    for v in voiced:
        if not v:c+=1
        else:
            if c>=25:runs.append(c/100)
            c=0
    dur=len(x)/sr;speech=voiced.sum()/100
    f0=f0_track(x,sr);f=f0[~np.isnan(f0)]
    st=12*np.log2(f/np.median(f))
    edb=20*np.log10(e[voiced]+1e-9)
    seg=x[:sr*20];X=np.abs(np.fft.rfft(seg));fr=np.fft.rfftfreq(len(seg),1/sr)
    cen=(X*fr).sum()/X.sum()
    return dict(dur=round(dur,1),字每秒=round(chars/dur,2),净语速=round(chars/speech,2),停顿次数每分=round(len(runs)/dur*60,1),平均停顿秒=round(np.mean(runs),2) if runs else 0,
      F0中位Hz=round(float(np.median(f)),1),音高起伏半音=round(float(np.percentile(st,95)-np.percentile(st,5)),1),音高抖动=round(float(np.std(np.diff(st)[np.abs(np.diff(st))<3])),2),
      响度起伏dB=round(float(np.percentile(edb,90)-np.percentile(edb,10)),1),亮度Hz=round(float(cen)))
