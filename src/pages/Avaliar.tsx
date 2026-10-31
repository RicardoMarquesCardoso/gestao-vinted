// Ecrã "Vale a pena?", com dois modos:
//   - "Um set": até que preço compensa comprar um set, e quantas unidades (este ficheiro);
//   - "Promoção da loja": X% de desconto sobre o PVP numa lista de sets (components/AvaliarPromocao.tsx).
//
// Um set: escreve-se só o n.º do set e aparece o detalhe (components/DetalheSet.tsx). A app:
//   1. mostra o set (nome e imagem do catálogo, lançamento, retirada e PVP);
//   2. pergunta ao eBay os preços desse set NO MOMENTO (função ebay-set no Supabase, API oficial);
//   3. calcula com lib/avaliar.ts (precosCompra) por quanto se vende, em quantos dias, e os
//      preços de compra por escalão (bom / muito bom / oportunidade rara) com as unidades a
//      comprar em cada um, a diversificar: 1 por defeito, mais só em oportunidades raras, e nunca
//      mais de 10% do dinheiro em stock num só set;
//   4. dá links para ver o set na Vinted e nos vendidos do eBay (abertos por nós, à mão).
//
// "Acompanhar" guarda o set em definicoes.sets_avaliar: a tarefa diária passa a ir buscar o eBay
// dele, mesmo sem o termos em stock (útil enquanto a função ao vivo não tiver as chaves).

import { useState } from 'react';
import { AvaliarPromocao } from '../components/AvaliarPromocao';
import { DetalheSet } from '../components/DetalheSet';

const SET_VALIDO = /^\d{3,7}(-\d+)?$/;

/** rota: "/avaliar", ou "/avaliar/promo/<id>" para abrir uma promoção recebida (vinda do Painel). */
export function Avaliar({ rota = '/avaliar' }: { rota?: string }) {
  const idPromo = rota.match(/^\/avaliar\/promo\/([\w-]+)/)?.[1];
  const [modo, setModo] = useState<'set' | 'promo'>(idPromo ? 'promo' : 'set');
  return (
    <div className="pagina">
      <h1>Vale a pena?</h1>
      <div className="segmentos" role="radiogroup" aria-label="Modo">
        <button role="radio" aria-checked={modo === 'set'} className={modo === 'set' ? 'ativo' : ''} onClick={() => setModo('set')}>Um set</button>
        <button role="radio" aria-checked={modo === 'promo'} className={modo === 'promo' ? 'ativo' : ''} onClick={() => setModo('promo')}>Promoção da loja</button>
      </div>
      {modo === 'set' ? <UmSet /> : <AvaliarPromocao idInicial={idPromo} />}
    </div>
  );
}

function UmSet() {
  const [set, setSet] = useState('');
  const n = set.trim();
  return (
    <>
      <p className="nota">Escreve o n.º do set para ver até que preço compensa comprá-lo, e quantas unidades.</p>

      <label className="campo avaliar-campo">
        <span className="campo-rotulo">N.º do set</span>
        <input inputMode="numeric" value={set} onChange={(e) => setSet(e.target.value.replace(/[^\d-]/g, ''))} placeholder="ex.: 75321" />
      </label>

      {SET_VALIDO.test(n) && <DetalheSet set={n} />}
    </>
  );
}
