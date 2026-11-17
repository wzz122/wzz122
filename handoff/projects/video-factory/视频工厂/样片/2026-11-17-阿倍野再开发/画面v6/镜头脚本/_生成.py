"""生成 S*.py：照片 / 视频镜头的分段表在 ../镜头数据.py，手写镜头在 ../手写镜头.py。改完跑：python3 镜头脚本/_生成.py"""
import sys, re
from pathlib import Path
D0 = Path(__file__).resolve().parent
sys.path.insert(0, str(D0.parent))
import 镜头数据
hand = re.findall(r'^def (S\d+)\(', (D0.parent / '手写镜头.py').read_text(encoding='utf-8'), flags=re.M)
HEAD = '''"""{sid}（阿倍野再开发，自动生成自 镜头数据.py / 手写镜头.py / _生成.py）"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from v6lib import *
from 本期工具 import *


def build():
'''
n = 0
for sid in 镜头数据.D:
    assert sid not in hand, sid
    (D0 / f'{sid}.py').write_text(HEAD.format(sid=sid) + f"    import 镜头数据 as _D\n    return 镜('{sid}', _D.D['{sid}'], 章=_D.章.get('{sid}'))\n", encoding='utf-8'); n += 1
for sid in hand:
    (D0 / f'{sid}.py').write_text(HEAD.format(sid=sid) + f"    import 手写镜头 as _H\n    return _H.{sid}()\n", encoding='utf-8'); n += 1
allids = set(镜头数据.D) | set(hand)
miss = [f'S{i:02d}' for i in range(1, 88) if f'S{i:02d}' not in allids]
print('写了', n, '个镜头；缺：', miss)
