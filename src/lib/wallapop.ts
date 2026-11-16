// Piloto Wallapop (pedido do Ricardo, nov/2026): preencher o anúncio da Wallapop a partir da app.
//
// COMO FUNCIONA (sem chaves, sem publicação automática):
//   1. Na janela Anunciar, com uma conta "… (Wallapop)", carrega-se em "Abrir na Wallapop": a app
//      abre o formulário de publicação da Wallapop noutro separador e fica à escuta.
//   2. No separador da Wallapop carrega-se no botão "VinteDuo → Wallapop" da barra de favoritos
//      (um "bookmarklet", instalado uma vez a partir de Definições). Esse botão pede os dados à app
//      (que está no separador que abriu este, "window.opener") e preenche o formulário:
//        num só clique: o resumo e as fotografias, carrega em "Continuar" (só muda de passo) e, no
//        formulário final, escreve por cima o título e a descrição que a Wallapop sugere e escolhe
//        o estado, o preço e o escalão de peso (ver preencherWallapop).
//   3. Com o formulário preenchido, a app marca o produto como anunciado nessa conta e preço.
//   4. O "Publicar" é sempre carregado pela pessoa.
//
// Este ficheiro tem as regras (testadas em tests/wallapop.test.ts) e o código do botão.
// A Wallapop (pt.wallapop.com) limita o título a 50 caracteres e a descrição a 640.

import { textoAnuncio, produtoNovo } from './anuncio';
import type { ModeloAnuncio } from './anuncio';
import type { Produto } from './types';

/**
 * Formulário de publicação de um artigo. É o endereço do passo "Algo de que não preciso mais":
 * o endereço sem "/consumer-goods" abre antes a pergunta "O que vais adicionar?", onde o formulário
 * ainda não existe (confirmado na página verdadeira em 16/11/2026).
 */
export const URL_PUBLICAR_WALLAPOP = 'https://pt.wallapop.com/app/catalog/upload/consumer-goods';
/** Endereço da app: o botão só aceita dados vindos daqui. */
export const ORIGEM_APP = 'https://ricardomarquescardoso.github.io';

export const MAX_TITULO = 50;
export const MAX_DESCRICAO = 640;
/** Escalões de peso da Wallapop, em kg (limite superior de cada um): 0–1, 1–2, 2–5, 5–10, 10–20, 20–30. */
export const ESCALOES_KG = [1, 2, 5, 10, 20, 30];

/** Texto simples, em português, para as contas Wallapop sem descrição própria (pedido do Ricardo). */
export const TEXTO_WALLAPOP = {
  novo: 'Novo e selado 📦\nEnviado bem protegido em caixa.\nMais {marca} no meu perfil.',
  usado: 'Usado, completo e em ótimo estado.\nEnviado bem protegido em caixa.\nMais {marca} no meu perfil.',
};

/** Uma conta da app é da Wallapop se o nome tiver "(Wallapop)" (convenção "TITULAR (Plataforma)"). */
export const eContaWallapop = (nome: string | null | undefined) => /\(\s*wallapop\s*\)/i.test(nome ?? '');

/** Corta um texto ao limite, de preferência num espaço (sem deixar palavras a meio). */
export function cortar(texto: string, max: number): string {
  const t = texto.trim();
  if (t.length <= max) return t;
  const parte = t.slice(0, max);
  const espaco = parte.lastIndexOf(' ');
  return (espaco > max * 0.6 ? parte.slice(0, espaco) : parte).replace(/[\s,;:–-]+$/, '');
}

/** Índice do escalão de peso (0 = 0–1 kg … 5 = 20–30 kg) para o peso da caixa; null se não se sabe ou passa de 30 kg. */
export function escalaoPeso(pesoG: number | null | undefined): number | null {
  if (!pesoG || pesoG <= 0) return null;
  const i = ESCALOES_KG.findIndex((kg) => pesoG / 1000 <= kg);
  return i >= 0 ? i : null;
}

/** Estado na Wallapop: os novos (selados ou não) → "Novo"; os outros → "Praticamente novo". */
export const estadoWallapop = (p: Pick<Produto, 'condicao'>) => (produtoNovo(p) ? 'Novo' : 'Praticamente novo');

export interface DadosWallapop {
  vinteduo: 'dados';
  titulo: string;
  descricao: string;
  estado: string;
  /** Preço em texto, com vírgula ("49,90"); vazio se não houver. */
  preco: string;
  escalao: number | null;
}

