create table if not exists public.local_conversation_tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, conversation_id uuid not null references public.conversations(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade, source_message_id uuid not null unique references public.messages(id) on delete cascade,
  device_id uuid not null references public.local_devices(id) on delete cascade, request_text text not null, status text not null default 'queued' check(status in ('queued','leased','completed','failed')),
  lease_id_hash text, lease_expires_at timestamptz, reply_message_id uuid unique references public.messages(id) on delete set null, completion_event_id text unique,
  error_code text, created_at timestamptz not null default now(), finished_at timestamptz, updated_at timestamptz not null default now()
);
create index if not exists local_conversation_claim_idx on public.local_conversation_tasks(device_id, created_at) where status in ('queued','leased');
alter table public.local_conversation_tasks enable row level security;
revoke all on public.local_conversation_tasks from anon, authenticated;
grant all on public.local_conversation_tasks to service_role;

create or replace function public.create_local_conversation_task(task_user_id uuid, task_conversation_id uuid, task_character_id uuid, task_source_message_id uuid, task_device_id uuid, task_request_text text)
returns public.local_conversation_tasks language plpgsql security definer set search_path=public as $$
declare result public.local_conversation_tasks;
begin
  if not exists(select 1 from conversations where id=task_conversation_id and user_id=task_user_id and character_id=task_character_id) then raise exception 'CHAT_RESOURCE_NOT_FOUND'; end if;
  insert into local_conversation_tasks(user_id,conversation_id,character_id,source_message_id,device_id,request_text) values(task_user_id,task_conversation_id,task_character_id,task_source_message_id,task_device_id,task_request_text) returning * into result;
  return result;
end $$;

create or replace function public.claim_local_conversation_task(target_device_id uuid, new_lease_id_hash text, new_lease_expires_at timestamptz)
returns public.local_conversation_tasks language plpgsql security definer set search_path=public as $$
declare result public.local_conversation_tasks;
begin
  select * into result from local_conversation_tasks where device_id=target_device_id and (status='queued' or (status='leased' and lease_expires_at < now())) order by created_at for update skip locked limit 1;
  if result.id is null then return null; end if;
  update local_conversation_tasks set status='leased',lease_id_hash=new_lease_id_hash,lease_expires_at=new_lease_expires_at,updated_at=now() where id=result.id returning * into result;
  return result;
end $$;

create or replace function public.complete_local_conversation_task(target_task_id uuid, target_device_id uuid, expected_lease_id_hash text, reply_content text, external_event_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare task_row public.local_conversation_tasks; message_row public.messages;
begin
  select * into task_row from local_conversation_tasks where id=target_task_id and device_id=target_device_id for update;
  if task_row.status='completed' and task_row.completion_event_id=external_event_id then select * into message_row from messages where id=task_row.reply_message_id; return jsonb_build_object('task',to_jsonb(task_row),'message',to_jsonb(message_row)); end if;
  if task_row.status<>'leased' or task_row.lease_id_hash<>expected_lease_id_hash or task_row.lease_expires_at<now() then raise exception 'INVALID_LOCAL_CONVERSATION_LEASE'; end if;
  insert into messages(conversation_id,sender,type,content) values(task_row.conversation_id,'assistant','text',left(reply_content,10000)) returning * into message_row;
  update local_conversation_tasks set status='completed',reply_message_id=message_row.id,completion_event_id=external_event_id,lease_id_hash=null,lease_expires_at=null,finished_at=now(),updated_at=now() where id=task_row.id returning * into task_row;
  return jsonb_build_object('task',to_jsonb(task_row),'message',to_jsonb(message_row));
end $$;

create or replace function public.fail_local_conversation_task(target_task_id uuid, target_device_id uuid, expected_lease_id_hash text, failure_code text)
returns public.local_conversation_tasks language plpgsql security definer set search_path=public as $$
declare result public.local_conversation_tasks;
begin
  update local_conversation_tasks set status='failed',error_code=left(failure_code,100),lease_id_hash=null,lease_expires_at=null,finished_at=now(),updated_at=now()
  where id=target_task_id and device_id=target_device_id and status='leased' and lease_id_hash=expected_lease_id_hash and lease_expires_at>=now() returning * into result;
  if result.id is null then raise exception 'INVALID_LOCAL_CONVERSATION_LEASE'; end if; return result;
end $$;

revoke execute on function public.create_local_conversation_task(uuid,uuid,uuid,uuid,uuid,text) from anon, authenticated;
revoke execute on function public.claim_local_conversation_task(uuid,text,timestamptz) from anon, authenticated;
revoke execute on function public.complete_local_conversation_task(uuid,uuid,text,text,text) from anon, authenticated;
revoke execute on function public.fail_local_conversation_task(uuid,uuid,text,text) from anon, authenticated;
grant execute on function public.create_local_conversation_task(uuid,uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.claim_local_conversation_task(uuid,text,timestamptz) to service_role;
grant execute on function public.complete_local_conversation_task(uuid,uuid,text,text,text) to service_role;
grant execute on function public.fail_local_conversation_task(uuid,uuid,text,text) to service_role;
