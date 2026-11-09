-- Codexa Assistant: histórico, RAG vetorial e políticas de acesso.
-- NÃO é aplicado automaticamente. Revise e aplique manualmente no Supabase.
-- Este script não cria ferramentas para consultar tabelas operacionais da Codexa.
-- Não indexe credenciais, tokens, senhas ou dados pessoais sem base legal e autorização.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to authenticated;

-- Verificação mínima de vínculo ativo. SECURITY DEFINER é restrita a esta checagem;
-- search_path fica vazio e todas as tabelas/funções estão qualificadas.
create or replace function public.assistant_is_active_workspace_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.team_members as member
    where member.user_id = auth.uid()
      and pg_catalog.lower(pg_catalog.btrim(coalesce(member.status, ''))) in ('active', 'ativo', 'enabled', 'habilitado')
  );
$function$;

revoke all on function public.assistant_is_active_workspace_member() from public, anon;
grant execute on function public.assistant_is_active_workspace_member() to authenticated;

-- Espelha o mapa de acesso do workspace para que documentos de módulo também
-- respeitem RLS quando a busca é chamada diretamente, fora da API do agente.
create or replace function public.assistant_can_access_knowledge_module(p_module_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  with active_member as (
    select member.id as member_id, role.id as role_id, pg_catalog.lower(pg_catalog.btrim(role.name)) as role_name
    from public.team_members as member
    join public.access_roles as role
      on pg_catalog.lower(pg_catalog.btrim(role.name)) = pg_catalog.lower(pg_catalog.btrim(member.role_name))
     and role.is_active
    where member.user_id = auth.uid()
      and pg_catalog.lower(pg_catalog.btrim(coalesce(member.status, ''))) in ('active', 'ativo', 'enabled', 'habilitado')
  ), required_permissions as (
    select pg_catalog.unnest(
      case pg_catalog.lower(coalesce(p_module_slug, ''))
        when 'dashboard' then array['dashboard:view', 'dashboard_commercial:view']
        when 'comercial' then array['dashboard_commercial:view']
        when 'documentos' then array['documents:view']
        when 'leads' then array['leads:view']
        when 'clientes' then array['clients:view']
        when 'contatos' then array['contacts:view']
        when 'propostas' then array['proposals:view']
        when 'contratos' then array['contracts:view']
        when 'projetos' then array['projects:view']
        when 'tarefas' then array['projects:view']
        when 'solicitacoes' then array['change_requests:view']
        when 'suporte' then array['support:view']
        when 'sistemas' then array['systems:view']
        when 'modulos' then array['modules:view']
        when 'planos' then array['plans:view']
        when 'licencas' then array['licenses:view']
        when 'contas-a-receber' then array['accounts_receivable:view']
        when 'contas-a-pagar' then array['accounts_payable:view']
        when 'fluxo-de-caixa' then array['finance:view']
        when 'transacoes' then array['finance:view']
        when 'categorias-financeiras' then array['finance:view']
        when 'relatorios' then array['reports_commercial:view', 'reports_financial:view']
        when 'equipe' then array['team:view']
        when 'usuarios' then array['users:manage_users']
        when 'papeis-e-permissoes' then array['roles:manage_roles']
        when 'emblemas' then array['badges:manage']
        when 'configuracao-xp' then array['badges:manage']
        when 'meu-perfil' then array['profile:view']
        when 'meu-historico' then array['projects:view']
        when 'configuracoes' then array['settings:view']
        when 'aparencia' then array['appearance:view']
        when 'auditoria' then array['audit:view_audit']
        else array[]::text[]
      end
    ) as permission_key
  )
  select case
    when pg_catalog.lower(coalesce(p_module_slug, '')) = 'global'
      then exists (select 1 from active_member)
    else exists (
      select 1
      from active_member as member
      cross join required_permissions as required
      where member.role_name = 'admin'
        or (
          (
            exists (
              select 1
              from public.role_permissions as role_permission
              join public.access_permissions as permission on permission.id = role_permission.permission_id
              where role_permission.role_id = member.role_id
                and permission.is_active
                and permission.module_name || ':' || permission.action_name = required.permission_key
            )
            or exists (
              select 1
              from public.workspace_member_permission_overrides as permission_override
              join public.access_permissions as permission on permission.id = permission_override.permission_id
              where permission_override.member_id = member.member_id
                and permission_override.effect = 'allow'
                and permission.is_active
                and permission.module_name || ':' || permission.action_name = required.permission_key
            )
          )
          and not exists (
            select 1
            from public.workspace_member_permission_overrides as permission_override
            join public.access_permissions as permission on permission.id = permission_override.permission_id
            where permission_override.member_id = member.member_id
              and permission_override.effect = 'deny'
              and permission.is_active
              and permission.module_name || ':' || permission.action_name = required.permission_key
          )
        )
    )
  end;
$function$;

revoke all on function public.assistant_can_access_knowledge_module(text) from public, anon;
grant execute on function public.assistant_can_access_knowledge_module(text) to authenticated;

create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa' check (pg_catalog.length(title) <= 120),
  selected_model text,
  fallback_models text[] not null default '{}'::text[],
  fallback_enabled boolean not null default false,
  summary text not null default '',
  summarized_message_count integer not null default 0 check (summarized_message_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists assistant_conversations_user_recent_idx
  on public.assistant_conversations (user_id, last_message_at desc);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_message_id text not null check (pg_catalog.length(client_message_id) between 1 and 128),
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  model_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (conversation_id, client_message_id)
);

create index if not exists assistant_messages_conversation_recent_idx
  on public.assistant_messages (conversation_id, created_at desc);

create or replace function public.set_assistant_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists assistant_conversations_updated_at on public.assistant_conversations;
create trigger assistant_conversations_updated_at
  before update on public.assistant_conversations
  for each row execute function public.set_assistant_updated_at();

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

revoke all on table public.assistant_conversations, public.assistant_messages from public, anon;
grant select, insert, update, delete on table public.assistant_conversations, public.assistant_messages to authenticated;

drop policy if exists assistant_conversations_select_own on public.assistant_conversations;
create policy assistant_conversations_select_own
  on public.assistant_conversations for select to authenticated
  using (user_id = auth.uid() and public.assistant_is_active_workspace_member());

drop policy if exists assistant_conversations_insert_own on public.assistant_conversations;
create policy assistant_conversations_insert_own
  on public.assistant_conversations for insert to authenticated
  with check (user_id = auth.uid() and public.assistant_is_active_workspace_member());

drop policy if exists assistant_conversations_update_own on public.assistant_conversations;
create policy assistant_conversations_update_own
  on public.assistant_conversations for update to authenticated
  using (user_id = auth.uid() and public.assistant_is_active_workspace_member())
  with check (user_id = auth.uid() and public.assistant_is_active_workspace_member());

drop policy if exists assistant_conversations_delete_own on public.assistant_conversations;
create policy assistant_conversations_delete_own
  on public.assistant_conversations for delete to authenticated
  using (user_id = auth.uid() and public.assistant_is_active_workspace_member());

drop policy if exists assistant_messages_select_own on public.assistant_messages;
create policy assistant_messages_select_own
  on public.assistant_messages for select to authenticated
  using (
    user_id = auth.uid()
    and public.assistant_is_active_workspace_member()
    and exists (
      select 1 from public.assistant_conversations as conversation
      where conversation.id = assistant_messages.conversation_id
        and conversation.user_id = auth.uid()
    )
  );

drop policy if exists assistant_messages_insert_own on public.assistant_messages;
create policy assistant_messages_insert_own
  on public.assistant_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.assistant_is_active_workspace_member()
    and exists (
      select 1 from public.assistant_conversations as conversation
      where conversation.id = assistant_messages.conversation_id
        and conversation.user_id = auth.uid()
    )
  );

