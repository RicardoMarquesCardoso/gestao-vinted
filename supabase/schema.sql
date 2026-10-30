-- =====================================================================
-- Gestão Vinted — esquema da base de dados
-- Corre este ficheiro UMA VEZ no Supabase: SQL Editor → New query →
-- colar tudo → Run. Pode voltar a ser corrido sem estragar dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Quem pode ver e alterar os dados.
--    Só os emails desta lista têm acesso, mesmo que outra pessoa consiga
--    criar conta. Substitui os dois emails abaixo pelos vossos antes de
--    correr. Para acrescentar alguém depois: Table Editor → membros.
-- ---------------------------------------------------------------------
create table if not exists public.membros (
  email text primary key
);
alter table public.membros enable row level security;

insert into public.membros (email) values
  ('EMAIL_1@exemplo.com'),   -- <- substitui
  ('EMAIL_2@exemplo.com')    -- <- substitui
on conflict do nothing;

create or replace function public.e_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke execute on function public.e_membro() from public, anon;
grant execute on function public.e_membro() to authenticated;

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
  estado text not null default 'concluida'
    check (estado in ('concluida','cancelada','devolvida')),
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

-- ---------------------------------------------------------------------
-- 5) Acertos entre nós (tipo Splitwise)
--    tipo_pagamento: 'pessoa' (paga pessoa_id), 'conjunta' (conta conjunta)
--    ou 'dividido' (partes iguais entre as pessoas).
--    contas.titular_id: quem recebe o dinheiro das vendas dessa conta.
-- ---------------------------------------------------------------------
alter table public.compras add column if not exists tipo_pagamento text not null default 'pessoa'
  check (tipo_pagamento in ('pessoa','conjunta','dividido'));
alter table public.produtos add column if not exists tipo_pagamento text not null default 'pessoa'
  check (tipo_pagamento in ('pessoa','conjunta','dividido'));
alter table public.contas add column if not exists titular_id uuid references public.pessoas(id) on delete set null;

-- Transferências já feitas. "de" e "para" são 'conjunta' ou o id de uma pessoa.
create table if not exists public.acertos (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  de text not null,
  para text not null,
  valor numeric(12,2) not null check (valor > 0),
  notas text,
  criado_em timestamptz not null default now()
);
alter table public.acertos enable row level security;
drop policy if exists "membros" on public.acertos;
create policy "membros" on public.acertos for all to authenticated
  using (public.e_membro()) with check (public.e_membro());

-- Vendas cujo dinheiro já foi distribuído fora da app (não entram nos acertos)
alter table public.vendas add column if not exists acertada boolean not null default false;

