// Função "ebay-set" (Supabase Edge Function): preços do eBay de UM set, pedidos no botão
// "Procurar no eBay" do detalhe do set (ecrã "Vale a pena?").
//
// Como funciona:
//   1. Confirma que quem pede tem sessão iniciada E é membro (função e_membro da base de dados,
//      chamada com o token de quem pede). Sem isso, recusa.
//   2. Pesquisa o eBay (../_shared/ebay.ts), com as chaves EBAY_CLIENT_ID / EBAY_CLIENT_SECRET
//      dos segredos das Edge Functions do Supabase (nunca no código nem na app).
//   3. Guarda o resultado em definicoes.ebay_pesquisas (função SQL registar_pesquisa_ebay, com o
//      token de quem pede), sem apagar as outras pesquisas.
//
// A regra dos 7 dias entre pesquisas do mesmo set é aplicada na app (o botão fica desativado).
// Resposta: { set, mediana, anuncios, lojas: {EBAY_DE: n, …} } ou { erro: 'sem_chaves' | … }.

import { chavesEbay, pesquisarSet, rpc } from '../_shared/ebay.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const auth = req.headers.get('authorization');
  const apikey = req.headers.get('apikey');
  if (!auth || !apikey) return responder({ erro: 'sem_permissao' }, 403);
  const quem = { Authorization: auth, apikey };
  const membro = await rpc('e_membro', {}, quem);
  if (!membro.ok || (await membro.json()) !== true) return responder({ erro: 'sem_permissao' }, 403);

  let set = '';
  try {
    set = String((await req.json()).set ?? '').trim().replace(/-\d+$/, '');
  } catch {
    /* corpo inválido */
  }
  if (!/^\d{3,7}$/.test(set)) return responder({ erro: 'set_invalido' }, 400);

  const chaves = chavesEbay();
  if (!chaves) return responder({ erro: 'sem_chaves' });

  try {
    const r = await pesquisarSet(set, chaves);
    const g = await rpc('registar_pesquisa_ebay', { p_set: set, p_mediana: r.mediana, p_anuncios: r.anuncios }, quem);
    return responder({ ...r, guardada: g.ok });
  } catch (e) {
    return responder({ erro: 'ebay', detalhe: e instanceof Error ? e.message : String(e) }, 502);
  }
});