drop policy if exists assistant_messages_update_own on public.assistant_messages;
create policy assistant_messages_update_own
  on public.assistant_messages for update to authenticated
  using (
    user_id = auth.uid()
    and public.assistant_is_active_workspace_member()
    and exists (
      select 1 from public.assistant_conversations as conversation
      where conversation.id = assistant_messages.conversation_id
        and conversation.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and public.assistant_is_active_workspace_member()
    and exists (
      select 1 from public.assistant_conversations as conversation
      where conversation.id = assistant_messages.conversation_id
        and conversation.user_id = auth.uid()
    )
  );

drop policy if exists assistant_messages_delete_own on public.assistant_messages;
create policy assistant_messages_delete_own
  on public.assistant_messages for delete to authenticated
  using (user_id = auth.uid() and public.assistant_is_active_workspace_member());

-- Documentos de conhecimento. Registros com created_by NULL são compartilhados
-- com membros ativos; documentos indexados pelo app pertencem somente ao autor.
create table if not exists public.assistant_knowledge (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  category text not null default 'geral',
  content text not null check (pg_catalog.length(pg_catalog.btrim(content)) > 0),
  keywords text[] not null default '{}'::text[],
  module_slug text not null default 'global',
  source_url text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('portuguese'::regconfig, coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(category, '')), 'B') ||
    setweight(to_tsvector('portuguese'::regconfig, coalesce(content, '')), 'C') ||
    setweight(to_tsvector('simple'::regconfig, array_to_string(coalesce(keywords, '{}'::text[]), ' ')), 'A')
  ) stored
);

alter table public.assistant_knowledge add column if not exists module_slug text not null default 'global';
alter table public.assistant_knowledge add column if not exists source_url text;
create index if not exists assistant_knowledge_search_vector_idx
  on public.assistant_knowledge using gin (search_vector);

