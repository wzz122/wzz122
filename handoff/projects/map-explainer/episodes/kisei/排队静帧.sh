#!/bin/zsh
cat > /tmp/kisei-st.$$.sh <<'X'
cd ~/video-projects/map-explainer/episodes/kisei
zsh 地形静帧.sh T1-纪伊半岛 T2-贴海南下 T3-山压着海 T4-半岛只有海边
zsh 静帧.sh G1-白良滨 G2-串本 G3-胜浦港 G4-新宫站 G5-见老津
X
for k in $(seq 1 120); do
  /usr/bin/python3 /Users/wzz122/.local/bin/mac-heavy-job.py -- zsh /tmp/kisei-st.$$.sh
  rc=$?
  [ $rc -ne 75 ] && break
  sleep 60
done
echo RC $rc
