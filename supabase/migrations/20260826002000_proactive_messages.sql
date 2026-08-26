alter table public.local_conversation_tasks alter column source_message_id drop not null;
alter table public.local_conversation_tasks add column if not exists kind text not null default 'reply' check (kind in ('reply','proactive'));

create table if not exists public.proactive_settings (
  user_id uuid primary key,
  enabled boolean not null default true,
  timezone text not null default 'Asia/Shanghai',
  quiet_start_hour integer not null default 22 check (quiet_start_hour between 0 and 23),
  quiet_end_hour integer not null default 8 check (quiet_end_hour between 0 and 23),
  min_interval_minutes integer not null default 360 check (min_interval_minutes between 60 and 10080),
  max_unanswered integer not null default 2 check (max_unanswered between 1 and 5),
  last_enqueued_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.proactive_settings enable row level security;
revoke all on public.proactive_settings from anon, authenticated;
grant all on public.proactive_settings to service_role;

create or replace function public.enqueue_due_proactive_message(target_user_id uuid, target_character_id uuid, target_conversation_id uuid)
returns public.local_conversation_tasks language plpgsql security definer set search_path=public as $$
declare settings_row public.proactive_settings; device_row public.local_devices; result public.local_conversation_tasks;
declare local_now timestamp; selected_hour integer; unanswered integer;
begin
  perform pg_advisory_xact_lock(hashtext('jeffrey-proactive:' || target_user_id::text));
  insert into proactive_settings(user_id) values(target_user_id) on conflict(user_id) do nothing;
  select * into settings_row from proactive_settings where user_id=target_user_id for update;
  if not settings_row.enabled then return null; end if;
  local_now := timezone(settings_row.timezone, now());
  if settings_row.quiet_start_hour > settings_row.quiet_end_hour and (extract(hour from local_now) >= settings_row.quiet_start_hour or extract(hour from local_now) < settings_row.quiet_end_hour) then return null; end if;
  selected_hour := 9 + mod(abs(hashtext(target_user_id::text || local_now::date::text)), 12);
  if extract(hour from local_now)::integer <> selected_hour then return null; end if;
  if settings_row.last_enqueued_at is not null and settings_row.last_enqueued_at > now() - make_interval(mins => settings_row.min_interval_minutes) then return null; end if;
  select count(*) into unanswered from messages where conversation_id=target_conversation_id and sender='assistant' and created_at > coalesce((select max(created_at) from messages where conversation_id=target_conversation_id and sender='user'), '-infinity'::timestamptz);
  if unanswered >= settings_row.max_unanswered then return null; end if;
  select * into device_row from local_devices where user_id=target_user_id and revoked_at is null and status='online' and last_seen_at > now() - interval '3 minutes' limit 1;
  if device_row.id is null then return null; end if;
  if exists(select 1 from local_conversation_tasks where user_id=target_user_id and status in ('queued','leased')) then return null; end if;
  insert into local_conversation_tasks(user_id,conversation_id,character_id,source_message_id,device_id,request_text,kind)
  values(target_user_id,target_conversation_id,target_character_id,null,device_row.id,'[PROACTIVE] 结合最近对话与本地 Obsidian 记忆，自主决定此刻最自然的一句话联系用户。不要泛泛问候，不要编造记忆，不要催促回复，也不要触发任何电脑操作。','proactive') returning * into result;
  update proactive_settings set last_enqueued_at=now(),updated_at=now() where user_id=target_user_id;
  return result;
end $$;
revoke execute on function public.enqueue_due_proactive_message(uuid,uuid,uuid) from anon, authenticated;
grant execute on function public.enqueue_due_proactive_message(uuid,uuid,uuid) to service_role;
