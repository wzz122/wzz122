-- 茶里茶里 扫码点单（顾客手机点单 → 收银 iPad 接单，到柜台付款）
--
-- 表放在不对外公开的 chali schema，顾客页面和收银 iPad 只能通过下面的 public.chali_* 函数读写：
--   顾客（anon key）：chali_get_menu / chali_place_order / chali_order_status
--   收银 iPad（anon key + 门店密钥）：chali_staff_publish_menu / chali_staff_orders / chali_staff_update_order
-- 价格、售罄、规格是否允许都在服务器端按 iPad 发布的菜单重新计算，顾客端传来的价格一律不用。
--
-- 建店（在 Supabase SQL Editor 里执行一次，返回的门店密钥填进 iPad「设置 → 扫码点单」）：
--   select chali.create_store('chalichali-01', '茶里茶里');

create extension if not exists pgcrypto with schema extensions;

create schema if not exists chali;
revoke all on schema chali from public;

create table if not exists chali.stores (
  id text primary key,
  name text not null,
  staff_key_hash text not null,
  accepting boolean not null default false,
  menu jsonb,
  menu_updated_at timestamptz,
  time_zone text not null default 'Asia/Tokyo',
  cutoff_hour int not null default 4 check (cutoff_hour between 0 and 6)
);

create table if not exists chali.orders (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references chali.stores (id) on delete cascade,
  business_day date not null,
  number int not null,
  seat text,
  dining text not null check (dining in ('eatIn', 'takeOut')),
  lines jsonb not null,
  total int not null check (total >= 0),
  cup_count int not null,
  note text,
  status text not null default 'received'
    check (status in ('received', 'accepted', 'ready', 'completed', 'cancelled')),
  pickup_number int,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, business_day, number)
);

create index if not exists orders_store_updated on chali.orders (store_id, updated_at);
create index if not exists orders_store_status on chali.orders (store_id, status);

alter table chali.stores enable row level security;
alter table chali.orders enable row level security;
revoke all on all tables in schema chali from public;

-- ---------------------------------------------------------------------------
-- 内部函数
-- ---------------------------------------------------------------------------

-- 营业日：凌晨 cutoff_hour 点之前算前一天（和 iPad 的设置一致）
create or replace function chali.business_day(p_store chali.stores)
returns date
language sql
stable
set search_path = ''
as $$
  select ((now() at time zone p_store.time_zone) - make_interval(hours => p_store.cutoff_hour))::date
$$;

