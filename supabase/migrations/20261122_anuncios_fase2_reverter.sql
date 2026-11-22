-- Fase 2 — REVERTER (só se for preciso voltar à app da fase 1; publicar antes a versão anterior).
--
-- 1. Reconstrói produtos.anuncios (o histórico que a app antiga lê) a partir da tabela anuncios,
--    para não se perder o que se registou durante a fase 2. A app antiga só conhece um anúncio aberto
--    por produto: fica aberto o principal (Vinted, senão o mais recente); os outros entram fechados
--    com o motivo "outro".
-- 2. Repõe o gatilho de espelho da fase 1.

with ord as (
  select a.*,
         row_number() over (partition by a.produto_id, (a.fim is null)
                            order by (a.plataforma = 'vinted') desc, a.inicio desc) as n
  from public.anuncios a
)
update public.produtos p set anuncios = coalesce((
  select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'inicio', o.inicio,
           'fim', case when o.fim is null and o.n > 1 then now() else o.fim end,
           'motivo', case when o.fim is null and o.n > 1 then 'outro' else o.motivo end,
           'conta_id', o.conta_id, 'preco', o.preco, 'precos', o.precos,
           'aproximado', case when o.aproximado then true end)) order by o.inicio)
  from ord o where o.produto_id = p.id), '[]'::jsonb);

create or replace function public.espelhar_anuncios() returns trigger
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
drop trigger if exists espelhar_anuncios on public.produtos;
create trigger espelhar_anuncios after insert or update of anuncios
  on public.produtos for each row execute function public.espelhar_anuncios();