create table if not exists public.assistant_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  knowledge_id uuid not null references public.assistant_knowledge(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (pg_catalog.length(pg_catalog.btrim(content)) > 0),
  embedding extensions.vector(1536) not null,
  search_vector tsvector generated always as (to_tsvector('portuguese'::regconfig, coalesce(content, ''))) stored,
  created_at timestamptz not null default now(),
  unique (knowledge_id, chunk_index)
);

create index if not exists assistant_knowledge_chunks_embedding_idx
  on public.assistant_knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists assistant_knowledge_chunks_search_idx
  on public.assistant_knowledge_chunks using gin (search_vector);

alter table public.assistant_knowledge enable row level security;
alter table public.assistant_knowledge_chunks enable row level security;
revoke all on table public.assistant_knowledge, public.assistant_knowledge_chunks from public, anon;
grant select, insert, update, delete on table public.assistant_knowledge, public.assistant_knowledge_chunks to authenticated;

drop policy if exists assistant_knowledge_select_member on public.assistant_knowledge;
create policy assistant_knowledge_select_member
  on public.assistant_knowledge for select to authenticated
  using (
    is_active
    and public.assistant_is_active_workspace_member()
    and (
      created_by = auth.uid()
      or (created_by is null and public.assistant_can_access_knowledge_module(module_slug))
    )
  );

drop policy if exists assistant_knowledge_insert_own on public.assistant_knowledge;
create policy assistant_knowledge_insert_own
  on public.assistant_knowledge for insert to authenticated
  with check (created_by = auth.uid() and public.assistant_is_active_workspace_member());

drop policy if exists assistant_knowledge_update_own on public.assistant_knowledge;
create policy assistant_knowledge_update_own
  on public.assistant_knowledge for update to authenticated
  using (created_by = auth.uid() and public.assistant_is_active_workspace_member())
  with check (created_by = auth.uid() and public.assistant_is_active_workspace_member());

drop policy if exists assistant_knowledge_delete_own on public.assistant_knowledge;
create policy assistant_knowledge_delete_own
  on public.assistant_knowledge for delete to authenticated
  using (created_by = auth.uid() and public.assistant_is_active_workspace_member());

drop policy if exists assistant_knowledge_chunks_select_member on public.assistant_knowledge_chunks;
create policy assistant_knowledge_chunks_select_member
  on public.assistant_knowledge_chunks for select to authenticated
  using (
    public.assistant_is_active_workspace_member()
    and exists (
      select 1 from public.assistant_knowledge as document
      where document.id = assistant_knowledge_chunks.knowledge_id
        and document.is_active
        and (
          document.created_by = auth.uid()
          or (document.created_by is null and public.assistant_can_access_knowledge_module(document.module_slug))
        )
    )
  );

drop policy if exists assistant_knowledge_chunks_insert_own on public.assistant_knowledge_chunks;
create policy assistant_knowledge_chunks_insert_own
  on public.assistant_knowledge_chunks for insert to authenticated
  with check (
    public.assistant_is_active_workspace_member()
    and exists (
      select 1 from public.assistant_knowledge as document
      where document.id = assistant_knowledge_chunks.knowledge_id
        and document.created_by = auth.uid()
    )
  );

drop policy if exists assistant_knowledge_chunks_update_own on public.assistant_knowledge_chunks;
create policy assistant_knowledge_chunks_update_own
  on public.assistant_knowledge_chunks for update to authenticated
  using (
    public.assistant_is_active_workspace_member()
    and exists (
      select 1 from public.assistant_knowledge as document
      where document.id = assistant_knowledge_chunks.knowledge_id
        and document.created_by = auth.uid()
    )
  )
  with check (
    public.assistant_is_active_workspace_member()
    and exists (
      select 1 from public.assistant_knowledge as document
      where document.id = assistant_knowledge_chunks.knowledge_id
        and document.created_by = auth.uid()
    )
  );

drop policy if exists assistant_knowledge_chunks_delete_own on public.assistant_knowledge_chunks;
create policy assistant_knowledge_chunks_delete_own
  on public.assistant_knowledge_chunks for delete to authenticated
  using (
    public.assistant_is_active_workspace_member()
    and exists (
      select 1 from public.assistant_knowledge as document
      where document.id = assistant_knowledge_chunks.knowledge_id
        and document.created_by = auth.uid()
    )
  );

