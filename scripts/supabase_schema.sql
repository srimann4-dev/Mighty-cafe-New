-- Mighty Cafe Supabase schema
-- Run this in Supabase Dashboard > SQL Editor before using app sync.

create table if not exists public.menu_items (
  id text primary key,
  name text not null,
  price numeric not null default 0,
  purchase_cost numeric not null default 0,
  category text not null,
  is_active integer not null default 1,
  barcode text,
  stock numeric not null default 0,
  fulfillment_type text not null default 'on_demand',
  image_uri text,
  synced_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id text primary key,
  name text not null,
  quantity numeric not null default 0,
  unit text not null,
  barcode text,
  low_stock_threshold numeric not null default 0,
  updated_at text not null,
  item_type text not null default 'ingredient',
  synced_at timestamptz not null default now()
);

create table if not exists public.recipes (
  menu_item_id text not null,
  inventory_item_id text not null,
  quantity_required numeric not null,
  synced_at timestamptz not null default now(),
  primary key (menu_item_id, inventory_item_id)
);

create table if not exists public.staff (
  id text primary key,
  name text not null,
  role text not null,
  phone text,
  is_active integer not null default 1,
  attendance_pin text,
  created_at text not null,
  updated_at text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.sales (
  id text primary key,
  sale_number text not null,
  created_at text not null,
  staff_id text,
  staff_name text,
  payment_method text not null,
  total numeric not null default 0,
  synced_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id text primary key,
  sale_id text not null,
  menu_item_id text not null,
  item_name text not null,
  price numeric not null default 0,
  quantity numeric not null default 0,
  total numeric not null default 0,
  synced_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id text primary key,
  inventory_item_id text not null,
  type text not null,
  quantity_change numeric not null default 0,
  note text not null,
  created_at text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.cash_drawer (
  id text primary key,
  date text not null unique,
  opening_balance numeric not null default 0,
  current_balance numeric not null default 0,
  created_at text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.cash_transactions (
  id text primary key,
  sale_id text not null,
  sale_total numeric not null default 0,
  amount_received numeric not null default 0,
  change_given numeric not null default 0,
  created_at text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id text primary key,
  description text not null,
  amount numeric not null default 0,
  category text not null default 'General',
  created_at text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id text primary key,
  staff_id text not null,
  staff_name text not null,
  date text not null,
  check_in text,
  check_out text,
  status text not null default 'present',
  synced_at timestamptz not null default now()
);

create table if not exists public.product_sections (
  id text primary key,
  name text not null unique,
  category text not null unique,
  icon text not null default 'tag-outline',
  color text not null default '#888888',
  sort_order integer not null default 0,
  created_at text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.inventory_audits (
  id text primary key,
  audit_date text not null,
  note text,
  created_at text not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.inventory_audit_items (
  id text primary key,
  audit_id text not null,
  inventory_item_id text not null,
  item_name text not null,
  system_quantity numeric not null default 0,
  counted_quantity numeric not null default 0,
  difference numeric not null default 0,
  unit text not null,
  note text,
  synced_at timestamptz not null default now()
);

alter table public.menu_items enable row level security;
alter table public.inventory_items enable row level security;
alter table public.recipes enable row level security;
alter table public.staff enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cash_drawer enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.expenses enable row level security;
alter table public.attendance enable row level security;
alter table public.product_sections enable row level security;
alter table public.inventory_audits enable row level security;
alter table public.inventory_audit_items enable row level security;

-- Simple single-shop policy for anon-key app sync.
-- For a private cafe app, keep the anon key inside your APK and do not expose this project publicly.
do $$
declare
  t text;
begin
  foreach t in array array[
    'menu_items', 'inventory_items', 'recipes', 'staff', 'sales', 'sale_items',
    'stock_movements', 'cash_drawer', 'cash_transactions', 'expenses',
    'attendance', 'product_sections', 'inventory_audits', 'inventory_audit_items'
  ]
  loop
    execute format('drop policy if exists mighty_cafe_app_sync on public.%I', t);
    execute format('create policy mighty_cafe_app_sync on public.%I for all using (true) with check (true)', t);
  end loop;
end $$;
