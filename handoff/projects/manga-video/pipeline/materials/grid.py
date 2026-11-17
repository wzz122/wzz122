# 官方截图加 10% 网格，方便读出 image 对象 marks 红框的相对坐标（0–1）：python3 grid.py in.png out.png
import subprocess, sys
f, o = sys.argv[1], sys.argv[2]
lines = [f"drawbox=x=iw*{i/10}:y=0:w=1:h=ih:color=red@0.6" for i in range(1, 10)] + [f"drawbox=x=0:y=ih*{i/10}:w=iw:h=1:color=red@0.6" for i in range(1, 10)]
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f, '-vf', 'scale=900:-1,' + ','.join(lines), o], check=True)
