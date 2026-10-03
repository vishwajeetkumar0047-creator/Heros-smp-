-- =====================================================
-- HEROS SMP - Supabase database (already applied to project "Spark mc")
-- Tables: staff, store_items
-- Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
-- =====================================================


-- =========================
-- STAFF
-- =========================

create table if not exists public.staff (
    id           uuid primary key default gen_random_uuid(),
    player_name  text not null unique,
    role         text not null
                 check (role in ('founder', 'owner', 'administrator', 'manager', 'moderator', 'helper', 'staff', 'support')),
    skin_url     text,                    -- optional: skin image link
    sort_order   integer not null default 0,
    created_at   timestamptz not null default now()
);


-- =========================
-- STORE ITEMS
-- =========================

create table if not exists public.store_items (
    id           uuid primary key default gen_random_uuid(),
    name         text not null,
    description  text,
    price        numeric(10, 2) not null check (price >= 0),
    category     text,                    -- example: Ranks, Keys, Crates
    image_url    text,
    is_active    boolean not null default true,   -- false = website par nahi dikhega
    sort_order   integer not null default 0,
    created_at   timestamptz not null default now()
);


-- =========================
-- SECURITY (RLS)
-- Website (anon key) sirf READ kar sakti hai.
-- Add / edit / delete sirf Supabase dashboard se hoga.
-- =========================

alter table public.staff       enable row level security;
alter table public.store_items enable row level security;

drop policy if exists "Public can read staff" on public.staff;
create policy "Public can read staff"
    on public.staff
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Public can read active store items" on public.store_items;
create policy "Public can read active store items"
    on public.store_items
    for select
    to anon, authenticated
    using (is_active = true);

grant select on public.staff       to anon, authenticated;
grant select on public.store_items to anon, authenticated;


-- =========================
-- STARTER DATA (staff page par jo owner pehle se hai)
-- =========================

insert into public.staff (player_name, role, skin_url, sort_order)
values ('VISHU0409', 'owner', 'images/skins/vishuskin.png', 1)
on conflict (player_name) do nothing;


-- =====================================================
-- PART 2: LOGIN + ADMIN (already applied to project "Spark mc")
-- Admin = admins table mein jis email ka confirmed account ho
-- Naya admin add karna: insert into public.admins (email) values ('email@gmail.com');   (lowercase)
-- =====================================================

create table if not exists public.admins (
    email       text primary key check (email = lower(email)),
    created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

insert into public.admins (email)
values ('vishwajeetp268@gmail.com')
on conflict (email) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from auth.users u
        join public.admins a on lower(u.email) = a.email
        where u.id = (select auth.uid())
          and u.email_confirmed_at is not null
    );
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

create table if not exists public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    username    text not null,
    created_at  timestamptz not null default now(),
    constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,16}$')
);

create unique index if not exists profiles_username_lower_key
    on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
    on public.profiles for select to authenticated
    using ((select auth.uid()) = id);

revoke all on public.profiles from anon;
grant select on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    wanted   text := new.raw_user_meta_data ->> 'username';
    fallback text := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
begin
    if wanted is null or wanted !~ '^[A-Za-z0-9_]{3,16}$' then
        wanted := fallback;
    end if;

    begin
        insert into public.profiles (id, username) values (new.id, wanted);
    exception when unique_violation then
        insert into public.profiles (id, username) values (new.id, fallback);
    end;

    return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select not exists (
        select 1 from public.profiles where lower(username) = lower(p_username)
    );
$$;

revoke execute on function public.username_available(text) from public;
grant  execute on function public.username_available(text) to anon, authenticated;

revoke insert, update, delete on public.staff, public.store_items from anon;
grant  insert, update, delete on public.staff, public.store_items to authenticated;

drop policy if exists "Admins insert staff" on public.staff;
create policy "Admins insert staff"
    on public.staff for insert to authenticated
    with check ((select public.is_admin()));

drop policy if exists "Admins update staff" on public.staff;
create policy "Admins update staff"
    on public.staff for update to authenticated
    using ((select public.is_admin()))
    with check ((select public.is_admin()));

drop policy if exists "Admins delete staff" on public.staff;
create policy "Admins delete staff"
    on public.staff for delete to authenticated
    using ((select public.is_admin()));

drop policy if exists "Admins read all store items" on public.store_items;
create policy "Admins read all store items"
    on public.store_items for select to authenticated
    using ((select public.is_admin()));

drop policy if exists "Admins insert store items" on public.store_items;
create policy "Admins insert store items"
    on public.store_items for insert to authenticated
    with check ((select public.is_admin()));

drop policy if exists "Admins update store items" on public.store_items;
create policy "Admins update store items"
    on public.store_items for update to authenticated
    using ((select public.is_admin()))
    with check ((select public.is_admin()));

drop policy if exists "Admins delete store items" on public.store_items;
create policy "Admins delete store items"
    on public.store_items for delete to authenticated
    using ((select public.is_admin()));



-- =====================================================
-- PART 3: IMAGE UPLOAD (already applied to project "Spark mc")
-- Bucket "site-images": sabko dikhti hai, upload/edit/delete sirf admin
-- =====================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'site-images',
    'site-images',
    true,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload site images" on storage.objects;
create policy "Admins upload site images"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'site-images' and (select public.is_admin()));

drop policy if exists "Admins update site images" on storage.objects;
create policy "Admins update site images"
    on storage.objects for update to authenticated
    using (bucket_id = 'site-images' and (select public.is_admin()))
    with check (bucket_id = 'site-images' and (select public.is_admin()));

drop policy if exists "Admins delete site images" on storage.objects;
create policy "Admins delete site images"
    on storage.objects for delete to authenticated
    using (bucket_id = 'site-images' and (select public.is_admin()));


