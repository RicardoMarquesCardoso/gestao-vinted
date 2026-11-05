// Gráficos simples feitos à mão com HTML/CSS (sem bibliotecas), para as Análises.
// Tocar numa barra mostra o valor exato.

import { useState } from 'react';
import { fmtEuro, fmtMes } from '../lib/format';

/** Gráfico de barras verticais (uma série), com valores negativos abaixo da linha de base. */
export function BarrasMensais(props: {
  dados: { mes: string; valor: number }[];
  nome: string;
  /** Texto de cada barra (por defeito "out 26"); ex.: semanas "26/10". */
  rotulo?: (k: string) => string;
  /** Como mostrar o valor (por defeito em euros); ex.: "8 vendas". */
  formatar?: (v: number, k: string) => string;
}) {
  const rotulo = props.rotulo ?? fmtMes;
  const formatar = props.formatar ?? ((v: number) => fmtEuro(v));
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
        <span className="mudo">{rotulo(d.mes)}</span>
        <strong className={d.valor < 0 ? 'negativo' : ''}>{formatar(d.valor, d.mes)}</strong>
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
              aria-label={`${rotulo(x.mes)}: ${formatar(x.valor, x.mes)}`}
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
            {props.dados.length > 8 && i % Math.ceil(props.dados.length / 8) && i !== destaque ? '' : rotulo(x.mes)}
          </span>
        ))}
      </div>
    </figure>
  );
}

/**
 * Vendas por semana (pedido do Ricardo): em cada semana, duas barras lado a lado na mesma escala
 * em euros. A primeira é o recebido, com a parte de baixo noutra cor = o lucro (o lucro é uma parte
 * do recebido); a segunda, vermelha, são os gastos em compras nessa semana. Tocar numa semana mostra
 * os números por cima. Por defeito mostra a última semana.
 */
