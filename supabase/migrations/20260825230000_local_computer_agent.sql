create table if not exists public.local_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null, platform text not null default 'macos' check (platform = 'macos'),
  public_key text not null, token_hash text, token_expires_at timestamptz, paired_at timestamptz not null default now(), last_seen_at timestamptz, revoked_at timestamptz,
  agent_version text not null, codex_version text, status text not null default 'offline' check (status in ('offline','online','paused','incompatible'))
);
create unique index if not exists local_devices_one_active_per_user on public.local_devices(user_id) where revoked_at is null;

create table if not exists public.local_agent_nonces (
  id uuid primary key default gen_random_uuid(), device_id uuid not null references public.local_devices(id) on delete cascade,
  nonce_hash text not null unique, expires_at timestamptz not null, created_at timestamptz not null default now()
);

create table if not exists public.local_pairing_challenges (
  id uuid primary key default gen_random_uuid(), code_hash text not null unique, claim_token_hash text not null, public_key text not null, device_name text not null,
  agent_version text not null, expires_at timestamptz not null, authorized_user_id uuid, authorized_at timestamptz, consumed_at timestamptz, created_at timestamptz not null default now()
);

create table if not exists public.local_computer_tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete cascade, device_id uuid references public.local_devices(id), request_text text not null,
  request_summary text not null, requested_outcome text not null, risk_level text not null check (risk_level in ('low','medium','high','blocked')),
  capabilities text[] not null default '{}', status text not null default 'draft' check (status in ('draft','awaiting_task_approval','queued','leased','running','awaiting_action_approval','completed','canceled','expired','failed')),
  lease_id_hash text, lease_expires_at timestamptz, last_event_sequence integer not null default 0, public_progress text,
  pending_action_id text, pending_action_summary text, pending_action_risk_level text check (pending_action_risk_level is null or pending_action_risk_level in ('low','medium','high','blocked')),
  result_summary text, error_code text, created_at timestamptz not null default now(), approved_at timestamptz, started_at timestamptz, finished_at timestamptz, updated_at timestamptz not null default now()
);
create unique index if not exists local_computer_one_active_per_user on public.local_computer_tasks(user_id) where status not in ('completed','canceled','expired','failed');

create table if not exists public.local_computer_task_events (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.local_computer_tasks(id) on delete cascade, user_id uuid not null,
  sequence integer not null, event_type text not null, public_message text not null, metadata jsonb not null default '{}', external_event_id text, created_at timestamptz not null default now()
);
create unique index if not exists local_computer_external_event_once on public.local_computer_task_events(external_event_id) where external_event_id is not null;

alter table public.local_devices enable row level security;
alter table public.local_agent_nonces enable row level security;
alter table public.local_pairing_challenges enable row level security;
alter table public.local_computer_tasks enable row level security;
alter table public.local_computer_task_events enable row level security;
revoke all on public.local_devices, public.local_agent_nonces, public.local_pairing_challenges, public.local_computer_tasks, public.local_computer_task_events from anon, authenticated;
grant all on public.local_devices, public.local_agent_nonces, public.local_pairing_challenges, public.local_computer_tasks, public.local_computer_task_events to service_role;

create or replace function public.approve_local_pairing_challenge(target_code_hash text, target_user_id uuid)
returns public.local_pairing_challenges language plpgsql security definer set search_path = public as $$
declare result public.local_pairing_challenges;
begin
  update local_pairing_challenges set authorized_user_id=target_user_id,authorized_at=now() where code_hash=target_code_hash and consumed_at is null and authorized_user_id is null returning * into result;
  return result;
end $$;

create or replace function public.consume_local_pairing_challenge(target_code_hash text)
returns public.local_pairing_challenges language plpgsql security definer set search_path = public as $$
declare result public.local_pairing_challenges;
begin
  update local_pairing_challenges set consumed_at=now() where code_hash=target_code_hash and consumed_at is null and authorized_user_id is not null returning * into result;
  return result;
end $$;

