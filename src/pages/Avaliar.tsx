// Ecrã "Vale a pena?": até que preço compensa comprar, numa loja ou um set em concreto.
//
// Tudo num só ecrã (pedido do Ricardo, nov/2026; antes havia os separadores "Um set" e "Promoção
// da loja"). No topo, numa linha: a loja, procurar um set e o desconto. O trabalho está em
// components/AvaliarPromocao.tsx; o detalhe de um set em components/DetalheSet.tsx, que:
//   1. mostra o set (nome e imagem do catálogo, lançamento, retirada e PVP);
//   2. usa o eBay desse set se já foi procurado (botão "Procurar no eBay", função ebay-set no
//      Supabase, API oficial; no máximo uma vez por set a cada 7 dias) ou se está na tarefa diária;
//   3. calcula com lib/avaliar.ts (precosCompra) por quanto se vende, em quantos dias, e os
//      preços de compra por escalão (bom / muito bom / oportunidade rara) com as unidades a
//      comprar em cada um, a diversificar: 1 por defeito, mais só em oportunidades raras, e nunca
//      mais de 10% do dinheiro em stock num só set;
//   4. dá links para ver o set na Vinted e nos vendidos do eBay (abertos por nós, à mão).

import { AvaliarPromocao } from '../components/AvaliarPromocao';

/** rota: "/avaliar", ou "/avaliar/promo/<id>" para abrir uma promoção recebida (vinda do Painel). */
export function Avaliar({ rota = '/avaliar' }: { rota?: string }) {
  const idPromo = rota.match(/^\/avaliar\/promo\/([\w-]+)/)?.[1];
  return (
    <div className="pagina">
      <h1>Vale a pena?</h1>
      <AvaliarPromocao idInicial={idPromo} />
    </div>
  );
}
