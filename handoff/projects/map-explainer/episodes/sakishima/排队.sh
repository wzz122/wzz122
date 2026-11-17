cd ~/video-projects/map-explainer/episodes/sakishima
until grep -q ALLDONE 静帧日志.txt; do sleep 10; done
bash 静帧.sh G1-三岛全景 G3-ATC > 静帧日志2.txt 2>&1
bash 渲染.sh G2-站前入管 G4-WTC G5-公寓群 G6-时空馆 G7-空地工地 G8-梦洲 G9-南港港城 > 渲染日志.txt 2>&1
