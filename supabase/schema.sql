-- =====================================================================
-- Lo de Carmi · Esquema de la base (PostgreSQL en Supabase)
--
-- Refleja la base al 25/11/2026. Es para crear el sistema en un proyecto
-- NUEVO y vacío (Supabase > SQL Editor). No trae datos.
--
-- Seguridad: todas las tablas tienen RLS y "authenticated" puede todo.
-- Por eso es obligatorio DESACTIVAR el registro público en
-- Authentication y crear a mano los usuarios del local.
-- =====================================================================

-- Tablas --------------------------------------------------------------

create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,
  price       integer not null check (price >= 0),        -- Gs, entero
  active      boolean not null default true,
  created_at  timestamptz default now(),
  kind        text not null default 'plato'
              constraint menu_items_kind_check
              check (kind in ('plato', 'guarnicion', 'bebida', 'postre')),
  description text,
  image_url   text,                                       -- reservado
  show_on_web boolean not null default true
);

-- Porciones por día. Para una guarnición, 1 = disponible hoy y 0 = no.
create table public.daily_stock (
  stock_date  date not null default (now() at time zone 'America/Asuncion')::date,
  item_id     uuid not null references public.menu_items (id),
  qty_initial integer not null check (qty_initial >= 0),
  qty_sold    integer not null default 0,
  primary key (stock_date, item_id),
  constraint no_oversell check (qty_sold <= qty_initial)
);

create table public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_date     date not null default (now() at time zone 'America/Asuncion')::date,
  ticket_no      integer not null,                        -- se reinicia cada día
  status         text not null default 'pendiente'
                 check (status in ('pendiente', 'en_cocina', 'listo', 'entregado', 'anulado')),
  channel        text not null default 'local'
                 check (channel in ('local', 'delivery', 'vianda')),
  customer_name  text,
  customer_phone text,
  payment_method text
                 check (payment_method in ('efectivo', 'transferencia', 'tarjeta', 'pendiente')),
  notes          text,
  total          integer not null default 0,
  created_at     timestamptz default now(),
  constraint orders_fecha_ticket_unico unique (order_date, ticket_no)
);

create table public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  item_id    uuid not null references public.menu_items (id),
  qty        integer not null check (qty > 0),
  unit_price integer not null                             -- precio al momento de vender
);

create table public.combos (
  id         uuid primary key default gen_random_uuid(),
  viandas    integer not null check (viandas > 0),
  price      integer not null check (price >= 0),
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz default now()
);

-- Sin uso desde que las guarniciones son del día. Se conserva porque
-- existe en la base.
create table public.plato_guarniciones (
  plato_id      uuid not null references public.menu_items (id) on delete cascade,
  guarnicion_id uuid not null references public.menu_items (id) on delete cascade,
  primary key (plato_id, guarnicion_id)
);
create index plato_guarniciones_guarnicion_idx on public.plato_guarniciones (guarnicion_id);

-- Row Level Security ----------------------------------------------------

alter table public.menu_items         enable row level security;
alter table public.daily_stock        enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.combos             enable row level security;
alter table public.plato_guarniciones enable row level security;

create policy "staff_all" on public.menu_items         for all to authenticated using (true) with check (true);
create policy "staff_all" on public.daily_stock        for all to authenticated using (true) with check (true);
create policy "staff_all" on public.orders             for all to authenticated using (true) with check (true);
create policy "staff_all" on public.order_items        for all to authenticated using (true) with check (true);
create policy "staff_all" on public.plato_guarniciones for all to authenticated using (true) with check (true);
create policy "authenticated puede todo" on public.combos for all to authenticated using (true) with check (true);
create policy "anon lee combos activos"  on public.combos for select to anon using (active);

grant all on public.menu_items, public.daily_stock, public.orders, public.order_items,
             public.combos, public.plato_guarniciones to authenticated;
grant select on public.combos to anon;

-- Vistas (security_invoker: respetan el RLS de quien consulta) ----------

create view public.v_stock_hoy with (security_invoker = true) as
  select m.name as plato, m.category as categoria, m.price as precio,
         ds.qty_initial as inicial, ds.qty_sold as vendido,
         ds.qty_initial - ds.qty_sold as disponible
    from public.daily_stock ds
    join public.menu_items m on m.id = ds.item_id
   where ds.stock_date = (now() at time zone 'America/Asuncion')::date;

create view public.v_ventas_por_dia with (security_invoker = true) as
  select order_date as fecha,
         count(*) as pedidos,
         sum(total) as total_vendido,
         sum(total) filter (where payment_method = 'efectivo') as efectivo,
         sum(total) filter (where payment_method = 'transferencia') as transferencia,
         sum(total) filter (where payment_method = 'tarjeta') as tarjeta,
         sum(total) filter (where payment_method = 'pendiente') as pendiente_cobro
    from public.orders
   where status <> 'anulado'
   group by order_date;

create view public.v_ventas_por_plato with (security_invoker = true) as
  select o.order_date as fecha, m.name as plato, m.category as categoria,
         sum(oi.qty) as unidades,
         sum(oi.qty * oi.unit_price) as recaudado
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.menu_items m on m.id = oi.item_id
   where o.status <> 'anulado'
   group by o.order_date, m.name, m.category;

