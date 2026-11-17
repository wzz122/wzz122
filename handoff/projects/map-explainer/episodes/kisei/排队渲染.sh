#!/bin/zsh
for k in $(seq 1 240); do
  /usr/bin/python3 /Users/wzz122/.local/bin/mac-heavy-job.py -- zsh ~/video-projects/map-explainer/episodes/kisei/全部渲染.sh
  rc=$?
  [ $rc -ne 75 ] && break
  sleep 60
done
echo RC $rc