create or replace function chali.key_hash(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
$$;

-- 门店密钥校验，不对返回 unauthorized
create or replace function chali.check_staff(p_store text, p_key text)
returns chali.stores
language plpgsql
stable
set search_path = ''
as $$
declare
  s chali.stores;
begin
  select * into s from chali.stores where id = p_store;
  if not found or s.staff_key_hash <> chali.key_hash(p_key) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  return s;
end
$$;

-- 建店 / 重新生成门店密钥（只能在 SQL Editor 里执行，没有开放给 API）
create or replace function chali.create_store(p_id text, p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  insert into chali.stores (id, name, staff_key_hash)
  values (p_id, p_name, chali.key_hash(v_key))
  on conflict (id) do update set name = excluded.name, staff_key_hash = excluded.staff_key_hash;
  return v_key;
end
$$;

-- 菜单价换算（和 App 的 Pricing.adjusted 一致：店内用按 110/108 换算时四舍五入到 1 円）
create or replace function chali.adjusted_price(p_price int, p_convert boolean)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when p_convert then (p_price * 110 * 2 + 108) / (108 * 2) else p_price end
$$;

create or replace function chali.order_json(o chali.orders)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id,
    'number', o.number,
    'businessDay', o.business_day,
    'seat', o.seat,
    'dining', o.dining,
    'lines', o.lines,
    'total', o.total,
    'cupCount', o.cup_count,
    'note', o.note,
    'status', o.status,
    'pickupNumber', o.pickup_number,
    'cancelReason', o.cancel_reason,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at
  )
$$;

revoke execute on all functions in schema chali from public;

-- ---------------------------------------------------------------------------
-- 顾客用
-- ---------------------------------------------------------------------------

create or replace function public.chali_get_menu(p_store text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'storeName', s.name,
    'accepting', s.accepting and s.menu is not null,
    'businessDay', chali.business_day(s),
    'menu', s.menu,
    'updatedAt', s.menu_updated_at
  )
  from chali.stores s
  where s.id = p_store
$$;

create or replace function public.chali_place_order(
  p_store text,
  p_dining text,
  p_items jsonb,
  p_seat text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s chali.stores;
  v_menu jsonb;
  v_today date;
  v_menu_is_today boolean;
  v_convert boolean;
  v_req jsonb;
  v_item jsonb;
  v_topping jsonb;
  v_topping_id text;
  v_picks jsonb;
  v_size text;
  v_temp text;
  v_sweet int;
  v_qty int;
  v_base int;
  v_price int;
  v_unit int;
  v_lines jsonb := '[]'::jsonb;
  v_total int := 0;
  v_cups int := 0;
  v_number int;
  v_id uuid;
begin
  select * into s from chali.stores where id = p_store;
  if not found then
    raise exception 'store_not_found';
  end if;
  if not s.accepting or s.menu is null then
    raise exception 'not_accepting';
  end if;
  if p_dining is null or p_dining not in ('eatIn', 'takeOut') then
    raise exception 'bad_dining';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'bad_items';
  end if;
  if (select count(*) from chali.orders where store_id = s.id and status = 'received') >= 30 then
    raise exception 'busy';
  end if;

  v_menu := s.menu;
  v_today := chali.business_day(s);
  v_menu_is_today := coalesce(v_menu ->> 'businessDay', '') = v_today::text;
  v_convert := p_dining = 'eatIn' and coalesce(v_menu ->> 'eatInPricing', '') = 'convertByTaxRate';

  for v_req in select value from jsonb_array_elements(p_items) loop
    v_item := null;
    select value into v_item
    from jsonb_array_elements(v_menu -> 'items')
    where value ->> 'id' = v_req ->> 'itemID';
    if v_item is null then
      raise exception 'item_not_found';
    end if;
    if v_menu_is_today and coalesce((v_item ->> 'soldOut')::boolean, false) then
      raise exception 'sold_out:%', v_item ->> 'name';
    end if;

    v_size := v_req ->> 'size';
    if v_size is null or v_size not in ('M', 'L') then
      raise exception 'bad_size';
    end if;
    v_base := (v_item -> 'prices' ->> lower(v_size))::int;
    if v_base is null then
      raise exception 'bad_size';
    end if;

    v_temp := v_req ->> 'temp';
    if v_temp is null or not ((v_item -> 'allowedTemps') ? v_temp) then
      raise exception 'bad_temp';
    end if;

    v_sweet := (v_req ->> 'sweetness')::int;
    if v_sweet is null or not ((v_item -> 'allowedSweetness') @> to_jsonb(v_sweet)) then
      raise exception 'bad_sweetness';
    end if;

    v_qty := coalesce((v_req ->> 'quantity')::int, 1);
    if v_qty < 1 or v_qty > 20 then
      raise exception 'bad_quantity';
    end if;

    v_base := chali.adjusted_price(v_base, v_convert);
    v_unit := v_base;
    v_picks := '[]'::jsonb;
    -- 按菜单里小料的顺序（和 App 一致）
    for v_topping in
      select value from jsonb_array_elements(v_menu -> 'toppings')
      where (coalesce(v_req -> 'toppingIDs', '[]'::jsonb)) ? (value ->> 'id')
    loop
      v_topping_id := v_topping ->> 'id';
      if not ((v_item -> 'allowedToppingIDs') ? v_topping_id) then
        raise exception 'bad_topping';
      end if;
      v_price := chali.adjusted_price((v_topping ->> 'price')::int, v_convert);
      v_unit := v_unit + v_price;
      v_picks := v_picks || jsonb_build_array(jsonb_build_object(
        'id', v_topping_id,
        'name', v_topping ->> 'name',
        'nameJP', v_topping ->> 'nameJP',
        'price', v_price
      ));
    end loop;
    if jsonb_array_length(v_picks) <> (
      select count(distinct value) from jsonb_array_elements_text(coalesce(v_req -> 'toppingIDs', '[]'::jsonb))
    ) then
      raise exception 'bad_topping';
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'itemID', v_item ->> 'id',
      'name', v_item ->> 'name',
      'nameJP', v_item ->> 'nameJP',
      'size', v_size,
      'temp', v_temp,
      'sweetness', v_sweet,
      'toppings', v_picks,
      'basePrice', v_base,
      'unitPrice', v_unit,
      'quantity', v_qty
    ));
    v_total := v_total + v_unit * v_qty;
    v_cups := v_cups + v_qty;
  end loop;

  if v_cups > 30 then
    raise exception 'too_many_cups';
  end if;

  -- 每天从 1 号开始的扫码单号
  perform pg_advisory_xact_lock(hashtext(s.id || v_today::text));
  select coalesce(max(number), 0) + 1 into v_number
  from chali.orders where store_id = s.id and business_day = v_today;

  insert into chali.orders (store_id, business_day, number, seat, dining, lines, total, cup_count, note)
  values (
    s.id, v_today, v_number,
    left(nullif(btrim(p_seat), ''), 20),
    p_dining, v_lines, v_total, v_cups,
    left(nullif(btrim(p_note), ''), 200)
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'number', v_number, 'total', v_total);
end
$$;

