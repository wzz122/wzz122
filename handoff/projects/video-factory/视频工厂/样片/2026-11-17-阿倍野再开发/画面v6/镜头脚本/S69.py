"""S69（阿倍野再开发，自动生成自 镜头数据.py / 手写镜头.py / _生成.py）"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from v6lib import *
from 本期工具 import *


def build():
    import 镜头数据 as _D
    return 镜('S69', _D.D['S69'], 章=_D.章.get('S69'))