-- Períodos em que cada produto esteve anunciado (preenchido pela app)
alter table public.produtos add column if not exists anuncios jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- Dados de mercado: funções lidas pela GitHub Action "mercado" (scripts/mercado.py).
-- Só respondem com o código certo (guardado em definicoes.token_mercado e no segredo
-- VINTEDUO_TOKEN do GitHub) e só devolvem n.º de set / nomes, nunca preços ou pessoas.
-- "security definer" = correm com as permissões de quem as criou, por isso conseguem ler
-- as tabelas mesmo sem sessão iniciada — mas só devolvem o que está escrito aqui.
-- ---------------------------------------------------------------------
create or replace function public.sets_mercado(token text) returns setof text
language sql stable security definer set search_path = public as $$
  select distinct trim(p.set_numero) from public.produtos p
  where p.set_numero is not null and trim(p.set_numero) <> ''
    and exists (select 1 from public.definicoes d where d.chave = 'token_mercado' and d.valor #>> '{}' = token);
$$;
revoke all on function public.sets_mercado(text) from public;
grant execute on function public.sets_mercado(text) to anon, authenticated;

create or replace function public.pokemon_mercado(token text) returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x), '[]'::json) from (
    select g.chave, g.nome,
      (select d2.valor ->> g.chave from public.definicoes d2 where d2.chave = 'pokemon_ids') as id_manual
    from (
      select lower(trim(p.nome)) as chave, min(p.nome) as nome
      from public.produtos p
      where p.marca ilike 'pok%mon' and p.estado in ('por_anunciar','anunciado')
        and exists (select 1 from public.definicoes d where d.chave = 'token_mercado' and d.valor #>> '{}' = token)
      group by 1
    ) g
  ) x;
$$;
revoke all on function public.pokemon_mercado(text) from public;
grant execute on function public.pokemon_mercado(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6) Lista de sets para a tarefa diária de mercado (scripts/mercado.py)
--    Os nossos sets + os que acompanhamos sem os ter (definicoes.sets_avaliar,
--    botão "Acompanhar" do ecrã "Vale a pena?"). Protegida pelo token_mercado.
-- ---------------------------------------------------------------------
create or replace function public.sets_mercado(token text)
returns setof text
language sql stable security definer set search_path to 'public' as $$
  select s from (
    select distinct trim(p.set_numero) as s from public.produtos p
    where p.set_numero is not null and trim(p.set_numero) <> ''
    union
    select distinct trim(x) from public.definicoes d, jsonb_array_elements_text(
      case when jsonb_typeof(d.valor) = 'array' then d.valor else '[]'::jsonb end) as x
    where d.chave = 'sets_avaliar' and trim(x) ~ '^\d{3,7}(-\d+)?$'
  ) t
  where exists (select 1 from public.definicoes d where d.chave = 'token_mercado' and d.valor #>> '{}' = token);
$$;

-- ---------------------------------------------------------------------
-- 7) Receber promoções de lojas enviadas por outra app (ex.: Continente)
--    POST /rest/v1/rpc/receber_promocao com o código definicoes.token_promocoes.
--    Guarda em definicoes.promocoes (as 50 mais recentes) e regista no histórico.
-- ---------------------------------------------------------------------
insert into public.definicoes (chave, valor)
values ('token_promocoes', to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
on conflict (chave) do nothing;

create or replace function public.receber_promocao(
  token text,
  loja text,
  texto text default null,       -- a lista em texto livre (como se colava na app)
  desconto numeric default null, -- % de desconto sobre o PVP (ex.: 25), se for igual para todos
  itens jsonb default null,      -- ou uma lista [{"set":"75375","preco":63.74}, ...]
  valida_ate date default null   -- até quando dura a promoção (opcional)
) returns json
language plpgsql security definer set search_path to 'public' as $$
declare
  nova jsonb;
  lista jsonb;
begin
  if token is null or not exists (select 1 from definicoes d where d.chave = 'token_promocoes' and d.valor #>> '{}' = token) then
    raise exception 'Código inválido' using errcode = '28000';
  end if;
  if coalesce(trim(loja), '') = '' then raise exception 'Falta a loja'; end if;
  if texto is null and itens is null then raise exception 'Falta a lista (texto ou itens)'; end if;
  if length(coalesce(texto, '')) > 200000 then raise exception 'Texto demasiado grande'; end if;
  if itens is not null and (jsonb_typeof(itens) <> 'array' or jsonb_array_length(itens) > 2000) then
    raise exception 'itens tem de ser uma lista (no máximo 2000)';
  end if;
  if desconto is not null and (desconto < 0 or desconto > 90) then raise exception 'Desconto fora de 0–90'; end if;
  nova := jsonb_strip_nulls(jsonb_build_object(
    'id', gen_random_uuid(), 'recebida', now(), 'loja', left(trim(loja), 60),
    'texto', texto, 'desconto', desconto, 'itens', itens, 'valida_ate', valida_ate));
  select coalesce(valor, '[]'::jsonb) into lista from definicoes where chave = 'promocoes';
  lista := jsonb_build_array(nova) || coalesce(lista, '[]'::jsonb);
  select coalesce(jsonb_agg(x order by i), '[]'::jsonb) into lista
    from jsonb_array_elements(lista) with ordinality as t(x, i) where i <= 50;
  insert into definicoes (chave, valor) values ('promocoes', lista)
    on conflict (chave) do update set valor = excluded.valor;
  insert into historico (utilizador, tabela, registo_id, acao, antes, depois)
    values ('App de promoções', 'definicoes', 'promocoes', 'criar', null, nova - 'texto');
  return json_build_object('ok', true, 'id', nova ->> 'id');
end;
$$;
revoke all on function public.receber_promocao(text, text, text, numeric, jsonb, date) from public;
grant execute on function public.receber_promocao(text, text, text, numeric, jsonb, date) to anon, authenticated;