-- =====================================================
-- PART 4: SITE SETTINGS (logo, rules header) + RULES (already applied to project "Spark mc")
-- Purane rules.html ke 7 categories / 28 rules seed ho chuke hain (kuch delete nahi hua)
-- =====================================================

create table if not exists public.site_settings (
    key         text primary key
                check (key in ('logo_url', 'rules_tag', 'rules_title', 'rules_intro')),
    value       text,
    updated_at  timestamptz not null default now()
);

create table if not exists public.rule_categories (
    id           uuid primary key default gen_random_uuid(),
    title        text not null,
    description  text,
    sort_order   integer not null default 0,
    created_at   timestamptz not null default now()
);

create table if not exists public.rules (
    id           uuid primary key default gen_random_uuid(),
    category_id  uuid not null references public.rule_categories (id) on delete cascade,
    title        text not null,
    description  text,
    sort_order   integer not null default 0,
    created_at   timestamptz not null default now()
);

create index if not exists rules_category_id_idx on public.rules (category_id);

alter table public.site_settings   enable row level security;
alter table public.rule_categories enable row level security;
alter table public.rules           enable row level security;

revoke insert, update, delete on public.site_settings, public.rule_categories, public.rules from anon;
grant  select on public.site_settings, public.rule_categories, public.rules to anon, authenticated;
grant  insert, update, delete on public.site_settings, public.rule_categories, public.rules to authenticated;

-- policies: sab padh sakte hain, likh sirf admin (site_settings / rule_categories / rules)
do $$
declare
    t text;
begin
    foreach t in array array['site_settings', 'rule_categories', 'rules'] loop
        execute format('drop policy if exists "Public can read %1$s" on public.%1$s', t);
        execute format('create policy "Public can read %1$s" on public.%1$s for select to anon, authenticated using (true)', t);
        execute format('drop policy if exists "Admins insert %1$s" on public.%1$s', t);
        execute format('create policy "Admins insert %1$s" on public.%1$s for insert to authenticated with check ((select public.is_admin()))', t);
        execute format('drop policy if exists "Admins update %1$s" on public.%1$s', t);
        execute format('create policy "Admins update %1$s" on public.%1$s for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
        execute format('drop policy if exists "Admins delete %1$s" on public.%1$s', t);
        execute format('create policy "Admins delete %1$s" on public.%1$s for delete to authenticated using ((select public.is_admin()))', t);
    end loop;
end $$;

insert into public.site_settings (key, value) values
    ('rules_tag',   'SERVER RULES'),
    ('rules_title', 'Rules & Guidelines'),
    ('rules_intro', 'Please follow these rules to keep our server safe, fair and enjoyable for everyone.')
on conflict (key) do nothing;

-- Rules ka starter data (General, Chat, Gameplay, PvP, Griefing & Stealing,
-- Exploiting & Cheating, Punishments) database mein pehle se hai.
-- Sirf naya database banate waqt rules.html se copy karke seed karna padega.


-- =====================================================
-- PART 5: FORMS (already applied to project "Spark mc")
-- Admin panel ke Forms tab se forms / questions bante hain,
-- aaye hue jawab (responses) sirf admin dekh sakta hai.
-- =====================================================

create table if not exists public.forms (
    id             uuid primary key default gen_random_uuid(),
    slug           text not null unique
                   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 60),
    title          text not null,
    description    text,
    is_open        boolean not null default true,
    require_login  boolean not null default true,
    sort_order     integer not null default 0,
    created_at     timestamptz not null default now()
);

create table if not exists public.form_fields (
    id           uuid primary key default gen_random_uuid(),
    form_id      uuid not null references public.forms (id) on delete cascade,
    label        text not null,
    field_type   text not null
                 check (field_type in ('text', 'textarea', 'email', 'number', 'select', 'radio', 'checkbox')),
    options      text,
    is_required  boolean not null default false,
    sort_order   integer not null default 0,
    created_at   timestamptz not null default now()
);

create index if not exists form_fields_form_id_idx on public.form_fields (form_id);

create table if not exists public.form_submissions (
    id                  uuid primary key default gen_random_uuid(),
    form_id             uuid not null references public.forms (id) on delete cascade,
    answers             jsonb not null
                        check (jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 20000),
    submitted_by        uuid references auth.users (id) on delete set null,
    submitter_username  text,
    submitter_email     text,
    status              text not null default 'new'
                        check (status in ('new', 'accepted', 'rejected')),
    created_at          timestamptz not null default now()
);

create index if not exists form_submissions_form_idx
    on public.form_submissions (form_id, created_at desc);

-- submit hote hi user ki asli detail server par lagti hai (fake nahi ho sakti)
create or replace function public.set_submission_meta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.submitted_by := (select auth.uid());
    new.status := 'new';
    new.created_at := now();
    new.submitter_username := null;
    new.submitter_email := null;

    if new.submitted_by is not null then
        select p.username into new.submitter_username
        from public.profiles p where p.id = new.submitted_by;

        select u.email into new.submitter_email
        from auth.users u where u.id = new.submitted_by;
    end if;

    return new;
end;
$$;

revoke execute on function public.set_submission_meta() from public, anon, authenticated;

drop trigger if exists set_submission_meta_trigger on public.form_submissions;
create trigger set_submission_meta_trigger
    before insert on public.form_submissions
    for each row execute function public.set_submission_meta();

alter table public.forms            enable row level security;
alter table public.form_fields      enable row level security;
alter table public.form_submissions enable row level security;

revoke all on public.forms, public.form_fields, public.form_submissions from anon;
grant select on public.forms, public.form_fields to anon;
grant insert on public.form_submissions to anon;
grant select, insert, update, delete on public.forms, public.form_fields, public.form_submissions to authenticated;

-- forms
create policy "Public can read open forms" on public.forms
    for select to anon, authenticated using (is_open);
create policy "Admins read all forms" on public.forms
    for select to authenticated using ((select public.is_admin()));
