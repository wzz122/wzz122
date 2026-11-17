cd ~/video-projects/map-explainer
for k in $(python3 -c "import json;print(' '.join(json.load(open('episodes/tajiri/shots.json'))))"); do
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/tajiri/shots.json'))[sys.argv[1]]))" $k)
  mkdir -p episodes/tajiri/stills/$k; node scripts/render_shot.mjs components/city-orbit --config "$c" --stills 0,7,14 --out episodes/tajiri/stills/$k/s.png || echo "FAIL $k"
done
echo ALLDONE