grant select on public.v_stock_hoy, public.v_ventas_por_dia, public.v_ventas_por_plato to authenticated;

-- Funciones -------------------------------------------------------------

-- Crea un pedido en una sola transacción: numera el ticket, toma el precio
-- de la base y descuenta stock. Si algo falla, no queda nada a medias.
create function public.create_order(
  p_channel text, p_customer_name text, p_customer_phone text,
  p_payment text, p_notes text, p_items jsonb
)
returns public.orders
language plpgsql set search_path = public
as $$
declare
  v_today date := (now() at time zone 'America/Asuncion')::date;
  v_order orders; v_ticket int; v_row jsonb;
  v_price int; v_qty int; v_total int := 0;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  -- Bloqueo por día: dos cajas a la vez no pueden sacar el mismo número.
  perform pg_advisory_xact_lock(hashtext('ticket_' || v_today::text));

  select coalesce(max(ticket_no),0) + 1 into v_ticket
    from orders where order_date = v_today;

  insert into orders(order_date, ticket_no, channel, customer_name,
                     customer_phone, payment_method, notes)
  values (v_today, v_ticket, p_channel, p_customer_name,
          p_customer_phone, p_payment, p_notes)
  returning * into v_order;

  for v_row in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_row->>'qty')::int;
    select price into v_price from menu_items
      where id = (v_row->>'item_id')::uuid and active;
    if v_price is null then raise exception 'Plato inexistente o inactivo'; end if;

    update daily_stock set qty_sold = qty_sold + v_qty
      where stock_date = v_today
        and item_id = (v_row->>'item_id')::uuid
        and qty_sold + v_qty <= qty_initial;
    if not found then raise exception 'Sin stock suficiente'; end if;

    insert into order_items(order_id, item_id, qty, unit_price)
    values (v_order.id, (v_row->>'item_id')::uuid, v_qty, v_price);
    v_total := v_total + v_price * v_qty;
  end loop;

  update orders set total = v_total where id = v_order.id returning * into v_order;
  return v_order;
end $$;

-- Anula un pedido y devuelve el stock.
create function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql set search_path = public
as $$
declare v_order orders;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if v_order.status = 'anulado' then raise exception 'El pedido ya estaba anulado'; end if;

  update daily_stock ds
     set qty_sold = greatest(ds.qty_sold - oi.qty, 0)
    from order_items oi
   where oi.order_id = p_order_id
     and ds.item_id = oi.item_id
     and ds.stock_date = v_order.order_date;

  update orders set status = 'anulado' where id = p_order_id returning * into v_order;
  return v_order;
end $$;

-- Crea o actualiza las porciones iniciales de un día (hoy por defecto).
create function public.set_daily_stock(p_items jsonb, p_date date default null)
returns setof public.daily_stock
language plpgsql set search_path = public
as $$
declare v_date date := coalesce(p_date, (now() at time zone 'America/Asuncion')::date);
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  return query
  insert into daily_stock(stock_date, item_id, qty_initial)
  select v_date, (e->>'item_id')::uuid, (e->>'qty')::int
    from jsonb_array_elements(p_items) e
  on conflict (stock_date, item_id) do update set qty_initial = excluded.qty_initial
  returning *;
end $$;

-- Menú público para la web. SECURITY DEFINER a propósito: un visitante sin
-- sesión recibe solo estas columnas, sin acceso a las tablas.
create function public.web_menu_hoy()
returns table (
  id uuid, name text, category text, kind text,
  description text, image_url text, price int, disponible int,
  guarniciones jsonb          -- [{ "name": "Puré", "price": 0 }, ...] price = recargo en Gs
)
language sql stable security definer set search_path = public
as $$
  with hoy as (
    select (now() at time zone 'America/Asuncion')::date as fecha
  ),
  guarn as (
    select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'price', g.price) order by g.name), '[]'::jsonb) as lista
      from public.daily_stock d
      join hoy on d.stock_date = hoy.fecha
      join public.menu_items g on g.id = d.item_id
     where d.qty_initial > 0 and g.kind = 'guarnicion' and g.active and g.show_on_web
  )
  select m.id, m.name, m.category, m.kind, m.description, m.image_url, m.price,
         greatest(d.qty_initial - d.qty_sold, 0) as disponible,
         case when m.kind = 'plato' then guarn.lista else '[]'::jsonb end as guarniciones
    from public.daily_stock d
    join hoy on d.stock_date = hoy.fecha
    join public.menu_items m on m.id = d.item_id
   cross join guarn
   where m.active and m.show_on_web and m.kind <> 'guarnicion'
   order by m.kind, m.name;
$$;

-- Permisos de las funciones: solo web_menu_hoy() es pública.
revoke all on function public.create_order(text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.cancel_order(uuid)                              from public, anon;
revoke all on function public.set_daily_stock(jsonb, date)                    from public, anon;
revoke all on function public.web_menu_hoy()                                  from public;

grant execute on function public.create_order(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.cancel_order(uuid)                                to authenticated;
grant execute on function public.set_daily_stock(jsonb, date)                      to authenticated;
grant execute on function public.web_menu_hoy()                                    to anon, authenticated;
