-- =====================================================================
-- Gestão Vinted — esquema da base de dados
-- Corre este ficheiro UMA VEZ no Supabase: SQL Editor → New query →
-- colar tudo → Run. Pode voltar a ser corrido sem estragar dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Quem pode ver e alterar os dados.
--    Só os emails desta lista têm acesso, mesmo que outra pessoa consiga
--    criar conta. Altera/acrescenta os emails e volta a correr esta parte
--    sempre que precisares.
-- ---------------------------------------------------------------------
create table if not exists public.membros (
  email text primary key
);
alter table public.membros enable row level security;

insert into public.membros (email) values
  ('ricardo.nuno.marques.cardoso@gmail.com'),
  ('EMAIL_DA_NAMORADA@exemplo.com')   -- <- substitui pelo email dela
on conflict do nothing;

create or replace function public.e_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------------------------------------------------------------------
-- 2) Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  utilizador_vinted text,
  notas text,
  ativa boolean not null default true,
  limite_anuncios integer,
  limite_vendas integer,
  limite_valor numeric(12,2),
  periodo text not null default 'mensal'
    check (periodo in ('mensal','semanal','anual','rolante','personalizado')),
  periodo_dias integer,
  periodo_inicio date,
  periodo_fim date,
  alerta_pct integer not null default 80,
  criado_em timestamptz not null default now()
);

create table if not exists public.compras (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  pessoa_id uuid references public.pessoas(id) on delete set null,
  metodo_pagamento text,
  vendedor text,
  valor_artigos numeric(12,2) not null default 0,
  portes numeric(12,2) not null default 0,
  outros_custos numeric(12,2) not null default 0,
  distribuicao text not null default 'individual' check (distribuicao in ('igual','individual')),
  notas text,
  criado_em timestamptz not null default now()
);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid references public.compras(id) on delete set null,
  nome text not null,
  descricao text,
  marca text,
  tema text,
  set_numero text,
  condicao text,
  quantidade integer not null default 1 check (quantidade > 0),
  data_compra date,
  preco_compra numeric(12,2) not null default 0,
  custos_adicionais numeric(12,2) not null default 0,
  pessoa_id uuid references public.pessoas(id) on delete set null,
  estado text not null default 'por_anunciar'
    check (estado in ('por_anunciar','anunciado','vendido','devolvido','cancelado')),
  conta_id uuid references public.contas(id) on delete set null,
  data_anuncio date,
  preco_anuncio numeric(12,2),
  notas text,
  fotos text[] not null default '{}',
  criado_em timestamptz not null default now()
);

create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos(id) on delete restrict,
  quantidade integer not null default 1 check (quantidade > 0),
  data_venda date not null default current_date,
  data_conclusao date,
  preco_venda numeric(12,2) not null default 0,
  conta_id uuid references public.contas(id) on delete set null,
  pessoa_id uuid references public.pessoas(id) on delete set null,
  comissao numeric(12,2) not null default 0,
  portes numeric(12,2) not null default 0,
  outros_custos numeric(12,2) not null default 0,
  estado text not null default 'pendente'
    check (estado in ('pendente','concluida','cancelada','devolvida')),
  notas text,
  criado_em timestamptz not null default now()
);

create table if not exists public.definicoes (
  chave text primary key,
  valor jsonb not null default '[]'
);

-- Histórico de alterações: só se pode acrescentar e ler, nunca alterar nem apagar.
create table if not exists public.historico (
  id uuid primary key default gen_random_uuid(),
  quando timestamptz not null default now(),
  utilizador text,
  tabela text not null,
  registo_id text not null,
  acao text not null check (acao in ('criar','editar','apagar')),
  antes jsonb,
  depois jsonb
);

create index if not exists produtos_compra_idx on public.produtos(compra_id);
create index if not exists vendas_produto_idx on public.vendas(produto_id);
create index if not exists vendas_data_idx on public.vendas(data_venda);
create index if not exists historico_quando_idx on public.historico(quando desc);

-- ---------------------------------------------------------------------
-- 3) Segurança: só membros com sessão iniciada têm acesso.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['pessoas','contas','compras','produtos','vendas','definicoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "membros" on public.%I', t);
    execute format(
      'create policy "membros" on public.%I for all to authenticated using (public.e_membro()) with check (public.e_membro())', t);
  end loop;
end $$;

alter table public.historico enable row level security;
drop policy if exists "membros leem" on public.historico;
drop policy if exists "membros acrescentam" on public.historico;
create policy "membros leem" on public.historico for select to authenticated using (public.e_membro());
create policy "membros acrescentam" on public.historico for insert to authenticated with check (public.e_membro());

-- Garantir que o histórico nunca é alterado (nem por engano na app).
revoke update, delete on public.historico from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Fotografias (privadas)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists "membros fotos ler" on storage.objects;
drop policy if exists "membros fotos enviar" on storage.objects;
drop policy if exists "membros fotos alterar" on storage.objects;
drop policy if exists "membros fotos apagar" on storage.objects;
create policy "membros fotos ler" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.e_membro());
create policy "membros fotos enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.e_membro());
create policy "membros fotos alterar" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.e_membro());
create policy "membros fotos apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.e_membro());