create or replace function public.search_assistant_knowledge_text(
  p_query text,
  p_module text default null,
  p_limit integer default 5
)
returns table (
  id uuid,
  slug text,
  title text,
  category text,
  module_slug text,
  content text,
  source_url text,
  relevance real
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with query_terms as (
    select pg_catalog.websearch_to_tsquery(
      'portuguese'::pg_catalog.regconfig,
      coalesce(p_query, '')
    ) as query
  ), ranked_documents as (
    select
      document.id,
      document.slug,
      document.title,
      document.category,
      document.module_slug,
      document.content,
      document.source_url,
      pg_catalog.ts_rank_cd(document.search_vector, query_terms.query)::real as relevance
    from public.assistant_knowledge as document
    cross join query_terms
    where document.is_active
      and document.search_vector @@ query_terms.query
      and (p_module is null or document.module_slug in ('global', p_module))
    order by pg_catalog.ts_rank_cd(document.search_vector, query_terms.query) desc
    limit 40
  )
  select
    ranked_documents.id,
    ranked_documents.slug,
    ranked_documents.title,
    ranked_documents.category,
    ranked_documents.module_slug,
    pg_catalog.left(ranked_documents.content, 2400),
    ranked_documents.source_url,
    ranked_documents.relevance
  from ranked_documents
  order by relevance desc
  limit least(greatest(coalesce(p_limit, 5), 1), 8);
$function$;

revoke all on function public.search_assistant_knowledge_text(text, text, integer) from public, anon;
grant execute on function public.search_assistant_knowledge_text(text, text, integer) to authenticated;

drop function if exists public.search_assistant_knowledge(text, integer);
drop function if exists public.search_assistant_knowledge(text, extensions.vector, text, integer);
create function public.search_assistant_knowledge(
  p_query text,
  p_embedding extensions.vector(1536),
  p_module text default null,
  p_limit integer default 5
)
returns table (
  id uuid,
  slug text,
  title text,
  category text,
  module_slug text,
  content text,
  source_url text,
  relevance real
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with query_terms as (
    select pg_catalog.websearch_to_tsquery(
      'portuguese'::pg_catalog.regconfig,
      coalesce(p_query, '')
    ) as query
  ), ranked_chunks as (
    select
      document.id,
      document.slug,
      document.title,
      document.category,
      document.module_slug,
      document.source_url,
      chunk.content,
      (1 - (chunk.embedding operator(extensions.<=>) p_embedding))::real as semantic_score,
      greatest(
        pg_catalog.ts_rank_cd(document.search_vector, query_terms.query),
        pg_catalog.ts_rank_cd(chunk.search_vector, query_terms.query)
      )::real as lexical_score
    from public.assistant_knowledge_chunks as chunk
    join public.assistant_knowledge as document on document.id = chunk.knowledge_id
    cross join query_terms
    where document.is_active
      and (p_module is null or document.module_slug in ('global', p_module))
    order by chunk.embedding operator(extensions.<=>) p_embedding asc
    limit 40
  )
  select
    ranked_chunks.id,
    ranked_chunks.slug,
    ranked_chunks.title,
    ranked_chunks.category,
    ranked_chunks.module_slug,
    pg_catalog.left(ranked_chunks.content, 2400),
    ranked_chunks.source_url,
    (ranked_chunks.semantic_score * 0.75 + least(ranked_chunks.lexical_score, 1) * 0.25)::real as relevance
  from ranked_chunks
  order by relevance desc
  limit least(greatest(coalesce(p_limit, 5), 1), 8);
$function$;

revoke all on function public.search_assistant_knowledge(text, extensions.vector, text, integer) from public, anon;
grant execute on function public.search_assistant_knowledge(text, extensions.vector, text, integer) to authenticated;

-- Semente de documentação: confirma apenas os nomes visíveis da navegação,
-- sem descrever regras de negócio ou afirmar dados operacionais.
insert into public.assistant_knowledge (slug, title, category, module_slug, content, keywords)
values (
  'codexa-navigation-overview',
  'Mapa dos módulos da Codexa',
  'sistema',
  'global',
  'A navegação atual da Codexa apresenta: Workspace (Dashboard, Visão comercial, Documentos); Relacionamento (Leads, Clientes, Contatos); Comercial (Propostas, Contratos); Operações (Projetos, Tarefas, Solicitações de alteração, Suporte); Produtos (Sistemas dos clientes, Módulos, Planos, Licenças); Financeiro (Contas a receber, Contas a pagar, Fluxo de caixa, Transações, Categorias financeiras); Administração (Relatórios, Equipe, Usuários, Papéis e permissões, Emblemas, Configuração de XP, Auditoria); Conta (Meu perfil, Meu histórico, Configurações, Aparência). Este registro confirma apenas nomes e grupos da navegação; não contém regras de negócio nem registros de clientes.',
  array['Codexa', 'Workspace', 'CRM', 'Comercial', 'Operações', 'Produtos', 'Financeiro', 'Administração', 'Dashboard', 'Leads', 'Clientes', 'Propostas', 'Contratos', 'Projetos', 'Tarefas', 'Licenças']
)
on conflict (slug) do nothing;
