#!/usr/bin/env bash
# 在本机用 Docker 起 Postgres + PostgREST（和 Supabase 用的同一套 REST 层），
# 执行迁移 SQL，然后跑数据库函数测试和顾客页面测试。
#   需要：docker、python3、node（顾客页面测试还需要 playwright）
#   用法：./run_local.sh            全部测试
#         SKIP_WEB=1 ./run_local.sh  只测数据库
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
PG_IMAGE="${PG_IMAGE:-postgres:16}"
REST_IMAGE="${REST_IMAGE:-postgrest/postgrest:v12.2.3}"
WORK="$(mktemp -d)"
export CHALI_KEY_FILE="$WORK/staff_key.txt"
export CHALI_REST="http://localhost:3000"
export CHALI_PAGE="http://localhost:8080/"

cleanup() {
  docker rm -f chali-test-db chali-test-rest >/dev/null 2>&1 || true
  docker network rm chali-test >/dev/null 2>&1 || true
  [ -n "${HTTP_PID:-}" ] && kill "$HTTP_PID" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT
cleanup_quiet() { docker rm -f chali-test-db chali-test-rest >/dev/null 2>&1 || true; docker network rm chali-test >/dev/null 2>&1 || true; }
cleanup_quiet

docker network create chali-test >/dev/null
docker run -d --name chali-test-db --network chali-test -e POSTGRES_PASSWORD=pg "$PG_IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec chali-test-db pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
sleep 2

echo "== 执行迁移（执行两次，确认可以重复执行）"
docker exec -i chali-test-db psql -U postgres -v ON_ERROR_STOP=1 -q < roles.sql
for _ in 1 2; do
  docker exec -i chali-test-db psql -U postgres -v ON_ERROR_STOP=1 -q < ../supabase/migrations/20261024120000_qr_order.sql 2>&1 | grep -v NOTICE || true
done
docker exec chali-test-db psql -U postgres -v ON_ERROR_STOP=1 -tAc "select chali.create_store('chalichali-01', '茶里茶里')" > "$CHALI_KEY_FILE"

docker run -d --name chali-test-rest --network chali-test -p 3000:3000 \
  -e PGRST_DB_URI=postgres://authenticator:authpass@chali-test-db:5432/postgres \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon "$REST_IMAGE" >/dev/null
for _ in $(seq 1 30); do curl -sf localhost:3000/ >/dev/null 2>&1 && break; sleep 1; done

echo "== 数据库函数"
python3 -I api_test.py

echo "== 只能通过函数访问"
if curl -sf localhost:3000/orders >/dev/null; then echo "FAIL 表被直接公开了"; exit 1; fi
test "$(docker exec chali-test-db psql -U postgres -tAc "select has_table_privilege('anon','chali.orders','select') or has_function_privilege('anon','chali.create_store(text,text)','execute')")" = "f"
echo "PASS anon 不能读表、不能建店"

if [ "${SKIP_WEB:-}" != "1" ]; then
  echo "== 顾客页面"
  mkdir -p "$WORK/site"
  cp ../web/index.html "$WORK/site/"
  printf 'window.CHALI_CONFIG = { restUrl: "%s", anonKey: "local-test", defaultStore: "chalichali-01" };\n' "$CHALI_REST" > "$WORK/site/config.js"
  (cd "$WORK/site" && python3 -m http.server 8080 >/dev/null 2>&1) &
  HTTP_PID=$!
  sleep 1
  node web_test.js "${SHOTS_DIR:-$WORK/shots}"
fi
echo "== 全部通过"