-- 顾客查看自己订单的状态（订单 id 是随机 UUID，只有下单的人知道）
create or replace function public.chali_order_status(p_order uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select chali.order_json(o) || jsonb_build_object('storeName', s.name)
  from chali.orders o
  join chali.stores s on s.id = o.store_id
  where o.id = p_order
$$;

-- ---------------------------------------------------------------------------
-- 收银 iPad 用（需要门店密钥）
-- ---------------------------------------------------------------------------

create or replace function public.chali_staff_publish_menu(
  p_store text,
  p_key text,
  p_menu jsonb,
  p_accepting boolean,
  p_cutoff_hour int default 4
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s chali.stores;
begin
  s := chali.check_staff(p_store, p_key);
  if p_menu is null or jsonb_typeof(p_menu -> 'items') <> 'array' or octet_length(p_menu::text) > 500000 then
    raise exception 'bad_menu';
  end if;
  update chali.stores
  set menu = p_menu,
      menu_updated_at = now(),
      accepting = coalesce(p_accepting, false),
      cutoff_hour = least(greatest(coalesce(p_cutoff_hour, 4), 0), 6),
      name = coalesce(nullif(p_menu ->> 'storeName', ''), name)
  where id = s.id;
  return jsonb_build_object('ok', true, 'businessDay', chali.business_day(s));
end
$$;

-- 今天的扫码单，以及以前还没处理完的（p_since 只取这之后有变化的）
create or replace function public.chali_staff_orders(
  p_store text,
  p_key text,
  p_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s chali.stores;
begin
  s := chali.check_staff(p_store, p_key);
  return coalesce((
    select jsonb_agg(chali.order_json(o) order by o.created_at)
    from chali.orders o
    where o.store_id = s.id
      and (o.business_day = chali.business_day(s) or o.status in ('received', 'accepted', 'ready'))
      and (p_since is null or o.updated_at > p_since)
  ), '[]'::jsonb);
end
$$;

create or replace function public.chali_staff_update_order(
  p_store text,
  p_key text,
  p_order uuid,
  p_status text,
  p_pickup_number int default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s chali.stores;
  o chali.orders;
begin
  s := chali.check_staff(p_store, p_key);
  if p_status is null or p_status not in ('received', 'accepted', 'ready', 'completed', 'cancelled') then
    raise exception 'bad_status';
  end if;
  update chali.orders
  set status = p_status,
      pickup_number = coalesce(p_pickup_number, pickup_number),
      cancel_reason = case when p_status = 'cancelled' then left(nullif(btrim(p_reason), ''), 100) else null end,
      updated_at = now()
  where id = p_order and store_id = s.id
  returning * into o;
  if not found then
    raise exception 'order_not_found';
  end if;
  return chali.order_json(o);
end
$$;

revoke execute on function public.chali_get_menu(text) from public;
revoke execute on function public.chali_place_order(text, text, jsonb, text, text) from public;
revoke execute on function public.chali_order_status(uuid) from public;
revoke execute on function public.chali_staff_publish_menu(text, text, jsonb, boolean, int) from public;
revoke execute on function public.chali_staff_orders(text, text, timestamptz) from public;
revoke execute on function public.chali_staff_update_order(text, text, uuid, text, int, text) from public;

grant execute on function public.chali_get_menu(text) to anon, authenticated;
grant execute on function public.chali_place_order(text, text, jsonb, text, text) to anon, authenticated;
grant execute on function public.chali_order_status(uuid) to anon, authenticated;
grant execute on function public.chali_staff_publish_menu(text, text, jsonb, boolean, int) to anon, authenticated;
grant execute on function public.chali_staff_orders(text, text, timestamptz) to anon, authenticated;
grant execute on function public.chali_staff_update_order(text, text, uuid, text, int, text) to anon, authenticated;