/** Tudo o que o botão escreve no formulário (as fotografias juntam-se à parte). */
export function dadosWallapop(
  p: Pick<Produto, 'nome' | 'set_numero' | 'tema' | 'condicao' | 'marca'>,
  modelo: ModeloAnuncio,
  contaId: string | null,
  preco: number | null,
  pesoG: number | null,
): DadosWallapop {
  // Descrição: a própria da conta (Definições → Texto dos anúncios); sem ela, o texto da Wallapop
  const daConta = contaId ? modelo.contas?.[contaId] : undefined;
  const m: ModeloAnuncio = {
    ...modelo,
    contas: { ...(modelo.contas ?? {}), ...(contaId ? { [contaId]: { novo: daConta?.novo?.trim() || TEXTO_WALLAPOP.novo, usado: daConta?.usado?.trim() || TEXTO_WALLAPOP.usado } } : {}) },
  };
  const t = textoAnuncio(p, m, contaId);
  return {
    vinteduo: 'dados',
    titulo: cortar(t.titulo, MAX_TITULO),
    descricao: cortar(t.descricao, MAX_DESCRICAO),
    estado: estadoWallapop(p),
    preco: preco && preco > 0 ? String(Math.round(preco * 100) / 100).replace('.', ',') : '',
    escalao: escalaoPeso(pesoG),
  };
}

/**
 * O código do botão da barra de favoritos. Corre DENTRO da página da Wallapop; por isso tem de
 * ser autossuficiente (não pode usar nada de fora desta função). É convertido em texto com
 * toString() e posto num endereço "javascript:".
 *
 * Um só clique (pedido do Ricardo, nov/2026):
 *   1. (se aparecer a pergunta "O que vais adicionar?") escolhe "Algo de que não preciso mais";
 *   2. escreve o resumo e junta as fotografias;
 *   3. carrega em "Continuar" (só passa ao passo seguinte; não publica) e espera pelo formulário final;
 *   4. escreve o título, a descrição e o preço e escolhe o estado e o peso;
 *   5. avisa a app ("preenchido"), que marca o produto como anunciado nessa conta.
 * Se o passo 3 não resultar (a Wallapop mudou o botão, as fotos ainda a carregar…), pára e pede à
 * pessoa que carregue em Continuar e depois outra vez no botão: o 2.º clique faz os passos 4 e 5.
 * O "Publicar" é SEMPRE da pessoa.
 */
