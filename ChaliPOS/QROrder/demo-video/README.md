# 扫码点单演示视频

给老板看的试用演示（约 2 分钟）：左边顾客手机，右边柜台平板，下面中文字幕。画面全部是真实系统的自动录屏（本机测试数据）。

## 重新生成（菜单或页面改了以后）

```bash
cd ChaliPOS/QROrder/demo-video
W=~/Developer/chali-demo-work                      # 工作目录（放在仓库外面）
./start-stack.sh $W                                # 起一套干净的系统（Docker），从 Q1 开始
node record.js $W                                  # 自动操作手机 + 平板并连续截图（约 85 秒）
node assets.js $W                                  # 幻灯片、字幕、外框、弹出标签
python3 compose.py $W $W/演示.mp4 配乐1.mp3 配乐2.mp3 叮咚.wav
./start-stack.sh $W stop                           # 关掉
```

- 需要：Docker、node + playwright、python3 + Pillow、ffmpeg（有 libx264）
- 用缓存的浏览器时设 `PW_EXE`；playwright 不在全局时设 `NODE_PATH`
- 字幕、章节、每个镜头配什么效果都在 `video.json`。镜头时间点由 `record.js` 里的 `mark()` 决定，录屏镜头按真实速度播放；字幕读不完就加长 `record.js` 里那一步的等待
- `STILLS=1 python3 compose.py $W /tmp/stills` 只导出每个镜头的一帧，用来检查
- 配乐用的是之前做 MANGO SIAM 演示时生成的两首（`chumon/output/demo-video/bgm/`），提示音是同一目录的 `ding2.wav`
