cd ~/video-projects/map-explainer/episodes/sakishima
until grep -q "DONE G9" 渲染日志.txt || grep -q "FAIL G9" 渲染日志.txt; do sleep 10; done
bash 渲染.sh G1-三岛全景 G3-ATC > 渲染日志2.txt 2>&1
