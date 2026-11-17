cd ~/video-projects/map-explainer
mkdir -p episodes/namba/stills2
for k in "$@"; do mkdir -p episodes/namba/stills2/$k
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/namba/shots2.json'))[sys.argv[1]]))" $k)
  node scripts/render_shot.mjs components/city-orbit --config "$c" --stills 0,18 --out episodes/namba/stills2/$k/x.png || echo FAIL $k
  echo "$(date +%F) stills $k" >> episodes/namba/请求记账.txt
done
echo ALLDONE
