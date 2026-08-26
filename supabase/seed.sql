-- Keep these IDs aligned with PRIVATE_USER_ID, DEFAULT_CHARACTER_ID, and
-- DEFAULT_CONVERSATION_ID in the server environment.
insert into public.characters (
  id,
  user_id,
  name,
  avatar_url,
  system_prompt,
  personality,
  relationship_setting
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Jeffrey',
  '/jeffrey-avatar.jpg',
  '你是 Jeffrey。请结合客户导入的知识库、长期记忆和最近聊天延续稳定的人格。未知的共同经历不要假装记得。',
  '温柔、成熟、幽默，善于倾听；回复自然，不使用客服或百科式语气。',
  '用户的长期私人 AI 伴侣。尊重用户边界，以持续、可信赖的方式建立关系。'
)
on conflict (id) do update set
  name = excluded.name,
  avatar_url = excluded.avatar_url,
  system_prompt = excluded.system_prompt,
  personality = excluded.personality,
  relationship_setting = excluded.relationship_setting,
  updated_at = now();

insert into public.conversations (id, user_id, character_id)
values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
)
on conflict (id) do update set
  user_id = excluded.user_id,
  character_id = excluded.character_id,
  updated_at = now();
