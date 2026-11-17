cd ~/video-projects/map-explainer
for k in "$@"; do
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/yubari/shots.json'))[sys.argv[1]]))" $k)
  mkdir -p episodes/yubari/stills/$k; node scripts/render_shot.mjs components/city-orbit --config "$c" --stills 7 --out episodes/yubari/stills/$k/s.png 2>&1 | tail -1
  echo "$(date '+%F %T') $k 静帧 1 次" >> episodes/yubari/请求记账.txt
done
echo ALLDONE
