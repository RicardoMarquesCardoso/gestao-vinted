-- Fase 2 — troca (correr LOGO A SEGUIR a publicar a app da fase 2).
--
-- A partir daqui a tabela anuncios é a única fonte da verdade e a app deixa de gravar
-- produtos.anuncios (jsonb). O gatilho da fase 1 copiava o jsonb para a tabela; se ficasse ligado,
-- uma gravação feita por uma app antiga ainda aberta APAGAVA os anúncios novos desse produto.
-- produtos.anuncios fica congelado como cópia antiga até à fase 3.
--
-- Reverter: supabase/migrations/20261122_anuncios_fase2_reverter.sql (e publicar a versão anterior).

drop trigger if exists espelhar_anuncios on public.produtos;
drop function if exists public.espelhar_anuncios();
