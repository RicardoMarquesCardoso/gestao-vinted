// Ecrã "Produtos": stock e vendidos num só sítio, com os filtros Por anunciar / Anunciados /
// Vendidos, pesquisa com sugestões (produtos e categorias/subcategorias) e ordenação.
//
// Produtos iguais (mesmo n.º de set ou mesmo nome) aparecem agrupados num só cartão com o
// custo médio; tocar abre o grupo com cada unidade.

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAbrir } from '../components/acoes';
import { CabecalhoProdutos } from '../components/CabecalhoProdutos';
import { SinalProduto, useContextoPlano, useSinais } from '../components/planos';
import { URGENCIA } from '../lib/plano';
import { PesquisaProdutos, naCategoria, normalizar } from '../components/PesquisaProdutos';
import type { FiltroCategoria } from '../components/PesquisaProdutos';
import type { VerProdutos } from '../components/CabecalhoProdutos';
import { Foto, ImagemReferencia, Valor, Vazio, iconeMarca, useImagemReferencia } from '../components/ui';
import { chaveComparacao, custoTotalProduto, custoUnitario, emInventario, liquidoVenda, lucroVenda, unidadesDisponiveis, vendaValida } from '../lib/calc';
import { diasAnunciado } from '../lib/anuncios';
import { descarregar, paraCsv } from '../lib/csv';
import { fmtData, fmtEuro, hoje, plural } from '../lib/format';
import type { Produto, Venda } from '../lib/types';
import { ESTADOS_PRODUTO } from '../lib/types';
import { useDados } from '../state';

type Ordem = 'recentes' | 'antigos' | 'nome' | 'custo';

