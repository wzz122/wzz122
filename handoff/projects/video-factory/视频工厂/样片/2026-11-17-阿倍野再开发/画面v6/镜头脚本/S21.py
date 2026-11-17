"""S21（阿倍野再开发，自动生成自 镜头数据.py / 手写镜头.py / _生成.py）"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from v6lib import *
from 本期工具 import *


def build():
    import 手写镜头 as _H
    return _H.S21()
