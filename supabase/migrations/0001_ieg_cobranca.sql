-- IEG Cobrança — estrutura do banco (Supabase / PostgreSQL)
--
-- Modelo de segurança:
--  • Todas as tabelas têm RLS ligado.
--  • Usuários autenticados e ATIVOS só conseguem LER (select) os dados de cobrança.
--  • Toda gravação passa pelo servidor do app (chave secreta), depois de checar
--    login, perfil ativo e papel (admin/operador). Assim ninguém consegue forjar
--    histórico ou status chamando a API do Supabase diretamente.
--  • Segredos das integrações (tokens) ficam numa tabela sem nenhuma política:
--    só o servidor lê, e os valores ficam criptografados (AES-256-GCM) pelo app.


-- ─── Perfis de funcionários ────────────────────────────────────────────────

do $$ begin
  create type public.user_role as enum ('admin', 'operador');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'operador',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cria o perfil automaticamente.
--  • O primeiro usuário do sistema vira administrador ativo.
--  • Os demais nascem INATIVOS: só têm acesso depois que um administrador os cria
--    pela tela Usuários (que já ativa) ou os ativa. Assim, mesmo que o cadastro
--    público do Supabase Auth fique ligado por engano, ninguém entra sozinho.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  first_user boolean := not exists (select 1 from public.profiles);
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when first_user then 'admin'::public.user_role else 'operador'::public.user_role end,
    first_user
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─── Configurações (linha única) ───────────────────────────────────────────
-- Campos de texto nulos = usar o texto padrão definido no app.

create table if not exists public.settings (
  id smallint primary key default 1 check (id = 1),
  open_rule text not null default 'sem_pagamento_ou_zerado'
    check (open_rule in ('sem_pagamento_ou_zerado', 'sem_data_pagamento', 'valor_pago_zerado', 'pago_menor_que_liquido')),
  only_overdue boolean not null default true,
  grace_days integer not null default 0 check (grace_days between 0 and 60),
  amount_basis text not null default 'parcela' check (amount_basis in ('liquido', 'parcela')),
  daily_interest_pct numeric(8, 5) check (daily_interest_pct is null or (daily_interest_pct >= 0 and daily_interest_pct <= 1)),
  fine_pct numeric(6, 3) check (fine_pct is null or (fine_pct >= 0 and fine_pct <= 20)),
  interest_start_date date,
  show_updated_values boolean not null default true,
  cpf_display text not null default 'parcial' check (cpf_display in ('nao_exibir', 'parcial', 'completo')),
  store_original_pdf boolean not null default false,
  duplicate_window_days integer not null default 7 check (duplicate_window_days between 1 and 90),
  -- manual: o sistema abre o WhatsApp/e-mail com a mensagem pronta e o funcionário envia.
  -- automatico: envio pela API da Meta e por SMTP/Resend (exige credenciais).
  send_mode text not null default 'manual' check (send_mode in ('manual', 'automatico')),
  test_mode boolean not null default true,
  test_phone text,
  test_email text,
  wa_mode text not null default 'template' check (wa_mode in ('template', 'texto')),
  wa_template_name text,
  wa_template_language text not null default 'pt_BR',
  wa_template_body text,
  wa_template_params text[],
  wa_text_template text,
  email_subject_template text,
  email_body_template text,
  email_sender_name text not null default 'IEG Colégio e Curso',
  email_team_name text not null default 'Equipe de Cobrança',
  email_reply_to text,
  email_provider text not null default 'smtp' check (email_provider in ('smtp', 'resend')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ─── Segredos das integrações (somente servidor) ───────────────────────────

create table if not exists public.integration_secrets (
  key text primary key,
  value_encrypted text not null,
  hint text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

-- ─── Importações de relatório ──────────────────────────────────────────────

create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_size bigint,
  file_hash text,
  page_count integer,
  extraction_method text not null default 'texto' check (extraction_method in ('texto', 'ocr')),
  reference_date date not null,
  rules_snapshot jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  parse_warnings text[] not null default '{}',
  storage_path text,
  imported_by uuid references public.profiles (id) on delete set null,
  imported_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists imports_created_idx on public.imports (created_at desc);
create index if not exists imports_hash_idx on public.imports (file_hash);

-- ─── Cobranças (uma por responsável + aluno, por importação) ───────────────

create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.imports (id) on delete cascade,
  group_key text not null,
  guardian_name text not null,
  guardian_cpf text,
  guardian_email text,
  guardian_phone text,
  guardian_phone_raw text,
  student_name text not null,
  class_name text,
  installments jsonb not null default '[]'::jsonb,
  open_count integer not null default 0,
  upcoming_count integer not null default 0,
  total_open_cents bigint not null default 0,
  oldest_due date,
  warnings jsonb not null default '[]'::jsonb,
  reviewed boolean not null default false,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  contact_edited boolean not null default false,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'entregue', 'erro', 'cancelado')),
  wa_status text check (wa_status in ('pendente', 'enviado', 'entregue', 'lido', 'erro', 'simulado')),
  email_status text check (email_status in ('pendente', 'enviado', 'entregue', 'erro', 'simulado')),
  wa_text_override text,
  wa_params_override text[],
  email_subject_override text,
  email_body_override text,
  cancel_reason text,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (import_id, group_key)
);

