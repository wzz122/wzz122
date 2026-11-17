cd ~/video-projects/map-explainer
for k in "$@"; do
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/shoreline/terrain.json'))[sys.argv[1]]))" $k)
  node scripts/render_shot.mjs components/terrain-orbit --config "$c" --stills 0,5,14 --out episodes/shoreline/stills/$k/x.png || echo FAIL $k
done
