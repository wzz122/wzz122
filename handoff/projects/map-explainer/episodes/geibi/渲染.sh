cd ~/video-projects/map-explainer
for k in "$@"; do
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/geibi/shots.json'))[sys.argv[1]]))" $k)
  node scripts/render_shot.mjs components/city-orbit --config "$c" --out episodes/geibi/renders/$k.mp4 || echo FAIL $k
  echo "$(date +%F) render $k" >> episodes/geibi/请求记账.txt
  echo DONE $k
done
echo ALLDONE
