create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  avatar_url text,
  system_prompt text not null default '',
  personality text not null default '',
  relationship_setting text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id uuid not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender text not null check (sender in ('user', 'assistant')),
  type text not null check (type in ('text', 'image', 'sticker', 'audio', 'system')),
  content text not null default '',
  media_url text,
  duration integer check (duration is null or duration >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filename text not null,
  path text not null,
  content text not null,
  content_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, path)
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  chunk_index integer not null check (chunk_index >= 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (document_id, chunk_index)
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  character_id uuid not null references public.characters(id) on delete cascade,
  content text not null,
  memory_type text not null check (memory_type in ('profile', 'preference', 'relationship', 'event', 'person', 'place', 'habit', 'promise', 'emotion', 'goal', 'other')),
  importance real not null default 0.5 check (importance >= 0 and importance <= 1),
  embedding vector(1536),
  source_message_id uuid references public.messages(id) on delete set null,
  source_document_id uuid references public.knowledge_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists characters_user_id_idx on public.characters(user_id);
create index if not exists conversations_user_id_idx on public.conversations(user_id);
create index if not exists conversations_character_id_idx on public.conversations(character_id);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at desc, id desc);
create index if not exists memories_owner_idx on public.memories(user_id, character_id);
create index if not exists knowledge_documents_user_idx on public.knowledge_documents(user_id);
create index if not exists knowledge_chunks_document_idx on public.knowledge_chunks(document_id, chunk_index);
create index if not exists memories_embedding_hnsw_idx on public.memories using hnsw (embedding vector_cosine_ops) where embedding is not null;
create index if not exists knowledge_chunks_embedding_hnsw_idx on public.knowledge_chunks using hnsw (embedding vector_cosine_ops) where embedding is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists characters_set_updated_at on public.characters;
create trigger characters_set_updated_at before update on public.characters
for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_documents_set_updated_at on public.knowledge_documents;
create trigger knowledge_documents_set_updated_at before update on public.knowledge_documents
for each row execute function public.set_updated_at();

create or replace function public.match_memories(
  query_embedding vector(1536),
  match_user_id uuid,
  match_character_id uuid,
  match_count integer default 8,
  minimum_similarity real default 0.35
)
returns table (
  id uuid,
  content text,
  memory_type text,
  importance real,
  source_message_id uuid,
  source_document_id uuid,
  similarity real
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.id,
    m.content,
    m.memory_type,
    m.importance,
    m.source_message_id,
    m.source_document_id,
    (1 - (m.embedding <=> query_embedding))::real as similarity
  from public.memories m
  where m.user_id = match_user_id
    and m.character_id = match_character_id
    and m.embedding is not null
    and (1 - (m.embedding <=> query_embedding)) >= minimum_similarity
  order by ((1 - (m.embedding <=> query_embedding)) * 0.85 + m.importance * 0.15) desc
  limit greatest(1, least(match_count, 20));
$$;

create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_user_id uuid,
  match_count integer default 8,
  minimum_similarity real default 0.3
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  chunk_index integer,
  metadata jsonb,
  similarity real
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    kc.id,
    kc.document_id,
    kc.content,
    kc.chunk_index,
    kc.metadata,
    (1 - (kc.embedding <=> query_embedding))::real as similarity
  from public.knowledge_chunks kc
  join public.knowledge_documents kd on kd.id = kc.document_id
  where kd.user_id = match_user_id
    and kc.embedding is not null
    and (1 - (kc.embedding <=> query_embedding)) >= minimum_similarity
  order by kc.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

create or replace function public.replace_knowledge_chunks(
  target_document_id uuid,
  new_chunks jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.knowledge_chunks where document_id = target_document_id;
  insert into public.knowledge_chunks (document_id, content, embedding, chunk_index, metadata)
  select
    target_document_id,
    item->>'content',
    (item->'embedding')::text::vector(1536),
    (item->>'chunk_index')::integer,
    coalesce(item->'metadata', '{}'::jsonb)
  from jsonb_array_elements(new_chunks) as item;
end;
$$;

alter table public.characters enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on public.characters from anon, authenticated;
revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;
revoke all on public.memories from anon, authenticated;
revoke all on public.knowledge_documents from anon, authenticated;
revoke all on public.knowledge_chunks from anon, authenticated;
revoke all on public.push_subscriptions from anon, authenticated;
revoke execute on function public.match_memories(vector, uuid, uuid, integer, real) from anon, authenticated;
revoke execute on function public.match_knowledge_chunks(vector, uuid, integer, real) from anon, authenticated;
revoke execute on function public.replace_knowledge_chunks(uuid, jsonb) from anon, authenticated;

grant all on public.characters, public.conversations, public.messages, public.memories,
  public.knowledge_documents, public.knowledge_chunks, public.push_subscriptions to service_role;
grant execute on function public.match_memories(vector, uuid, uuid, integer, real) to service_role;
grant execute on function public.match_knowledge_chunks(vector, uuid, integer, real) to service_role;
grant execute on function public.replace_knowledge_chunks(uuid, jsonb) to service_role;
