cd ~/video-projects/map-explainer
mkdir -p episodes/yubari/renders
for k in "$@"; do
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/yubari/shots.json'))[sys.argv[1]]))" $k)
  node scripts/render_shot.mjs components/city-orbit --config "$c" --out episodes/yubari/renders/$k.mp4 || echo "FAIL $k"
  echo "$(date '+%F %T') $k 渲染 1 次" >> episodes/yubari/请求记账.txt
  echo "DONE $k"
done
echo ALLDONE
