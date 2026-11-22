-- Fase 1 — anúncios em várias plataformas (decisão do Ricardo, 22/11/2026).
--
-- Até aqui um produto só podia estar anunciado num sítio (produtos.estado/conta_id/preco_anuncio/
-- data_anuncio + histórico em produtos.anuncios, jsonb). Agora o mesmo set anuncia-se uma vez em
-- cada plataforma (Vinted, Wallapop, eBay). Esta fase NÃO muda a app:
--   1. contas.plataforma (vinted / wallapop / ebay), preenchida a partir do nome "… (Wallapop)";
--   2. tabela anuncios: uma linha por anúncio (produto × plataforma); no máximo um aberto por
--      produto e plataforma;
--   3. permissões iguais às outras tabelas (só membros, e_membro());
--   4. espelho temporário: enquanto a app grava em produtos.anuncios, um gatilho mantém a tabela
--      igual (sai na fase 3);
--   5. cópia do histórico existente.
-- Reverter:
--   drop trigger espelhar_anuncios on public.produtos; drop function public.espelhar_anuncios();
--   drop table public.anuncios; alter table public.contas drop column plataforma;

-- 1. Plataforma de cada conta (em vez de a deduzir do nome)
alter table public.contas add column plataforma text not null default 'vinted'
  check (plataforma in ('vinted','wallapop','ebay'));
update public.contas set plataforma = 'wallapop' where nome ilike '%(wallapop)';
update public.contas set plataforma = 'ebay'     where nome ilike '%(ebay)';

-- 2. Um anúncio = uma linha (produto × plataforma)
create table public.anuncios (
  id          uuid primary key default gen_random_uuid(),
  produto_id  uuid not null references public.produtos(id) on delete cascade,
  conta_id    uuid references public.contas(id) on delete set null,
  plataforma  text not null check (plataforma in ('vinted','wallapop','ebay')),
  preco       numeric,                          -- o que recebemos (nunca o que o comprador paga)
  precos      jsonb not null default '[]',      -- mudanças de preço durante o anúncio
  inicio      timestamptz not null,
  fim         timestamptz,                      -- vazio = ainda anunciado
  motivo      text,                             -- vendido / retirado / outro
  aproximado  boolean not null default false,   -- reconstruído sem hora
  id_externo  text,                             -- n.º do anúncio na plataforma (eBay, futuro)
  criado_em   timestamptz not null default now()
);
create unique index anuncios_um_aberto_por_plataforma
  on public.anuncios (produto_id, plataforma) where fim is null;
create index anuncios_produto on public.anuncios (produto_id);

-- 3. Permissões iguais às das outras tabelas
alter table public.anuncios enable row level security;
create policy membros on public.anuncios for all to authenticated
  using (e_membro()) with check (e_membro());
grant select, insert, update, delete on public.anuncios to authenticated;

-- 4. Espelho temporário (fases 1–2): cada vez que a app grava o histórico de um produto,
--    a tabela nova fica igual
create function public.espelhar_anuncios() returns trigger
language plpgsql set search_path = public as $$
begin
  delete from anuncios where produto_id = new.id;
  insert into anuncios (produto_id, conta_id, plataforma, preco, precos, inicio, fim, motivo, aproximado)
  select new.id, c.id, coalesce(c.plataforma, 'vinted'),
         nullif(a->>'preco','')::numeric, coalesce(a->'precos','[]'::jsonb),
         (a->>'inicio')::timestamptz, nullif(a->>'fim','')::timestamptz,
         a->>'motivo', coalesce((a->>'aproximado')::boolean, false)
  from jsonb_array_elements(coalesce(new.anuncios,'[]'::jsonb)) a
  left join contas c on c.id::text = a->>'conta_id';
  return new;
end $$;
create trigger espelhar_anuncios after insert or update of anuncios
  on public.produtos for each row execute function public.espelhar_anuncios();

-- 5. Cópia inicial do histórico
insert into public.anuncios (produto_id, conta_id, plataforma, preco, precos, inicio, fim, motivo, aproximado)
select p.id, c.id, coalesce(c.plataforma, 'vinted'),
       nullif(a->>'preco','')::numeric, coalesce(a->'precos','[]'::jsonb),
       (a->>'inicio')::timestamptz, nullif(a->>'fim','')::timestamptz,
       a->>'motivo', coalesce((a->>'aproximado')::boolean, false)
from public.produtos p
cross join jsonb_array_elements(coalesce(p.anuncios,'[]'::jsonb)) a
left join public.contas c on c.id::text = a->>'conta_id';
