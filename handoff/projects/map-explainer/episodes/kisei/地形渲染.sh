cd ~/video-projects/map-explainer
for k in "$@"; do
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/kisei/terrain.json'))[sys.argv[1]]))" $k)
  node scripts/render_shot.mjs components/terrain-orbit --config "$c" --to 16 --out episodes/kisei/renders/$k.mp4 || echo FAIL $k
  echo DONE $k
done
echo ALLDONE