create policy "Admins insert forms" on public.forms
    for insert to authenticated with check ((select public.is_admin()));
create policy "Admins update forms" on public.forms
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete forms" on public.forms
    for delete to authenticated using ((select public.is_admin()));

-- form_fields
create policy "Public can read fields of open forms" on public.form_fields
    for select to anon, authenticated
    using (exists (select 1 from public.forms f where f.id = form_id and f.is_open));
create policy "Admins read all form fields" on public.form_fields
    for select to authenticated using ((select public.is_admin()));
create policy "Admins insert form fields" on public.form_fields
    for insert to authenticated with check ((select public.is_admin()));
create policy "Admins update form fields" on public.form_fields
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete form fields" on public.form_fields
    for delete to authenticated using ((select public.is_admin()));

-- form_submissions: khule form mein koi bhi submit kar sakta hai (login zaroori ho to sirf logged-in)
create policy "Anyone can submit to open forms" on public.form_submissions
    for insert to anon, authenticated
    with check (exists (
        select 1 from public.forms f
        where f.id = form_id
          and f.is_open
          and (not f.require_login or (select auth.uid()) is not null)
    ));
create policy "Admins read submissions" on public.form_submissions
    for select to authenticated using ((select public.is_admin()));
create policy "Admins update submissions" on public.form_submissions
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete submissions" on public.form_submissions
    for delete to authenticated using ((select public.is_admin()));

-- Starter forms (Staff Application + Media Team Application) database mein pehle se bane hue hain.
-- Naya database banate waqt admin panel ke Forms tab se dobara bana sakte ho.


-- =====================================================
-- PART 6: PRODUCT GALLERY + ORDERS + PAYMENT PROOFS (already applied to project "Spark mc")
-- =====================================================

-- Gallery (product preview ki extra images)
create table if not exists public.store_item_images (
    id          uuid primary key default gen_random_uuid(),
    item_id     uuid not null references public.store_items (id) on delete cascade,
    image_url   text not null,
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now()
);

create index if not exists store_item_images_item_idx on public.store_item_images (item_id);

alter table public.store_item_images enable row level security;

revoke all on public.store_item_images from anon;
grant select on public.store_item_images to anon;
grant select, insert, update, delete on public.store_item_images to authenticated;

create policy "Public can read images of active items" on public.store_item_images
    for select to anon, authenticated
    using (exists (select 1 from public.store_items i where i.id = item_id and i.is_active));
create policy "Admins read all item images" on public.store_item_images
    for select to authenticated using ((select public.is_admin()));
create policy "Admins insert item images" on public.store_item_images
    for insert to authenticated with check ((select public.is_admin()));
create policy "Admins update item images" on public.store_item_images
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete item images" on public.store_item_images
    for delete to authenticated using ((select public.is_admin()));

-- Payment settings (UPI ID, QR, note) site_settings mein
alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check
    check (key in ('logo_url', 'rules_tag', 'rules_title', 'rules_intro',
                   'payment_upi_id', 'payment_qr_url', 'payment_note'));

-- Orders
create table if not exists public.orders (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid references auth.users (id) on delete set null,
    item_id             uuid references public.store_items (id) on delete set null,
    item_name           text not null,
    unit_price          numeric(10, 2) not null,
    quantity            integer not null check (quantity between 1 and 99),
    total               numeric(12, 2) not null,
    minecraft_username  text not null check (char_length(minecraft_username) between 2 and 32),
    utr                 text not null check (utr ~ '^[A-Z0-9]{8,30}$'),
    screenshot_path     text not null,
    status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected')),
    admin_note          text,
    submitter_username  text,
    submitter_email     text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    reviewed_at         timestamptz
);

-- ek hi UTR do active orders mein use nahi ho sakta (rejected ko chhod kar)
create unique index if not exists orders_utr_active_key
    on public.orders (utr) where status <> 'rejected';
create index if not exists orders_user_idx   on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status, created_at desc);

-- Order banate waqt naam / price / total server par lagta hai (client fake nahi kar sakta),
-- max 5 pending orders per user
create or replace function public.prepare_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid            uuid := (select auth.uid());
    item           record;
    pending_count  integer;
begin
    if uid is null then
        raise exception 'Please log in to place an order.';
    end if;

    select i.id, i.name, i.price, i.is_active into item
    from public.store_items i where i.id = new.item_id;

    if not found or not item.is_active then
        raise exception 'This item is not available.';
    end if;

    select count(*) into pending_count
    from public.orders o where o.user_id = uid and o.status = 'pending';

    if pending_count >= 5 then
        raise exception 'You already have 5 pending orders. Please wait for approval.';
    end if;

    if split_part(coalesce(new.screenshot_path, ''), '/', 1) <> uid::text then
        raise exception 'Invalid payment screenshot.';
    end if;

    new.user_id            := uid;
    new.item_name          := item.name;
    new.unit_price         := item.price;
    new.total              := item.price * new.quantity;
    new.utr                := upper(trim(new.utr));
    new.minecraft_username := trim(new.minecraft_username);
    new.status             := 'pending';
    new.admin_note         := null;
    new.reviewed_at        := null;
    new.created_at         := now();
    new.updated_at         := now();
    new.submitter_username := null;
    new.submitter_email    := null;

    select p.username into new.submitter_username from public.profiles p where p.id = uid;
    select u.email    into new.submitter_email    from auth.users u    where u.id = uid;

    return new;
end;
$$;

revoke execute on function public.prepare_order() from public, anon, authenticated;

drop trigger if exists prepare_order_trigger on public.orders;
create trigger prepare_order_trigger
    before insert on public.orders
    for each row execute function public.prepare_order();

create or replace function public.touch_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    if new.status is distinct from old.status then
        new.reviewed_at := now();
    end if;
    return new;
end;
$$;

