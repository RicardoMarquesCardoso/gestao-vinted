// Pesquisa da Wallapop de UM set LEGO (pedido do Ricardo, nov/2026): o "preço da concorrência".
//
// A Wallapop não tem API pública. Usa-se a mesma pesquisa que o próprio site pt.wallapop.com faz
// (sem login), com muito pouco volume: 1 set de cada vez, no máximo 1 pesquisa por set a cada
// 7 dias (função wallapop-rotacao). A resposta traz anúncios de Portugal e Espanha (quase todos
// com envio), com título e preço PEDIDO. Não há vendidos nem o estado do artigo.
//
// O que se faz com os anúncios (filtrarAnuncios, testada em tests/wallapop.test.ts):
//   1. Só os que têm o n.º do set no título (o teste de nov/2026 mostrou que sem isto entram
//      outros sets, réplicas e lotes).
//   2. Fora o "ruído": caixas vazias, suportes e molduras expositoras, instruções, kits de luzes,
//      peças/mods, minifiguras soltas, lotes e títulos com outro n.º de set.
//   3. Fora os que dizem ser usados, montados, sem caixa ou incompletos: a mediana é a de "novo",
//      tal como a do eBay.
//   4. Fora os preços estranhos: abaixo de 40% ou acima de 250% da mediana dos que sobram.
//   5. Mediana dos restantes (com menos de 3 não há mediana).
//
// Partilhado pela função wallapop-rotacao (Deno) e pelos testes (Node): só usa fetch.

/** Palavras de anúncios que não são o set completo (PT, ES, IT, FR, EN). */
const RUIDO =
  /\b(vazi[ao]s?|vac[ií][ao]s?|vuot[ao]|vide|empty|suportes?|soportes?|marcos?|molduras?|expositor\w*|peanas?|display|vitrine|stand|instru\w*|manua(?:l|is|les)|kits?|led|luz|luzes|luces|lights?|mods?|modifica\w*|pe[çc]as|piezas|pezzi|stickers?|pegatinas?|autocolantes?|figuras?|minifig\w*|r[ée]plicas?|compat[ií]ve(?:l|is)|compatibles?|lotes?|lots?|conjuntos de|sets|s[oó] a caixa|solo la caja)\b/i;

/** Palavras de anúncios de artigos usados (a mediana guardada é a de "novo"). */
const USADO = /\b(usad[oa]s?|montad[oa]s?|sem caixa|sin caja|incomplet[oa]s?|faltam?|sem instru\w*|segunda m[aã]o)\b/i;

export interface AnuncioWallapop {
  titulo: string;
  preco: number;
  pais?: string;
}

export interface ResultadoWallapop {
  set: string;
  mediana: number | null; // null com menos de 3 anúncios válidos
  anuncios: number; // válidos (depois dos filtros)
  total: number; // devolvidos pela pesquisa
}

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/** Os anúncios que são mesmo o set (novo), pelos passos 1 a 4 do topo. */
export function filtrarAnuncios(set: string, anuncios: AnuncioWallapop[]): AnuncioWallapop[] {
  const n = set.trim().replace(/-\d+$/, '');
  const comNumero = new RegExp(`(?<!\\d)${n}(?!\\d)`);
  const outroSet = /(?<![\d.,])\d{4,6}(?![\d.,])/g;
  const bons = anuncios.filter((a) => {
    const t = a.titulo ?? '';
    if (!(a.preco > 0) || !comNumero.test(t)) return false;
    if (RUIDO.test(t) || USADO.test(t)) return false;
    // Outro n.º de set no título (lotes "77259 e 77260", mods "P67701 P76924"…)
    return (t.match(outroSet) ?? []).every((x) => x === n);
  });
  if (bons.length < 3) return bons;
  const m = mediana(bons.map((a) => a.preco));
  return bons.filter((a) => a.preco >= m * 0.4 && a.preco <= m * 2.5);
}

/** Mediana do preço pedido dos anúncios válidos. */
export function resumir(set: string, anuncios: AnuncioWallapop[]): ResultadoWallapop {
  const bons = filtrarAnuncios(set, anuncios);
  return {
    set,
    mediana: bons.length >= 3 ? Math.round(mediana(bons.map((a) => a.preco)) * 100) / 100 : null,
    anuncios: bons.length,
    total: anuncios.length,
  };
}

/**
 * Pesquisa "lego <set>" na Wallapop (uma página, até ~40 anúncios, chega para a mediana).
 * Lança um erro se a Wallapop recusar o pedido, para a rotação não guardar um resultado vazio.
 */
export async function pesquisarWallapop(set: string): Promise<ResultadoWallapop> {
  const q = new URLSearchParams({
    keywords: `lego ${set}`,
    source: 'search_box',
    // Lisboa: a pesquisa precisa de um ponto de partida; os resultados incluem PT e ES
    latitude: '38.7223',
    longitude: '-9.1393',
    order_by: 'most_relevance',
  });
  const r = await fetch(`https://api.wallapop.com/api/v3/search?${q}`, {
    headers: { Accept: 'application/json', 'Accept-Language': 'pt-PT,pt;q=0.9,es;q=0.8', 'X-DeviceOS': '0' },
  });
  if (!r.ok) throw new Error(`Wallapop recusou (HTTP ${r.status})`);
  const j = await r.json();
  const itens = j?.data?.section?.payload?.items ?? [];
  const anuncios: AnuncioWallapop[] = itens.map((i: { title?: string; price?: { amount?: number; currency?: string }; location?: { country_code?: string } }) => ({
    titulo: String(i.title ?? ''),
    preco: i.price?.currency === 'EUR' ? Number(i.price?.amount) : NaN,
    pais: i.location?.country_code,
  }));
  return resumir(set, anuncios);
}