create or replace function public.pair_local_device(device_user_id uuid, device_name text, device_public_key text, device_agent_version text, device_token_hash text, device_token_expires_at timestamptz)
returns public.local_devices language plpgsql security definer set search_path = public as $$
declare result public.local_devices;
begin
  update local_devices set revoked_at=now(), status='offline', token_hash=null, token_expires_at=null where user_id=device_user_id and revoked_at is null;
  update local_computer_tasks set status='canceled', finished_at=now(), updated_at=now(), lease_id_hash=null, lease_expires_at=null where user_id=device_user_id and status not in ('completed','canceled','expired','failed');
  insert into local_devices(user_id,name,public_key,agent_version,token_hash,token_expires_at) values(device_user_id,device_name,device_public_key,device_agent_version,device_token_hash,device_token_expires_at) returning * into result;
  return result;
end $$;

create or replace function public.create_local_computer_task(task_user_id uuid, task_conversation_id uuid, task_source_message_id uuid, task_device_id uuid, task_request_text text, task_request_summary text, task_requested_outcome text, task_risk_level text, task_capabilities text[])
returns public.local_computer_tasks language plpgsql security definer set search_path = public as $$
declare result public.local_computer_tasks;
begin
  if task_risk_level='blocked' then raise exception 'blocked risk'; end if;
  insert into local_computer_tasks(user_id,conversation_id,source_message_id,device_id,request_text,request_summary,requested_outcome,risk_level,capabilities)
  values(task_user_id,task_conversation_id,task_source_message_id,task_device_id,task_request_text,task_request_summary,task_requested_outcome,task_risk_level,task_capabilities) returning * into result;
  insert into local_computer_task_events(task_id,user_id,sequence,event_type,public_message) values(result.id,result.user_id,0,'created','已创建本地电脑任务');
  return result;
end $$;

create or replace function public.transition_local_computer_task(target_task_id uuid, target_user_id uuid, target_status text, task_patch jsonb, event_type_value text, public_message_value text, event_metadata jsonb, external_event_id_value text default null)
returns public.local_computer_tasks language plpgsql security definer set search_path = public as $$
declare result public.local_computer_tasks;
begin
  if external_event_id_value is not null and exists(select 1 from local_computer_task_events where external_event_id=external_event_id_value) then select * into result from local_computer_tasks where id=target_task_id and user_id=target_user_id; return result; end if;
  select * into result from local_computer_tasks where id=target_task_id and user_id=target_user_id for update;
  if result.id is null then raise exception 'task not found'; end if;
  if not (
    (result.status='draft' and target_status in ('awaiting_task_approval','queued','canceled','expired','failed')) or
    (result.status='awaiting_task_approval' and target_status in ('queued','canceled','expired','failed')) or
    (result.status='queued' and target_status in ('leased','canceled','expired','failed')) or
    (result.status='leased' and target_status in ('running','queued','canceled','expired','failed')) or
    (result.status='running' and target_status in ('awaiting_action_approval','completed','canceled','expired','failed')) or
    (result.status='awaiting_action_approval' and target_status in ('running','canceled','expired','failed'))
  ) then raise exception 'invalid local task transition'; end if;
  update local_computer_tasks set status=target_status, updated_at=now(), approved_at=coalesce((task_patch->>'approvedAt')::timestamptz,approved_at), started_at=coalesce((task_patch->>'startedAt')::timestamptz,started_at), finished_at=coalesce((task_patch->>'finishedAt')::timestamptz,finished_at), lease_id_hash=case when task_patch ? 'leaseIdHash' then task_patch->>'leaseIdHash' else lease_id_hash end, lease_expires_at=case when task_patch ? 'leaseExpiresAt' then (task_patch->>'leaseExpiresAt')::timestamptz else lease_expires_at end, pending_action_id=case when task_patch ? 'pendingActionId' then task_patch->>'pendingActionId' else pending_action_id end, pending_action_summary=case when task_patch ? 'pendingActionSummary' then task_patch->>'pendingActionSummary' else pending_action_summary end, pending_action_risk_level=case when task_patch ? 'pendingActionRiskLevel' then task_patch->>'pendingActionRiskLevel' else pending_action_risk_level end where id=target_task_id and user_id=target_user_id returning * into result;
  insert into local_computer_task_events(task_id,user_id,sequence,event_type,public_message,metadata,external_event_id) values(result.id,result.user_id,result.last_event_sequence,event_type_value,public_message_value,coalesce(event_metadata,'{}'),external_event_id_value);
  return result;
end $$;