drop trigger if exists touch_order_trigger on public.orders;
create trigger touch_order_trigger
    before update on public.orders
    for each row execute function public.touch_order();

alter table public.orders enable row level security;

revoke all on public.orders from anon;
grant select, insert, update, delete on public.orders to authenticated;

create policy "Users create own orders" on public.orders
    for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users read own orders, admins read all" on public.orders
    for select to authenticated
    using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Admins update orders" on public.orders
    for update to authenticated
    using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete orders" on public.orders
    for delete to authenticated using ((select public.is_admin()));

-- Private bucket: payment screenshots
-- User sirf apne folder (<user id>/...) mein upload kar sakta hai.
-- Dekh sirf wo khud aur admin sakta hai. Delete sirf admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

create policy "Users upload own payment proofs" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'payment-proofs'
                and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owner and admins read payment proofs" on storage.objects
    for select to authenticated
    using (bucket_id = 'payment-proofs'
           and ((storage.foldername(name))[1] = (select auth.uid())::text
                or (select public.is_admin())));
create policy "Admins delete payment proofs" on storage.objects
    for delete to authenticated
    using (bucket_id = 'payment-proofs' and (select public.is_admin()));


-- =====================================================
-- PART 7: DISCORD ORDER NOTIFICATIONS (already applied to project "Spark mc")
-- Naya order aane par Discord channel (webhook) par embed message jata hai.
-- Webhook URL admin panel (Orders tab) se save hota hai; website use padh nahi sakti.
-- =====================================================

create extension if not exists pg_net with schema extensions;

create table if not exists public.integration_settings (
    key         text primary key check (key in ('discord_webhook_url')),
    value       text not null,
    updated_at  timestamptz not null default now(),
    constraint discord_webhook_url_format check (
        key <> 'discord_webhook_url'
        or value ~ '^https://((ptb|canary)\.)?(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'
    )
);

alter table public.integration_settings enable row level security;
revoke all on public.integration_settings from anon, authenticated;   -- koi policy nahi = API se band

create or replace function public.discord_order_payload(o public.orders)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select jsonb_build_object(
        'username', 'HEROS SMP Store',
        'allowed_mentions', jsonb_build_object('parse', jsonb_build_array()),   -- @everyone jaise pings band
        'embeds', jsonb_build_array(jsonb_build_object(
            'title', '🛒 New order received',
            'description', 'A payment proof is waiting for review. Open **Admin Panel → Orders** to check the screenshot, then approve or reject.',
            'color', 14435381,
            'fields', jsonb_build_array(
                jsonb_build_object('name', 'Item',
                    'value', left(replace(o.item_name, '`', '') || ' × ' || o.quantity::text, 1000),
                    'inline', true),
                jsonb_build_object('name', 'Total',
                    'value', '₹' || case when o.total = trunc(o.total)
                                         then trunc(o.total)::text
                                         else to_char(o.total, 'FM9999999990.00') end,
                    'inline', true),
                jsonb_build_object('name', 'Minecraft username',
                    'value', '`' || left(replace(o.minecraft_username, '`', ''), 40) || '`',
                    'inline', true),
                jsonb_build_object('name', 'UTR',
                    'value', '`' || o.utr || '`',
                    'inline', true),
                jsonb_build_object('name', 'Buyer',
                    'value', left(coalesce(replace(o.submitter_username, '`', ''), 'Unknown')
                                  || coalesce(E'\n' || o.submitter_email, ''), 300),
                    'inline', true),
                jsonb_build_object('name', 'Order ID',
                    'value', '`' || left(o.id::text, 8) || '`',
                    'inline', true)
            ),
            'timestamp', to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ))
    );
$$;

revoke execute on function public.discord_order_payload(public.orders) from public, anon, authenticated;

-- order banne ke baad Discord ko bhejo (fail ho to bhi order chalta hai)
create or replace function public.notify_discord_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    hook text;
begin
    select s.value into hook
    from public.integration_settings s
    where s.key = 'discord_webhook_url';

    if hook is not null and hook <> '' then
        perform net.http_post(
            url  := hook,
            body := public.discord_order_payload(new)
        );
    end if;

    return new;
exception when others then
    return new;
end;
$$;

revoke execute on function public.notify_discord_order() from public, anon, authenticated;

drop trigger if exists notify_discord_order_trigger on public.orders;
create trigger notify_discord_order_trigger
    after insert on public.orders
    for each row execute function public.notify_discord_order();

-- Admin panel ke functions (sab mein admin check)
create or replace function public.discord_status()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not (select public.is_admin()) then
        raise exception 'Not allowed.';
    end if;

    return exists (select 1 from public.integration_settings where key = 'discord_webhook_url');
end;
$$;

