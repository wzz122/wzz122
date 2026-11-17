import json
from pathlib import Path
D=Path.home()/'Desktop/视频工厂/样片/2026-11-06-纪势线/数据'
L=json.load(open(D/'线路.json')); S=json.load(open(D/'车站.json'))
def thin(p,n=12): 
    q=p[::n]
    return [[round(a,4),round(b,4)] for a,b in q+[p[-1]]]
RELIEF=[[100,"#6F8A78"],[300,"#8E9D7A"],[600,"#B0A573"],[900,"#C69A62"],[1300,"#D18A55"],[1800,"#DCD3C3"]]
base=dict(relief=RELIEF,area={"at":99,"lngLat":[135.5,33.8],"text":""},note={"at":99,"html":""},showAttribution=False,reliefOpacity=.72,hillshade=.8,duration=16)
RED="#FF4B33"; G="#E9E4D3"
def P(at,k,t,sub=""):
    return {"at":at,"lngLat":S[k],"text":t,"sub":sub}
hot={"coords":thin(L['白滨新宫'],22),"color":RED,"width":6}
ctx=[{"coords":thin(L['和歌山到白滨'],70),"color":G,"width":3},{"coords":thin(L['新宫到龟山'],120),"color":G,"width":3}]
out={}
out['T1-纪伊半岛']=dict(base,exaggeration=5,lines=ctx+[hot],
 keyframes=[{"t":0,"center":[135.75,34.2],"zoom":7.9,"bearing":0,"pitch":15},{"t":6,"center":[135.75,33.95],"zoom":8.3,"bearing":10,"pitch":48,"dur":6},{"t":16,"center":[135.75,33.75],"zoom":8.7,"bearing":25,"pitch":58,"dur":10,"ease":"sine.inOut"}],
 places=[P(.5,'和歌山市','和歌山'),P(1.5,'白浜','白滨'),P(2.5,'串本','串本'),P(3.5,'新宮','新宫'),P(4.5,'亀山','龟山')])
out['T2-贴海南下']=dict(base,exaggeration=3,lines=ctx+[dict(hot,width=5)],
 keyframes=[{"t":0,"center":[135.40,33.62],"zoom":10.7,"bearing":100,"pitch":62},{"t":8,"center":[135.72,33.47],"zoom":10.7,"bearing":95,"pitch":64,"dur":8,"ease":"sine.inOut"},{"t":16,"center":[135.98,33.68],"zoom":10.7,"bearing":40,"pitch":62,"dur":8,"ease":"sine.inOut"}],
 places=[P(.3,'白浜','白滨'),P(2.6,'周参見','周参见'),P(4.2,'見老津','见老津'),P(7.4,'串本','串本'),P(9.2,'古座','古座'),P(11.2,'太地','太地'),P(12.4,'紀伊勝浦','纪伊胜浦'),P(14.2,'新宮','新宫')])
out['T3-山压着海']=dict(base,exaggeration=2.5,lines=[dict(hot,width=5,coords=thin(L['周参见到串本'],4))],
 keyframes=[{"t":0,"center":[135.60,33.555],"zoom":12.2,"bearing":30,"pitch":68},{"t":16,"center":[135.70,33.52],"zoom":12.5,"bearing":55,"pitch":70,"dur":16,"ease":"sine.inOut"}],places=[])
out['T4-半岛只有海边']=dict(base,exaggeration=5,lines=ctx+[hot],
 keyframes=[{"t":0,"center":[135.8,33.75],"zoom":8.8,"bearing":-20,"pitch":55},{"t":16,"center":[135.8,33.85],"zoom":9.1,"bearing":20,"pitch":60,"dur":16,"ease":"sine.inOut"}],
 places=[P(.5,'白浜','白滨'),P(1,'新宮','新宫')])
json.dump(out,open('terrain.json','w'),ensure_ascii=False)
print({k:len(json.dumps(v)) for k,v in out.items()})
