-- Fragancia y Miel: esquema compartido para Supabase.
-- Ejecuta este archivo en Supabase > SQL Editor. No uses una clave service_role en el cliente.

create extension if not exists pgcrypto;

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  unit text not null check (unit in ('g', 'ml', 'pza')),
  initial_stock numeric(14, 3) not null default 0 check (initial_stock >= 0),
  purchased numeric(14, 3) not null default 0 check (purchased >= 0),
  used numeric(14, 3) not null default 0 check (used >= 0),
  minimum_stock numeric(14, 3) not null default 0 check (minimum_stock >= 0),
  total_cost numeric(14, 2) not null default 0 check (total_cost >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

create table if not exists public.indirects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null default 'Envase / Botella',
  cost numeric(14, 2) not null default 0 check (cost >= 0),
  yield_value numeric(14, 3) not null check (yield_value > 0),
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

create table if not exists public.utensils (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  cost numeric(14, 2) not null default 0 check (cost >= 0),
  useful_life numeric(14, 3) not null check (useful_life > 0),
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  batch_size integer not null check (batch_size > 0),
  soap_weight numeric(10, 2) not null check (soap_weight > 0),
  indirect_id uuid references public.indirects(id) on delete set null,
  utensil_id uuid references public.utensils(id) on delete set null,
  margin numeric(8, 2) not null default 100 check (margin >= 0),
  price_detail numeric(14, 2) check (price_detail is null or price_detail >= 0),
  price_wholesale numeric(14, 2) check (price_wholesale is null or price_wholesale >= 0),
  price_event numeric(14, 2) check (price_event is null or price_event >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

alter table public.recipes add column if not exists price_detail numeric(14, 2) check (price_detail is null or price_detail >= 0);
alter table public.recipes add column if not exists price_wholesale numeric(14, 2) check (price_wholesale is null or price_wholesale >= 0);
alter table public.recipes add column if not exists price_event numeric(14, 2) check (price_event is null or price_event >= 0);

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(14, 3) not null check (quantity > 0),
  unique (recipe_id, material_id)
);

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipe_id uuid references public.recipes(id) on delete set null,
  recipe_name text not null,
  code text not null,
  quantity integer not null check (quantity > 0),
  batch_date date not null default current_date,
  total_cost numeric(14, 2) not null check (total_cost >= 0),
  unit_cost numeric(14, 4) not null check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

create sequence if not exists public.sales_invoice_number_seq;
create sequence if not exists public.purchases_number_seq;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  invoice_number text unique,
  invoice_date date,
  customer_name text not null default 'Cliente general',
  customer_phone text,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'card', 'other')),
  payment_status text not null default 'paid' check (payment_status in ('paid', 'pending')),
  paid_at timestamptz,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  issued_at timestamptz,
  check (
    (status = 'draft' and invoice_number is null and invoice_date is null and issued_at is null)
    or (status = 'issued' and invoice_number is not null and invoice_date is not null and issued_at is not null)
  )
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  recipe_name text not null,
  quantity integer not null check (quantity > 0),
  price_type text not null check (price_type in ('detail', 'wholesale', 'event')),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  unit_cost numeric(14, 4) not null default 0 check (unit_cost >= 0),
  cost_total numeric(14, 2) not null default 0 check (cost_total >= 0),
  cost_recorded boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.sales add column if not exists payment_status text not null default 'paid' check (payment_status in ('paid', 'pending'));
alter table public.sales add column if not exists paid_at timestamptz;
alter table public.sale_items add column if not exists unit_cost numeric(14, 4) not null default 0 check (unit_cost >= 0);
alter table public.sale_items add column if not exists cost_total numeric(14, 2) not null default 0 check (cost_total >= 0);
alter table public.sale_items add column if not exists cost_recorded boolean not null default false;

update public.sales
set paid_at = coalesce(issued_at, created_at)
where status = 'issued' and payment_status = 'paid' and paid_at is null;