create index if not exists charges_import_idx on public.charges (import_id);
create index if not exists charges_group_idx on public.charges (group_key);

drop trigger if exists charges_touch on public.charges;
create trigger charges_touch before update on public.charges
  for each row execute function public.touch_updated_at();

-- ─── Envios (histórico) ────────────────────────────────────────────────────
-- dispatches: um registro por cobrança enviada (ou cancelada) em uma ação.
-- messages: uma mensagem por canal dentro do envio.

create table if not exists public.dispatches (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  charge_id uuid references public.charges (id) on delete set null,
  import_id uuid references public.imports (id) on delete set null,
  group_key text not null,
  guardian_name text not null,
  guardian_cpf text,
  student_name text not null,
  amount_cents bigint not null default 0,
  channels text[] not null default '{}',
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'entregue', 'erro', 'cancelado', 'simulado')),
  test_mode boolean not null default false,
  note text,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_by_name text,
  created_at timestamptz not null default now(),
  unique (batch_id, charge_id)
);

create index if not exists dispatches_group_idx on public.dispatches (group_key, created_at desc);
create index if not exists dispatches_created_idx on public.dispatches (created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches (id) on delete cascade,
  charge_id uuid references public.charges (id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient text not null,
  intended_recipient text,
  subject text,
  body text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'entregue', 'lido', 'erro', 'cancelado', 'simulado')),
  provider text,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz
);

-- Impede duas mensagens "em envio" ao mesmo tempo para a mesma cobrança/canal
-- (dois funcionários clicando juntos, clique duplo etc.)
create unique index if not exists messages_one_pending
  on public.messages (charge_id, channel)
  where status = 'pendente' and charge_id is not null;
create index if not exists messages_provider_idx on public.messages (provider_message_id);
create index if not exists messages_sent_idx on public.messages (sent_at desc);
create index if not exists messages_dispatch_idx on public.messages (dispatch_id);

-- ─── Logs de acesso e auditoria ────────────────────────────────────────────

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  user_email text,
  action text not null,
  entity text,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_user_idx on public.audit_logs (user_id, created_at desc);

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.imports enable row level security;
alter table public.charges enable row level security;
alter table public.dispatches enable row level security;
alter table public.messages enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "perfis: leitura por funcionários ativos" on public.profiles;
create policy "perfis: leitura por funcionários ativos" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_active_user());

drop policy if exists "configurações: leitura" on public.settings;
create policy "configurações: leitura" on public.settings
  for select to authenticated using (public.is_active_user());

drop policy if exists "importações: leitura" on public.imports;
create policy "importações: leitura" on public.imports
  for select to authenticated using (public.is_active_user());

drop policy if exists "cobranças: leitura" on public.charges;
create policy "cobranças: leitura" on public.charges
  for select to authenticated using (public.is_active_user());

drop policy if exists "envios: leitura" on public.dispatches;
create policy "envios: leitura" on public.dispatches
  for select to authenticated using (public.is_active_user());

drop policy if exists "mensagens: leitura" on public.messages;
create policy "mensagens: leitura" on public.messages
  for select to authenticated using (public.is_active_user());

drop policy if exists "auditoria: leitura por administradores" on public.audit_logs;
create policy "auditoria: leitura por administradores" on public.audit_logs
  for select to authenticated using (public.is_admin());

-- integration_secrets: RLS ligado e NENHUMA política → inacessível fora do servidor.

revoke all on public.integration_secrets from anon, authenticated;
revoke insert, update, delete on public.profiles, public.settings, public.imports, public.charges,
  public.dispatches, public.messages, public.audit_logs from anon, authenticated;
revoke all on public.profiles, public.settings, public.imports, public.charges,
  public.dispatches, public.messages, public.audit_logs from anon;

-- ─── Armazenamento opcional do PDF original (bucket privado) ───────────────

insert into storage.buckets (id, name, public)
values ('relatorios', 'relatorios', false)
on conflict (id) do nothing;
