import sys, glob, os
from v6lib import *
from PIL import Image
ids = sys.argv[1].split(',') if 'S' in sys.argv[1] else [f'S{i:02d}' for i in range(int(sys.argv[1].split('-')[0]), int(sys.argv[1].split('-')[1]) + 1)]; ats = [float(x) for x in sys.argv[2].split(',')]; tag = sys.argv[3]
build_storyboard(quiet=True)
render(ids, stills=True, at=ats)
fs = []
for i in ids:
    for a in ats:
        f = f'镜头/{i}-t{a:.2f}.jpg'
        if os.path.exists(f): fs.append(f)
out = '/private/tmp/claude-501/-Users-wzz122/eb1cc2f6-10f7-46b1-adc9-a8964efc4c91/scratchpad/st'
os.makedirs(out, exist_ok=True)
W, H, C, R = 640, 336, 3, 4
for p in range(0, len(fs), C * R):
    im = Image.new('RGB', (C * W, R * H), 'black')
    for k, f in enumerate(fs[p:p + C * R]):
        t = Image.open(f).convert('RGB').resize((W - 4, H - 4)); im.paste(t, ((k % C) * W + 2, (k // C) * H + 2))
    im.save(f'{out}/{tag}-{p // (C * R) + 1}.jpg', quality=82)
print('sheets', (len(fs) + C * R - 1) // (C * R), fs)