with average_cost as (
  select recipe_id, sum(total_cost) / nullif(sum(quantity), 0) as unit_cost
  from public.batches
  where recipe_id is not null
  group by recipe_id
)
update public.sale_items si
set unit_cost = round(ac.unit_cost, 4),
    cost_total = round(ac.unit_cost * si.quantity, 2),
    cost_recorded = true
from public.sales s, average_cost ac
where s.id = si.sale_id
  and s.status = 'issued'
  and si.recipe_id = ac.recipe_id
  and not si.cost_recorded;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_number text not null unique,
  supplier_name text not null default 'Proveedor general',
  purchase_date date not null default current_date,
  payment_status text not null default 'paid' check (payment_status in ('paid', 'pending')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'card', 'other')),
  total numeric(14, 2) not null default 0 check (total >= 0),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  item_type text not null default 'materials' check (item_type in ('materials', 'indirects', 'utensils')),
  material_id uuid references public.materials(id) on delete restrict,
  indirect_id uuid references public.indirects(id) on delete restrict,
  utensil_id uuid references public.utensils(id) on delete restrict,
  item_name text not null,
  material_name text,
  quantity numeric(14, 3) not null check (quantity > 0),
  unit_cost numeric(14, 6) not null check (unit_cost >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  check (
    (item_type = 'materials' and material_id is not null and indirect_id is null and utensil_id is null)
    or (item_type = 'indirects' and material_id is null and indirect_id is not null and utensil_id is null)
    or (item_type = 'utensils' and material_id is null and indirect_id is null and utensil_id is not null)
  ),
  created_at timestamptz not null default now()
);

alter table public.purchase_items alter column material_id drop not null;
alter table public.purchase_items alter column material_name drop not null;
alter table public.purchase_items add column if not exists item_type text not null default 'materials' check (item_type in ('materials', 'indirects', 'utensils'));
alter table public.purchase_items add column if not exists indirect_id uuid references public.indirects(id) on delete restrict;
alter table public.purchase_items add column if not exists utensil_id uuid references public.utensils(id) on delete restrict;
alter table public.purchase_items add column if not exists item_name text;

update public.purchase_items
set item_name = coalesce(material_name, 'Artículo')
where item_name is null;

alter table public.purchase_items alter column item_name set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_items_product_check'
      and conrelid = 'public.purchase_items'::regclass
  ) then
    alter table public.purchase_items add constraint purchase_items_product_check check (
      (item_type = 'materials' and material_id is not null and indirect_id is null and utensil_id is null)
      or (item_type = 'indirects' and material_id is null and indirect_id is not null and utensil_id is null)
      or (item_type = 'utensils' and material_id is null and indirect_id is null and utensil_id is not null)
    );
  end if;