export function Inventario({ inicial = 'por_vender' }: { inicial?: 'por_vender' | 'vendidos' }) {
  const { dados, nomeConta, nomePagador } = useDados();
  const abrir = useAbrir();
  const [texto, setTexto] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<FiltroCategoria | null>(null);
  const [verOutros, setVerOutros] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>('recentes');
  const [aberto, setAberto] = useState<string | null>(null);
  const [ver, setVer] = useState<VerProdutos>({ porAnunciar: inicial === 'por_vender', anunciados: inicial === 'por_vender', vendidos: inicial === 'vendidos' });

  // Vendas válidas de cada produto (a mais recente primeiro)
  const vendasDe = useMemo(() => {
    const m = new Map<string, Venda[]>();
    for (const v of dados.vendas) if (vendaValida(v)) m.set(v.produto_id, [...(m.get(v.produto_id) ?? []), v]);
    for (const l of m.values()) l.sort((a, b) => b.data_venda.localeCompare(a.data_venda));
    return m;
  }, [dados.vendas]);
  const h = hoje();
  const ctxPlano = useContextoPlano();
  // Bolinha tipo semáforo + próxima ação de cada produto (ver sinais() em lib/plano.ts)
  const sinaisP = useSinais(ctxPlano);
  const vendido = (p: Produto) => vendasDe.has(p.id);
  const contagens = useMemo(
    () => ({
      porAnunciar: dados.produtos.filter((p) => p.estado === 'por_anunciar').length,
      anunciados: dados.produtos.filter((p) => p.estado === 'anunciado').length,
      vendidos: dados.produtos.filter(vendido).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados.produtos, vendasDe],
  );

  // Produtos que os filtros de estado deixam ver (antes da pesquisa); também alimentam as sugestões
  const visiveis = useMemo(
    () =>
      dados.produtos.filter(
        (p) =>
          (ver.porAnunciar && p.estado === 'por_anunciar') || (ver.anunciados && p.estado === 'anunciado') || (ver.vendidos && vendido(p)) || (verOutros && (p.estado === 'cancelado' || p.estado === 'devolvido')),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados.produtos, ver, verOutros, vendasDe],
  );

  const lista = useMemo(() => {
    // Pesquisa sem ligar a maiúsculas nem acentos, mais o filtro de categoria escolhido nas sugestões
    const t = normalizar(texto);
    const r = visiveis.filter(
      (p) =>
        naCategoria(p, categoriaFiltro) &&
        (!t ||
          [p.nome, p.set_numero, p.tema, p.marca, p.condicao, p.notas, p.conta_id ? nomeConta(p.conta_id) : '', nomePagador(p)].some((x) =>
            normalizar(x).includes(t),
          )),
    );
    // Data da última atividade: a venda mais recente (se estiver a ver vendidos) ou a compra
    const data = (p: Produto) => (ver.vendidos ? vendasDe.get(p.id)?.[0]?.data_venda : undefined) || p.data_compra || p.criado_em || '';
    return r.sort((a, b) =>
      ordem === 'nome'
        ? a.nome.localeCompare(b.nome)
        : ordem === 'custo'
          ? custoTotalProduto(b) - custoTotalProduto(a)
          : ordem === 'antigos'
            ? data(a).localeCompare(data(b))
            : data(b).localeCompare(data(a)),
    );
  }, [visiveis, texto, categoriaFiltro, ordem, nomeConta, nomePagador, ver, vendasDe]);

  // Produtos iguais (mesmo n.º de set ou, sem set, mesmo nome) ficam num só grupo
  const grupos = useMemo(() => {
    const m = new Map<string, Produto[]>();
    for (const p of lista) {
      const k = chaveComparacao(p);
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    const r = [...m.entries()].map(([chave, itens]) => {
      const unidadesG = itens.reduce((a, p) => a + (emInventario(p) ? unidadesDisponiveis(p, dados.vendas) : p.quantidade), 0);
      const custos = itens.flatMap((p) => Array(Math.max(emInventario(p) ? unidadesDisponiveis(p, dados.vendas) : p.quantidade, 1)).fill(custoUnitario(p)) as number[]);
      const media = custos.reduce((a, b) => a + b, 0) / Math.max(custos.length, 1);
      return { chave, itens, unidades: unidadesG, media, min: Math.min(...custos), max: Math.max(...custos) };
    });
    if (ordem === 'custo') r.sort((a, b) => b.media - a.media);
    return r;
  }, [lista, dados.vendas, ordem]);

  const outros = dados.produtos.filter((p) => p.estado === 'cancelado' || p.estado === 'devolvido').length;
  const lucroDe = (p: Produto) => (vendasDe.get(p.id) ?? []).reduce((a, v) => a + lucroVenda(v, p), 0);

  function exportar() {
    descarregar(
      `produtos-${h}.csv`,
      paraCsv(lista, [
        { titulo: 'Nome', valor: (p) => p.nome },
        { titulo: 'N.º set', valor: (p) => p.set_numero },
        { titulo: 'Marca', valor: (p) => p.marca },
        { titulo: 'Tema', valor: (p) => p.tema },
        { titulo: 'Condição', valor: (p) => p.condicao },
        { titulo: 'Estado', valor: (p) => ESTADOS_PRODUTO.find((e) => e.valor === p.estado)?.nome },
        { titulo: 'Quantidade', valor: (p) => p.quantidade },
        { titulo: 'Disponíveis', valor: (p) => unidadesDisponiveis(p, dados.vendas) },
        { titulo: 'Data de compra', valor: (p) => p.data_compra },
        { titulo: 'Preço de compra', valor: (p) => p.preco_compra },
        { titulo: 'Custos adicionais', valor: (p) => p.custos_adicionais },
        { titulo: 'Custo total', valor: (p) => custoTotalProduto(p) },
        { titulo: 'Quem pagou', valor: (p) => nomePagador(p) },
        { titulo: 'Conta', valor: (p) => nomeConta(p.conta_id) },
        { titulo: 'Anunciado em', valor: (p) => p.data_anuncio },
        { titulo: 'Dias anunciado', valor: (p) => diasAnunciado(p, h) },
        { titulo: 'Preço anunciado', valor: (p) => p.preco_anuncio },
        { titulo: 'Data de venda', valor: (p) => vendasDe.get(p.id)?.[0]?.data_venda },
        { titulo: 'Conta da venda', valor: (p) => (vendasDe.get(p.id)?.[0] ? nomeConta(vendasDe.get(p.id)![0].conta_id) : null) },
        { titulo: 'Valor de venda (líquido)', valor: (p) => (vendasDe.get(p.id) ?? []).reduce((a, v) => a + liquidoVenda(v), 0) || null },
        { titulo: 'Lucro', valor: (p) => (vendasDe.has(p.id) ? Math.round(lucroDe(p) * 100) / 100 : null) },
        { titulo: 'Descrição', valor: (p) => p.descricao },
        { titulo: 'Notas', valor: (p) => p.notas },
      ]),
    );
  }

  function cartaoProduto(p: Produto) {
    const disp = unidadesDisponiveis(p, dados.vendas);
    return (
      <button className="produto" onClick={() => abrir({ tipo: 'detalhe', id: p.id })}>
        <ImagemProduto p={p} />
        <div className="produto-info">
          <div className="produto-nome">{p.nome}</div>
          {/* Só categoria e n.º do set; a retirada fica no detalhe do produto, para o cartão ficar limpo */}
          <div className="produto-meta">{[categoria(p), p.set_numero].filter(Boolean).join(' · ')}</div>
          <div className="produto-linha">
            {/* Uma só linha: bolinha de cor + próxima ação (e as unidades, se houver mais do que uma) */}
            <SinalProduto sinal={sinaisP.get(p.id)} />
            {disp > 1 && <span className="sinal-qtd">×{disp}</span>}
          </div>
          {vendasDe.has(p.id) && !emInventario(p) ? (
            <div className="produto-rodape">
              <span>
                {fmtEuro(vendasDe.get(p.id)!.reduce((a, v) => a + liquidoVenda(v), 0))} <Valor n={lucroDe(p)} sinal />
              </span>
              <span className="mudo">
                {[fmtData(vendasDe.get(p.id)![0].data_venda), nomeConta(vendasDe.get(p.id)![0].conta_id)].join(' · ')}
              </span>
            </div>
          ) : (
            <div className="produto-rodape">
              <span>{fmtEuro(custoTotalProduto(p))}</span>
              {/* Quem pagou fica só no detalhe do produto, para o cartão ficar mais limpo */}
              <span className="mudo">{p.conta_id ? nomeConta(p.conta_id) : ''}</span>
            </div>
          )}
        </div>
      </button>
    );
  }

  /** Uma unidade dentro de um grupo aberto. */
  function linhaProduto(p: Produto): ReactNode {
    const disp = unidadesDisponiveis(p, dados.vendas);
    return (
      <li key={p.id} className="grupo-linha">
        <button className="grupo-linha-info" onClick={() => abrir({ tipo: 'detalhe', id: p.id })}>
          <span className="linha-principal">
            <span className="truncar">
              {p.nome}
              {p.condicao ? <span className="mudo"> · {p.condicao}</span> : null}
            </span>
            <small className="mudo">
              {p.estado === 'vendido' && vendasDe.has(p.id) ? `vendido ${fmtData(vendasDe.get(p.id)![0].data_venda)} · ` : ''}
              {fmtData(p.data_compra)}
              {p.conta_id ? ` · ${nomeConta(p.conta_id)}` : ''}
              {p.notas ? ` · ${p.notas}` : ''}
            </small>
          </span>
          <span className="linha-direita">
            <SinalProduto sinal={sinaisP.get(p.id)} />
            {p.estado === 'vendido' && vendasDe.has(p.id) ? (
              <span className="coluna-valores">
                <strong>{fmtEuro(vendasDe.get(p.id)!.reduce((a, v) => a + liquidoVenda(v), 0))}</strong>
                <Valor n={lucroDe(p)} sinal />
              </span>
            ) : (
              <strong>{fmtEuro(custoUnitario(p))}</strong>
            )}
          </span>
        </button>
        {disp > 0 && (
          <button className="btn btn-pequeno btn-primario" onClick={() => abrir({ tipo: 'vendi', ids: [p.id] })}>
            Vendi
          </button>
        )}
      </li>
    );
  }

  return (
    <div className="pagina">
      <CabecalhoProdutos ver={ver} mudar={setVer} contagens={contagens} exportar={exportar} adicionar={() => abrir({ tipo: 'compra' })} />

      <div className="filtros-inv filtros-inv-1">
        <PesquisaProdutos texto={texto} mudarTexto={setTexto} categoria={categoriaFiltro} mudarCategoria={setCategoriaFiltro} produtos={visiveis} />
        <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">
          <option value="recentes">Mais recentes</option>
          <option value="antigos">Mais antigos</option>
          <option value="nome">Nome</option>
          <option value="custo">Maior custo</option>
        </select>
      </div>


      {lista.length === 0 ? (
        <Vazio titulo="Nenhum produto encontrado" texto="Experimenta mudar os filtros, ou regista uma compra." />
      ) : (
        <ul className="grelha-produtos">
          {grupos.map((g) =>
            g.itens.length === 1 ? (
              <li key={g.chave}>{cartaoProduto(g.itens[0])}</li>
            ) : (
              <GrupoProdutos
                key={g.chave}
                grupo={g}
                aberto={aberto === g.chave}
                alternar={() => setAberto((x) => (x === g.chave ? null : g.chave))}
                linha={linhaProduto}
                anunciar={(ids, retirar) => abrir({ tipo: 'anunciar', ids, retirar })}
                vendi={(ids) => abrir({ tipo: 'vendi', ids })}
                sinal={(() => {
                  // O grupo mostra o sinal da unidade mais urgente (vermelho > amarelo > azul > verde)
                  const lista = g.itens.map((x) => sinaisP.get(x.id)).filter((x): x is NonNullable<typeof x> => !!x);
                  const s = lista.sort((a, b) => URGENCIA[a.cor] - URGENCIA[b.cor])[0];
                  return <SinalProduto sinal={s} />;
                })()}
              />
            ),
          )}
        </ul>
      )}
      {outros > 0 && (
        <p className="ver-outros">
          <button className="link" onClick={() => setVerOutros((x) => !x)}>
            {verOutros ? 'Esconder' : 'Mostrar'} {plural(outros, 'produto cancelado ou devolvido', 'produtos cancelados ou devolvidos')}
          </button>
        </p>
      )}
    </div>
  );
}

/** Fotografia do produto, ou a imagem de referência (set LEGO / produto Pokémon), ou um ícone. */
function ImagemProduto({ p }: { p: Produto }) {
  const imagemReferencia = useImagemReferencia();
  return p.fotos[0] ? (
    <Foto refFoto={p.fotos[0]} alt="" className="produto-foto" />
  ) : (
    <ImagemReferencia
      url={imagemReferencia(p)}
      className="produto-foto produto-sem-foto"
      vazio={
        <span className="icone-marca">
          <span aria-hidden="true">{iconeMarca(p.marca)}</span>
          <small>{p.set_numero || p.marca || ''}</small>
        </span>
      }
    />
  );
}

interface Grupo {
  chave: string;
  itens: Produto[];
  unidades: number;
  media: number;
  min: number;
  max: number;
}

/** Cartão de um grupo de produtos iguais; aberto mostra cada unidade e ações para o grupo. */
function GrupoProdutos(props: { grupo: Grupo; aberto: boolean; alternar(): void; linha(p: Produto): ReactNode; anunciar(ids: string[], retirar?: boolean): void; vendi(ids: string[]): void; sinal?: ReactNode }) {
  const { grupo: g } = props;
  const p = g.itens[0];
  const nomes = new Set(g.itens.map((x) => x.nome.trim().toLowerCase()));
  return (
    <li className={props.aberto ? 'grupo-aberto' : ''}>
      <button className={`produto produto-grupo ${props.aberto ? 'ativo' : ''}`} onClick={props.alternar} aria-expanded={props.aberto}>
        <span className="grupo-pilha">
          <ImagemProduto p={p} />
          <span className="grupo-qtd">×{g.unidades}</span>
        </span>
        <div className="produto-info">
          <div className="produto-nome">{p.nome}{nomes.size > 1 ? ' e variantes' : ''}</div>
          <div className="produto-meta">{[categoria(p), p.set_numero].filter(Boolean).join(' · ')}</div>
          <div className="produto-linha">
            {props.sinal}
          </div>
          <div className="produto-rodape">
            <span>
              Média {fmtEuro(g.media)}
              {g.max - g.min > 0.004 && <span className="mudo"> ({fmtEuro(g.min)}–{fmtEuro(g.max)})</span>}
            </span>
            <span className="mudo" aria-hidden="true">{props.aberto ? '▴' : '▾'}</span>
          </div>
        </div>
      </button>
      {props.aberto && (
        <div className="grupo-painel">
          <div className="grupo-acoes">
            {g.itens.some((x) => x.estado === 'por_anunciar' || x.estado === 'anunciado') && (
              <button className="btn btn-pequeno btn-primario" onClick={() => props.vendi(g.itens.map((x) => x.id))}>
                Vendi
              </button>
            )}
            {g.itens.some((x) => x.estado === 'por_anunciar') && (
              <button className="btn btn-pequeno" onClick={() => props.anunciar(g.itens.map((x) => x.id))}>
                Anunciar
              </button>
            )}
            {g.itens.some((x) => x.estado === 'anunciado') && (
              <button className="btn btn-pequeno" onClick={() => props.anunciar(g.itens.map((x) => x.id), true)}>
                Retirar anúncio
              </button>
            )}
          </div>
          <ul className="grupo-itens">{g.itens.map((x) => props.linha(x))}</ul>
        </div>
      )}
    </li>
  );
}

/** Categoria e subcategoria, ex.: "LEGO › Speed Champions". */
function categoria(p: Produto): string {
  const tema = p.tema && p.tema.toLowerCase() !== (p.marca ?? '').toLowerCase() ? p.tema : null;
  return [p.marca, tema].filter(Boolean).join(' › ');
}