export function preencherWallapop(origemApp: string) {
  // Mensagem no topo da página. duracao = 0: fica até ser substituída.
  const aviso = (texto: string, erro?: boolean, duracao?: number) => {
    document.getElementById('vinteduo-aviso')?.remove();
    const d = document.createElement('div');
    d.id = 'vinteduo-aviso';
    d.textContent = texto;
    d.style.cssText = `position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);max-width:90vw;padding:10px 16px;border-radius:10px;font:15px system-ui,sans-serif;color:#fff;background:${erro ? '#b3261e' : '#13a89e'};box-shadow:0 4px 16px rgba(0,0,0,.25)`;
    document.body.appendChild(d);
    const ms = duracao ?? (erro ? 10000 : 5000);
    if (ms > 0) setTimeout(() => d.remove(), ms);
    return d;
  };
  const escrever = (el: HTMLInputElement | HTMLTextAreaElement | null, valor: string) => {
    if (!el || !valor) return false;
    el.focus();
    el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return true;
  };
  const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  // Procura também dentro de componentes com "shadow DOM"
  const todos = (raiz: Document | ShadowRoot, acc: Element[] = []): Element[] => {
    raiz.querySelectorAll('*').forEach((e) => {
      acc.push(e);
      if (e.shadowRoot) todos(e.shadowRoot, acc);
    });
    return acc;
  };
  const porId = (id: string) => document.getElementById(id);
  /** Espera (até ms) que a condição dê alguma coisa; devolve-a ou null. */
  const ate = async <T,>(cond: () => T | null | undefined | false, ms: number, cada?: () => void): Promise<T | null> => {
    const fim = Date.now() + ms;
    for (;;) {
      const r = cond();
      if (r) return r;
      if (Date.now() > fim) return null;
      cada?.();
      await esperar(400);
    }
  };
  const texto = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim();
  const desativado = (e: Element) => (e as HTMLButtonElement).disabled === true || e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled');
  /** O botão com este texto exato (de preferência o <button> verdadeiro, mesmo dentro de shadow DOM). */
  const botao = (re: RegExp) => {
    const cands = todos(document).filter((e) => (e.tagName === 'BUTTON' || e.tagName === 'WALLA-BUTTON' || e.getAttribute('role') === 'button') && re.test(texto(e)));
    const host = cands.find((e) => e.tagName === 'BUTTON') ?? cands[0];
    if (!host) return null;
    const dentro = host.shadowRoot?.querySelector('button');
    return (dentro ?? host) as HTMLElement;
  };

  (async () => {
    const app = window.opener as Window | null;
    if (!app) return aviso('Abre a Wallapop pelo botão "Abrir na Wallapop" da VinteDuo.', true);
    // Sinal imediato: sem ele, a espera pela app (até 20 s) parecia "não faz nada"
    aviso('VinteDuo: a pedir os dados à app…', false, 0);

    // Pedir os dados à app (que está no separador que abriu este)
    const dados = await new Promise<any>((ok) => {
      const fim = setTimeout(() => {
        window.removeEventListener('message', ouvir);
        ok(null);
      }, 20000);
      function ouvir(e: MessageEvent) {
        if (e.source !== app || e.origin !== origemApp || !e.data || e.data.vinteduo !== 'dados') return;
        clearTimeout(fim);
        window.removeEventListener('message', ouvir);
        ok(e.data);
      }
      window.addEventListener('message', ouvir);
      app.postMessage({ vinteduo: 'pedido', v: 1 }, origemApp);
    });
    if (!dados) return aviso('A VinteDuo não respondeu. Mantém a janela Anunciar aberta e tenta outra vez.', true);

    // Passo final: título, descrição, preço, estado e peso; depois avisa a app
    const final = async () => {
      escrever(porId('title') as HTMLInputElement | null, dados.titulo);
      escrever(porId('description') as HTMLTextAreaElement | null, dados.descricao);
      escrever(porId('price_amount') as HTMLInputElement | null, dados.preco);
      // Estado: abrir a lista e escolher a opção com o texto certo
      let estadoOk = false;
      const condicao = porId('condition');
      // O "botão" da lista é o antepassado com papel de botão; senão, a caixa de texto ao lado
      const abrir = (condicao?.closest('[role="button"], button') ??
        condicao?.parentElement?.querySelector('input[type="text"]')) as HTMLElement | null;
      if (abrir && dados.estado) {
        abrir.click();
        await esperar(500);
        // "Novo" não pode apanhar "Praticamente novo"; o texto da opção pode vir colado à explicação
        const re = new RegExp('^\\s*' + dados.estado + '(?![a-zà-ú])');
        const opcao = todos(document).find((e) => e.getAttribute('role') === 'option' && re.test(e.textContent ?? '')) as HTMLElement | undefined;
        if (opcao) {
          opcao.click();
          estadoOk = true;
        }
      }
      // Peso: escalões 0–5
      let pesoOk = dados.escalao == null;
      if (dados.escalao != null) {
        const r = porId(String(dados.escalao)) as HTMLInputElement | null;
        if (r && r.type === 'radio') {
          r.click();
          pesoOk = true;
        }
      }
      app.postMessage({ vinteduo: 'preenchido', v: 1 }, origemApp);
      const falta = [!estadoOk && 'estado', !pesoOk && 'peso', dados.escalao == null && 'peso (desconhecido)'].filter(Boolean);
      aviso(
        falta.length
          ? `VinteDuo: preenchido e marcado como anunciado. Falta escolher: ${falta.join(', ')}. Depois revê a categoria e publica.`
          : 'VinteDuo: preenchido ✓ e marcado como anunciado. Revê a categoria e publica.',
        falta.length > 0,
        15000,
      );
    };

    // Já no formulário final (2.º clique, ou o Continuar foi carregado à mão)
    if (porId('title')) return final();

    // Pergunta "O que vais adicionar?": escolher "Algo de que não preciso mais"
    if (!porId('summary')) {
      const opcao = todos(document).find((e) => /^algo de que n[ãa]o preciso mais$/i.test(texto(e))) as HTMLElement | undefined;
      opcao?.click();
      if (!(await ate(() => porId('summary'), 5000)))
        return aviso('VinteDuo: não encontrei o formulário. Escolhe "Algo de que não preciso mais" e carrega outra vez no botão.', true);
    }

    // Resumo e fotografias
    escrever(porId('summary') as HTMLTextAreaElement | null, dados.titulo);
    const fotos: File[] = dados.fotos ?? [];
    const entrada = (todos(document).find((e) => e instanceof HTMLInputElement && e.type === 'file' && e.multiple && !e.id) ??
      todos(document).find((e) => e instanceof HTMLInputElement && e.type === 'file')) as HTMLInputElement | undefined;
    if (fotos.length && entrada) {
      const dt = new DataTransfer();
      fotos.slice(0, 10).forEach((f) => dt.items.add(f));
      entrada.files = dt.files;
      entrada.dispatchEvent(new Event('change', { bubbles: true }));
    }
    aviso('VinteDuo: resumo e fotografias ✓ A continuar…', false, 0);

    // Continuar (só avança de passo; não publica). Tenta a cada 2 s, enquanto o botão estiver
    // desativado (ex.: fotografias a carregar), até aparecer o formulário final (máx. 30 s).
    let ultimo = 0;
    const chegou = await ate(
      () => porId('title'),
      30000,
      () => {
        if (Date.now() - ultimo < 2000) return;
        const b = botao(/^continuar$/i);
        if (b && !desativado(b)) {
          ultimo = Date.now();
          b.click();
        }
      },
    );
    if (!chegou) return aviso('VinteDuo: resumo e fotografias ✓ Carrega em Continuar e depois outra vez no botão.', true, 0);
    await esperar(800); // a Wallapop escreve as sugestões dela no formulário; escrevemos por cima depois
    return final();
  })().catch((e) => aviso('VinteDuo: erro — ' + (e instanceof Error ? e.message : String(e)), true));
}

/** Endereço "javascript:" do botão da barra de favoritos. */
export const codigoBotaoWallapop = () => `javascript:(${preencherWallapop.toString()})(${JSON.stringify(ORIGEM_APP)});void 0`;
