#!/usr/bin/env bash
# 录演示视频用：在本机起一套干净的扫码点单（Postgres + PostgREST + 网页），数据从 Q1 开始。
#   用法：./start-stack.sh <工作目录>        之后 REST 在 :3001，网页在 :8081
#         ./start-stack.sh <工作目录> stop   关掉
# 和 tests/run_local.sh 用一样的镜像，端口不一样，可以同时存在。
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
WORK="${1:?工作目录}"
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"

stop() {
  docker rm -f chali-demo-db chali-demo-rest >/dev/null 2>&1 || true
  docker network rm chali-demo >/dev/null 2>&1 || true
  if [ -f "$WORK/http.pid" ]; then kill "$(cat "$WORK/http.pid")" 2>/dev/null || true; rm -f "$WORK/http.pid"; fi
}
stop
[ "${2:-}" = "stop" ] && exit 0

docker network create chali-demo >/dev/null
docker run -d --name chali-demo-db --network chali-demo -e POSTGRES_PASSWORD=pg postgres:16 >/dev/null
for _ in $(seq 1 60); do docker exec chali-demo-db pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2
docker exec -i chali-demo-db psql -U postgres -v ON_ERROR_STOP=1 -q < ../tests/roles.sql
docker exec -i chali-demo-db psql -U postgres -v ON_ERROR_STOP=1 -q < ../supabase/migrations/20261024120000_qr_order.sql 2>&1 | grep -v NOTICE || true
docker exec chali-demo-db psql -U postgres -v ON_ERROR_STOP=1 -tAc "select chali.create_store('chalichali-01', '茶里茶里')" | tr -d '[:space:]' > "$WORK/staff_key.txt"

docker run -d --name chali-demo-rest --network chali-demo -p 3001:3000 \
  -e PGRST_DB_URI=postgres://authenticator:authpass@chali-demo-db:5432/postgres \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon postgrest/postgrest:v12.2.3 >/dev/null
for _ in $(seq 1 30); do curl -sf localhost:3001/ >/dev/null 2>&1 && break; sleep 1; done

rm -rf "$WORK/site"
mkdir -p "$WORK/site"
cp -R ../web/. "$WORK/site/"
printf 'window.CHALI_CONFIG = { restUrl: "http://localhost:3001", anonKey: "local-demo", defaultStore: "chalichali-01", orderUrl: "https://wzz122.github.io/chalichali/" };\n' > "$WORK/site/config.js"
cp "$HERE/scan.html" "$WORK/site/"
(cd "$WORK/site" && exec python3 -m http.server 8081 >/dev/null 2>&1) &
echo $! > "$WORK/http.pid"
sleep 1
echo "OK  REST http://localhost:3001  网页 http://localhost:8081/  门店密钥在 $WORK/staff_key.txt"