export function BarrasSemanas(props: { dados: { semana: string; vendas: number; receita: number; lucro: number; gasto: number }[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  if (!props.dados.length) return <p className="mudo">Sem dados no período.</p>;
  const max = Math.max(...props.dados.map((d) => Math.max(d.receita, d.gasto)), 1);
  const destaque = ativo ?? props.dados.length - 1;
  const d = props.dados[destaque];
  const rotulo = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
  const alt = (v: number) => `${(Math.max(v, 0) / max) * 100}%`;
  const passo = Math.ceil(props.dados.length / 8);
  return (
    <figure className="grafico" aria-label="Vendas por semana">
      <div className="grafico-leitura grafico-leitura-semana">
        <span className="mudo">{rotulo(d.semana)}</span>
        <strong>{d.vendas === 1 ? '1 venda' : `${d.vendas} vendas`}</strong>
        <span>
          <i className="legenda legenda-receita" /> {fmtEuro(d.receita)}
        </span>
        <span className={d.lucro < 0 ? 'negativo' : ''}>
          <i className="legenda legenda-lucro" /> lucro {fmtEuro(d.lucro)}
        </span>
        <span>
          <i className="legenda legenda-gasto" /> gastos {fmtEuro(d.gasto)}
        </span>
      </div>
      <div className="grafico-area" onMouseLeave={() => setAtivo(null)}>
        {props.dados.map((x, i) => (
          <button
            key={x.semana}
            className={`grafico-coluna grafico-semana ${i === destaque ? 'ativa' : ''}`}
            onMouseEnter={() => setAtivo(i)}
            onFocus={() => setAtivo(i)}
            onClick={() => setAtivo(i)}
            aria-label={`${rotulo(x.semana)}: ${x.vendas} vendas, recebido ${fmtEuro(x.receita)}, lucro ${fmtEuro(x.lucro)}, gastos ${fmtEuro(x.gasto)}`}
          >
            <span className="barra-par">
              <span className="barra-receita" style={{ height: alt(x.receita) }}>
                <span className="barra-lucro" style={{ height: x.receita > 0 ? `${(Math.max(Math.min(x.lucro, x.receita), 0) / x.receita) * 100}%` : 0 }} />
              </span>
              <span className="barra-gasto" style={{ height: alt(x.gasto) }} />
            </span>
          </button>
        ))}
      </div>
      <div className="grafico-eixo grafico-eixo-livre">
        {props.dados.map((x, i) => (
          <span key={x.semana} className={i === destaque ? 'ativa' : ''}>
            {props.dados.length > 8 && i % passo && i !== destaque ? '' : rotulo(x.semana)}
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

/**
 * Gráfico de pontos (dispersão) em SVG: um ponto por categoria, com x e y numéricos e o tamanho
 * a mostrar o peso (ex.: n.º de vendas). Só os maiores levam o nome escrito ao lado; tocar ou
 * passar o rato num ponto mostra os números todos. Usado em "Rentabilidade vs. tempo".
 */
export function Dispersao(props: {
  pontos: { nome: string; x: number; y: number; peso: number; detalhe: string }[];
  rotuloX: string;
  rotuloY: string;
  fmtX(v: number): string;
  fmtY(v: number): string;
}) {
  const [ativo, setAtivo] = useState<string | null>(null);
  if (!props.pontos.length) return <p className="mudo">Sem dados no período.</p>;
  const L = 300, A = 190, mE = 30, mB = 16, mT = 12, mD = 12; // largura, altura e margens
  const xs = props.pontos.map((p) => p.x);
  const ys = props.pontos.map((p) => p.y);
  const passo = (max: number) => { const e = 10 ** Math.floor(Math.log10(max || 1)); return [1, 2, 5, 10].map((k) => k * e).find((k) => max / k <= 5)!; };
  // Os eixos acabam numa marca redonda logo acima do maior valor
  const xBruto = Math.max(...xs) * 1.05 || 1;
  const sx = passo(xBruto);
  const xMax = Math.ceil(xBruto / sx) * sx;
  const yBrutoMin = Math.min(0, ...ys) * 1.05;
  const yBrutoMax = Math.max(...ys, 0) * 1.05 || 1;
  const sy = passo(yBrutoMax - yBrutoMin);
  const yMin = Math.floor(yBrutoMin / sy) * sy;
  const yMax = Math.ceil(yBrutoMax / sy) * sy;
  const px = (x: number) => mE + (x / xMax) * (L - mE - mD);
  const py = (y: number) => mT + (1 - (y - yMin) / (yMax - yMin)) * (A - mT - mB);
  const pesoMax = Math.max(...props.pontos.map((p) => p.peso), 1);
  const raio = (w: number) => 4 + Math.sqrt(w / pesoMax) * 9;
  const ticksX = Array.from({ length: Math.round(xMax / sx) + 1 }, (_, i) => i * sx);
  const ticksY = Array.from({ length: Math.round((yMax - yMin) / sy) + 1 }, (_, i) => yMin + i * sy);
  // Nomes escritos só nos 3 com mais peso (o resto no toque)
  const comNome = new Set([...props.pontos].sort((a, b) => b.peso - a.peso).slice(0, 3).map((p) => p.nome));
  const sel = props.pontos.find((p) => p.nome === ativo);
  return (
    <figure className="grafico dispersao">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`${props.rotuloY} por ${props.rotuloX}`} onMouseLeave={() => setAtivo(null)}>
        {ticksY.map((v) => (
          <g key={`y${v}`}>
            <line x1={mE} x2={L - mD} y1={py(v)} y2={py(v)} className={v === 0 ? 'eixo-zero' : 'grelha'} />
            <text x={mE - 5} y={py(v) + 3} className="eixo-texto" textAnchor="end">{props.fmtY(v)}</text>
          </g>
        ))}
        {ticksX.map((v) => (
          <text key={`x${v}`} x={px(v)} y={A - 3} className="eixo-texto" textAnchor="middle">{props.fmtX(v)}</text>
        ))}
        {[...props.pontos].sort((a, b) => b.peso - a.peso).map((p) => (
          <g key={p.nome} className={`ponto ${ativo === p.nome ? 'ativo' : ''}`} onMouseEnter={() => setAtivo(p.nome)} onClick={() => setAtivo(p.nome)}>
            <circle cx={px(p.x)} cy={py(p.y)} r={raio(p.peso) + 6} className="ponto-alvo" />
            <circle cx={px(p.x)} cy={py(p.y)} r={raio(p.peso)} className="ponto-marca" />
            {comNome.has(p.nome) && (
              // Perto da margem direita, o nome vai para a esquerda do ponto
              <text
                x={px(p.x) > L * 0.7 ? px(p.x) - raio(p.peso) - 3 : px(p.x) + raio(p.peso) + 3}
                y={py(p.y) + 3}
                textAnchor={px(p.x) > L * 0.7 ? 'end' : 'start'}
                className="ponto-nome"
              >
                {p.nome}
              </text>
            )}
          </g>
        ))}
      </svg>
      <figcaption className="dispersao-leitura">
        {sel ? (
          <>
            <strong>{sel.nome}</strong> · {props.fmtY(sel.y)} · {props.fmtX(sel.x)} <span className="mudo">· {sel.detalhe}</span>
          </>
        ) : (
          <span className="mudo">{props.rotuloY} (vertical) · {props.rotuloX} (horizontal) · tamanho = vendas</span>
        )}
      </figcaption>
    </figure>
  );
}
