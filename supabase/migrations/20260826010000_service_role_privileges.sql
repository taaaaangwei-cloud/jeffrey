-- Server-only runtime access when "Automatically expose new tables" is disabled.
grant all on public.characters, public.conversations, public.messages, public.memories,
  public.knowledge_documents, public.knowledge_chunks, public.push_subscriptions,
  public.local_devices, public.local_agent_nonces, public.local_pairing_challenges,
  public.local_computer_tasks, public.local_computer_task_events,
  public.local_conversation_tasks, public.proactive_settings to service_role;

grant execute on function public.match_memories(vector,uuid,uuid,integer,real) to service_role;
grant execute on function public.match_knowledge_chunks(vector,uuid,integer,real) to service_role;
grant execute on function public.replace_knowledge_chunks(uuid,jsonb) to service_role;
grant execute on function public.approve_local_pairing_challenge(text,uuid) to service_role;
grant execute on function public.consume_local_pairing_challenge(text) to service_role;
grant execute on function public.pair_local_device(uuid,text,text,text,text,timestamptz) to service_role;
grant execute on function public.create_local_computer_task(uuid,uuid,uuid,uuid,text,text,text,text,text[]) to service_role;
grant execute on function public.transition_local_computer_task(uuid,uuid,text,jsonb,text,text,jsonb,text) to service_role;
grant execute on function public.claim_local_computer_task(uuid,text,timestamptz) to service_role;
grant execute on function public.append_local_agent_event(uuid,uuid,text,integer,text,text,jsonb,text) to service_role;
grant execute on function public.revoke_local_device(uuid,uuid) to service_role;
grant execute on function public.create_local_conversation_task(uuid,uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.claim_local_conversation_task(uuid,text,timestamptz) to service_role;
grant execute on function public.complete_local_conversation_task(uuid,uuid,text,text,text) to service_role;
grant execute on function public.fail_local_conversation_task(uuid,uuid,text,text) to service_role;
grant execute on function public.enqueue_due_proactive_message(uuid,uuid,uuid) to service_role;

revoke execute on function public.approve_local_pairing_challenge(text,uuid) from anon, authenticated;
revoke execute on function public.consume_local_pairing_challenge(text) from anon, authenticated;
revoke execute on function public.pair_local_device(uuid,text,text,text,text,timestamptz) from anon, authenticated;
revoke execute on function public.create_local_computer_task(uuid,uuid,uuid,uuid,text,text,text,text,text[]) from anon, authenticated;
revoke execute on function public.transition_local_computer_task(uuid,uuid,text,jsonb,text,text,jsonb,text) from anon, authenticated;
revoke execute on function public.claim_local_computer_task(uuid,text,timestamptz) from anon, authenticated;
revoke execute on function public.append_local_agent_event(uuid,uuid,text,integer,text,text,jsonb,text) from anon, authenticated;
revoke execute on function public.revoke_local_device(uuid,uuid) from anon, authenticated;
