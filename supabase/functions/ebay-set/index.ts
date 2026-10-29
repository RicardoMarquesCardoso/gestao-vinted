// Função "ebay-set" (Supabase Edge Function): preços do eBay de UM set, pedidos no momento.
//
// Para que serve: no ecrã "Vale a pena?" escreve-se o n.º de um set que talvez nunca tivemos.
// Os dados do dia (mercado-sets.json) só têm os nossos sets, por isso a app pergunta aqui.
//
// Como funciona:
//   1. Confirma que quem pede tem sessão iniciada E é membro (função e_membro da base de dados,
//      chamada com o token de quem pede). Sem isso, recusa.
//   2. Pede ao eBay um token de aplicação com as chaves EBAY_CLIENT_ID / EBAY_CLIENT_SECRET, que
//      ficam nos segredos das Edge Functions do Supabase (nunca no código nem na app).
//   3. Pesquisa anúncios de "novo", a preço fixo, nas lojas eBay DE/FR/ES/IT, tal como a tarefa
//      diária (scripts/mercado.py): só anúncios com o n.º do set no título e que não sejam partes.
//   4. Devolve a mediana do preço PEDIDO (sem os 10% mais baratos e mais caros) e o n.º de anúncios.
//
// É a API oficial do eBay (Browse API), por isso não há scraping.
// Resposta: { set, mediana, anuncios, lojas: {EBAY_DE: n, …} } ou { erro: 'sem_chaves' | … }.

const LOJAS = ['EBAY_DE', 'EBAY_FR', 'EBAY_ES', 'EBAY_IT'];
const CATEGORIA_SETS = '19006'; // "LEGO Complete Sets & Packs"
// Anúncios que não são o set completo (caixa vazia, só instruções, minifiguras, peças…)
const EXCLUIR =
  /\b(leer|empty|vide|vac[ií]a|vuot|ohne|sans|sin|senza|nur|only|anleitung|instructions?|notice|minifig\w*|figur\w*|teile|parts|pi[eè]ces|piezas|pezzi|sticker|aufkleber|poster|box only)\b/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (corpo: unknown, estado = 200) =>
  new Response(JSON.stringify(corpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

// O token do eBay dura ~2 horas: guarda-se enquanto a função estiver "acordada"
let tokenEbay: { valor: string; ate: number } | null = null;

async function pedirTokenEbay(id: string, segredo: string): Promise<string> {
  if (tokenEbay && tokenEbay.ate > Date.now()) return tokenEbay.valor;
  const r = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${id}:${segredo}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' }),
  });
  if (!r.ok) throw new Error(`eBay recusou as chaves (HTTP ${r.status})`);
  const j = await r.json();
  tokenEbay = { valor: j.access_token, ate: Date.now() + (Number(j.expires_in) - 120) * 1000 };
  return tokenEbay.valor;
}

/** Quem pede é membro? Pergunta à base de dados com o token de quem pede. */
async function eMembro(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization');
  const apikey = req.headers.get('apikey');
  if (!auth || !apikey) return false;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/e_membro`, {
    method: 'POST',
    headers: { Authorization: auth, apikey, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return r.ok && (await r.json()) === true;
}

const mediana = (xs: number[]) => {
  const n = xs.length;
  return n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!(await eMembro(req))) return responder({ erro: 'sem_permissao' }, 403);

  let set = '';
  try {
    set = String((await req.json()).set ?? '').trim().replace(/-\d+$/, '');
  } catch {
    /* corpo inválido */
  }
  if (!/^\d{3,7}$/.test(set)) return responder({ erro: 'set_invalido' }, 400);

  const id = Deno.env.get('EBAY_CLIENT_ID')?.trim();
  const segredo = Deno.env.get('EBAY_CLIENT_SECRET')?.trim();
  if (!id || !segredo) return responder({ erro: 'sem_chaves' });

  try {
    const token = await pedirTokenEbay(id, segredo);
    const lojas: Record<string, number> = {};
    const precos: number[] = [];
    // As 4 lojas ao mesmo tempo, para responder depressa
    await Promise.all(
      LOJAS.map(async (loja) => {
        const q = new URLSearchParams({
          q: `lego ${set}`,
          category_ids: CATEGORIA_SETS,
          filter: 'conditionIds:{1000},buyingOptions:{FIXED_PRICE},priceCurrency:EUR', // 1000 = novo
          limit: '50',
        });
        const r = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${q}`, {
          headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': loja },
        });
        if (!r.ok) return;
        const j = await r.json();
        let n = 0;
        for (const item of j.itemSummaries ?? []) {
          const titulo: string = item.title ?? '';
          const preco = item.price ?? {};
          if (!new RegExp(`(?<!\\d)${set}(?!\\d)`).test(titulo) || EXCLUIR.test(titulo)) continue;
          if (preco.currency === 'EUR' && Number(preco.value) > 0) {
            precos.push(Number(preco.value));
            n++;
          }
        }
        lojas[loja] = n;
      }),
    );
    if (precos.length < 3) return responder({ set, mediana: null, anuncios: precos.length, lojas });
    // Cortar os 10% mais baratos e mais caros (anúncios estranhos) antes da mediana
    precos.sort((a, b) => a - b);
    const corte = Math.floor(precos.length / 10);
    const uteis = precos.slice(corte, precos.length - corte);
    return responder({ set, mediana: Math.round(mediana(uteis.length ? uteis : precos) * 100) / 100, anuncios: precos.length, lojas });
  } catch (e) {
    return responder({ erro: 'ebay', detalhe: e instanceof Error ? e.message : String(e) }, 502);
  }
});
