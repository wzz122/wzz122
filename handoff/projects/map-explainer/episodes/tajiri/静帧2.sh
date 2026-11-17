cd ~/video-projects/map-explainer
for k in G2-第一航站楼 G1g-关空全岛-地理院 G5g-海岸远景-地理院; do
  c=$(python3 -c "import json,sys;print(json.dumps(json.load(open('episodes/tajiri/shots.json'))[sys.argv[1]]))" $k)
  mkdir -p episodes/tajiri/stills/$k-b; node scripts/render_shot.mjs components/city-orbit --config "$c" --stills 0,7,14 --out episodes/tajiri/stills/$k-b/s.png || echo "FAIL $k"
done
echo ALLDONE
