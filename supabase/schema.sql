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
  unit_cost numeric(14, 6) not null default 0 check (unit_cost >= 0),
  total_cost numeric(14, 2) not null default 0 check (total_cost >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

alter table public.materials add column if not exists unit_cost numeric(14, 6) not null default 0 check (unit_cost >= 0);
update public.materials
set unit_cost = total_cost / nullif(initial_stock + purchased, 0)
where unit_cost = 0 and total_cost > 0 and initial_stock + purchased > 0;
update public.materials
set total_cost = round(unit_cost * (initial_stock + purchased), 2)
where total_cost is distinct from round(unit_cost * (initial_stock + purchased), 2);

create table if not exists public.indirects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null default 'Envase / Botella',
  cost numeric(14, 2) not null default 0 check (cost >= 0),
  yield_value numeric(14, 3) not null check (yield_value > 0),
  measure_unit text not null default 'pza' check (measure_unit in ('g', 'ml', 'pza')),
  stock numeric(14, 3) not null default 0 check (stock >= 0),
  minimum_stock numeric(14, 3) not null default 0 check (minimum_stock >= 0),
  consumption_per_soap numeric(14, 3) not null default 1 check (consumption_per_soap > 0),
  unit_cost numeric(14, 6) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

alter table public.indirects add column if not exists measure_unit text default 'pza';
alter table public.indirects add column if not exists stock numeric(14, 3);
alter table public.indirects add column if not exists minimum_stock numeric(14, 3) default 0;
alter table public.indirects add column if not exists consumption_per_soap numeric(14, 3) default 1;
alter table public.indirects add column if not exists unit_cost numeric(14, 6);

update public.indirects
set measure_unit = coalesce(measure_unit, 'pza'),
    stock = coalesce(stock, yield_value),
    minimum_stock = coalesce(minimum_stock, 0),
    consumption_per_soap = coalesce(consumption_per_soap, 1),
    unit_cost = coalesce(unit_cost, cost / nullif(yield_value, 0))
where measure_unit is null or stock is null or minimum_stock is null
   or consumption_per_soap is null or unit_cost is null;

alter table public.indirects alter column measure_unit set default 'pza';
alter table public.indirects alter column measure_unit set not null;
alter table public.indirects alter column stock set default 0;
alter table public.indirects alter column stock set not null;
alter table public.indirects alter column minimum_stock set default 0;
alter table public.indirects alter column minimum_stock set not null;
alter table public.indirects alter column consumption_per_soap set default 1;
alter table public.indirects alter column consumption_per_soap set not null;
alter table public.indirects alter column unit_cost set default 0;
alter table public.indirects alter column unit_cost set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'indirects_measure_unit_check' and conrelid = 'public.indirects'::regclass) then
    alter table public.indirects add constraint indirects_measure_unit_check check (measure_unit in ('g', 'ml', 'pza'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'indirects_stock_check' and conrelid = 'public.indirects'::regclass) then
    alter table public.indirects add constraint indirects_stock_check check (stock >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'indirects_minimum_stock_check' and conrelid = 'public.indirects'::regclass) then
    alter table public.indirects add constraint indirects_minimum_stock_check check (minimum_stock >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'indirects_consumption_per_soap_check' and conrelid = 'public.indirects'::regclass) then
    alter table public.indirects add constraint indirects_consumption_per_soap_check check (consumption_per_soap > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'indirects_unit_cost_check' and conrelid = 'public.indirects'::regclass) then
    alter table public.indirects add constraint indirects_unit_cost_check check (unit_cost >= 0);
  end if;
end;
$$;

create table if not exists public.utensils (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  cost numeric(14, 2) not null default 0 check (cost >= 0),
  useful_life numeric(14, 3) not null check (useful_life > 0),
  stock numeric(14, 3) not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  unique (owner_id, code)
);

alter table public.utensils add column if not exists stock numeric(14, 3) not null default 0 check (stock >= 0);

create table if not exists public.inventory_takes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_take_items (
  id uuid primary key default gen_random_uuid(),
  take_id uuid not null references public.inventory_takes(id) on delete cascade,
  category text not null check (category in ('soap', 'utensils', 'materials')),
  item_id uuid not null,
  item_code text not null default '',
  item_name text not null,
  system_quantity numeric(14, 3) not null check (system_quantity >= 0),
  counted_quantity numeric(14, 3) not null check (counted_quantity >= 0),
  adjustment numeric(14, 3) not null,
  created_at timestamptz not null default now(),
  unique (take_id, category, item_id)
);

create index if not exists inventory_takes_created_at_idx on public.inventory_takes(created_at desc);
create index if not exists inventory_take_items_take_idx on public.inventory_take_items(take_id);

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

create table if not exists public.recipe_indirects (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  indirect_id uuid not null references public.indirects(id) on delete restrict,
  unique (recipe_id, indirect_id)
);

create table if not exists public.recipe_utensils (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  utensil_id uuid not null references public.utensils(id) on delete restrict,
  unique (recipe_id, utensil_id)
);

insert into public.recipe_indirects (recipe_id, indirect_id)
select id, indirect_id from public.recipes where indirect_id is not null
on conflict (recipe_id, indirect_id) do nothing;

insert into public.recipe_utensils (recipe_id, utensil_id)
select id, utensil_id from public.recipes where utensil_id is not null
on conflict (recipe_id, utensil_id) do nothing;

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

alter table public.batches
  add column if not exists inventory_adjustment numeric(14, 3) not null default 0;

create table if not exists public.web_settings (
  id integer primary key default 1 check (id = 1),
  business_name text not null default 'Fragancia & Miel',
  tagline text not null default 'Jabones artesanales hechos con cuidado',
  logo_path text,
  phone text,
  whatsapp_phone text,
  email text,
  address text,
  about_text text,
  tiktok_url text,
  facebook_url text,
  instagram_url text,
  updated_at timestamptz not null default now()
);

alter table public.web_settings add column if not exists tiktok_url text;
alter table public.web_settings add column if not exists facebook_url text;
alter table public.web_settings add column if not exists instagram_url text;

insert into public.web_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.web_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  batch_id uuid references public.batches(id) on delete set null,
  image_path text,
  benefits text[] not null default '{}',
  health_concerns text[] not null default '{}',
  composition text[] not null default '{}',
  usage_instructions text not null default '',
  normal_price numeric(14, 2) check (normal_price is null or normal_price >= 0),
  promotion_price numeric(14, 2) check (promotion_price is null or promotion_price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.web_products
  add column if not exists health_concerns text[] not null default '{}';
alter table public.web_products
  add column if not exists normal_price numeric(14, 2) check (normal_price is null or normal_price >= 0);
alter table public.web_products
  add column if not exists promotion_price numeric(14, 2) check (promotion_price is null or promotion_price >= 0);

create table if not exists public.web_product_batches (
  web_product_id uuid not null references public.web_products(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (web_product_id, batch_id)
);



create unique index if not exists web_product_batches_batch_uidx
  on public.web_product_batches(batch_id);
create index if not exists web_product_batches_product_idx
  on public.web_product_batches(web_product_id);
drop index if exists public.web_products_batch_idx;

create sequence if not exists public.sales_invoice_number_seq;
create sequence if not exists public.purchases_number_seq;
create sequence if not exists public.web_order_number_seq;

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
alter table public.sales add column if not exists written_off_at timestamptz;
alter table public.sales drop constraint if exists sales_payment_status_check;
alter table public.sales add constraint sales_payment_status_check
  check (payment_status in ('paid', 'pending', 'lost'));
alter table public.sale_items add column if not exists unit_cost numeric(14, 4) not null default 0 check (unit_cost >= 0);
alter table public.sale_items add column if not exists cost_total numeric(14, 2) not null default 0 check (cost_total >= 0);
alter table public.sale_items add column if not exists cost_recorded boolean not null default false;

create table if not exists public.web_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  delivery_address text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  total numeric(14, 2) not null default 0 check (total >= 0),
  sale_id uuid references public.sales(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.web_order_items (
  id uuid primary key default gen_random_uuid(),
  web_order_id uuid not null references public.web_orders(id) on delete cascade,
  web_product_id uuid not null references public.web_products(id) on delete restrict,
  batch_id uuid references public.batches(id) on delete set null,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  line_total numeric(14, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.manual_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  web_product_id uuid not null references public.web_products(id) on delete cascade,
  product_name text not null,
  customer_name text not null check (length(btrim(customer_name)) > 0),
  customer_phone text,
  quantity integer not null check (quantity > 0),
  batch_allocations jsonb not null default '[]'::jsonb check (jsonb_typeof(batch_allocations) = 'array'),
  reservation_date date not null default current_date,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.custom_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_name text not null check (length(btrim(customer_name)) > 0),
  customer_phone text not null check (length(btrim(customer_phone)) > 0),
  design text not null check (length(btrim(design)) > 0),
  fragrance text not null check (length(btrim(fragrance)) > 0),
  color text not null check (length(btrim(color)) > 0),
  quantity integer not null check (quantity > 0),
  order_value numeric(14, 2) not null default 0 check (order_value >= 0),
  created_at timestamptz not null default now()
);

alter table public.custom_orders
  add column if not exists status text not null default 'pending';
alter table public.custom_orders
  add column if not exists order_value numeric(14, 2) not null default 0 check (order_value >= 0);

create table if not exists public.promotion_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_date date not null,
  activity text not null check (length(btrim(activity)) > 0),
  resources text not null default '',
  objective text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'custom_orders_status_check'
      and conrelid = 'public.custom_orders'::regclass
  ) then
    alter table public.custom_orders
      add constraint custom_orders_status_check check (status in ('created', 'rejected', 'pending'));
  end if;
end;
$$;

create table if not exists public.collection_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_name text not null check (length(btrim(customer_name)) > 0),
  customer_phone text,
  concept text not null check (length(btrim(concept)) > 0),
  amount numeric(14, 2) not null check (amount > 0),
  due_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

alter table public.web_products alter column batch_id drop not null;
alter table public.web_products drop constraint if exists web_products_batch_id_fkey;
alter table public.web_products
  add constraint web_products_batch_id_fkey foreign key (batch_id)
  references public.batches(id) on delete set null;

insert into public.web_product_batches (web_product_id, batch_id)
select wp.id, wp.batch_id
from public.web_products wp
where wp.batch_id is not null
order by wp.created_at, wp.id
on conflict (batch_id) do nothing;

update public.web_products set batch_id = null where batch_id is not null;

with product_prices as (
  select distinct on (wp.id)
    wp.id as web_product_id,
    r.price_detail
  from public.web_products wp
  join public.web_product_batches wpb on wpb.web_product_id = wp.id
  join public.batches b on b.id = wpb.batch_id
  join public.recipes r on r.id = b.recipe_id
  where r.price_detail is not null
  order by wp.id, b.batch_date, b.created_at, b.id
)
update public.web_products wp
set normal_price = coalesce(wp.normal_price, product_prices.price_detail + 100),
    promotion_price = coalesce(wp.promotion_price, product_prices.price_detail)
from product_prices
where wp.id = product_prices.web_product_id
  and (wp.normal_price is null or wp.promotion_price is null);

alter table public.web_order_items alter column batch_id drop not null;
alter table public.web_order_items drop constraint if exists web_order_items_batch_id_fkey;
alter table public.web_order_items
  add constraint web_order_items_batch_id_fkey foreign key (batch_id)
  references public.batches(id) on delete set null;

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
  unit_label text not null,
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
alter table public.purchase_items add column if not exists unit_label text;

update public.purchase_items
set item_name = coalesce(material_name, 'Artículo')
where item_name is null;

update public.purchase_items pi
set unit_label = coalesce(m.unit, 'unidad')
from public.materials m
where pi.unit_label is null and pi.item_type = 'materials' and m.id = pi.material_id;

update public.purchase_items pi
set unit_label = coalesce(i.measure_unit, 'unidad')
from public.indirects i
where pi.unit_label is null and pi.item_type = 'indirects' and i.id = pi.indirect_id;

update public.purchase_items
set unit_label = 'uso'
where unit_label is null and item_type = 'utensils';

alter table public.purchase_items alter column item_name set not null;
alter table public.purchase_items alter column unit_label set not null;

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

create table if not exists public.additional_incomes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  concept text not null check (length(btrim(concept)) > 0),
  amount numeric(14, 2) not null check (amount > 0),
  income_date date not null default current_date,
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

create table if not exists public.business_loans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null check (length(btrim(description)) > 0),
  principal numeric(14, 2) not null check (principal > 0),
  loan_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.business_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  business_loan_id uuid not null references public.business_loans(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  created_at timestamptz not null default now()
);

insert into public.finance_settings (id) values (1) on conflict (id) do nothing;

create index if not exists materials_owner_idx on public.materials(owner_id);
create index if not exists indirects_owner_idx on public.indirects(owner_id);
create index if not exists utensils_owner_idx on public.utensils(owner_id);
create index if not exists recipes_owner_idx on public.recipes(owner_id);
create index if not exists batches_owner_date_idx on public.batches(owner_id, batch_date desc);
create index if not exists recipe_items_recipe_idx on public.recipe_items(recipe_id);
create index if not exists recipe_indirects_recipe_idx on public.recipe_indirects(recipe_id);
create index if not exists recipe_utensils_recipe_idx on public.recipe_utensils(recipe_id);
create index if not exists sales_created_at_idx on public.sales(created_at desc);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);
create index if not exists sale_items_recipe_idx on public.sale_items(recipe_id);
create index if not exists purchases_date_idx on public.purchases(purchase_date desc);
create index if not exists purchase_items_purchase_idx on public.purchase_items(purchase_id);
create index if not exists expenses_date_idx on public.expenses(expense_date desc);
create index if not exists additional_incomes_date_idx on public.additional_incomes(income_date desc);
create index if not exists collection_reminders_due_date_idx on public.collection_reminders(due_date);
create index if not exists web_products_active_sort_idx on public.web_products(active, sort_order, name);
create index if not exists web_orders_created_at_idx on public.web_orders(created_at desc);
create index if not exists web_orders_status_created_idx on public.web_orders(status, created_at desc);
create index if not exists web_order_items_order_idx on public.web_order_items(web_order_id);
create index if not exists web_order_items_batch_idx on public.web_order_items(batch_id);
create index if not exists manual_reservations_status_date_idx on public.manual_reservations(status, reservation_date desc);
create index if not exists business_loans_date_idx on public.business_loans(loan_date desc);
create index if not exists business_loan_repayments_loan_idx on public.business_loan_repayments(business_loan_id, payment_date);
create index if not exists promotion_events_date_idx on public.promotion_events(event_date);

alter table public.materials enable row level security;
alter table public.indirects enable row level security;
alter table public.utensils enable row level security;
alter table public.inventory_takes enable row level security;
alter table public.inventory_take_items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.recipe_indirects enable row level security;
alter table public.recipe_utensils enable row level security;
alter table public.batches enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.expenses enable row level security;
alter table public.additional_incomes enable row level security;
alter table public.collection_reminders enable row level security;
alter table public.finance_settings enable row level security;
alter table public.web_settings enable row level security;
alter table public.web_products enable row level security;
alter table public.web_product_batches enable row level security;
alter table public.web_orders enable row level security;
alter table public.web_order_items enable row level security;
alter table public.manual_reservations enable row level security;
alter table public.custom_orders enable row level security;
alter table public.promotion_events enable row level security;
alter table public.business_loans enable row level security;
alter table public.business_loan_repayments enable row level security;

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

drop policy if exists "Authenticated users manage shared inventory takes" on public.inventory_takes;
create policy "Authenticated users manage shared inventory takes" on public.inventory_takes
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage shared inventory take items" on public.inventory_take_items;
create policy "Authenticated users manage shared inventory take items" on public.inventory_take_items
  for all to authenticated using (true) with check (true);

drop policy if exists "Owners manage their recipes" on public.recipes;
drop policy if exists "Authenticated users manage shared recipes" on public.recipes;
create policy "Authenticated users manage shared recipes" on public.recipes
  for all to authenticated using (true) with check (true);

drop policy if exists "Owners manage their recipe items" on public.recipe_items;
drop policy if exists "Authenticated users manage shared recipe items" on public.recipe_items;
create policy "Authenticated users manage shared recipe items" on public.recipe_items
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage shared recipe indirects" on public.recipe_indirects;
create policy "Authenticated users manage shared recipe indirects" on public.recipe_indirects
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage shared recipe utensils" on public.recipe_utensils;
create policy "Authenticated users manage shared recipe utensils" on public.recipe_utensils
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

drop policy if exists "Authenticated users manage additional incomes" on public.additional_incomes;
create policy "Authenticated users manage additional incomes" on public.additional_incomes
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage collection reminders" on public.collection_reminders;
create policy "Authenticated users manage collection reminders" on public.collection_reminders
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage finance settings" on public.finance_settings;
create policy "Authenticated users manage finance settings" on public.finance_settings
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage web settings" on public.web_settings;
create policy "Authenticated users manage web settings" on public.web_settings
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage web products" on public.web_products;
create policy "Authenticated users manage web products" on public.web_products
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage web product batches" on public.web_product_batches;
create policy "Authenticated users manage web product batches" on public.web_product_batches
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users view web orders" on public.web_orders;
create policy "Authenticated users view web orders" on public.web_orders
  for select to authenticated using (true);

drop policy if exists "Authenticated users view web order items" on public.web_order_items;
create policy "Authenticated users view web order items" on public.web_order_items
  for select to authenticated using (true);

drop policy if exists "Authenticated users manage manual reservations" on public.manual_reservations;
create policy "Authenticated users manage manual reservations" on public.manual_reservations
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage custom orders" on public.custom_orders;
create policy "Authenticated users manage custom orders" on public.custom_orders
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage promotion events" on public.promotion_events;
create policy "Authenticated users manage promotion events" on public.promotion_events
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage business loans" on public.business_loans;
create policy "Authenticated users manage business loans" on public.business_loans
  for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users manage business loan repayments" on public.business_loan_repayments;
create policy "Authenticated users manage business loan repayments" on public.business_loan_repayments
  for all to authenticated using (true) with check (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'web_orders'
     ) then
    alter publication supabase_realtime add table public.web_orders;
  end if;
end;
$$;

grant select, insert, update, delete on public.materials, public.indirects, public.utensils, public.inventory_takes, public.inventory_take_items, public.recipes, public.recipe_items, public.recipe_indirects, public.recipe_utensils, public.batches, public.sales, public.sale_items, public.purchases, public.purchase_items, public.expenses, public.additional_incomes, public.collection_reminders, public.finance_settings, public.web_settings, public.web_products, public.web_product_batches, public.manual_reservations, public.business_loans, public.business_loan_repayments to authenticated;
grant select on public.web_orders, public.web_order_items to authenticated;
grant select, insert, update, delete on public.custom_orders to authenticated;
grant select, insert, update, delete on public.promotion_events to authenticated;
grant usage, select on sequence public.sales_invoice_number_seq, public.purchases_number_seq, public.web_order_number_seq to authenticated;

insert into storage.buckets (id, name, public)
values ('jabon', 'jabon', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view web product images" on storage.objects;
create policy "Public can view web product images" on storage.objects
  for select to public using (bucket_id = 'jabon');

drop policy if exists "Authenticated users manage web images" on storage.objects;
create policy "Authenticated users manage web images" on storage.objects
  for all to authenticated
  using (bucket_id = 'jabon')
  with check (bucket_id = 'jabon');

drop function if exists public.save_recipe(uuid, text, integer, numeric, uuid, uuid, numeric, jsonb);
drop function if exists public.save_recipe(uuid, text, integer, numeric, uuid, uuid, numeric, numeric, numeric, numeric, jsonb);

create or replace function public.save_recipe(
  p_recipe_id uuid,
  p_name text,
  p_batch_size integer,
  p_soap_weight numeric,
  p_margin numeric,
  p_price_detail numeric,
  p_price_wholesale numeric,
  p_price_event numeric,
  p_items jsonb,
  p_indirects jsonb,
  p_utensils jsonb
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
     or p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0
     or p_indirects is null or jsonb_typeof(p_indirects) is distinct from 'array'
     or p_utensils is null or jsonb_typeof(p_utensils) is distinct from 'array' then
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
  if exists (
    select 1
    from jsonb_to_recordset(p_indirects) as item(indirect_id uuid)
    left join public.indirects i on i.id = item.indirect_id
    where i.id is null
  ) then
    raise exception 'La receta contiene un insumo indirecto inexistente.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_utensils) as item(utensil_id uuid)
    left join public.utensils u on u.id = item.utensil_id
    where u.id is null
  ) then
    raise exception 'La receta contiene un utensilio inexistente.';
  end if;

  if p_recipe_id is null then
    insert into public.recipes (
      owner_id, name, batch_size, soap_weight, margin,
      price_detail, price_wholesale, price_event
    )
    values (
      v_owner, trim(p_name), p_batch_size, p_soap_weight, p_margin,
      p_price_detail, p_price_wholesale, p_price_event
    )
    returning id into v_recipe_id;
  else
    update public.recipes
    set name = trim(p_name), batch_size = p_batch_size, soap_weight = p_soap_weight,
        indirect_id = null, utensil_id = null, margin = p_margin,
        price_detail = p_price_detail, price_wholesale = p_price_wholesale, price_event = p_price_event
    where id = p_recipe_id
    returning id into v_recipe_id;
    if v_recipe_id is null then
      raise exception 'No se encontró la receta para actualizar.';
    end if;
    delete from public.recipe_items where recipe_id = v_recipe_id;
    delete from public.recipe_indirects where recipe_id = v_recipe_id;
    delete from public.recipe_utensils where recipe_id = v_recipe_id;
  end if;

  insert into public.recipe_items (recipe_id, material_id, quantity)
  select v_recipe_id, item.material_id, sum(item.quantity)
  from jsonb_to_recordset(p_items) as item(material_id uuid, quantity numeric)
  group by item.material_id;

  insert into public.recipe_indirects (recipe_id, indirect_id)
  select v_recipe_id, item.indirect_id
  from jsonb_to_recordset(p_indirects) as item(indirect_id uuid)
  group by item.indirect_id;

  insert into public.recipe_utensils (recipe_id, utensil_id)
  select v_recipe_id, item.utensil_id
  from jsonb_to_recordset(p_utensils) as item(utensil_id uuid)
  group by item.utensil_id;

  return v_recipe_id;
end;
$$;

drop function if exists public.produce_batch(uuid, text, integer);

create or replace function public.produce_batch(
  p_recipe_id uuid,
  p_code text,
  p_quantity integer,
  p_web_product_id uuid default null
)
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

  if p_web_product_id is not null then
    perform 1 from public.web_products where id = p_web_product_id for update;
    if not found then
      raise exception 'No se encontró el producto web seleccionado.';
    end if;
  end if;

  select * into v_recipe from public.recipes
  where id = p_recipe_id
  for update;
  if not found then
    raise exception 'No se encontró la receta seleccionada.';
  end if;

  if p_web_product_id is not null then
    if exists (
      select 1
      from public.web_product_batches wpb
      join public.batches b on b.id = wpb.batch_id
      where wpb.web_product_id = p_web_product_id
        and b.recipe_id is distinct from v_recipe.id
    ) then
      raise exception 'El producto web seleccionado está vinculado a otra receta.';
    end if;
  end if;

  for v_item in
    select ri.material_id, ri.quantity, m.initial_stock, m.purchased, m.used, m.unit_cost
    from public.recipe_items ri
    join public.materials m on m.id = ri.material_id
    where ri.recipe_id = v_recipe.id
    order by ri.material_id
    for update of m
  loop
    v_required := v_item.quantity * p_quantity::numeric;
    if v_item.initial_stock + v_item.purchased - v_item.used < v_required then
      raise exception 'Existencias insuficientes para una o más materias primas.';
    end if;
    v_unit_cost := v_item.unit_cost;
    v_material_cost := v_material_cost + v_unit_cost * v_required;
    update public.materials set used = used + v_required where id = v_item.material_id;
  end loop;

  for v_item in
    select ri.indirect_id, i.name, i.stock, i.consumption_per_soap, i.unit_cost
    from public.recipe_indirects ri
    join public.indirects i on i.id = ri.indirect_id
    where ri.recipe_id = v_recipe.id
    order by ri.indirect_id
    for update of i
  loop
    v_required := v_item.consumption_per_soap * p_quantity::numeric;
    if v_item.stock < v_required then
      raise exception 'Existencias insuficientes del insumo indirecto "%".', v_item.name;
    end if;
    v_indirect_cost := v_indirect_cost + v_item.unit_cost * v_required;
    update public.indirects
    set stock = stock - v_required
    where id = v_item.indirect_id;
  end loop;

  select coalesce(sum(u.cost / u.useful_life * p_quantity), 0)
  into v_utensil_cost
  from public.recipe_utensils ru
  join public.utensils u on u.id = ru.utensil_id
  where ru.recipe_id = v_recipe.id;

  v_total := v_material_cost + v_indirect_cost + v_utensil_cost;
  insert into public.batches (owner_id, recipe_id, recipe_name, code, quantity, total_cost, unit_cost)
  values (v_owner, v_recipe.id, v_recipe.name, trim(p_code), p_quantity, v_total, v_total / p_quantity)
  returning * into v_batch;
  if p_web_product_id is not null then
    insert into public.web_product_batches (web_product_id, batch_id)
    values (p_web_product_id, v_batch.id);
    update public.web_products set updated_at = now() where id = p_web_product_id;
  end if;
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
  v_reserved numeric;
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
      coalesce(sum(b.quantity + b.inventory_adjustment), 0) - coalesce((
        select sum(si.quantity)
        from public.sales s
        join public.sale_items si on si.sale_id = s.id
        where s.status = 'issued' and si.recipe_id = v_item.recipe_id
      ), 0)
    into v_available
    from public.batches b
    where b.recipe_id = v_item.recipe_id;

    select coalesce(sum(woi.quantity), 0)
    into v_reserved
    from public.web_order_items woi
    join public.web_orders wo on wo.id = woi.web_order_id
    where woi.recipe_id = v_item.recipe_id
      and wo.status = 'confirmed';

    v_available := v_available - v_reserved;
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

    v_average_cost := case
      when v_available + v_reserved > 0
        then greatest(v_available_value, 0) / (v_available + v_reserved)
      else 0
    end;

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
    quantity, unit_label, unit_cost, line_total
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
    case item.item_type when 'materials' then m.unit when 'indirects' then i.measure_unit else 'uso' end,
    item.unit_cost,
    round(item.quantity * item.unit_cost, 2)
  from jsonb_to_recordset(p_items) as item(item_type text, material_id uuid, indirect_id uuid, utensil_id uuid, quantity numeric, unit_cost numeric)
  left join public.materials m on m.id = item.material_id
  left join public.indirects i on i.id = item.indirect_id
  left join public.utensils u on u.id = item.utensil_id;

  update public.materials m
  set purchased = m.purchased + item_totals.quantity,
      total_cost = round(m.unit_cost * (m.initial_stock + m.purchased) + item_totals.purchase_cost, 2),
      unit_cost = case
        when m.initial_stock + m.purchased + item_totals.quantity > 0
          then round(
            (m.unit_cost * (m.initial_stock + m.purchased) + item_totals.purchase_cost)
              / (m.initial_stock + m.purchased + item_totals.quantity),
            6
          )
        else m.unit_cost
      end
  from (
    select item.material_id,
      sum(quantity) as quantity,
      sum(round(quantity * unit_cost, 2)) as purchase_cost
    from jsonb_to_recordset(p_items) as item(item_type text, material_id uuid, indirect_id uuid, utensil_id uuid, quantity numeric, unit_cost numeric)
    where item.item_type = 'materials'
    group by item.material_id
  ) item_totals
  where m.id = item_totals.material_id;

  update public.indirects i
  set cost = i.cost + item_totals.total_cost,
      stock = i.stock + item_totals.quantity,
      unit_cost = case
        when i.stock + item_totals.quantity > 0
          then round((i.unit_cost * i.stock + item_totals.total_cost) / (i.stock + item_totals.quantity), 6)
        else i.unit_cost
      end
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

create or replace function public.record_purchase(
  p_supplier_name text,
  p_purchase_date date,
  p_payment_method text,
  p_items jsonb
)
returns public.purchases
language sql
set search_path = ''
as $$
  select public.record_purchase(
    p_supplier_name, p_purchase_date, 'paid', p_payment_method, p_items
  );
$$;

create or replace function public.record_purchase(
  p_supplier_name text,
  p_purchase_date date,
  p_items jsonb
)
returns public.purchases
language sql
set search_path = ''
as $$
  select public.record_purchase(
    p_supplier_name, p_purchase_date, 'paid', 'cash', p_items
  );
$$;

create or replace function public.update_purchase(
  p_purchase_id uuid,
  p_supplier_name text,
  p_purchase_date date,
  p_payment_status text,
  p_payment_method text,
  p_items jsonb,
  p_delete boolean default false
)
returns public.purchases
language plpgsql
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_purchase public.purchases%rowtype;
  v_replacement public.purchases%rowtype;
begin
  if v_owner is null then
    raise exception 'Debes iniciar sesión para editar compras.';
  end if;

  select * into v_purchase
  from public.purchases
  where id = p_purchase_id
  for update;
  if not found then
    raise exception 'No se encontró la compra.';
  end if;

  if p_delete and (p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) <> 0) then
    raise exception 'No se pueden incluir artículos al eliminar una compra.';
  end if;
  if not p_delete and (p_items is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0) then
    raise exception 'Agrega por lo menos un artículo a la compra.';
  end if;

  if exists (
    select 1
    from public.purchase_items pi
    left join public.materials m on m.id = pi.material_id
    left join public.indirects i on i.id = pi.indirect_id
    left join public.utensils u on u.id = pi.utensil_id
    where pi.purchase_id = p_purchase_id
      and (
        (pi.item_type = 'materials' and m.initial_stock + m.purchased - m.used < pi.quantity)
        or (pi.item_type = 'indirects' and i.stock < pi.quantity)
        or (pi.item_type = 'utensils' and u.useful_life <= pi.quantity)
      )
  ) then
    raise exception 'No se puede ajustar esta compra: parte de sus artículos ya fue consumida.';
  end if;

  update public.materials m
  set purchased = m.purchased - item_totals.quantity,
      total_cost = greatest(0, round(m.total_cost - item_totals.total_cost, 2)),
      unit_cost = case
        when m.initial_stock + m.purchased - item_totals.quantity > 0
          then greatest(0, round((m.total_cost - item_totals.total_cost)
            / (m.initial_stock + m.purchased - item_totals.quantity), 6))
        else 0
      end
  from (
    select pi.material_id, sum(pi.quantity) as quantity, sum(pi.line_total) as total_cost
    from public.purchase_items pi
    where pi.purchase_id = p_purchase_id and pi.item_type = 'materials'
    group by pi.material_id
  ) item_totals
  where m.id = item_totals.material_id;

  update public.indirects i
  set stock = i.stock - item_totals.quantity,
      cost = greatest(0, round(i.cost - item_totals.total_cost, 2)),
      unit_cost = case
        when i.stock - item_totals.quantity > 0
          then greatest(0, round((i.cost - item_totals.total_cost)
            / (i.stock - item_totals.quantity), 6))
        else 0
      end
  from (
    select pi.indirect_id, sum(pi.quantity) as quantity, sum(pi.line_total) as total_cost
    from public.purchase_items pi
    where pi.purchase_id = p_purchase_id and pi.item_type = 'indirects'
    group by pi.indirect_id
  ) item_totals
  where i.id = item_totals.indirect_id;

  update public.utensils u
  set useful_life = u.useful_life - item_totals.quantity,
      cost = greatest(0, round(u.cost - item_totals.total_cost, 2))
  from (
    select pi.utensil_id, sum(pi.quantity) as quantity, sum(pi.line_total) as total_cost
    from public.purchase_items pi
    where pi.purchase_id = p_purchase_id and pi.item_type = 'utensils'
    group by pi.utensil_id
  ) item_totals
  where u.id = item_totals.utensil_id;

  delete from public.purchase_items where purchase_id = p_purchase_id;

  if p_delete then
    delete from public.purchases where id = p_purchase_id;
    return v_purchase;
  end if;

  v_replacement := public.record_purchase(
    p_supplier_name, p_purchase_date, p_payment_status, p_payment_method, p_items
  );
  update public.purchase_items
  set purchase_id = p_purchase_id
  where purchase_id = v_replacement.id;
  delete from public.purchases where id = v_replacement.id;

  update public.purchases
  set supplier_name = v_replacement.supplier_name,
      purchase_date = v_replacement.purchase_date,
      payment_status = v_replacement.payment_status,
      payment_method = v_replacement.payment_method,
      total = v_replacement.total,
      paid_at = v_replacement.paid_at
  where id = p_purchase_id
  returning * into v_purchase;
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

create or replace function public.mark_sale_lost(p_sale_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar cuentas incobrables.';
  end if;
  update public.sales
  set payment_status = 'lost', paid_at = null, written_off_at = now()
  where id = p_sale_id and status = 'issued' and payment_status = 'pending';
  if not found then
    raise exception 'No se encontró una venta pendiente de cobro.';
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

create or replace function public.web_available_batch_stock(p_batch_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    b.quantity + b.inventory_adjustment
      - coalesce(current_reservation.quantity, 0)
      - coalesce(manual_reservation.quantity, 0)
      - least(
        greatest(b.quantity + b.inventory_adjustment - coalesce(current_reservation.quantity, 0) - coalesce(manual_reservation.quantity, 0), 0),
        greatest(coalesce(recipe_sales.quantity, 0) - coalesce(previous_free_stock.quantity, 0), 0)
      ),
    0
  )
  from public.batches b
  left join lateral (
    select coalesce(sum(woi.quantity), 0) as quantity
    from public.web_order_items woi
    join public.web_orders wo on wo.id = woi.web_order_id
    where woi.batch_id = b.id and wo.status = 'confirmed'
  ) current_reservation on true
  left join lateral (
    select coalesce(sum(allocation.quantity), 0) as quantity
    from public.manual_reservations reservation
    cross join lateral jsonb_to_recordset(reservation.batch_allocations) as allocation(batch_id uuid, quantity integer)
    where allocation.batch_id = b.id and reservation.status = 'active'
  ) manual_reservation on true
  left join lateral (
    select coalesce(sum(si.quantity), 0) as quantity
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
    where s.status = 'issued' and si.recipe_id = b.recipe_id
  ) recipe_sales on true
  left join lateral (
    select coalesce(sum(greatest(
      previous_batch.quantity + previous_batch.inventory_adjustment - coalesce(previous_reservation.quantity, 0)
        - coalesce(previous_manual_reservation.quantity, 0),
      0
    )), 0) as quantity
    from public.batches previous_batch
    left join lateral (
      select coalesce(sum(woi.quantity), 0) as quantity
      from public.web_order_items woi
      join public.web_orders wo on wo.id = woi.web_order_id
      where woi.batch_id = previous_batch.id and wo.status = 'confirmed'
    ) previous_reservation on true
    left join lateral (
      select coalesce(sum(allocation.quantity), 0) as quantity
      from public.manual_reservations reservation
      cross join lateral jsonb_to_recordset(reservation.batch_allocations) as allocation(batch_id uuid, quantity integer)
      where allocation.batch_id = previous_batch.id and reservation.status = 'active'
    ) previous_manual_reservation on true
    where previous_batch.recipe_id = b.recipe_id
      and (previous_batch.batch_date, previous_batch.created_at, previous_batch.id)
        < (b.batch_date, b.created_at, b.id)
  ) previous_free_stock on true
  where b.id = p_batch_id;
$$;

create or replace function public.get_web_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'settings', (
      select jsonb_build_object(
        'business_name', business_name,
        'tagline', tagline,
        'logo_path', logo_path,
        'phone', phone,
        'whatsapp_phone', whatsapp_phone,
        'email', email,
        'address', address,
        'about_text', about_text,
        'tiktok_url', tiktok_url,
        'facebook_url', facebook_url,
        'instagram_url', instagram_url
      )
      from public.web_settings
      where id = 1
    ),
    'products', coalesce((
      select jsonb_agg(product_data order by sort_order, name)
      from (
        select
          wp.sort_order,
          wp.name,
          jsonb_build_object(
            'id', wp.id,
            'name', wp.name,
            'image_path', wp.image_path,
            'benefits', wp.benefits,
            'health_concerns', wp.health_concerns,
            'composition', wp.composition,
            'usage_instructions', wp.usage_instructions,
            'available', coalesce((
              select sum(public.web_available_batch_stock(b.id))
              from public.web_product_batches wpb
              join public.batches b on b.id = wpb.batch_id
              where wpb.web_product_id = wp.id
            ), 0),
            'normal_price', wp.normal_price,
            'price', wp.promotion_price,
            'soap_weight', product_recipe.soap_weight
          ) as product_data
        from public.web_products wp
        join lateral (
          select r.soap_weight
          from public.web_product_batches wpb
          join public.batches b on b.id = wpb.batch_id
          join public.recipes r on r.id = b.recipe_id
          where wpb.web_product_id = wp.id
          order by b.batch_date, b.created_at, b.id
          limit 1
        ) product_recipe on true
        where wp.active and wp.normal_price is not null and wp.promotion_price is not null
      ) products
    ), '[]'::jsonb)
  );
$$;

create or replace function public.submit_web_order(
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_delivery_address text,
  p_notes text,
  p_items jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_item record;
  v_batch record;
  v_available numeric;
  v_remaining integer;
  v_take integer;
begin
  if nullif(trim(p_customer_name), '') is null or length(trim(p_customer_name)) > 120
     or nullif(trim(p_customer_phone), '') is null or length(trim(p_customer_phone)) > 40
     or (p_customer_email is not null and length(trim(p_customer_email)) > 254)
     or (p_delivery_address is not null and length(trim(p_delivery_address)) > 500)
     or (p_notes is not null and length(trim(p_notes)) > 1000) then
    raise exception 'Completa un nombre y teléfono válidos; revisa también los límites de los demás campos.';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'El pedido debe incluir entre 1 y 20 productos.';
  end if;
  if jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 20 then
    raise exception 'El pedido debe incluir entre 1 y 20 productos.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    group by item.product_id
    having sum(item.quantity) > 100
  ) then
    raise exception 'La cantidad máxima por producto es 100 unidades.';
  end if;

  perform wp.id
  from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
  join public.web_products wp on wp.id = item.product_id
  order by wp.id
  for share of wp;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    left join public.web_products wp on wp.id = item.product_id
    left join lateral (
      select b.recipe_id, wp.promotion_price
      from public.web_product_batches wpb
      join public.batches b on b.id = wpb.batch_id
      where wpb.web_product_id = item.product_id
      order by b.batch_date, b.created_at, b.id
      limit 1
    ) product_recipe on true
    where item.product_id is null or item.quantity is null or item.quantity < 1 or item.quantity > 100
      or wp.id is null or not wp.active
      or wp.normal_price is null
      or product_recipe.recipe_id is null or product_recipe.promotion_price is null
      or exists (
        select 1
        from public.web_product_batches wpb
        join public.batches b on b.id = wpb.batch_id
        where wpb.web_product_id = wp.id
          and b.recipe_id is distinct from product_recipe.recipe_id
      )
  ) then
    raise exception 'El pedido contiene un producto no disponible o una cantidad inválida.';
  end if;

  for v_item in
    select distinct b.recipe_id
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    join public.web_products wp on wp.id = item.product_id
    join public.web_product_batches wpb on wpb.web_product_id = wp.id
    join public.batches b on b.id = wpb.batch_id
    order by b.recipe_id
  loop
    perform 1 from public.recipes where id = v_item.recipe_id for update;
  end loop;

  v_order_number := 'WEB-' || pg_catalog.lpad(pg_catalog.nextval('public.web_order_number_seq')::text, 7, '0');
  insert into public.web_orders (
    order_number, customer_name, customer_phone, customer_email, delivery_address, notes
  )
  values (
    v_order_number, trim(p_customer_name), trim(p_customer_phone),
    nullif(trim(p_customer_email), ''), nullif(trim(p_delivery_address), ''), nullif(trim(p_notes), '')
  )
  returning id into v_order_id;

  for v_item in
    select item.product_id, sum(item.quantity)::integer as quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity integer)
    group by item.product_id
    order by item.product_id
  loop
    v_remaining := v_item.quantity;
    for v_batch in
      select b.id, b.recipe_id, wp.promotion_price
      from public.web_product_batches wpb
      join public.batches b on b.id = wpb.batch_id
      join public.web_products wp on wp.id = wpb.web_product_id
      where wpb.web_product_id = v_item.product_id
      order by b.batch_date, b.created_at, b.id
    loop
      v_available := public.web_available_batch_stock(v_batch.id);
      v_take := least(v_remaining, greatest(v_available, 0)::integer);
      if v_take > 0 then
        insert into public.web_order_items (
          web_order_id, web_product_id, batch_id, recipe_id, product_name, quantity, unit_price, line_total
        )
        select
          v_order_id, wp.id, v_batch.id, v_batch.recipe_id, wp.name, v_take, v_batch.promotion_price,
          round(v_batch.promotion_price * v_take, 2)
        from public.web_products wp
        where wp.id = v_item.product_id;
        v_remaining := v_remaining - v_take;
      end if;
      exit when v_remaining = 0;
    end loop;
    if v_remaining > 0 then
      raise exception 'No hay suficientes unidades disponibles de "%". Faltan: %.',
        (select name from public.web_products where id = v_item.product_id), v_remaining;
    end if;
  end loop;

  update public.web_orders wo
  set total = totals.total
  from (
    select coalesce(sum(line_total), 0) as total
    from public.web_order_items
    where web_order_id = v_order_id
  ) totals
  where wo.id = v_order_id;

  return v_order_number;
end;
$$;

create or replace function public.manage_web_order(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.web_orders%rowtype;
  v_item record;
  v_available numeric;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para administrar pedidos web.';
  end if;
  if p_status is null or p_status not in ('confirmed', 'cancelled') then
    raise exception 'El estado solicitado no es válido.';
  end if;

  select * into v_order from public.web_orders where id = p_order_id for update;
  if not found or v_order.status not in ('pending', 'confirmed') then
    raise exception 'El pedido web ya fue cerrado o no existe.';
  end if;

  for v_item in
    select distinct recipe_id from public.web_order_items
    where web_order_id = p_order_id order by recipe_id
  loop
    perform 1 from public.recipes where id = v_item.recipe_id for update;
  end loop;

  if p_status = 'confirmed' and v_order.status = 'pending' then
    if exists (
      select 1 from public.web_order_items
      where web_order_id = p_order_id and batch_id is null
    ) then
      raise exception 'No se puede reservar este pedido porque uno de sus lotes fue eliminado.';
    end if;

    for v_item in
      select batch_id, sum(quantity)::integer as quantity
      from public.web_order_items
      where web_order_id = p_order_id
      group by batch_id
      order by batch_id
    loop
      v_available := public.web_available_batch_stock(v_item.batch_id);
      if v_available < v_item.quantity then
        raise exception 'No hay suficientes unidades disponibles para reservar el lote. Disponibles: %, solicitadas: %.',
          v_available, v_item.quantity;
      end if;
    end loop;
  end if;

  update public.web_orders
  set status = p_status, updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function public.reserve_manual_product(
  p_web_product_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_quantity integer,
  p_reservation_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.web_products%rowtype;
  v_batch record;
  v_recipe_id uuid;
  v_reservation_id uuid;
  v_available numeric;
  v_remaining integer;
  v_take integer;
  v_allocations jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar una reservación.';
  end if;
  if nullif(trim(p_customer_name), '') is null or length(trim(p_customer_name)) > 160
     or (p_customer_phone is not null and length(trim(p_customer_phone)) > 40)
     or p_quantity is null or p_quantity < 1 or p_quantity > 100
     or p_reservation_date is null then
    raise exception 'Completa un cliente, una fecha y una cantidad válida (1 a 100).';
  end if;

  select * into v_product
  from public.web_products
  where id = p_web_product_id and active
  for share;
  if not found then
    raise exception 'El producto no existe o no está activo.';
  end if;

  select b.recipe_id into v_recipe_id
  from public.web_product_batches wpb
  join public.batches b on b.id = wpb.batch_id
  where wpb.web_product_id = v_product.id
  order by b.batch_date, b.created_at, b.id
  limit 1;
  if v_recipe_id is null or exists (
    select 1
    from public.web_product_batches wpb
    join public.batches b on b.id = wpb.batch_id
    where wpb.web_product_id = v_product.id and b.recipe_id is distinct from v_recipe_id
  ) then
    raise exception 'El producto no tiene lotes compatibles para reservar.';
  end if;

  perform r.id
  from public.recipes r
  where r.id = v_recipe_id
  for update;

  v_remaining := p_quantity;
  for v_batch in
    select b.id
    from public.web_product_batches wpb
    join public.batches b on b.id = wpb.batch_id
    where wpb.web_product_id = v_product.id
    order by b.batch_date, b.created_at, b.id
  loop
    v_available := public.web_available_batch_stock(v_batch.id);
    v_take := least(v_remaining, greatest(v_available, 0)::integer);
    if v_take > 0 then
      v_allocations := v_allocations || jsonb_build_array(
        jsonb_build_object('batch_id', v_batch.id, 'quantity', v_take)
      );
      v_remaining := v_remaining - v_take;
    end if;
    exit when v_remaining = 0;
  end loop;

  if v_remaining > 0 then
    raise exception 'No hay suficientes unidades disponibles de "%". Faltan: %.',
      v_product.name, v_remaining;
  end if;

  insert into public.manual_reservations (
    web_product_id, product_name, customer_name, customer_phone, quantity,
    batch_allocations, reservation_date
  )
  values (
    v_product.id, v_product.name, trim(p_customer_name), nullif(trim(p_customer_phone), ''),
    p_quantity, v_allocations, p_reservation_date
  )
  returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

create or replace function public.repay_business_loan(
  p_business_loan_id uuid,
  p_amount numeric,
  p_payment_date date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_principal numeric;
  v_repaid numeric;
  v_loan_date date;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para registrar un abono.';
  end if;
  if p_amount is null or p_amount <= 0 or p_payment_date is null then
    raise exception 'Ingresa un importe y una fecha válidos.';
  end if;

  select principal, loan_date into v_principal, v_loan_date
  from public.business_loans
  where id = p_business_loan_id
  for update;
  if not found then
    raise exception 'No se encontró el préstamo.';
  end if;
  if p_payment_date < v_loan_date then
    raise exception 'La fecha del abono no puede ser anterior a la fecha del préstamo.';
  end if;

  select coalesce(sum(amount), 0) into v_repaid
  from public.business_loan_repayments
  where business_loan_id = p_business_loan_id;
  if v_repaid + p_amount > v_principal then
    raise exception 'El abono supera el saldo pendiente de L %.',
      pg_catalog.to_char(v_principal - v_repaid, 'FM999999999990.00');
  end if;

  insert into public.business_loan_repayments (business_loan_id, amount, payment_date)
  values (p_business_loan_id, p_amount, p_payment_date);
end;
$$;

create or replace function public.delete_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelled_orders integer;
  v_cancelled_reservations integer;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para eliminar lotes.';
  end if;

  update public.web_orders wo
  set status = 'cancelled', updated_at = now()
  where wo.status in ('pending', 'confirmed')
    and exists (
      select 1 from public.web_order_items woi
      where woi.web_order_id = wo.id and woi.batch_id = p_batch_id
    );
  get diagnostics v_cancelled_orders = row_count;

  perform r.id
  from public.recipes r
  join public.batches b on b.recipe_id = r.id
  where b.id = p_batch_id
  for update of r;

  update public.manual_reservations reservation
  set status = 'cancelled'
  where reservation.status = 'active'
    and exists (
      select 1
      from jsonb_to_recordset(reservation.batch_allocations) as allocation(batch_id uuid, quantity integer)
      where allocation.batch_id = p_batch_id
    );
  get diagnostics v_cancelled_reservations = row_count;

  delete from public.batches where id = p_batch_id;
  if not found then
    raise exception 'No se encontró el lote.';
  end if;

  return v_cancelled_orders + v_cancelled_reservations;
end;
$$;

create or replace function public.delete_web_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para eliminar pedidos web.';
  end if;

  delete from public.web_orders where id = p_order_id;
  if not found then
    raise exception 'No se encontró el pedido web.';
  end if;
end;
$$;

create or replace function public.complete_web_order(
  p_order_id uuid,
  p_payment_method text,
  p_payment_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.web_orders%rowtype;
  v_item record;
  v_sale_id uuid;
  v_items jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para completar pedidos web.';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'transfer', 'card', 'other')
     or p_payment_status is null or p_payment_status not in ('paid', 'pending') then
    raise exception 'Selecciona un método y estado de pago válidos.';
  end if;

  select * into v_order from public.web_orders where id = p_order_id for update;
  if not found or v_order.status not in ('pending', 'confirmed') then
    raise exception 'El pedido web ya fue cerrado o no existe.';
  end if;

  for v_item in
    select distinct recipe_id from public.web_order_items
    where web_order_id = p_order_id order by recipe_id
  loop
    perform 1 from public.recipes where id = v_item.recipe_id for update;
  end loop;

  select jsonb_agg(jsonb_build_object(
    'recipe_id', recipe_id,
    'quantity', quantity,
    'price_type', 'detail'
  ))
  into v_items
  from (
    select recipe_id, sum(quantity)::integer as quantity
    from public.web_order_items
    where web_order_id = p_order_id
    group by recipe_id
  ) order_items;

  update public.web_orders set status = 'completed', updated_at = now() where id = p_order_id;
  v_sale_id := public.save_sales_order(
    null, v_order.customer_name, v_order.customer_phone,
    p_payment_method, p_payment_status, v_items
  );

  update public.sale_items si
  set unit_price = order_prices.unit_price,
      line_total = round(order_prices.unit_price * si.quantity, 2)
  from (
    select recipe_id, sum(quantity)::integer as quantity,
      sum(unit_price * quantity) / nullif(sum(quantity), 0) as unit_price
    from public.web_order_items
    where web_order_id = p_order_id
    group by recipe_id
  ) order_prices
  where si.sale_id = v_sale_id and si.recipe_id = order_prices.recipe_id;

  update public.sales s
  set subtotal = totals.total, total = totals.total
  from (
    select coalesce(sum(line_total), 0) as total
    from public.sale_items
    where sale_id = v_sale_id
  ) totals
  where s.id = v_sale_id;

  perform public.issue_sales_order(v_sale_id);
  update public.web_orders set sale_id = v_sale_id where id = p_order_id;
  return v_sale_id;
end;
$$;

create or replace function public.record_inventory_take(p_notes text, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_take_id uuid;
  v_item record;
  v_material public.materials%rowtype;
  v_utensil public.utensils%rowtype;
  v_batch public.batches%rowtype;
  v_before numeric(14, 3);
  v_reserved numeric(14, 3);
  v_sold numeric(14, 3);
  v_earlier_free numeric(14, 3);
  v_sold_here numeric(14, 3);
begin
  if v_owner is null then
    raise exception 'Debes iniciar sesión para registrar una toma de inventario.';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'Las notas no pueden superar 500 caracteres.';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'La toma debe incluir una lista de artículos válida.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'La toma debe incluir al menos un artículo.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      category text, item_id uuid, item_code text, item_name text,
      system_quantity numeric, counted_quantity numeric
    )
    group by item.category, item.item_id
    having count(*) > 1
  ) then
    raise exception 'La toma contiene artículos duplicados.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      category text, item_id uuid, item_code text, item_name text,
      system_quantity numeric, counted_quantity numeric
    )
    where item.category is null
       or item.category not in ('soap', 'utensils', 'materials')
       or item.item_id is null
       or item.system_quantity is null or item.system_quantity < 0
       or item.counted_quantity is null or item.counted_quantity < 0
       or item.item_name is null or length(item.item_name) = 0
       or (item.category in ('soap', 'utensils') and item.counted_quantity <> trunc(item.counted_quantity))
       or (item.category = 'materials' and item.counted_quantity <> round(item.counted_quantity, 3))
  ) then
    raise exception 'La toma contiene cantidades o artículos inválidos.';
  end if;

  insert into public.inventory_takes (owner_id, notes)
  values (v_owner, nullif(btrim(p_notes), ''))
  returning id into v_take_id;

  for v_item in
    select * from jsonb_to_recordset(p_items) as item(
      category text, item_id uuid, item_code text, item_name text,
      system_quantity numeric, counted_quantity numeric
    )
  loop
    if v_item.category = 'materials' then
      select * into v_material
      from public.materials
      where id = v_item.item_id
      for update;
      if not found then
        raise exception 'No se encontró la materia prima %.', v_item.item_name;
      end if;
      v_before := v_material.initial_stock + v_material.purchased - v_material.used;
      if abs(v_before - v_item.system_quantity) > 0.001 then
        raise exception 'El stock de % cambió durante la toma. Actualiza la pantalla e inténtalo de nuevo.', v_item.item_name;
      end if;
      if v_item.counted_quantity >= v_before then
        update public.materials
        set initial_stock = initial_stock + (v_item.counted_quantity - v_before),
            total_cost = round(total_cost
              + (v_item.counted_quantity - v_before) * unit_cost, 2)
        where id = v_item.item_id;
      else
        update public.materials
        set used = used + (v_before - v_item.counted_quantity)
        where id = v_item.item_id;
      end if;
    elsif v_item.category = 'utensils' then
      select * into v_utensil
      from public.utensils
      where id = v_item.item_id
      for update;
      if not found then
        raise exception 'No se encontró el utensilio %.', v_item.item_name;
      end if;
      v_before := v_utensil.stock;
      if abs(v_before - v_item.system_quantity) > 0.001 then
        raise exception 'El stock de % cambió durante la toma. Actualiza la pantalla e inténtalo de nuevo.', v_item.item_name;
      end if;
      update public.utensils
      set stock = v_item.counted_quantity
      where id = v_item.item_id;
    else
      select * into v_batch
      from public.batches
      where id = v_item.item_id
      for update;
      if not found then
        raise exception 'No se encontró el lote de jabón %.', v_item.item_name;
      end if;

      select coalesce(sum(item.quantity), 0) into v_reserved
      from (
        select woi.quantity
        from public.web_order_items woi
        join public.web_orders wo on wo.id = woi.web_order_id
        where woi.batch_id = v_batch.id and wo.status = 'confirmed'
        union all
        select allocation.quantity
        from public.manual_reservations reservation
        cross join lateral jsonb_to_recordset(reservation.batch_allocations)
          as allocation(batch_id uuid, quantity numeric)
        where allocation.batch_id = v_batch.id and reservation.status = 'active'
      ) item;

      select coalesce(sum(item.quantity), 0) into v_sold
      from public.sale_items item
      join public.sales sale on sale.id = item.sale_id
      where item.recipe_id = v_batch.recipe_id and sale.status = 'issued';

      select coalesce(sum(greatest(0, earlier.quantity - earlier_reserved.quantity)), 0)
      into v_earlier_free
      from public.batches earlier
      cross join lateral (
        select coalesce(sum(woi.quantity), 0) as quantity
        from public.web_order_items woi
        join public.web_orders wo on wo.id = woi.web_order_id
        where woi.batch_id = earlier.id and wo.status = 'confirmed'
      ) web_reserved
      cross join lateral (
        select coalesce(sum(allocation.quantity), 0) as quantity
        from public.manual_reservations reservation
        cross join lateral jsonb_to_recordset(reservation.batch_allocations)
          as allocation(batch_id uuid, quantity numeric)
        where allocation.batch_id = earlier.id and reservation.status = 'active'
      ) manual_reserved
      cross join lateral (
        select web_reserved.quantity + manual_reserved.quantity as quantity
      ) earlier_reserved
      where earlier.recipe_id = v_batch.recipe_id
        and (earlier.batch_date, earlier.created_at, earlier.id)
          < (v_batch.batch_date, v_batch.created_at, v_batch.id);

      v_sold_here := least(
        greatest(0, v_batch.quantity + v_batch.inventory_adjustment - v_reserved),
        greatest(0, v_sold - v_earlier_free)
      );
      v_before := greatest(0, v_batch.quantity + v_batch.inventory_adjustment - v_sold_here);
      if abs(v_before - v_item.system_quantity) > 0.001 then
        raise exception 'El stock del lote % cambió durante la toma. Actualiza la pantalla e inténtalo de nuevo.', v_item.item_name;
      end if;
      if v_item.counted_quantity < v_reserved then
        raise exception 'La cantidad física de % no cubre sus reservas activas. Revisa las reservas antes de ajustar.', v_item.item_name;
      end if;
      update public.batches
      set inventory_adjustment = v_item.counted_quantity + v_sold_here - v_batch.quantity
      where id = v_item.item_id;
    end if;

    insert into public.inventory_take_items (
      take_id, category, item_id, item_code, item_name,
      system_quantity, counted_quantity, adjustment
    )
    values (
      v_take_id, v_item.category, v_item.item_id, coalesce(v_item.item_code, ''),
      v_item.item_name, v_before, v_item.counted_quantity,
      v_item.counted_quantity - v_before
    );
  end loop;

  return v_take_id;
end;
$$;

revoke all on function public.record_inventory_take(text, jsonb) from public;
grant execute on function public.record_inventory_take(text, jsonb) to authenticated;

revoke all on function public.web_available_batch_stock(uuid) from public;
revoke all on function public.get_web_catalog() from public;
revoke all on function public.submit_web_order(text, text, text, text, text, jsonb) from public;
revoke all on function public.manage_web_order(uuid, text) from public;
revoke all on function public.delete_web_order(uuid) from public;
revoke all on function public.complete_web_order(uuid, text, text) from public;

grant execute on function public.get_web_catalog() to anon, authenticated;
grant execute on function public.submit_web_order(text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.manage_web_order(uuid, text) to authenticated;
grant execute on function public.delete_web_order(uuid) to authenticated;
grant execute on function public.complete_web_order(uuid, text, text) to authenticated;

revoke all on function public.save_recipe(uuid, text, integer, numeric, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb) from public;
revoke all on function public.produce_batch(uuid, text, integer, uuid) from public;
revoke all on function public.save_sales_order(uuid, text, text, text, text, jsonb) from public;
revoke all on function public.issue_sales_order(uuid) from public;
revoke all on function public.record_purchase(text, date, text, text, jsonb) from public;
revoke all on function public.record_purchase(text, date, text, jsonb) from public;
revoke all on function public.record_purchase(text, date, jsonb) from public;
revoke all on function public.mark_purchase_paid(uuid, text) from public;
revoke all on function public.update_purchase(uuid, text, date, text, text, jsonb, boolean) from public;
revoke all on function public.mark_sale_paid(uuid, text) from public;
revoke all on function public.mark_sale_lost(uuid) from public;
revoke all on function public.record_expense(text, text, numeric, date, text, text) from public;
revoke all on function public.mark_expense_paid(uuid, text) from public;
revoke all on function public.reserve_manual_product(uuid, text, text, integer, date) from public;
revoke all on function public.repay_business_loan(uuid, numeric, date) from public;
revoke all on function public.delete_batch(uuid) from public;
grant execute on function public.save_recipe(uuid, text, integer, numeric, numeric, numeric, numeric, numeric, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.produce_batch(uuid, text, integer, uuid) to authenticated;
grant execute on function public.save_sales_order(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.issue_sales_order(uuid) to authenticated;
grant execute on function public.record_purchase(text, date, text, text, jsonb) to authenticated;
grant execute on function public.record_purchase(text, date, text, jsonb) to authenticated;
grant execute on function public.record_purchase(text, date, jsonb) to authenticated;
grant execute on function public.mark_purchase_paid(uuid, text) to authenticated;
grant execute on function public.update_purchase(uuid, text, date, text, text, jsonb, boolean) to authenticated;
grant execute on function public.mark_sale_paid(uuid, text) to authenticated;
grant execute on function public.mark_sale_lost(uuid) to authenticated;
grant execute on function public.record_expense(text, text, numeric, date, text, text) to authenticated;
grant execute on function public.mark_expense_paid(uuid, text) to authenticated;
grant execute on function public.reserve_manual_product(uuid, text, text, integer, date) to authenticated;
grant execute on function public.repay_business_loan(uuid, numeric, date) to authenticated;
grant execute on function public.delete_batch(uuid) to authenticated;

notify pgrst, 'reload schema';
