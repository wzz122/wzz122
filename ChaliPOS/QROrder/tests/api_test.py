"""扫码点单数据库函数测试：在本地 Postgres + PostgREST 上跑（见 run_local.sh）"""
import json, os, sys, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("CHALI_REST", "http://localhost:3000") + "/rpc/"
KEY = open(os.environ["CHALI_KEY_FILE"]).read().strip()
MENU = json.load(open(os.path.join(HERE, "published_menu.json")))
STORE = "chalichali-01"
failures = []

def rpc(fn, **args):
    req = urllib.request.Request(BASE + fn, data=json.dumps(args).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or "null")

def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"))
    if not cond: failures.append(name)

def err(res): return (res[1] or {}).get("message", "") if isinstance(res[1], dict) else ""

# 菜单里的营业日用服务器的「今天」（售罄只对当天有效）
MENU["businessDay"] = rpc("chali_get_menu", p_store=STORE)[1]["businessDay"]

# 门店密钥
r = rpc("chali_staff_publish_menu", p_store=STORE, p_key="wrong", p_menu=MENU, p_accepting=True)
check("错误密钥不能发布菜单", r[0] >= 400 and "unauthorized" in err(r), r)
r = rpc("chali_staff_orders", p_store=STORE, p_key="wrong")
check("错误密钥不能看订单", r[0] >= 400 and "unauthorized" in err(r), r)

# 未发布菜单前不能下单
item = {"itemID": "oolong-roast-milk", "size": "L", "temp": "lessIce", "sweetness": 50, "toppingIDs": ["pearl"], "quantity": 2}
r = rpc("chali_place_order", p_store=STORE, p_dining="takeOut", p_items=[item])
check("未发布菜单时拒绝下单", "not_accepting" in err(r), r)

r = rpc("chali_staff_publish_menu", p_store=STORE, p_key=KEY, p_menu=MENU, p_accepting=True)
check("发布菜单", r[0] == 200 and r[1]["ok"], r)
r = rpc("chali_get_menu", p_store=STORE)
check("顾客读菜单", r[0] == 200 and r[1]["accepting"] and len(r[1]["menu"]["items"]) == 13, r)

# 正常下单：乌龙烤鲜奶 L 少冰 50% +珍珠 ×2 = 750×2；奇异之旅 L = 780
r = rpc("chali_place_order", p_store=STORE, p_dining="takeOut", p_seat=" T3 ", p_note="少一点珍珠",
        p_items=[item, {"itemID": "kiwi-trip", "size": "L", "temp": "normalIce", "sweetness": 100, "toppingIDs": []}])
check("正常下单", r[0] == 200 and r[1]["number"] == 1 and r[1]["total"] == 2280, r)
order1 = r[1]["id"]
r = rpc("chali_place_order", p_store=STORE, p_dining="eatIn",
        p_items=[{"itemID": "salt-osmanthus-milk", "size": "M", "temp": "noIce", "sweetness": 30, "toppingIDs": ["cheese", "cheese"], "quantity": 1, "unitPrice": 1}])
check("单号递增、忽略顾客传来的价格、重复小料只算一次", r[0] == 200 and r[1]["number"] == 2 and r[1]["total"] == 800, r)
order2 = r[1]["id"]

# 各种非法请求
bad = [
    ("售罄饮品", {"itemID": "strawberry", "size": "L", "temp": "normalIce", "sweetness": 100}, "sold_out"),
    ("下架饮品", {"itemID": "durian-milk", "size": "M", "temp": "normalIce", "sweetness": 100}, "item_not_found"),
    ("不存在的饮品", {"itemID": "nope", "size": "L", "temp": "normalIce", "sweetness": 100}, "item_not_found"),
    ("鲜果不能做热的", {"itemID": "kiwi-trip", "size": "L", "temp": "hot", "sweetness": 100}, "bad_temp"),
    ("没有的规格", {"itemID": "kiwi-trip", "size": "M", "temp": "normalIce", "sweetness": 100}, "bad_size"),
    ("非法甜度", {"itemID": "kiwi-trip", "size": "L", "temp": "normalIce", "sweetness": 55}, "bad_sweetness"),
    ("不存在的小料", {"itemID": "kiwi-trip", "size": "L", "temp": "normalIce", "sweetness": 100, "toppingIDs": ["gold"]}, "bad_topping"),
    ("数量 0", {"itemID": "kiwi-trip", "size": "L", "temp": "normalIce", "sweetness": 100, "quantity": 0}, "bad_quantity"),
    ("数量太多", {"itemID": "kiwi-trip", "size": "L", "temp": "normalIce", "sweetness": 100, "quantity": 21}, "bad_quantity"),
]
for name, it, code in bad:
    r = rpc("chali_place_order", p_store=STORE, p_dining="takeOut", p_items=[it])
    check("拒绝" + name, r[0] >= 400 and code in err(r), r)
