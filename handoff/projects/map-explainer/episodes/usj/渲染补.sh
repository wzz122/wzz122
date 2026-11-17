cd ~/video-projects/map-explainer
for k in "$@"; do
  [ -s episodes/usj/renders/$k.mp4 ] && { echo SKIP $k; continue; }
  n=$(cat episodes/*/请求记账.txt 2>/dev/null | grep -c "^$(date +%F)")
  if [ "$n" -ge 27 ]; then echo "STOP 今日已用 $n 次"; break; fi
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/usj/shots.json'))[sys.argv[1]]))" $k)
  /usr/bin/python3 $HOME/.local/bin/mac-heavy-job.py --wait 14400 -- node scripts/render_shot.mjs components/city-orbit --config "$c" --out episodes/usj/renders/$k.mp4
  rc=$?
  [ $rc -eq 75 ] && { echo "WAIT-TIMEOUT $k"; continue; }
  echo "$(date +%F) render $k" >> episodes/usj/请求记账.txt
  echo "DONE $k rc=$rc"
done
echo ALLDONE
