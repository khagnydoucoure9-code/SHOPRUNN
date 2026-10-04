-- =====================================================================
-- SHOP — Script Supabase complet (à exécuter UNE fois)
-- Supabase → SQL Editor → New query → coller tout → Run
-- Rejouable sans risque (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =====================================================================

-- ======================= SQL 1 — TABLES ==============================
create extension if not exists pgcrypto;

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(trim(name)) > 0),
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  description  text not null default '',
  price        numeric(10,2) not null default 0 check (price >= 0),
  category_id  uuid references public.categories(id) on delete set null,
  active       boolean not null default true,
  is_new       boolean not null default false,
  is_featured  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  image_path  text not null,                -- chemin dans le bucket product-images
  sort_order  integer not null default 0,   -- 0 = image principale
  created_at  timestamptz not null default now()
);

create table if not exists public.product_sizes (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  size        text not null check (size in ('S','M','L','XL','XXL')),
  quantity    integer not null default 0 check (quantity >= 0),
  enabled     boolean not null default true,
  unique (product_id, size)
);

create table if not exists public.admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.site_settings (
  id            integer primary key default 1 check (id = 1),  -- une seule ligne
  site_name     text not null default 'SHOP',
  description   text not null default '',
  snapchat      text not null default '',
  instagram     text not null default '',
  email         text not null default '',
  phone         text not null default '',
  contact_text  text not null default '',
  qr_code_path  text,                       -- chemin dans le bucket site-assets
  updated_at    timestamptz not null default now()
);

create index if not exists idx_products_category  on public.products(category_id);
create index if not exists idx_products_active    on public.products(active, created_at desc);
create index if not exists idx_images_product     on public.product_images(product_id, sort_order);
create index if not exists idx_sizes_product      on public.product_sizes(product_id);
create index if not exists idx_categories_order   on public.categories(sort_order);

-- ======================= SQL 2 — FONCTIONS / TRIGGERS =================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_categories_upd on public.categories;
create trigger trg_categories_upd before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_products_upd on public.products;
create trigger trg_products_upd before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_upd on public.site_settings;
create trigger trg_settings_upd before update on public.site_settings
  for each row execute function public.set_updated_at();

-- Vérifie côté base que l'utilisateur connecté est admin (utilisé par RLS + Storage)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ======================= SQL 3 — RLS =================================
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.product_sizes  enable row level security;
alter table public.admin_users    enable row level security;
alter table public.site_settings  enable row level security;

-- Lecture publique (uniquement ce qui est actif)
drop policy if exists "public read categories" on public.categories;
create policy "public read categories" on public.categories
  for select using (active);

drop policy if exists "public read products" on public.products;
create policy "public read products" on public.products
  for select using (active);

drop policy if exists "public read images" on public.product_images;
create policy "public read images" on public.product_images
  for select using (exists (select 1 from public.products p where p.id = product_id and p.active));

drop policy if exists "public read sizes" on public.product_sizes;
create policy "public read sizes" on public.product_sizes
  for select using (enabled and exists (select 1 from public.products p where p.id = product_id and p.active));

drop policy if exists "public read settings" on public.site_settings;
create policy "public read settings" on public.site_settings
  for select using (true);

-- Un utilisateur connecté peut seulement vérifier SA propre ligne admin
drop policy if exists "read own admin row" on public.admin_users;
create policy "read own admin row" on public.admin_users
  for select to authenticated using (user_id = auth.uid());

-- Écriture (et lecture complète) réservée aux admins
drop policy if exists "admin all categories" on public.categories;
create policy "admin all categories" on public.categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all products" on public.products;
create policy "admin all products" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all images" on public.product_images;
create policy "admin all images" on public.product_images
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all sizes" on public.product_sizes;
create policy "admin all sizes" on public.product_sizes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin all settings" on public.site_settings;
create policy "admin all settings" on public.site_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- admin_users : aucune policy d'écriture → on ajoute les admins uniquement via le SQL Editor.

-- Temps réel
do $$
declare t text;
begin
  foreach t in array array['products','product_sizes','categories','product_images','site_settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ======================= SQL 4 — STORAGE =============================
insert into storage.buckets (id, name, public) values
  ('product-images', 'product-images', true),
  ('site-assets',    'site-assets',    true)
on conflict (id) do update set public = true;

drop policy if exists "public read shop files" on storage.objects;
create policy "public read shop files" on storage.objects
  for select using (bucket_id in ('product-images','site-assets'));

drop policy if exists "admin insert shop files" on storage.objects;
create policy "admin insert shop files" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('product-images','site-assets') and public.is_admin());

drop policy if exists "admin update shop files" on storage.objects;
create policy "admin update shop files" on storage.objects
  for update to authenticated
  using (bucket_id in ('product-images','site-assets') and public.is_admin())
  with check (bucket_id in ('product-images','site-assets') and public.is_admin());

drop policy if exists "admin delete shop files" on storage.objects;
create policy "admin delete shop files" on storage.objects
  for delete to authenticated
  using (bucket_id in ('product-images','site-assets') and public.is_admin());

-- ======================= SQL 5 — DONNÉES INITIALES ===================
insert into public.site_settings (id, site_name, description, contact_text)
values (1, 'SHOP', 'Streetwear & running. Pièces en stock limité.',
        'Pour acheter, contacte-nous directement en privé.')
on conflict (id) do nothing;

insert into public.categories (name, sort_order) values
  ('T-shirts', 0), ('Hoodies', 1), ('Pantalons', 2), ('Accessoires', 3)
on conflict (name) do nothing;

-- ======================= SQL 6 — TON COMPTE ADMIN ====================
-- 1) Supabase → Authentication → Users → Add user → email + mot de passe
--    (coche "Auto Confirm User")
-- 2) Remplace l'email ci-dessous puis exécute CETTE ligne seule :
--
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'TON_EMAIL@exemple.com';
