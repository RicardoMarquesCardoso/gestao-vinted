// Janela "Anunciar" (ou "Retirar anúncio"): escolhe a conta da Vinted, quantas unidades e o preço,
// e mostra o título e a descrição prontos a copiar para a Vinted (ver lib/anuncio.ts) e as
// fotografias do produto para partilhar ou descarregar (components/fotos.tsx).
// Ao marcar como anunciado, o registo do tempo anunciado começa sozinho (lib/anuncios.ts).
// Avisa se a conta escolhida já vendeu ou tem anunciadas 2 ou mais unidades iguais (vezesNaConta):
// a Vinted reclama de muitos artigos iguais na mesma conta (pedido do Ricardo).
// Contas "… (Wallapop)" (piloto, nov/2026): o texto é o da Wallapop (em português, título até 50 e
// descrição até 640 caracteres) e há o botão "Abrir na Wallapop", que abre o formulário de
// publicação e entrega os dados ao botão da barra de favoritos (ver lib/wallapop.ts). Quando o botão
// avisa que o formulário ficou preenchido, a app marca o produto como anunciado nessa conta e preço
// (pedido do Ricardo, nov/2026), como se se carregasse em "Marcar como anunciado".
// O preço vem preenchido com o sugerido pelo plano (o mesmo do "Anunciar a X €"), venha a janela
// das tarefas ou do detalhe do produto.

import { useEffect, useRef, useState } from 'react';
import { fmtEuro, hoje, lerNumero } from '../lib/format';
import { vezesNaConta } from '../lib/calc';
import type { Produto } from '../lib/types';
import { useDados } from '../state';
import { modeloAnuncio, textoAnuncio } from '../lib/anuncio';
import { Campo, Dinheiro, Janela, SelecionarConta } from './ui';
import { PartilharFotos, eIos, ficheirosDoProduto } from './fotos';
import { infoMercado, useMercado } from '../lib/investimento';
import { URL_PUBLICAR_WALLAPOP, dadosWallapop, eContaWallapop } from '../lib/wallapop';
import { produtoComFotos, sugerirPlano, temFotosUsaveis } from '../lib/plano';
import { useContextoPlano } from './planos';

const CHAVE_CONTA = 'gv.ultimaConta';

/**
 * Marca rapidamente unidades como anunciadas (ou retira o anúncio).
 * Para um grupo de produtos iguais, escolhe-se quantas unidades.
 */