end;
$$;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null,
  category text not null,
  amount numeric(14, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  payment_status text not null default 'paid' check (payment_status in ('paid', 'pending')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'card', 'other')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.finance_settings (
  id integer primary key default 1 check (id = 1),
  opening_date date not null default current_date,
  opening_cash numeric(14, 2) not null default 0 check (opening_cash >= 0),
  opening_receivables numeric(14, 2) not null default 0 check (opening_receivables >= 0),
  opening_payables numeric(14, 2) not null default 0 check (opening_payables >= 0),
  opening_equity numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.finance_settings (id) values (1) on conflict (id) do nothing;

create index if not exists materials_owner_idx on public.materials(owner_id);
create index if not exists indirects_owner_idx on public.indirects(owner_id);
create index if not exists utensils_owner_idx on public.utensils(owner_id);
create index if not exists recipes_owner_idx on public.recipes(owner_id);
create index if not exists batches_owner_date_idx on public.batches(owner_id, batch_date desc);
create index if not exists recipe_items_recipe_idx on public.recipe_items(recipe_id);
create index if not exists sales_created_at_idx on public.sales(created_at desc);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);
create index if not exists sale_items_recipe_idx on public.sale_items(recipe_id);
create index if not exists purchases_date_idx on public.purchases(purchase_date desc);
create index if not exists purchase_items_purchase_idx on public.purchase_items(purchase_id);
create index if not exists expenses_date_idx on public.expenses(expense_date desc);

alter table public.materials enable row level security;
alter table public.indirects enable row level security;
alter table public.utensils enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.batches enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.expenses enable row level security;
alter table public.finance_settings enable row level security;

drop policy if exists "Owners manage their materials" on public.materials;
drop policy if exists "Authenticated users manage shared materials" on public.materials;
create policy "Authenticated users manage shared materials" on public.materials
  for all to authenticated using (true) with check (true);

drop policy if exists "Owners manage their indirects" on public.indirects;
drop policy if exists "Authenticated users manage shared indirects" on public.indirects;
create policy "Authenticated users manage shared indirects" on public.indirects
  for all to authenticated using (true) with check (true);

drop policy if exists "Owners manage their utensils" on public.utensils;
drop policy if exists "Authenticated users manage shared utensils" on public.utensils;
create policy "Authenticated users manage shared utensils" on public.utensils
  for all to authenticated using (true) with check (true);

drop policy if exists "Owners manage their recipes" on public.recipes;
drop policy if exists "Authenticated users manage shared recipes" on public.recipes;
create policy "Authenticated users manage shared recipes" on public.recipes
  for all to authenticated using (true) with check (true);

drop policy if exists "Owners manage their recipe items" on public.recipe_items;
drop policy if exists "Authenticated users manage shared recipe items" on public.recipe_items;
create policy "Authenticated users manage shared recipe items" on public.recipe_items
  for all to authenticated using (true) with check (true);

drop policy if exists "Owners manage their batches" on public.batches;
drop policy if exists "Authenticated users manage shared batches" on public.batches;
create policy "Authenticated users manage shared batches" on public.batches
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage shared sales" on public.sales;
create policy "Authenticated users manage shared sales" on public.sales
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage shared sale items" on public.sale_items;
create policy "Authenticated users manage shared sale items" on public.sale_items
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage shared purchases" on public.purchases;
create policy "Authenticated users manage shared purchases" on public.purchases
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage shared purchase items" on public.purchase_items;
create policy "Authenticated users manage shared purchase items" on public.purchase_items
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage shared expenses" on public.expenses;
create policy "Authenticated users manage shared expenses" on public.expenses
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage finance settings" on public.finance_settings;
create policy "Authenticated users manage finance settings" on public.finance_settings
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.materials, public.indirects, public.utensils, public.recipes, public.recipe_items, public.batches, public.sales, public.sale_items, public.purchases, public.purchase_items, public.expenses, public.finance_settings to authenticated;
grant usage, select on sequence public.sales_invoice_number_seq, public.purchases_number_seq to authenticated;

drop function if exists public.save_recipe(uuid, text, integer, numeric, uuid, uuid, numeric, jsonb);

create or replace function public.save_recipe(
  p_recipe_id uuid,
  p_name text,
  p_batch_size integer,
  p_soap_weight numeric,
  p_indirect_id uuid,
  p_utensil_id uuid,
  p_margin numeric,
  p_price_detail numeric,
  p_price_wholesale numeric,
  p_price_event numeric,
  p_items jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_recipe_id uuid;
begin
  if v_owner is null then
    raise exception 'Debes iniciar sesión para guardar recetas.';
  end if;
  if nullif(trim(p_name), '') is null or p_batch_size is null or p_batch_size <= 0
     or p_soap_weight is null or p_soap_weight <= 0 or p_margin is null or p_margin < 0
     or (p_price_detail is not null and p_price_detail < 0)
     or (p_price_wholesale is not null and p_price_wholesale < 0)
     or (p_price_event is not null and p_price_event < 0)
     or p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La receta debe tener nombre, cantidades válidas y al menos un ingrediente.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(material_id uuid, quantity numeric)
    left join public.materials m on m.id = item.material_id
    where m.id is null or item.quantity is null or item.quantity <= 0
  ) then
    raise exception 'La receta contiene una materia prima inexistente o una cantidad inválida.';
  end if;
  if p_indirect_id is not null and not exists (
    select 1 from public.indirects where id = p_indirect_id
  ) then
    raise exception 'No se encontró el insumo indirecto seleccionado.';
  end if;
  if p_utensil_id is not null and not exists (
    select 1 from public.utensils where id = p_utensil_id
  ) then
    raise exception 'No se encontró el utensilio seleccionado.';
  end if;

  if p_recipe_id is null then
    insert into public.recipes (
      owner_id, name, batch_size, soap_weight, indirect_id, utensil_id, margin,
      price_detail, price_wholesale, price_event
    )
    values (
      v_owner, trim(p_name), p_batch_size, p_soap_weight, p_indirect_id, p_utensil_id, p_margin,
      p_price_detail, p_price_wholesale, p_price_event
    )
    returning id into v_recipe_id;
  else
    update public.recipes
    set name = trim(p_name), batch_size = p_batch_size, soap_weight = p_soap_weight,
        indirect_id = p_indirect_id, utensil_id = p_utensil_id, margin = p_margin,
        price_detail = p_price_detail, price_wholesale = p_price_wholesale, price_event = p_price_event
    where id = p_recipe_id
    returning id into v_recipe_id;
    if v_recipe_id is null then
      raise exception 'No se encontró la receta para actualizar.';
    end if;
    delete from public.recipe_items where recipe_id = v_recipe_id;
  end if;

  insert into public.recipe_items (recipe_id, material_id, quantity)
  select v_recipe_id, item.material_id, sum(item.quantity)
  from jsonb_to_recordset(p_items) as item(material_id uuid, quantity numeric)
  group by item.material_id;

  return v_recipe_id;
end;
$$;

create or replace function public.produce_batch(p_recipe_id uuid, p_code text, p_quantity integer)
returns public.batches
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_recipe public.recipes%rowtype;
  v_batch public.batches%rowtype;
  v_item record;
  v_required numeric;
  v_unit_cost numeric;
  v_material_cost numeric := 0;
  v_indirect_cost numeric := 0;
  v_utensil_cost numeric := 0;
  v_total numeric;
begin
  if v_owner is null then
    raise exception 'Debes iniciar sesión para registrar producción.';
  end if;
  if nullif(trim(p_code), '') is null or p_quantity is null or p_quantity <= 0 then
    raise exception 'El código de lote y la cantidad deben ser válidos.';
  end if;

  select * into v_recipe from public.recipes
  where id = p_recipe_id
  for update;
  if not found then
    raise exception 'No se encontró la receta seleccionada.';
  end if;

  for v_item in
    select ri.material_id, ri.quantity, m.initial_stock, m.purchased, m.used, m.total_cost
    from public.recipe_items ri
    join public.materials m on m.id = ri.material_id
    where ri.recipe_id = v_recipe.id
    order by ri.material_id
    for update of m
  loop
    v_required := v_item.quantity * p_quantity::numeric / v_recipe.batch_size;
    if v_item.initial_stock + v_item.purchased - v_item.used < v_required then
      raise exception 'Existencias insuficientes para una o más materias primas.';
    end if;
    v_unit_cost := case when v_item.initial_stock + v_item.purchased > 0
      then v_item.total_cost / (v_item.initial_stock + v_item.purchased) else 0 end;
    v_material_cost := v_material_cost + v_unit_cost * v_required;
    update public.materials set used = used + v_required where id = v_item.material_id;
  end loop;

  if v_recipe.indirect_id is not null then
    select i.cost / i.yield_value * p_quantity into v_indirect_cost
    from public.indirects i where i.id = v_recipe.indirect_id;
    v_indirect_cost := coalesce(v_indirect_cost, 0);
  end if;
  if v_recipe.utensil_id is not null then
    select u.cost / u.useful_life * p_quantity into v_utensil_cost
    from public.utensils u where u.id = v_recipe.utensil_id;
    v_utensil_cost := coalesce(v_utensil_cost, 0);
  end if;

  v_total := v_material_cost + v_indirect_cost + v_utensil_cost;
  insert into public.batches (owner_id, recipe_id, recipe_name, code, quantity, total_cost, unit_cost)
  values (v_owner, v_recipe.id, v_recipe.name, trim(p_code), p_quantity, v_total, v_total / p_quantity)
  returning * into v_batch;
  return v_batch;
end;
$$;

drop function if exists public.save_sales_order(uuid, text, text, text, jsonb);

create or replace function public.save_sales_order(
  p_sale_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_payment_status text,
  p_items jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_sale_id uuid;
  v_total numeric(14, 2);
begin
  if v_owner is null then
    raise exception 'Debes iniciar sesión para guardar pedidos.';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'Selecciona un método de pago válido.';
  end if;
  if p_payment_status is null or p_payment_status not in ('paid', 'pending') then
    raise exception 'Selecciona un estado de pago válido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega por lo menos un producto al pedido.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(recipe_id uuid, quantity integer, price_type text)
    left join public.recipes r on r.id = item.recipe_id
    where r.id is null
      or item.quantity is null or item.quantity <= 0
      or item.price_type not in ('detail', 'wholesale', 'event')
      or case item.price_type
        when 'detail' then r.price_detail
        when 'wholesale' then r.price_wholesale
        when 'event' then r.price_event
        else null
      end is null
  ) then
    raise exception 'El pedido contiene un producto o precio inválido. Revisa los precios de la receta.';
  end if;

  if p_sale_id is null then
    insert into public.sales (owner_id, customer_name, customer_phone, payment_method, payment_status)
    values (v_owner, coalesce(nullif(trim(p_customer_name), ''), 'Cliente general'),
      nullif(trim(p_customer_phone), ''), p_payment_method, p_payment_status)
    returning id into v_sale_id;
  else
    update public.sales
    set customer_name = coalesce(nullif(trim(p_customer_name), ''), 'Cliente general'),
        customer_phone = nullif(trim(p_customer_phone), ''),
        payment_method = p_payment_method,
        payment_status = p_payment_status,
        subtotal = 0,
        total = 0
    where id = p_sale_id and status = 'draft'
    returning id into v_sale_id;
    if v_sale_id is null then
      raise exception 'No se encontró el pedido en borrador para actualizar.';
    end if;
    delete from public.sale_items where sale_id = v_sale_id;
  end if;

  insert into public.sale_items (
    sale_id, recipe_id, recipe_name, quantity, price_type, unit_price, line_total
  )
  select
    v_sale_id,
    r.id,
    r.name,
    item.quantity,
    item.price_type,
    case item.price_type
      when 'detail' then r.price_detail
      when 'wholesale' then r.price_wholesale
      when 'event' then r.price_event
    end,
    round(case item.price_type
      when 'detail' then r.price_detail
      when 'wholesale' then r.price_wholesale
      when 'event' then r.price_event
    end * item.quantity, 2)
  from jsonb_to_recordset(p_items) as item(recipe_id uuid, quantity integer, price_type text)
  join public.recipes r on r.id = item.recipe_id;

  select coalesce(sum(line_total), 0) into v_total
  from public.sale_items where sale_id = v_sale_id;

  update public.sales set subtotal = v_total, total = v_total where id = v_sale_id;
  return v_sale_id;
end;
$$;

create or replace function public.issue_sales_order(p_sale_id uuid)
returns public.sales
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_item record;
  v_available numeric;
  v_available_value numeric;
  v_average_cost numeric;
  v_invoice_number text;
begin
  if v_owner is null then
    raise exception 'Debes iniciar sesión para emitir comprobantes.';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found or v_sale.status <> 'draft' then
    raise exception 'No se encontró un pedido en borrador para emitir.';
  end if;

  if not exists (select 1 from public.sale_items where sale_id = p_sale_id) then
    raise exception 'El pedido no tiene productos.';
  end if;

  for v_item in
    select recipe_id, sum(quantity)::integer as quantity
    from public.sale_items
    where sale_id = p_sale_id
    group by recipe_id
    order by recipe_id
  loop
    perform 1 from public.recipes where id = v_item.recipe_id for update;
    if not found then
      raise exception 'No se encontró una receta del pedido.';
    end if;

    select
      coalesce(sum(b.quantity), 0) - coalesce((
        select sum(si.quantity)
        from public.sales s
        join public.sale_items si on si.sale_id = s.id
        where s.status = 'issued' and si.recipe_id = v_item.recipe_id
      ), 0)
    into v_available
    from public.batches b
    where b.recipe_id = v_item.recipe_id;

    if v_available < v_item.quantity then
      raise exception 'Existencias insuficientes para "%". Disponibles: %, solicitadas: %.',
        (select name from public.recipes where id = v_item.recipe_id),
        v_available,
        v_item.quantity;
    end if;

    select
      coalesce(sum(b.total_cost), 0) - coalesce((
        select sum(si.cost_total)
        from public.sales s
        join public.sale_items si on si.sale_id = s.id
        where s.status = 'issued' and si.recipe_id = v_item.recipe_id
      ), 0)
    into v_available_value
    from public.batches b
    where b.recipe_id = v_item.recipe_id;

    v_average_cost := case when v_available > 0 then greatest(v_available_value, 0) / v_available else 0 end;

    update public.sale_items
    set unit_cost = round(v_average_cost, 4),
        cost_total = round(v_average_cost * quantity, 2),
        cost_recorded = true
    where sale_id = p_sale_id and recipe_id = v_item.recipe_id;
  end loop;

  v_invoice_number := 'FYM-' || pg_catalog.to_char(current_date, 'YYYYMMDD') || '-'
    || pg_catalog.lpad(pg_catalog.nextval('public.sales_invoice_number_seq')::text, 6, '0');

  update public.sales
  set status = 'issued',
      invoice_number = v_invoice_number,
      invoice_date = current_date,
      issued_at = now(),
      paid_at = case when payment_status = 'paid' then now() else null end
  where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

create or replace function public.record_purchase(
  p_supplier_name text,
  p_purchase_date date,
  p_payment_status text,
  p_payment_method text,
  p_items jsonb
)
returns public.purchases
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_purchase public.purchases%rowtype;
  v_purchase_id uuid;
  v_total numeric(14, 2);
  v_number text;
begin
  if v_owner is null then
    raise exception 'Debes iniciar sesión para registrar compras.';
  end if;
  if p_purchase_date is null then
    raise exception 'La fecha de compra es obligatoria.';
  end if;
  if p_payment_status is null or p_payment_status not in ('paid', 'pending') then
    raise exception 'Selecciona un estado de pago válido.';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'Selecciona un método de pago válido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega por lo menos un artículo a la compra.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(item_type text, material_id uuid, indirect_id uuid, utensil_id uuid, quantity numeric, unit_cost numeric)
    left join public.materials m on m.id = item.material_id
    left join public.indirects i on i.id = item.indirect_id
    left join public.utensils u on u.id = item.utensil_id
    where item.quantity is null or item.quantity <= 0
      or item.unit_cost is null or item.unit_cost < 0
      or case item.item_type
        when 'materials' then m.id is null or item.indirect_id is not null or item.utensil_id is not null
        when 'indirects' then i.id is null or item.material_id is not null or item.utensil_id is not null
        when 'utensils' then u.id is null or item.material_id is not null or item.indirect_id is not null
        else true
      end
  ) then
    raise exception 'La compra contiene un artículo, cantidad o costo inválido.';
  end if;

  v_number := 'CMP-' || pg_catalog.to_char(p_purchase_date, 'YYYYMMDD') || '-'
    || pg_catalog.lpad(pg_catalog.nextval('public.purchases_number_seq')::text, 6, '0');

  insert into public.purchases (
    owner_id, purchase_number, supplier_name, purchase_date, payment_status, payment_method, paid_at
  )
  values (
    v_owner, v_number, coalesce(nullif(trim(p_supplier_name), ''), 'Proveedor general'),
    p_purchase_date, p_payment_status, p_payment_method,
    case when p_payment_status = 'paid' then now() else null end
  )
  returning id into v_purchase_id;

  insert into public.purchase_items (
    purchase_id, item_type, material_id, indirect_id, utensil_id, item_name, material_name,
    quantity, unit_cost, line_total
  )
  select
    v_purchase_id,
    item.item_type,
    case when item.item_type = 'materials' then m.id end,
    case when item.item_type = 'indirects' then i.id end,
    case when item.item_type = 'utensils' then u.id end,
    case item.item_type when 'materials' then m.name when 'indirects' then i.name else u.name end,
    case when item.item_type = 'materials' then m.name end,
    item.quantity,
    item.unit_cost,
    round(item.quantity * item.unit_cost, 2)
  from jsonb_to_recordset(p_items) as item(item_type text, material_id uuid, indirect_id uuid, utensil_id uuid, quantity numeric, unit_cost numeric)
  left join public.materials m on m.id = item.material_id
  left join public.indirects i on i.id = item.indirect_id
  left join public.utensils u on u.id = item.utensil_id;

  update public.materials m
  set purchased = m.purchased + item_totals.quantity,
      total_cost = m.total_cost + item_totals.total_cost
  from (
    select item.material_id,
      sum(quantity) as quantity,
      sum(round(quantity * unit_cost, 2)) as total_cost
    from jsonb_to_recordset(p_items) as item(item_type text, material_id uuid, indirect_id uuid, utensil_id uuid, quantity numeric, unit_cost numeric)
    where item.item_type = 'materials'
    group by item.material_id
  ) item_totals
  where m.id = item_totals.material_id;

  update public.indirects i
  set cost = i.cost + item_totals.total_cost,
      yield_value = i.yield_value + item_totals.quantity
  from (
    select item.indirect_id,
      sum(item.quantity) as quantity,
      sum(round(item.quantity * item.unit_cost, 2)) as total_cost
    from jsonb_to_recordset(p_items) as item(item_type text, material_id uuid, indirect_id uuid, utensil_id uuid, quantity numeric, unit_cost numeric)
    where item.item_type = 'indirects'
    group by item.indirect_id
  ) item_totals
  where i.id = item_totals.indirect_id;

  update public.utensils u
  set cost = u.cost + item_totals.total_cost,
      useful_life = u.useful_life + item_totals.quantity
  from (
    select item.utensil_id,
      sum(item.quantity) as quantity,
      sum(round(item.quantity * item.unit_cost, 2)) as total_cost
    from jsonb_to_recordset(p_items) as item(item_type text, material_id uuid, indirect_id uuid, utensil_id uuid, quantity numeric, unit_cost numeric)
    where item.item_type = 'utensils'
    group by item.utensil_id
  ) item_totals
  where u.id = item_totals.utensil_id;
  select coalesce(sum(line_total), 0) into v_total
  from public.purchase_items where purchase_id = v_purchase_id;
  update public.purchases set total = v_total where id = v_purchase_id returning * into v_purchase;
  return v_purchase;
