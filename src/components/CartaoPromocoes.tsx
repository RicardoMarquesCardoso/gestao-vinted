// Cartão "Promoções" do Painel: as listas de promoções recebidas automaticamente de outra app
// (lib/promocoes.ts) que ainda não foram vistas, com quantos sets compensam em cada uma.
// Tocar numa promoção abre o Vale a pena? → Promoção da loja já preenchido; o ✕ dispensa-a.
// Só aparece quando há promoções novas (o catálogo e os dados de mercado só se carregam então).

import { useMemo } from 'react';
import { avaliarPromocao } from '../lib/avaliar';
import { fmtDataHora, fmtEuro, hoje, plural } from '../lib/format';
import { useMercado } from '../lib/investimento';
import { CHAVE_PROMOCOES_VISTAS, descontoDe, promocoesNovas, promocoesVistas, setsDaPromocao } from '../lib/promocoes';
import type { Promocao } from '../lib/promocoes';
import { navegar } from '../router';
import { useDados } from '../state';
import { useCatalogoSets } from './catalogo';
import { Cartao } from './ui';

export function CartaoPromocoes() {
  const { dados } = useDados();
  const novas = promocoesNovas(dados.definicoes, hoje());
  if (!novas.length) return null;
  return <ListaPromocoes novas={novas} />;
}

function ListaPromocoes({ novas }: { novas: Promocao[] }) {
  const { dados, guardar } = useDados();
  const mercado = useMercado();
  const catalogo = useCatalogoSets();
  const h = hoje();
  // Para cada promoção: quantos sets compensam e quanto custam (usa o eBay do dia, não o ao vivo)
  const resumo = useMemo(
    () =>
      novas.map((p) => {
        const { sets, precos, descontos, pvps } = setsDaPromocao(p, (n) => !!mercado?.brickset[n] || !!catalogo(n));
        const linhas = mercado ? avaliarPromocao(sets, descontoDe(p), { dados, mercado, hoje: h }, { tema: (n) => catalogo(n)?.tema, precos, descontos, pvps }) : [];
        const comprar = linhas.filter((l) => l.comprar > 0);
        return { p, sets: sets.length, comprar: comprar.length, total: comprar.reduce((a, l) => a + l.comprar * (l.preco ?? 0), 0), pronto: !!mercado };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [novas, dados, mercado, h, catalogo.carregado],
  );

  async function dispensar(id: string) {
    await guardar('definicoes', [{ chave: CHAVE_PROMOCOES_VISTAS, valor: [...promocoesVistas(dados.definicoes), id].slice(-100) }]);
  }

  return (
    <Cartao titulo="Promoções">
      <ul className="lista-simples">
        {resumo.map(({ p, sets, comprar, total, pronto }) => (
          <li key={p.id} className="promo-linha">
            <button className="linha-botao" onClick={() => navegar(`/avaliar/promo/${p.id}`)}>
              <span className="linha-principal">
                <strong>{p.loja}</strong>
                <small className="mudo">
                  {fmtDataHora(p.recebida)}
                  {p.desconto ? ` · ${p.desconto}%` : ''} · {plural(sets, 'set', 'sets')}
                </small>
              </span>
              <span className="linha-direita">
                {!pronto ? '…' : comprar ? <strong>{`${plural(comprar, 'compensa', 'compensam')} · ${fmtEuro(total)}`}</strong> : <span className="mudo">nenhum compensa</span>}
              </span>
            </button>
            <button className="btn-icone" aria-label="Dispensar" title="Dispensar" onClick={() => dispensar(p.id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
