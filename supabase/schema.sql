-- Fragancia y Miel: esquema privado para Supabase.
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

create index if not exists materials_owner_idx on public.materials(owner_id);
create index if not exists indirects_owner_idx on public.indirects(owner_id);
create index if not exists utensils_owner_idx on public.utensils(owner_id);
create index if not exists recipes_owner_idx on public.recipes(owner_id);
create index if not exists batches_owner_date_idx on public.batches(owner_id, batch_date desc);
create index if not exists recipe_items_recipe_idx on public.recipe_items(recipe_id);

alter table public.materials enable row level security;
alter table public.indirects enable row level security;
alter table public.utensils enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_items enable row level security;
alter table public.batches enable row level security;

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

grant select, insert, update, delete on public.materials, public.indirects, public.utensils, public.recipes, public.recipe_items, public.batches to authenticated;

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
  where id = p_recipe_id;
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

revoke all on function public.save_recipe(uuid, text, integer, numeric, uuid, uuid, numeric, numeric, numeric, numeric, jsonb) from public;
revoke all on function public.produce_batch(uuid, text, integer) from public;
grant execute on function public.save_recipe(uuid, text, integer, numeric, uuid, uuid, numeric, numeric, numeric, numeric, jsonb) to authenticated;
grant execute on function public.produce_batch(uuid, text, integer) to authenticated;