create or replace function public.claim_local_computer_task(target_device_id uuid, new_lease_id_hash text, new_lease_expires_at timestamptz)
returns public.local_computer_tasks language plpgsql security definer set search_path = public as $$
declare result public.local_computer_tasks;
begin
  if exists(select 1 from local_computer_tasks where device_id=target_device_id and status in ('leased','running','awaiting_action_approval') and lease_expires_at>now()) then return null; end if;
  select * into result from local_computer_tasks where device_id=target_device_id and status='queued' order by created_at for update skip locked limit 1;
  if result.id is null then return null; end if;
  update local_computer_tasks set status='leased',lease_id_hash=new_lease_id_hash,lease_expires_at=new_lease_expires_at,updated_at=now() where id=result.id returning * into result;
  insert into local_computer_task_events(task_id,user_id,sequence,event_type,public_message) values(result.id,result.user_id,result.last_event_sequence,'leased','Mac 已领取任务'); return result;
end $$;

create or replace function public.append_local_agent_event(target_task_id uuid,target_device_id uuid,expected_lease_id_hash text,event_sequence integer,event_type_value text,public_message_value text,event_metadata jsonb,external_event_id_value text default null)
returns public.local_computer_tasks language plpgsql security definer set search_path = public as $$
declare result public.local_computer_tasks;
begin
  if external_event_id_value is not null and exists(select 1 from local_computer_task_events where external_event_id=external_event_id_value) then select * into result from local_computer_tasks where id=target_task_id and device_id=target_device_id; return result; end if;
  update local_computer_tasks set last_event_sequence=event_sequence,public_progress=public_message_value,updated_at=now() where id=target_task_id and device_id=target_device_id and lease_id_hash=expected_lease_id_hash and event_sequence=last_event_sequence+1 returning * into result;
  if result.id is null then raise exception 'invalid event sequence or lease'; end if;
  insert into local_computer_task_events(task_id,user_id,sequence,event_type,public_message,metadata,external_event_id) values(result.id,result.user_id,event_sequence,event_type_value,public_message_value,coalesce(event_metadata,'{}'),external_event_id_value); return result;
end $$;

create or replace function public.revoke_local_device(target_device_id uuid,target_user_id uuid)
returns public.local_devices language plpgsql security definer set search_path = public as $$
declare result public.local_devices;
begin
  update local_devices set revoked_at=now(),status='offline',token_hash=null,token_expires_at=null where id=target_device_id and user_id=target_user_id returning * into result;
  if result.id is null then raise exception 'device not found'; end if;
  update local_computer_tasks set status='canceled',finished_at=now(),updated_at=now(),lease_id_hash=null,lease_expires_at=null where device_id=target_device_id and status not in ('completed','canceled','expired','failed'); return result;
end $$;

revoke execute on function public.approve_local_pairing_challenge(text,uuid) from anon, authenticated;
revoke execute on function public.consume_local_pairing_challenge(text) from anon, authenticated;
revoke execute on function public.pair_local_device(uuid,text,text,text,text,timestamptz) from anon, authenticated;
revoke execute on function public.create_local_computer_task(uuid,uuid,uuid,uuid,text,text,text,text,text[]) from anon, authenticated;
revoke execute on function public.transition_local_computer_task(uuid,uuid,text,jsonb,text,text,jsonb,text) from anon, authenticated;
revoke execute on function public.claim_local_computer_task(uuid,text,timestamptz) from anon, authenticated;
revoke execute on function public.append_local_agent_event(uuid,uuid,text,integer,text,text,jsonb,text) from anon, authenticated;
revoke execute on function public.revoke_local_device(uuid,uuid) from anon, authenticated;

grant execute on function public.approve_local_pairing_challenge(text,uuid) to service_role;
grant execute on function public.consume_local_pairing_challenge(text) to service_role;
grant execute on function public.pair_local_device(uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.create_local_computer_task(uuid,uuid,uuid,uuid,text,text,text,text,text[]) to service_role;
grant execute on function public.transition_local_computer_task(uuid,uuid,text,jsonb,text,text,jsonb,text) to service_role;
grant execute on function public.claim_local_computer_task(uuid,text,timestamptz) to service_role;
grant execute on function public.append_local_agent_event(uuid,uuid,text,integer,text,text,jsonb,text) to service_role;
grant execute on function public.revoke_local_device(uuid,uuid) to service_role;
