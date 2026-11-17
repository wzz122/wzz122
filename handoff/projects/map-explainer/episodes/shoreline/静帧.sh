cd ~/video-projects/map-explainer
for k in "$@"; do
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/shoreline/shots.json'))[sys.argv[1]]))" $k)
  node scripts/render_shot.mjs components/city-orbit --config "$c" --stills 8 --out episodes/shoreline/stills/$k/x.png || echo FAIL $k
  echo "$(date +%F) still $k" >> episodes/shoreline/请求记账.txt
  echo DONE $k
done
echo ALLDONE
