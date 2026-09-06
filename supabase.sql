-- Supabase SQL: family schedule backend
-- Run this once in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.family_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  display_name text not null,
  pin_hash text not null
);

create table if not exists public.family_sessions (
  token uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.family_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.family_schedule_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.family_profiles(id) on delete cascade,
  start_time time not null,
  end_time time not null,
  title text not null,
  created_at timestamptz not null default now(),
  check (start_time >= time '07:00' and end_time <= time '22:00' and end_time > start_time)
);

alter table public.family_profiles enable row level security;
alter table public.family_sessions enable row level security;
alter table public.family_schedule_items enable row level security;

-- No direct table access from the public anon role.
revoke all on public.family_profiles from anon, authenticated;
revoke all on public.family_sessions from anon, authenticated;
revoke all on public.family_schedule_items from anon, authenticated;

insert into public.family_profiles(slug, display_name, pin_hash)
values
  ('mama','Мама',crypt('1234',gen_salt('bf'))),
  ('papa','Папа',crypt('1234',gen_salt('bf'))),
  ('vlada','Влада',crypt('1234',gen_salt('bf'))),
  ('nikita','Никита',crypt('1234',gen_salt('bf')))
on conflict (slug) do update set
  display_name=excluded.display_name,
  pin_hash=excluded.pin_hash;

create or replace function public.login_profile(p_profile_slug text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile family_profiles%rowtype;
  v_token uuid;
begin
  select * into v_profile from family_profiles where slug=p_profile_slug;
  if v_profile.id is null or crypt(p_pin,v_profile.pin_hash) <> v_profile.pin_hash then
    raise exception 'invalid credentials';
  end if;

  insert into family_sessions(profile_id) values(v_profile.id) returning token into v_token;

  return jsonb_build_object(
    'session_token',v_token,
    'profile_slug',v_profile.slug,
    'profile_name',v_profile.display_name
  );
end;
$$;

create or replace function public.get_schedule(p_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile family_profiles%rowtype;
  v_items jsonb;
begin
  select p.* into v_profile
  from family_sessions s
  join family_profiles p on p.id=s.profile_id
  where s.token=p_session_token;

  if v_profile.id is null then raise exception 'invalid session'; end if;

  update family_sessions set last_seen_at=now() where token=p_session_token;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',i.id,
      'start_time',to_char(i.start_time,'HH24:MI'),
      'end_time',to_char(i.end_time,'HH24:MI'),
      'title',i.title
    ) order by i.start_time
  ),'[]'::jsonb)
  into v_items
  from family_schedule_items i
  where i.profile_id=v_profile.id;

  return jsonb_build_object(
    'profile_slug',v_profile.slug,
    'profile_name',v_profile.display_name,
    'items',v_items
  );
end;
$$;

create or replace function public.replace_schedule(p_session_token uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_item jsonb;
  v_start time;
  v_end time;
  v_title text;
  v_prev_end time := time '07:00';
begin
  select profile_id into v_profile_id from family_sessions where token=p_session_token;
  if v_profile_id is null then raise exception 'invalid session'; end if;

  -- Validate sorted intervals and overlap.
  for v_item in
    select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
    order by (value->>'start_time')::time
  loop
    v_start := (v_item->>'start_time')::time;
    v_end := (v_item->>'end_time')::time;
    v_title := btrim(coalesce(v_item->>'title',''));

    if v_title='' or v_start < time '07:00' or v_end > time '22:00' or v_end <= v_start then
      raise exception 'invalid schedule item';
    end if;
    if v_start < v_prev_end then
      raise exception 'overlapping schedule items';
    end if;
    v_prev_end := v_end;
  end loop;

  delete from family_schedule_items where profile_id=v_profile_id;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
    order by (value->>'start_time')::time
  loop
    insert into family_schedule_items(profile_id,start_time,end_time,title)
    values(
      v_profile_id,
      (v_item->>'start_time')::time,
      (v_item->>'end_time')::time,
      btrim(v_item->>'title')
    );
  end loop;

  update family_sessions set last_seen_at=now() where token=p_session_token;
  return jsonb_build_object('ok',true);
end;
$$;

grant execute on function public.login_profile(text,text) to anon, authenticated;
grant execute on function public.get_schedule(uuid) to anon, authenticated;
grant execute on function public.replace_schedule(uuid,jsonb) to anon, authenticated;