end;
$$;

create or replace function public.mark_purchase_paid(p_purchase_id uuid, p_payment_method text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar pagos.';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'Selecciona un método de pago válido.';
  end if;
  update public.purchases
  set payment_status = 'paid', payment_method = p_payment_method, paid_at = now()
  where id = p_purchase_id and payment_status = 'pending';
  if not found then
    raise exception 'No se encontró una compra pendiente de pago.';
  end if;
end;
$$;

create or replace function public.mark_sale_paid(p_sale_id uuid, p_payment_method text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar pagos.';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'Selecciona un método de pago válido.';
  end if;
  update public.sales
  set payment_status = 'paid', payment_method = p_payment_method, paid_at = now()
  where id = p_sale_id and status = 'issued' and payment_status = 'pending';
  if not found then
    raise exception 'No se encontró una venta pendiente de pago.';
  end if;
end;
$$;

create or replace function public.record_expense(
  p_description text,
  p_category text,
  p_amount numeric,
  p_expense_date date,
  p_payment_status text,
  p_payment_method text
)
returns public.expenses
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_expense public.expenses%rowtype;
begin
  if v_owner is null then
    raise exception 'Debes iniciar sesión para registrar gastos.';
  end if;
  if nullif(trim(p_description), '') is null or nullif(trim(p_category), '') is null
     or p_amount is null or p_amount <= 0 or p_expense_date is null then
    raise exception 'Completa la descripción, categoría, fecha e importe del gasto.';
  end if;
  if p_payment_status is null or p_payment_status not in ('paid', 'pending') then
    raise exception 'Selecciona un estado de pago válido.';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'Selecciona un método de pago válido.';
  end if;

  insert into public.expenses (
    owner_id, description, category, amount, expense_date, payment_status, payment_method, paid_at
  )
  values (
    v_owner, trim(p_description), trim(p_category), p_amount, p_expense_date,
    p_payment_status, p_payment_method,
    case when p_payment_status = 'paid' then now() else null end
  )
  returning * into v_expense;
  return v_expense;
end;
$$;

create or replace function public.mark_expense_paid(p_expense_id uuid, p_payment_method text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar pagos.';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card', 'other') then
    raise exception 'Selecciona un método de pago válido.';
  end if;
  update public.expenses
  set payment_status = 'paid', payment_method = p_payment_method, paid_at = now()
  where id = p_expense_id and payment_status = 'pending';
  if not found then
    raise exception 'No se encontró un gasto pendiente de pago.';
  end if;
end;
$$;

revoke all on function public.save_recipe(uuid, text, integer, numeric, uuid, uuid, numeric, numeric, numeric, numeric, jsonb) from public;
revoke all on function public.produce_batch(uuid, text, integer) from public;
revoke all on function public.save_sales_order(uuid, text, text, text, text, jsonb) from public;
revoke all on function public.issue_sales_order(uuid) from public;
revoke all on function public.record_purchase(text, date, text, text, jsonb) from public;
revoke all on function public.mark_purchase_paid(uuid, text) from public;
revoke all on function public.mark_sale_paid(uuid, text) from public;
revoke all on function public.record_expense(text, text, numeric, date, text, text) from public;
revoke all on function public.mark_expense_paid(uuid, text) from public;
grant execute on function public.save_recipe(uuid, text, integer, numeric, uuid, uuid, numeric, numeric, numeric, numeric, jsonb) to authenticated;
grant execute on function public.produce_batch(uuid, text, integer) to authenticated;
grant execute on function public.save_sales_order(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.issue_sales_order(uuid) to authenticated;
grant execute on function public.record_purchase(text, date, text, text, jsonb) to authenticated;
grant execute on function public.mark_purchase_paid(uuid, text) to authenticated;
grant execute on function public.mark_sale_paid(uuid, text) to authenticated;
grant execute on function public.record_expense(text, text, numeric, date, text, text) to authenticated;
grant execute on function public.mark_expense_paid(uuid, text) to authenticated;
