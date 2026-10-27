// Gráficos simples feitos à mão com HTML/CSS (sem bibliotecas), para as Análises.
// Tocar numa barra mostra o valor exato.

import { useState } from 'react';
import { fmtEuro, fmtMes } from '../lib/format';

/** Gráfico de barras verticais (uma série), com valores negativos abaixo da linha de base. */
export function BarrasMensais(props: { dados: { mes: string; valor: number }[]; nome: string }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  if (!props.dados.length) return <p className="mudo">Sem dados no período.</p>;
  const max = Math.max(...props.dados.map((d) => d.valor), 0);
  const min = Math.min(...props.dados.map((d) => d.valor), 0);
  const amplitude = max - min || 1;
  const zero = (max / amplitude) * 100; // posição da linha de base, em % a partir do topo
  const destaque = ativo ?? props.dados.length - 1;
  const d = props.dados[destaque];

  return (
    <figure className="grafico" aria-label={props.nome}>
      <div className="grafico-leitura">
        <span className="mudo">{fmtMes(d.mes)}</span>
        <strong className={d.valor < 0 ? 'negativo' : ''}>{fmtEuro(d.valor)}</strong>
      </div>
      <div className="grafico-area" onMouseLeave={() => setAtivo(null)}>
        <div className="grafico-zero" style={{ top: `${zero}%` }} />
        {props.dados.map((x, i) => {
          const altura = (Math.abs(x.valor) / amplitude) * 100;
          return (
            <button
              key={x.mes}
              className={`grafico-coluna ${i === destaque ? 'ativa' : ''}`}
              onMouseEnter={() => setAtivo(i)}
              onFocus={() => setAtivo(i)}
              onClick={() => setAtivo(i)}
              aria-label={`${fmtMes(x.mes)}: ${fmtEuro(x.valor)}`}
            >
              <span
                className={`grafico-barra ${x.valor < 0 ? 'neg' : ''}`}
                style={x.valor >= 0 ? { bottom: `${100 - zero}%`, height: `${altura}%` } : { top: `${zero}%`, height: `${altura}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="grafico-eixo">
        {props.dados.map((x, i) => (
          <span key={x.mes} className={i === destaque ? 'ativa' : ''}>
            {props.dados.length > 8 && i % 2 && i !== destaque ? '' : fmtMes(x.mes)}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Barras horizontais para comparar categorias (contas, pessoas…). */
export function BarrasHorizontais(props: { linhas: { nome: string; valor: number; detalhe?: string }[] }) {
  if (!props.linhas.length) return <p className="mudo">Sem dados no período.</p>;
  const max = Math.max(...props.linhas.map((l) => Math.abs(l.valor)), 1);
  return (
    <div className="barras-h">
      {props.linhas.map((l) => (
        <div key={l.nome} className="barra-h" title={`${l.nome}: ${fmtEuro(l.valor)}`}>
          <div className="barra-h-topo">
            <span>{l.nome}</span>
            <span>
              <strong className={l.valor < 0 ? 'negativo' : ''}>{fmtEuro(l.valor)}</strong>
              {l.detalhe && <span className="mudo"> · {l.detalhe}</span>}
            </span>
          </div>
          <div className="barra-h-trilho">
            <div className={l.valor < 0 ? 'neg' : ''} style={{ width: `${(Math.abs(l.valor) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