create or replace function public.set_discord_webhook(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    clean text := trim(coalesce(p_url, ''));
begin
    if not (select public.is_admin()) then
        raise exception 'Not allowed.';
    end if;

    if clean !~ '^https://((ptb|canary)\.)?(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$' then
        raise exception 'That is not a valid Discord webhook URL.';
    end if;

    insert into public.integration_settings (key, value, updated_at)
    values ('discord_webhook_url', clean, now())
    on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

create or replace function public.clear_discord_webhook()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not (select public.is_admin()) then
        raise exception 'Not allowed.';
    end if;

    delete from public.integration_settings where key = 'discord_webhook_url';
end;
$$;

create or replace function public.send_discord_test()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    hook text;
    request_id bigint;
begin
    if not (select public.is_admin()) then
        raise exception 'Not allowed.';
    end if;

    select s.value into hook
    from public.integration_settings s
    where s.key = 'discord_webhook_url';

    if hook is null then
        raise exception 'Discord webhook is not set.';
    end if;

    select net.http_post(
        url  := hook,
        body := jsonb_build_object(
            'username', 'HEROS SMP Store',
            'allowed_mentions', jsonb_build_object('parse', jsonb_build_array()),
            'content', '✅ Test message from the HEROS SMP admin panel. New order notifications will appear in this channel.'
        )
    ) into request_id;

    return request_id;
end;
$$;

create or replace function public.discord_test_result(p_request_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    r record;
begin
    if not (select public.is_admin()) then
        raise exception 'Not allowed.';
    end if;

    select h.status_code, h.error_msg, h.timed_out into r
    from net._http_response h
    where h.id = p_request_id;

    if not found then
        return jsonb_build_object('done', false);
    end if;

    return jsonb_build_object(
        'done', true,
        'status', r.status_code,
        'error', coalesce(r.error_msg, case when r.timed_out then 'timed out' end)
    );
end;
$$;

revoke execute on function public.discord_status()             from public, anon;
revoke execute on function public.set_discord_webhook(text)    from public, anon;
revoke execute on function public.clear_discord_webhook()      from public, anon;
revoke execute on function public.send_discord_test()          from public, anon;
revoke execute on function public.discord_test_result(bigint)  from public, anon;
grant  execute on function public.discord_status()             to authenticated;
grant  execute on function public.set_discord_webhook(text)    to authenticated;
grant  execute on function public.clear_discord_webhook()      to authenticated;
grant  execute on function public.send_discord_test()          to authenticated;
grant  execute on function public.discord_test_result(bigint)  to authenticated;


-- =====================================================
-- PART 8: SERVER ADDRESS SETTING (already applied to project "Spark mc")
-- Home page ka Play button ye IP copy karta hai (admin panel -> Site tab se set hota hai)
-- =====================================================

alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check
    check (key in ('logo_url', 'rules_tag', 'rules_title', 'rules_intro',
                   'payment_upi_id', 'payment_qr_url', 'payment_note',
                   'server_ip'));


-- =====================================================
-- PART 9: SOCIAL LINKS SETTINGS (already applied to project "Spark mc")
-- Footer ke Discord / YouTube links (admin panel -> Site tab se set hote hain)
-- =====================================================

alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check
    check (key in ('logo_url', 'rules_tag', 'rules_title', 'rules_intro',
                   'payment_upi_id', 'payment_qr_url', 'payment_note',
                   'server_ip', 'discord_url', 'youtube_url'));


-- =====================================================
-- PART 10: CART (multi-item orders) + COUPONS + SALES DASHBOARD (already applied to project "Spark mc")
-- Orders ab sirf place_order() function se bante hain (price / coupon server par lagta hai).
-- Purane single-item orders order_items mein copy ho gaye (kuch delete nahi hua).
-- =====================================================

alter table public.orders add column if not exists subtotal    numeric(12, 2);
alter table public.orders add column if not exists discount    numeric(12, 2) not null default 0;
alter table public.orders add column if not exists coupon_code text;

alter table public.orders alter column item_name  drop not null;
alter table public.orders alter column unit_price drop not null;
alter table public.orders alter column quantity   drop not null;

create table if not exists public.order_items (
    id          uuid primary key default gen_random_uuid(),
    order_id    uuid not null references public.orders (id) on delete cascade,
    item_id     uuid references public.store_items (id) on delete set null,
    item_name   text not null,
    unit_price  numeric(10, 2) not null,
    quantity    integer not null check (quantity between 1 and 99),
    line_total  numeric(12, 2) not null,
    created_at  timestamptz not null default now()
);

create index if not exists order_items_order_idx on public.order_items (order_id);

insert into public.order_items (order_id, item_id, item_name, unit_price, quantity, line_total)
select o.id, o.item_id, o.item_name, o.unit_price, o.quantity, o.unit_price * o.quantity
from public.orders o
where o.item_name is not null
  and not exists (select 1 from public.order_items i where i.order_id = o.id);

update public.orders set subtotal = total where subtotal is null;
alter table public.orders alter column subtotal set not null;

alter table public.order_items enable row level security;
revoke all on public.order_items from anon, authenticated;
grant select on public.order_items to authenticated;

create policy "Users read own order items, admins read all" on public.order_items
    for select to authenticated
    using (exists (
        select 1 from public.orders o
        where o.id = order_id
          and (o.user_id = (select auth.uid()) or (select public.is_admin()))
    ));

drop policy if exists "Users create own orders" on public.orders;
revoke insert on public.orders from authenticated;

drop trigger if exists prepare_order_trigger on public.orders;
drop trigger if exists notify_discord_order_trigger on public.orders;
drop function if exists public.prepare_order();
drop function if exists public.notify_discord_order();
drop function if exists public.discord_order_payload(public.orders);

-- Coupons (sirf admin)
create table if not exists public.coupons (
    id              uuid primary key default gen_random_uuid(),
    code            text not null unique check (code ~ '^[A-Z0-9_-]{3,20}$'),
    discount_type   text not null check (discount_type in ('percent', 'fixed')),
    value           numeric(10, 2) not null check (value > 0),
    min_order       numeric(10, 2) not null default 0 check (min_order >= 0),
    max_discount    numeric(10, 2) check (max_discount is null or max_discount > 0),
    max_uses        integer check (max_uses is null or max_uses > 0),
    per_user_limit  integer not null default 1 check (per_user_limit >= 1),
    expires_on      date,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    constraint coupons_percent_range check (discount_type <> 'percent' or value <= 100)
);

alter table public.coupons enable row level security;
revoke all on public.coupons from anon;
grant select, insert, update, delete on public.coupons to authenticated;

create policy "Admins read coupons" on public.coupons
    for select to authenticated using ((select public.is_admin()));
create policy "Admins insert coupons" on public.coupons
    for insert to authenticated with check ((select public.is_admin()));
create policy "Admins update coupons" on public.coupons
    for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete coupons" on public.coupons
    for delete to authenticated using ((select public.is_admin()));

-- Internal helpers
create or replace function public.fmt_money(n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
    select case when n = trunc(n) then trunc(n)::text else to_char(n, 'FM9999999990.00') end;
$$;

create or replace function public.cart_lines(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    e      jsonb;
    rec    record;
    lines  jsonb := '[]'::jsonb;
    ids    uuid[] := '{}';
    iid    uuid;
    qty    integer;
begin
    if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
        raise exception 'Your cart is empty.';
    end if;

    if jsonb_array_length(p_items) > 20 then
        raise exception 'Too many different items in the cart.';
    end if;

    for e in select * from jsonb_array_elements(p_items) loop

        begin
            iid := (e ->> 'id')::uuid;
            qty := (e ->> 'qty')::integer;
        exception when others then
            raise exception 'Invalid cart.';
        end;

        if qty is null or qty < 1 or qty > 99 then
            raise exception 'Quantity must be between 1 and 99.';
        end if;

        if iid = any (ids) then
            raise exception 'Invalid cart.';
        end if;

        ids := ids || iid;

        select i.id, i.name, i.price into rec
        from public.store_items i
        where i.id = iid and i.is_active;

        if not found then
            raise exception 'One of the items in your cart is no longer available.';
        end if;

        lines := lines || jsonb_build_object(
            'item_id',    rec.id,
            'item_name',  rec.name,
            'unit_price', rec.price,
            'quantity',   qty,
            'line_total', rec.price * qty
        );

    end loop;

    return lines;
end;
$$;

create or replace function public.evaluate_coupon(p_code text, p_subtotal numeric, p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    wanted      text := upper(trim(coalesce(p_code, '')));
    c           record;
    used_total  integer;
    used_user   integer;
    disc        numeric;
begin
    if wanted = '' then
        return jsonb_build_object('code', null, 'discount', 0);
    end if;

    select * into c
    from public.coupons cp
    where cp.code = wanted and cp.is_active
    for update;

    if not found then
        raise exception 'Invalid coupon code.';
    end if;

    if c.expires_on is not null
       and (now() at time zone 'Asia/Kolkata')::date > c.expires_on then
        raise exception 'This coupon has expired.';
    end if;

    if p_subtotal < c.min_order then
        raise exception 'This coupon needs a minimum order of ₹%.', public.fmt_money(c.min_order);
    end if;

    if c.max_uses is not null then

        select count(*) into used_total
        from public.orders o
        where o.coupon_code = c.code and o.status <> 'rejected';

        if used_total >= c.max_uses then
            raise exception 'This coupon has reached its usage limit.';
        end if;

    end if;

    select count(*) into used_user
    from public.orders o
    where o.coupon_code = c.code and o.user_id = p_user and o.status <> 'rejected';

    if used_user >= c.per_user_limit then
        raise exception 'You have already used this coupon.';
    end if;

    if c.discount_type = 'percent' then
        disc := round(p_subtotal * c.value / 100, 2);
    else
        disc := c.value;
    end if;

    if c.max_discount is not null then
        disc := least(disc, c.max_discount);
    end if;

    disc := least(disc, p_subtotal);

    if p_subtotal - disc < 1 then
        raise exception 'This coupon cannot make the order free.';
    end if;

    return jsonb_build_object('code', c.code, 'discount', disc);
end;
$$;

revoke execute on function public.fmt_money(numeric)                     from public, anon, authenticated;
revoke execute on function public.cart_lines(jsonb)                      from public, anon, authenticated;
revoke execute on function public.evaluate_coupon(text, numeric, uuid)   from public, anon, authenticated;

-- Discord: order ki poori detail (items ke saath)
create or replace function public.send_order_to_discord(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    hook        text;
    o           public.orders;
    items_text  text;
    fields      jsonb;
begin
    select s.value into hook
    from public.integration_settings s
    where s.key = 'discord_webhook_url';

    if hook is null or hook = '' then
        return;
    end if;

    select * into o from public.orders where id = p_order_id;

    if not found then
        return;
    end if;

    select string_agg(
               '• ' || replace(i.item_name, '`', '') || ' × ' || i.quantity::text
               || ' — ₹' || public.fmt_money(i.line_total),
               E'\n' order by i.created_at, i.item_name)
    into items_text
    from public.order_items i
    where i.order_id = o.id;

    fields := jsonb_build_array(
        jsonb_build_object('name', 'Items', 'value', left(coalesce(items_text, '-'), 1000), 'inline', false)
    );

    if o.discount > 0 then

        fields := fields
            || jsonb_build_array(
                jsonb_build_object('name', 'Subtotal', 'value', '₹' || public.fmt_money(o.subtotal), 'inline', true),
                jsonb_build_object('name', 'Discount',
                    'value', '-₹' || public.fmt_money(o.discount)
                             || coalesce(' (`' || o.coupon_code || '`)', ''),
                    'inline', true)
            );

    end if;

    fields := fields || jsonb_build_array(
        jsonb_build_object('name', 'Total to verify', 'value', '**₹' || public.fmt_money(o.total) || '**', 'inline', true),
        jsonb_build_object('name', 'Minecraft username',
            'value', '`' || left(replace(o.minecraft_username, '`', ''), 40) || '`', 'inline', true),
        jsonb_build_object('name', 'UTR', 'value', '`' || o.utr || '`', 'inline', true),
        jsonb_build_object('name', 'Buyer',
            'value', left(coalesce(replace(o.submitter_username, '`', ''), 'Unknown')
                          || coalesce(E'\n' || o.submitter_email, ''), 300),
            'inline', true),
        jsonb_build_object('name', 'Order ID', 'value', '`' || left(o.id::text, 8) || '`', 'inline', true)
    );

    perform net.http_post(
        url  := hook,
        body := jsonb_build_object(
            'username', 'HEROS SMP Store',
            'allowed_mentions', jsonb_build_object('parse', jsonb_build_array()),
            'embeds', jsonb_build_array(jsonb_build_object(
                'title', '🛒 New order received',
                'description', 'A payment proof is waiting for review. Open **Admin Panel → Orders** to check the screenshot, then approve or reject.',
                'color', 14435381,
                'fields', fields,
                'timestamp', to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            ))
        )
    );
end;
$$;

revoke execute on function public.send_order_to_discord(uuid) from public, anon, authenticated;

-- Logged-in user ke functions: preview + order place
create or replace function public.preview_order(p_items jsonb, p_coupon text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    uid       uuid := (select auth.uid());
    lines     jsonb;
    line      jsonb;
    subtotal  numeric := 0;
    coupon    jsonb;
    disc      numeric;
begin
    if uid is null then
        raise exception 'Please log in to continue.';
    end if;

    lines := public.cart_lines(p_items);

    for line in select * from jsonb_array_elements(lines) loop
        subtotal := subtotal + (line ->> 'line_total')::numeric;
    end loop;

    coupon := public.evaluate_coupon(p_coupon, subtotal, uid);
    disc   := (coupon ->> 'discount')::numeric;

    return jsonb_build_object(
        'lines',       lines,
        'subtotal',    subtotal,
        'discount',    disc,
        'coupon_code', coupon ->> 'code',
        'total',       subtotal - disc
    );
end;
$$;

create or replace function public.place_order(
    p_items               jsonb,
    p_coupon              text,
    p_minecraft_username  text,
    p_utr                 text,
    p_screenshot_path     text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    uid            uuid := (select auth.uid());
    uname          text := trim(coalesce(p_minecraft_username, ''));
    utr_clean      text := upper(trim(coalesce(p_utr, '')));
    lines          jsonb;
    line           jsonb;
    subtotal       numeric := 0;
    coupon         jsonb;
    disc           numeric;
    pending_count  integer;
    new_id         uuid;
begin
    if uid is null then
        raise exception 'Please log in to place an order.';
    end if;

    if char_length(uname) < 2 or char_length(uname) > 32 then
        raise exception 'Enter your Minecraft username (2-32 characters).';
    end if;

    if utr_clean !~ '^[A-Z0-9]{8,30}$' then
        raise exception 'Enter a valid UTR (8-30 letters or numbers, no spaces).';
    end if;

    if split_part(coalesce(p_screenshot_path, ''), '/', 1) <> uid::text then
        raise exception 'Invalid payment screenshot.';
    end if;

    select count(*) into pending_count
    from public.orders o where o.user_id = uid and o.status = 'pending';

    if pending_count >= 5 then
        raise exception 'You already have 5 pending orders. Please wait for approval.';
    end if;

    lines := public.cart_lines(p_items);

    for line in select * from jsonb_array_elements(lines) loop
        subtotal := subtotal + (line ->> 'line_total')::numeric;
    end loop;

    coupon := public.evaluate_coupon(p_coupon, subtotal, uid);
    disc   := (coupon ->> 'discount')::numeric;

    insert into public.orders (
        user_id, subtotal, discount, coupon_code, total,
        minecraft_username, utr, screenshot_path,
        submitter_username, submitter_email
    )
    values (
        uid, subtotal, disc, coupon ->> 'code', subtotal - disc,
        uname, utr_clean, p_screenshot_path,
        (select p.username from public.profiles p where p.id = uid),
        (select u.email from auth.users u where u.id = uid)
    )
    returning id into new_id;

    insert into public.order_items (order_id, item_id, item_name, unit_price, quantity, line_total)
    select new_id,
           (l ->> 'item_id')::uuid,
           l ->> 'item_name',
           (l ->> 'unit_price')::numeric,
           (l ->> 'quantity')::integer,
           (l ->> 'line_total')::numeric
    from jsonb_array_elements(lines) l;

    begin
        perform public.send_order_to_discord(new_id);
    exception when others then
        null;   -- Discord fail ho to bhi order chalta hai
    end;

    return new_id;
end;
$$;

revoke execute on function public.preview_order(jsonb, text)                          from public, anon;
revoke execute on function public.place_order(jsonb, text, text, text, text)          from public, anon;
grant  execute on function public.preview_order(jsonb, text)                          to authenticated;
grant  execute on function public.place_order(jsonb, text, text, text, text)          to authenticated;

-- Admin: coupon usage + sales dashboard
create or replace function public.coupon_use_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if not (select public.is_admin()) then
        raise exception 'Not allowed.';
    end if;

    return coalesce((
        select jsonb_agg(jsonb_build_object('code', t.code, 'uses', t.uses))
        from (
            select o.coupon_code as code, count(*)::integer as uses
            from public.orders o
            where o.coupon_code is not null and o.status <> 'rejected'
            group by o.coupon_code
        ) t
    ), '[]'::jsonb);
end;
$$;

create or replace function public.sales_summary(p_days integer default 30, p_tz text default 'Asia/Kolkata')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    tz          text := 'UTC';
    days_n      integer := least(greatest(coalesce(p_days, 30), 1), 365);
    today       date;
    start_day   date;
    result      jsonb;
begin
    if not (select public.is_admin()) then
        raise exception 'Not allowed.';
    end if;

    if exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_tz) then
        tz := p_tz;
    end if;

    today     := (now() at time zone tz)::date;
    start_day := today - (days_n - 1);

    with approved as (
        select o.*, (o.reviewed_at at time zone tz)::date as sale_day
        from public.orders o
        where o.status = 'approved' and o.reviewed_at is not null
    ),
    in_period as (
        select * from approved where sale_day between start_day and today
    ),
    placed as (
        select o.status from public.orders o
        where (o.created_at at time zone tz)::date between start_day and today
    )
    select jsonb_build_object(
        'days',               days_n,
        'revenue',            coalesce((select sum(total) from in_period), 0),
        'orders',             (select count(*) from in_period),
        'avg_order',          coalesce((select round(avg(total), 2) from in_period), 0),
        'discounts',          coalesce((select sum(discount) from in_period), 0),
        'lifetime_revenue',   coalesce((select sum(total) from approved), 0),
        'lifetime_orders',    (select count(*) from approved),
        'pending_count',      (select count(*) from public.orders where status = 'pending'),
        'pending_amount',     coalesce((select sum(total) from public.orders where status = 'pending'), 0),
        'placed',             (select count(*) from placed),
        'rejected',           (select count(*) from placed where status = 'rejected'),
        'daily', (
            select jsonb_agg(jsonb_build_object(
                       'day',     g.d::text,
                       'revenue', coalesce(r.revenue, 0),
                       'orders',  coalesce(r.orders, 0)
                   ) order by g.d)
            from (select generate_series(start_day::timestamp, today::timestamp, interval '1 day')::date as d) g
            left join (
                select sale_day, sum(total) as revenue, count(*)::integer as orders
                from in_period group by sale_day
            ) r on r.sale_day = g.d
        ),
        'top_items', coalesce((
            select jsonb_agg(t)
            from (
                select oi.item_name as name,
                       sum(oi.quantity)::integer as qty,
                       sum(oi.line_total) as revenue
                from public.order_items oi
                join in_period o on o.id = oi.order_id
                group by oi.item_name
                order by sum(oi.line_total) desc, sum(oi.quantity) desc
                limit 10
            ) t
        ), '[]'::jsonb),
        'coupons', coalesce((
            select jsonb_agg(t)
            from (
                select coupon_code as code, count(*)::integer as uses, sum(discount) as discount
                from in_period
                where coupon_code is not null
                group by coupon_code
                order by count(*) desc
                limit 10
            ) t
        ), '[]'::jsonb)
    ) into result;

    return result;
end;
$$;

revoke execute on function public.coupon_use_counts()               from public, anon;
revoke execute on function public.sales_summary(integer, text)      from public, anon;
grant  execute on function public.coupon_use_counts()               to authenticated;
grant  execute on function public.sales_summary(integer, text)      to authenticated;


-- =====================================================
-- PART 11: BEDROCK PORT SETTING  (NEW - ye SQL Supabase SQL editor mein ek baar run karo)
-- Java ke liye sirf IP chalti hai, Bedrock ke liye port bhi chahiye.
-- Admin panel -> Site tab -> "Server address" mein Bedrock port set hota hai.
-- =====================================================

alter table public.site_settings drop constraint if exists site_settings_key_check;
alter table public.site_settings add constraint site_settings_key_check
    check (key in ('logo_url', 'rules_tag', 'rules_title', 'rules_intro',
                   'payment_upi_id', 'payment_qr_url', 'payment_note',
                   'server_ip', 'discord_url', 'youtube_url',
                   'bedrock_port'));


-- =====================================================
-- PART 12: MORE STAFF ROLES  (NEW - ye SQL Supabase SQL editor mein ek baar run karo)
-- Founder, Manager, Helper, Staff roles add hue
-- =====================================================

alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff add constraint staff_role_check
    check (role in ('founder', 'owner', 'administrator', 'manager', 'moderator', 'helper', 'staff', 'support'));


-- =====================================================
-- PART 13: DISCORD NAME FIX  (NEW - ye SQL Supabase SQL editor mein ek baar run karo)
-- Discord notification mein ab "HEROS SMP Store" naam aayega
-- =====================================================

create or replace function public.discord_order_payload(o public.orders)
returns jsonb
language sql
stable
set search_path = ''
as $$
    select jsonb_build_object(
        'username', 'HEROS SMP Store',
        'allowed_mentions', jsonb_build_object('parse', jsonb_build_array()),   -- @everyone jaise pings band
        'embeds', jsonb_build_array(jsonb_build_object(
            'title', '🛒 New order received',
            'description', 'A payment proof is waiting for review. Open **Admin Panel → Orders** to check the screenshot, then approve or reject.',
            'color', 14435381,
            'fields', jsonb_build_array(
                jsonb_build_object('name', 'Item',
                    'value', left(replace(o.item_name, '`', '') || ' × ' || o.quantity::text, 1000),
                    'inline', true),
                jsonb_build_object('name', 'Total',
                    'value', '₹' || case when o.total = trunc(o.total)
                                         then trunc(o.total)::text
                                         else to_char(o.total, 'FM9999999990.00') end,
                    'inline', true),
                jsonb_build_object('name', 'Minecraft username',
                    'value', '`' || left(replace(o.minecraft_username, '`', ''), 40) || '`',
                    'inline', true),
                jsonb_build_object('name', 'UTR',
                    'value', '`' || o.utr || '`',
                    'inline', true),
                jsonb_build_object('name', 'Buyer',
                    'value', left(coalesce(replace(o.submitter_username, '`', ''), 'Unknown')
                                  || coalesce(E'\n' || o.submitter_email, ''), 300),
                    'inline', true),
                jsonb_build_object('name', 'Order ID',
                    'value', '`' || left(o.id::text, 8) || '`',
                    'inline', true)
            ),
            'timestamp', to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        ))
    );
$$;

create or replace function public.send_discord_test()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    hook text;
    request_id bigint;
begin
    if not (select public.is_admin()) then
        raise exception 'Not allowed.';
    end if;

    select s.value into hook
    from public.integration_settings s
    where s.key = 'discord_webhook_url';

    if hook is null then
        raise exception 'Discord webhook is not set.';
    end if;

    select net.http_post(
        url  := hook,
        body := jsonb_build_object(
            'username', 'HEROS SMP Store',
            'allowed_mentions', jsonb_build_object('parse', jsonb_build_array()),
            'content', '✅ Test message from the HEROS SMP admin panel. New order notifications will appear in this channel.'
        )
    ) into request_id;

    return request_id;
end;
$$;
