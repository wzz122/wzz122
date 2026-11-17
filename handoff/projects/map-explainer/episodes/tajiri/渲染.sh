cd ~/video-projects/map-explainer
for k in "$@"; do
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/tajiri/shots.json'))[sys.argv[1]]))" $k)
  node scripts/render_shot.mjs components/city-orbit --config "$c" --out episodes/tajiri/renders/$k.mp4 || echo "FAIL $k"
  echo "DONE $k"
done
echo ALLDONE