r = rpc("chali_place_order", p_store=STORE, p_dining="takeOut", p_items=[])
check("拒绝空订单", "bad_items" in err(r), r)
r = rpc("chali_place_order", p_store=STORE, p_dining="delivery", p_items=[item])
check("拒绝非法用餐方式", "bad_dining" in err(r), r)
r = rpc("chali_place_order", p_store=STORE, p_dining="takeOut", p_items=[dict(item, quantity=16), dict(item, quantity=16)])
check("一单最多 30 杯", "too_many_cups" in err(r), r)
r = rpc("chali_place_order", p_store="other", p_dining="takeOut", p_items=[item])
check("不存在的门店", "store_not_found" in err(r), r)

# 店内用按税率换算（菜单设置 convertByTaxRate）
conv = dict(MENU, eatInPricing="convertByTaxRate")
rpc("chali_staff_publish_menu", p_store=STORE, p_key=KEY, p_menu=conv, p_accepting=True)
r = rpc("chali_place_order", p_store=STORE, p_dining="eatIn", p_items=[{"itemID": "oolong-roast-milk", "size": "L", "temp": "lessIce", "sweetness": 50, "toppingIDs": ["pearl"]}])
check("店内用按 110/108 换算（680→693，珍珠 70→71）", r[0] == 200 and r[1]["total"] == 764, r)
order3 = r[1]["id"]

# 昨天的售罄不再生效
stale = dict(MENU, businessDay="2000-01-01")
rpc("chali_staff_publish_menu", p_store=STORE, p_key=KEY, p_menu=stale, p_accepting=True)
r = rpc("chali_place_order", p_store=STORE, p_dining="takeOut", p_items=[{"itemID": "strawberry", "size": "L", "temp": "normalIce", "sweetness": 100}])
check("昨天标的售罄今天自动恢复", r[0] == 200, r)
rpc("chali_staff_publish_menu", p_store=STORE, p_key=KEY, p_menu=MENU, p_accepting=True)

# 暂停接单
rpc("chali_staff_publish_menu", p_store=STORE, p_key=KEY, p_menu=MENU, p_accepting=False)
r = rpc("chali_place_order", p_store=STORE, p_dining="takeOut", p_items=[item])
check("暂停接单时拒绝", "not_accepting" in err(r), r)
rpc("chali_staff_publish_menu", p_store=STORE, p_key=KEY, p_menu=MENU, p_accepting=True)

# 顾客查看状态
r = rpc("chali_order_status", p_order=order1)
check("顾客查看状态", r[0] == 200 and r[1]["status"] == "received" and r[1]["seat"] == "T3" and r[1]["note"] == "少一点珍珠" and r[1]["storeName"] == "茶里茶里", r)
r = rpc("chali_order_status", p_order="00000000-0000-0000-0000-000000000000")
check("不存在的订单返回空", r[0] == 200 and r[1] is None, r)

# 店员：接单（取餐号 041）→ 做好 → 取消另一单
r = rpc("chali_staff_orders", p_store=STORE, p_key=KEY)
check("店员拉取订单", r[0] == 200 and len(r[1]) == 4, (r[0], len(r[1]) if isinstance(r[1], list) else r))
since = max(o["updatedAt"] for o in r[1])
r = rpc("chali_staff_update_order", p_store=STORE, p_key=KEY, p_order=order1, p_status="accepted", p_pickup_number=41)
check("接单", r[0] == 200 and r[1]["status"] == "accepted" and r[1]["pickupNumber"] == 41, r)
r = rpc("chali_staff_update_order", p_store=STORE, p_key=KEY, p_order=order1, p_status="ready")
check("做好（取餐号保留）", r[0] == 200 and r[1]["status"] == "ready" and r[1]["pickupNumber"] == 41, r)
r = rpc("chali_staff_update_order", p_store=STORE, p_key=KEY, p_order=order2, p_status="cancelled", p_reason="老盐桂花卖完了")
check("拒单带原因", r[0] == 200 and r[1]["cancelReason"] == "老盐桂花卖完了", r)
r = rpc("chali_staff_update_order", p_store=STORE, p_key=KEY, p_order=order2, p_status="paid")
check("拒绝非法状态", "bad_status" in err(r), r)
r = rpc("chali_staff_orders", p_store=STORE, p_key=KEY, p_since=since)
check("只拉取有变化的订单", r[0] == 200 and {o["id"] for o in r[1]} == {order1, order2}, r)
r = rpc("chali_order_status", p_order=order1)
check("顾客看到可取餐和取餐号", r[1]["status"] == "ready" and r[1]["pickupNumber"] == 41, r)

print(f"\n{len(failures)} failures")
sys.exit(1 if failures else 0)
