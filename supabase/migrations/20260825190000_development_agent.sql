create table if not exists public.development_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  source_message_id uuid not null references public.messages(id) on delete restrict,
  request_text text not null,
  request_summary text not null,
  requested_changes jsonb not null default '[]'::jsonb,
  risk_level text not null check (risk_level in ('normal', 'sensitive')),
  status text not null check (status in ('queued','running','testing','previewing','awaiting_approval','publishing','published','failed','canceled','rollback_requested','rollback_running','rolled_back')),
  repository_full_name text,
  branch_name text,
  base_sha text,
  preview_sha text,
  runner_run_id text,
  runner_url text,
  preview_url text,
  test_summary jsonb not null default '{"lint":"pending","typecheck":"pending","tests":"pending","build":"pending"}'::jsonb,
  change_summary text,
  approval_nonce_hash text,
  approval_expires_at timestamptz,
  approved_at timestamptz,
  published_sha text,
  previous_production_sha text,
  published_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.development_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.development_tasks(id) on delete cascade,
  user_id uuid not null,
  event_type text not null,
  public_message text not null,
  metadata jsonb not null default '{}'::jsonb,
  external_event_id text,
  created_at timestamptz not null default now()
);

create unique index if not exists development_tasks_one_active_owner_idx on public.development_tasks(user_id)
  where status not in ('failed','canceled','published','rolled_back');
create index if not exists development_tasks_owner_created_idx on public.development_tasks(user_id, created_at desc);
create index if not exists development_task_events_task_created_idx on public.development_task_events(task_id, created_at);
create unique index if not exists development_task_events_external_id_idx on public.development_task_events(external_event_id) where external_event_id is not null;

create or replace function public.create_development_task(
  task_user_id uuid, task_conversation_id uuid, task_source_message_id uuid, task_request_text text,
  task_request_summary text, task_requested_changes jsonb, task_risk_level text, task_repository_full_name text
) returns public.development_tasks language plpgsql security definer set search_path = public as $$
declare created public.development_tasks;
begin
  insert into public.development_tasks(user_id, conversation_id, source_message_id, request_text, request_summary, requested_changes, risk_level, status, repository_full_name)
  values(task_user_id, task_conversation_id, task_source_message_id, task_request_text, task_request_summary, task_requested_changes, task_risk_level, 'queued', task_repository_full_name)
  returning * into created;
  insert into public.development_task_events(task_id, user_id, event_type, public_message)
  values(created.id, task_user_id, 'created', '已创建安全修改任务');
  return created;
end; $$;

create or replace function public.transition_development_task(
  target_task_id uuid, target_user_id uuid, target_status text, task_patch jsonb,
  event_type_value text, public_message_value text, event_metadata jsonb, external_event_id_value text
) returns public.development_tasks language plpgsql security definer set search_path = public as $$
declare current_task public.development_tasks;
declare updated_task public.development_tasks;
declare allowed boolean := false;
begin
  select * into current_task from public.development_tasks where id = target_task_id and user_id = target_user_id for update;
  if current_task.id is null then raise exception 'DEVELOPMENT_TASK_NOT_FOUND'; end if;
  if external_event_id_value is not null and exists(select 1 from public.development_task_events where external_event_id = external_event_id_value) then
    return current_task;
  end if;
  allowed := case current_task.status
    when 'queued' then target_status in ('running','failed','canceled')
    when 'running' then target_status in ('testing','failed','canceled')
    when 'testing' then target_status in ('previewing','failed','canceled')
    when 'previewing' then target_status in ('awaiting_approval','failed','canceled')
    when 'awaiting_approval' then target_status in ('queued','publishing','failed','canceled')
    when 'publishing' then target_status in ('published','failed','rollback_running')
    when 'published' then target_status = 'rollback_requested'
    when 'rollback_requested' then target_status = 'rollback_running'
    when 'rollback_running' then target_status in ('rolled_back','failed')
    else false end;
  if not allowed then raise exception 'INVALID_DEVELOPMENT_TRANSITION'; end if;
  update public.development_tasks set
    status = target_status,
    request_text = coalesce(task_patch->>'requestText', request_text),
    branch_name = coalesce(task_patch->>'branchName', branch_name),
    base_sha = coalesce(task_patch->>'baseSha', base_sha),
    preview_sha = coalesce(task_patch->>'previewSha', preview_sha),
    runner_run_id = coalesce(task_patch->>'runnerRunId', runner_run_id),
    runner_url = coalesce(task_patch->>'runnerUrl', runner_url),
    preview_url = coalesce(task_patch->>'previewUrl', preview_url),
    test_summary = coalesce(task_patch->'checks', test_summary),
    change_summary = coalesce(task_patch->>'changeSummary', change_summary),
    approval_nonce_hash = case when task_patch ? 'approvalNonceHash' then nullif(task_patch->>'approvalNonceHash','') else approval_nonce_hash end,
    approval_expires_at = case when task_patch ? 'approvalExpiresAt' then nullif(task_patch->>'approvalExpiresAt','')::timestamptz else approval_expires_at end,
    approved_at = case when task_patch ? 'approvedAt' then nullif(task_patch->>'approvedAt','')::timestamptz else approved_at end,
    published_sha = coalesce(task_patch->>'publishedSha', published_sha),
    previous_production_sha = coalesce(task_patch->>'previousProductionSha', previous_production_sha),
    published_at = case when task_patch ? 'publishedAt' then nullif(task_patch->>'publishedAt','')::timestamptz else published_at end,
    error_code = case when task_patch ? 'errorCode' then nullif(task_patch->>'errorCode','') else error_code end,
    updated_at = now()
  where id = target_task_id returning * into updated_task;
  insert into public.development_task_events(task_id,user_id,event_type,public_message,metadata,external_event_id)
  values(target_task_id,target_user_id,event_type_value,public_message_value,coalesce(event_metadata,'{}'::jsonb),external_event_id_value)
  on conflict (external_event_id) where external_event_id is not null do nothing;
  return updated_task;
end; $$;

alter table public.development_tasks enable row level security;
alter table public.development_task_events enable row level security;
revoke all on public.development_tasks from anon, authenticated;
revoke all on public.development_task_events from anon, authenticated;
revoke execute on function public.create_development_task(uuid,uuid,uuid,text,text,jsonb,text,text) from public, anon, authenticated;
revoke execute on function public.transition_development_task(uuid,uuid,text,jsonb,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.create_development_task(uuid,uuid,uuid,text,text,jsonb,text,text) to service_role;
grant execute on function public.transition_development_task(uuid,uuid,text,jsonb,text,text,jsonb,text) to service_role;