export function FormAnunciar({ ids, retirar, precoSugerido, unidades, aoFechar }: { ids: string[]; retirar?: boolean; precoSugerido?: number | null; unidades?: number; aoFechar(): void }) {
  const { dados, guardar, aviso } = useDados();
  // Candidatos: os que estão no estado certo; ao anunciar, primeiro os que têm fotografias nossas
  // (é essa unidade que se fotografou e se anuncia); depois os mais antigos
  const candidatos = ids
    .map((id) => dados.produtos.find((p) => p.id === id))
    .filter((p): p is Produto => !!p && p.estado === (retirar ? 'anunciado' : 'por_anunciar'))
    .sort((a, b) => (retirar ? 0 : Number(temFotosUsaveis(b)) - Number(temFotosUsaveis(a))) || (a.data_compra ?? '').localeCompare(b.data_compra ?? ''));
  const nome = candidatos[0]?.nome ?? 'Produto';
  // Sem preço vindo de fora (ex.: aberto no detalhe do produto), usa o sugerido pelo plano
  const ctx = useContextoPlano();
  const sugerido = precoSugerido ?? (!retirar && candidatos[0] ? sugerirPlano(candidatos[0], ctx).precoSugerido : null);
  // Fotografias para o anúncio: as deste produto ou, se não tiver, as de um igual (mesmo set e condição)
  const fotosDe = candidatos[0] ? produtoComFotos(candidatos[0], dados.produtos) : null;

  const [conta, setConta] = useState(() => {
    try {
      const c = localStorage.getItem(CHAVE_CONTA);
      if (c && dados.contas.some((x) => x.id === c && x.ativa)) return c;
    } catch {
      /* ignorar */
    }
    return dados.contas.find((c) => c.ativa)?.id ?? '';
  });
  // Quantas unidades marcar (vindo das tarefas é 1: anuncia-se uma de cada vez)
  const [qtd, setQtd] = useState(String(Math.min(unidades ?? candidatos.length, candidatos.length)));
  const [preco, setPreco] = useState(sugerido ? String(sugerido).replace('.', ',') : '');
  const [aGuardar, setAGuardar] = useState(false);
  // Quantos iguais já passaram por esta conta (vendidos + anunciados agora)
  const vezes = !retirar && candidatos[0] ? vezesNaConta(dados, candidatos[0], conta) : 0;

  async function submeter(origem?: 'wallapop') {
    const n = Math.min(Math.max(Math.round(lerNumero(qtd)) || 1, 1), candidatos.length);
    if (!retirar && !conta) return aviso('Escolhe a conta da Vinted.', 'erro');
    const escolhidos = candidatos.slice(0, n);
    const alterados = escolhidos.map((p) =>
      retirar
        ? { ...p, estado: 'por_anunciar' as const, data_anuncio: null }
        : { ...p, estado: 'anunciado' as const, conta_id: conta, data_anuncio: hoje(), preco_anuncio: preco ? lerNumero(preco) : p.preco_anuncio },
    );
    setAGuardar(true);
    try {
      await guardar('produtos', alterados);
      try {
        if (!retirar) localStorage.setItem(CHAVE_CONTA, conta);
      } catch {
        /* ignorar */
      }
      aviso(retirar ? `Anúncio retirado (${n}).` : origem === 'wallapop' ? `Marcado como anunciado na Wallapop${preco ? ` a ${fmtEuro(lerNumero(preco))}` : ''}.` : `${n} unidade(s) marcada(s) como anunciada(s).`);
      aoFechar();
    } catch (e) {
      aviso(`Erro: ${e instanceof Error ? e.message : e}`, 'erro');
    } finally {
      setAGuardar(false);
    }
  }

  // A versão mais recente de submeter, para o aviso "preenchido" da Wallapop (que chega mais tarde)
  const submeterRef = useRef(submeter);
  submeterRef.current = submeter;

  if (!candidatos.length) {
    return (
      <Janela titulo={retirar ? 'Retirar anúncio' : 'Anunciar'} aoFechar={aoFechar}>
        <p>{retirar ? 'Não há unidades anunciadas.' : 'Não há unidades por anunciar.'}</p>
      </Janela>
    );
  }

  return (
    <Janela
      titulo={retirar ? `Retirar anúncio: ${nome}` : `Anunciar: ${nome}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={() => submeter()} disabled={aGuardar}>
            {retirar ? 'Retirar' : 'Marcar como anunciado'}
          </button>
        </>
      }
    >
      <div className="grelha-form">
        {!retirar && (
          <Campo rotulo="Conta da Vinted">
            <SelecionarConta valor={conta} mudar={setConta} />
          </Campo>
        )}
        {candidatos.length > 1 && (
          <Campo rotulo="Quantas unidades" ajuda={`de ${candidatos.length} ${retirar ? 'anunciadas' : 'por anunciar'}`}>
            <input inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))} />
          </Campo>
        )}
        {!retirar && (
          <Campo rotulo="Preço do anúncio" ajuda={sugerido ? 'Sugerido pela app' : candidatos[0].preco_anuncio ? `Atual: ${fmtEuro(candidatos[0].preco_anuncio)}` : 'Opcional'}>
            <Dinheiro valor={preco} mudar={setPreco} placeholder="" />
          </Campo>
        )}
      </div>
      {/* Aviso: esta conta já vendeu/anunciou 2 ou mais iguais (a Vinted reclama de muitos artigos iguais) */}
      {!retirar && vezes >= 2 && (
        <p className="alerta-repetido" role="alert">
          ⚠ Esta conta já tem {vezes} {vezes === 1 ? 'unidade' : 'unidades'} deste produto (vendidas ou anunciadas). A Vinted reclama de muitos artigos iguais na mesma conta: considera outra conta.
        </p>
      )}
      {!retirar && <TextoVinted produto={candidatos[0]} fotosDe={fotosDe} contaId={conta} preco={preco ? lerNumero(preco) : null} aoPreencherWallapop={() => submeterRef.current('wallapop')} />}
      {/* As fotografias do produto, para pôr no anúncio (Partilhar → Vinted, ou Descarregar) */}
      {!retirar && fotosDe && (
        <div className="texto-vinted">
          <h4>Fotografias</h4>
          <PartilharFotos p={fotosDe} />
        </div>
      )}
    </Janela>
  );
}

/**
 * Título e descrição prontos a copiar (com a descrição própria da conta, se tiver).
 * Numa conta Wallapop: o texto da Wallapop e o botão "Abrir na Wallapop".
 * Numa conta Vinted (no computador): o botão "Abrir na Vinted" (fotos, título e descrição copiados,
 * página Vender).
 */
function TextoVinted({ produto, fotosDe, contaId, preco, aoPreencherWallapop }: { produto: Produto; fotosDe: Produto | null; contaId: string; preco: number | null; aoPreencherWallapop(): void }) {
  const { dados, aviso } = useDados();
  const mercado = useMercado();
  const wallapop = eContaWallapop(dados.contas.find((c) => c.id === contaId)?.nome);
  const modelo = modeloAnuncio(dados.definicoes);
  const pesoG = infoMercado(mercado, produto.set_numero, hoje())?.pesoG ?? null;
  const t = wallapop ? dadosWallapop(produto, modelo, contaId, preco, pesoG) : textoAnuncio(produto, modelo, contaId);
  async function copiar(texto: string, o: string) {
    try {
      await navigator.clipboard.writeText(texto);
      aviso(`${o} copiado.`);
    } catch {
      aviso('Não foi possível copiar. Seleciona o texto e copia à mão.', 'erro');
    }
  }
  return (
    <div className="texto-vinted">
      <h4>{wallapop ? 'Texto para a Wallapop' : 'Texto para a Vinted'}</h4>
      {wallapop && <AbrirWallapop produto={produto} fotosDe={fotosDe} contaId={contaId} preco={preco} pesoG={pesoG} aoPreencher={aoPreencherWallapop} />}
      {!wallapop && !eIos() && <AbrirVinted titulo={t.titulo} descricao={t.descricao} fotosDe={fotosDe} />}
      <div className="texto-vinted-bloco">
        <div className="texto-vinted-topo">
          <span className="campo-rotulo">Título</span>
          <button type="button" className="btn btn-pequeno" onClick={() => copiar(t.titulo, 'Título')}>Copiar</button>
        </div>
        <p className="texto-vinted-titulo">{t.titulo}</p>
      </div>
      <div className="texto-vinted-bloco">
        <div className="texto-vinted-topo">
          <span className="campo-rotulo">Descrição</span>
          <button type="button" className="btn btn-pequeno" onClick={() => copiar(t.descricao, 'Descrição')}>Copiar</button>
        </div>
        <p className="texto-vinted-descricao">{t.descricao}</p>
      </div>
      <p className="mudo pequeno">O texto muda-se em Definições → Texto dos anúncios.</p>
    </div>
  );
}

/** Página "Vender" da Vinted (confirmada a 21/11/2026; sem sessão, a Vinted pede para entrar e volta cá). */
export const URL_VENDER_VINTED = 'https://www.vinted.pt/items/new';

/**
 * "Abrir na Vinted" (pedido do Ricardo, nov/2026; só no computador, não no iPhone). Num só clique:
 *   1. descarrega as fotografias (nomes por ordem: "… - 1.jpg", "… - 2.jpg"…);
 *   2. copia a descrição e logo a seguir o título: na Vinted, Ctrl+V cola o título e, no Windows,
 *      Win+V (histórico da área de transferência) mostra a descrição logo abaixo;
 *   3. abre a página "Vender" da Vinted noutro separador.
 * Nada corre dentro do site da Vinted (os termos proíbem ferramentas de terceiros): a app só
 * guarda ficheiros, copia texto e abre um link. Preencher e publicar é sempre à mão.
 * As fotografias são preparadas logo ao abrir a janela, para o clique não ter de esperar (o
 * browser só deixa abrir separadores e descarregar logo a seguir a um clique).
 */
function AbrirVinted({ titulo, descricao, fotosDe }: { titulo: string; descricao: string; fotosDe: Produto | null }) {
  const { store, aviso } = useDados();
  const fotos = useRef<{ chave: string; ficheiros: Promise<File[]> } | null>(null);
  const [aAbrir, setAAbrir] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const chave = fotosDe?.fotos.join('|') ?? '';
  const preparar = () => {
    if (!fotosDe || !fotosDe.fotos.length) return Promise.resolve([] as File[]);
    if (fotos.current?.chave !== chave) {
      const ficheiros = ficheirosDoProduto(fotosDe, store);
      ficheiros.catch(() => {
        if (fotos.current?.ficheiros === ficheiros) fotos.current = null; // tenta outra vez no clique
      });
      fotos.current = { chave, ficheiros };
    }
    return fotos.current.ficheiros;
  };
  useEffect(() => {
    preparar().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  const descarregar = (fs: File[]) => {
    for (const f of fs) {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  };

  async function abrir() {
    setAAbrir(true);
    setBloqueado(false);
    const falhas: string[] = [];
    try {
      // 1. Fotografias (já preparadas ao abrir a janela, em princípio)
      try {
        descarregar(await preparar());
      } catch {
        falhas.push('fotografias');
      }
      // 2. Descrição e depois título (o título fica no Ctrl+V; a descrição no Win+V)
      try {
        await navigator.clipboard.writeText(descricao);
        await new Promise((ok) => setTimeout(ok, 600)); // para o histórico do Windows guardar as duas
        await navigator.clipboard.writeText(titulo);
      } catch {
        falhas.push('copiar o texto');
      }
      // 3. Página "Vender" da Vinted
      const w = window.open(URL_VENDER_VINTED, '_blank');
      if (!w) setBloqueado(true);
      aviso(falhas.length ? `Não foi possível: ${falhas.join(', ')}.` : 'Fotografias descarregadas e título copiado (descrição no Win+V).', falhas.length ? 'erro' : undefined);
    } finally {
      setAAbrir(false);
    }
  }

  return (
    <div className="linha-botoes">
      <button type="button" className="btn btn-primario" onClick={abrir} disabled={aAbrir}>
        {aAbrir ? 'A preparar…' : 'Abrir na Vinted'}
      </button>
      {/* O browser bloqueou o separador novo (o clique "expirou" à espera das fotos): link normal */}
      {bloqueado && (
        <a className="btn" href={URL_VENDER_VINTED} target="_blank" rel="noopener">
          Abrir a página Vender
        </a>
      )}
    </div>
  );
}

/**
 * Abre o formulário de publicação da Wallapop noutro separador e responde aos pedidos do botão
 * da barra de favoritos que corre nesse separador. Só responde à janela que ela própria abriu
 * e a páginas da Wallapop. As fotografias vão como ficheiros, diretamente de separador para
 * separador (nada passa por outros servidores). Publicar continua a ser feito à mão.
 * Quando o botão avisa "preenchido", chama aoPreencher (marca o produto como anunciado), uma vez.
 */
function AbrirWallapop({ produto, fotosDe, contaId, preco, pesoG, aoPreencher }: { produto: Produto; fotosDe: Produto | null; contaId: string; preco: number | null; pesoG: number | null; aoPreencher(): void }) {
  const { dados, store, aviso } = useDados();
  const janela = useRef<Window | null>(null);
  const fotos = useRef<{ chave: string; ficheiros: Promise<File[]> } | null>(null);
  // Valores atuais, lidos quando o pedido chega (o ouvinte não muda a cada tecla)
  const atual = useRef({ produto, fotosDe, contaId, preco, pesoG, definicoes: dados.definicoes, aoPreencher });
  atual.current = { produto, fotosDe, contaId, preco, pesoG, definicoes: dados.definicoes, aoPreencher };
  const marcado = useRef(false);

  useEffect(() => {
    async function ouvir(e: MessageEvent) {
      if (!janela.current || e.source !== janela.current) return;
      if (!/^https:\/\/([a-z0-9-]+\.)?wallapop\.com$/.test(e.origin)) return;
      const a = atual.current;
      // O formulário ficou preenchido: marcar como anunciado (só uma vez)
      if (e.data?.vinteduo === 'preenchido') {
        if (!marcado.current) {
          marcado.current = true;
          a.aoPreencher();
        }
        return;
      }
      if (e.data?.vinteduo !== 'pedido') return;
      try {
        // As fotos podem vir de um igual (ver produtoComFotos)
        const origem = a.fotosDe ?? a.produto;
        const chave = origem.fotos.join('|');
        if (fotos.current?.chave !== chave) fotos.current = { chave, ficheiros: ficheirosDoProduto(origem, store) };
        const ficheiros = await fotos.current.ficheiros;
        const d = dadosWallapop(a.produto, modeloAnuncio(a.definicoes), a.contaId, a.preco, a.pesoG);
        (e.source as Window).postMessage({ ...d, fotos: ficheiros }, e.origin);
      } catch (err) {
        fotos.current = null;
        aviso(`Não foi possível preparar o anúncio: ${err instanceof Error ? err.message : err}`, 'erro');
      }
    }
    window.addEventListener('message', ouvir);
    return () => window.removeEventListener('message', ouvir);
  }, [store, aviso]);

  return (
    <div className="botoes">
      <button
        type="button"
        className="btn"
        onClick={() => {
          janela.current = window.open(URL_PUBLICAR_WALLAPOP, 'vinteduo-wallapop');
          if (!janela.current) aviso('O browser bloqueou a nova janela.', 'erro');
        }}
      >
        Abrir na Wallapop
      </button>
    </div>
  );
}
