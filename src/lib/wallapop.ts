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
 * Um só clique (pedido do Ricardo, nov/2026). O formulário da Wallapop (visto a 16/11/2026) tem
 * 4 passos, que ficam todos na página; cada um tem o seu "Continuar":
 *   0. (se aparecer a pergunta "O que vais adicionar?") escolhe "Algo de que não preciso mais";
 *   1. resumo (#step-title) → Continuar;
 *   2. fotografias (#step-photo): junta-as e confirma que a Wallapop as recebeu (aparecem
 *      miniaturas); se não, tenta o outro campo de ficheiros e depois largá-las na área → Continuar;
 *   3. categoria (#step-category): a primeira das "Categorias sugeridas" → aparece o formulário final;
 *   4. título, descrição, preço, estado e peso; avisa a app ("preenchido"), que marca o produto
 *      como anunciado nessa conta.
 * A velocidade não interessa (pedido do Ricardo): há pausas entre os passos para a página carregar.
 * Se um passo automático falhar, o aviso diz o que fazer à mão e o botão continua sozinho quando
 * aparecer o passo seguinte (até 5 minutos). Carregar outra vez no botão retoma onde ficou.
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
  const todos = (raiz: ParentNode, acc: Element[] = []): Element[] => {
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
  /** O botão com este texto exato dentro de raiz (de preferência o <button> verdadeiro, mesmo dentro de shadow DOM). */
  const botao = (re: RegExp, raiz: ParentNode = document) => {
    const cands = todos(raiz).filter((e) => (e.tagName === 'BUTTON' || e.tagName === 'WALLA-BUTTON' || e.getAttribute('role') === 'button') && re.test(texto(e)));
    const host = cands.find((e) => e.tagName === 'BUTTON') ?? cands[0];
    if (!host) return null;
    const dentro = host.shadowRoot?.querySelector('button');
    return (dentro ?? host) as HTMLElement;
  };
  /** Texto de uma opção de lista: a Wallapop põe-no no aria-label (o texto visível está no shadow DOM). */
  const rotulo = (e: Element) => e.getAttribute('aria-label') || texto(e);
  /**
   * Carrega no "Continuar" de um passo (cada passo tem o seu; os dos passos anteriores ficam na
   * página, desativados). Espera que fique ativo, dá mais 1,5 s e carrega; volta a tentar a cada
   * 5 s até `chegou` dar alguma coisa. Devolve null se não chegou dentro de ms.
   */
  const continuar = <T,>(passo: string, chegou: () => T | null | undefined | false, ms: number) => {
    let ultimo = 0;
    let ativoDesde = 0;
    return ate(chegou, ms, () => {
      const raiz = porId(passo);
      const b = raiz && botao(/^continuar$/i, raiz);
      if (!b || desativado(b)) {
        ativoDesde = 0;
        return;
      }
      if (!ativoDesde) ativoDesde = Date.now();
      if (Date.now() - ativoDesde < 1500 || Date.now() - ultimo < 5000) return;
      ultimo = Date.now();
      b.click();
    });
  };
  /**
   * Carrega num elemento como uma pessoa (rato por cima, carregar, largar, clique). A lista das
   * categorias só avança para o formulário final assim, no elemento de dentro da opção
   * (walla-list-item); um simples .click() escolhe a categoria mas o formulário não aparece.
   */
  const clicarComoPessoa = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const xy = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true, composed: true, view: window };
    for (const t of ['pointerover', 'pointerenter', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup'])
      el.dispatchEvent(t.startsWith('pointer') ? new PointerEvent(t, { ...xy, pointerId: 1, isPrimary: true }) : new MouseEvent(t, xy));
    el.click();
  };
  /** Abre uma lista da Wallapop (walla-dropdown) a partir de um elemento lá dentro. */
  const abrirLista = (dentro: Element | null) => {
    const el = (dentro?.closest('[role="button"], button') ?? dentro?.closest('walla-dropdown')) as HTMLElement | null;
    el?.click();
    return !!el;
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
    const final = async (nomeCategoria = '') => {
      escrever(porId('title') as HTMLInputElement | null, dados.titulo);
      await esperar(500);
      escrever(porId('description') as HTMLTextAreaElement | null, dados.descricao);
      await esperar(500);
      escrever(porId('price_amount') as HTMLInputElement | null, dados.preco);
      await esperar(500);
      // Estado: abrir a lista e escolher a opção com o texto certo
      let estadoOk = false;
      const condicao = porId('condition');
      // O "botão" da lista é o antepassado com papel de botão; senão, a caixa de texto ao lado
      const abrir = (condicao?.closest('[role="button"], button') ??
        condicao?.parentElement?.querySelector('input[type="text"]')) as HTMLElement | null;
      if (abrir && dados.estado) {
        abrir.click();
        await esperar(1000);
        // "Novo" não pode apanhar "Praticamente novo"; o texto da opção pode vir colado à explicação
        const re = new RegExp('^\\s*' + dados.estado + '(?![a-zà-ú])');
        const lista = condicao?.closest('walla-dropdown') ?? document;
        const opcao = todos(lista).find((e) => e.getAttribute('role') === 'option' && re.test(rotulo(e))) as HTMLElement | undefined;
        if (opcao) {
          opcao.click();
          estadoOk = true;
        }
        await esperar(700);
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
      const cat = nomeCategoria ? ` (${nomeCategoria})` : '';
      const falta = [!estadoOk && 'estado', !pesoOk && 'peso', dados.escalao == null && 'peso (desconhecido)'].filter(Boolean);
      aviso(
        falta.length
          ? `VinteDuo: preenchido e marcado como anunciado. Falta escolher: ${falta.join(', ')}. Depois revê a categoria${cat} e publica.`
          : `VinteDuo: preenchido ✓ e marcado como anunciado. Revê a categoria${cat} e publica.`,
        falta.length > 0,
        15000,
      );
    };

    // Já no formulário final (2.º clique, ou os passos foram feitos à mão)
    if (porId('title')) {
      await esperar(1000);
      return final();
    }

    // Pergunta "O que vais adicionar?": escolher "Algo de que não preciso mais"
    // (A página pode ainda estar a carregar: espera pelo resumo ou pela pergunta. Se a opção já vier
    // escolhida, o resumo já aparece e não se carrega nela, porque outro clique podia desmarcá-la.)
    const algo = () => todos(document).find((e) => e.tagName === 'BUTTON' && /^algo de que n[ãa]o preciso mais$/i.test(texto(e))) as HTMLElement | undefined;
    if (!porId('summary')) {
      aviso('VinteDuo: à espera do formulário…', false, 0);
      await ate(() => porId('summary') || algo(), 30000);
      await esperar(1500);
      if (!porId('summary')) algo()?.click();
      if (!(await ate(() => porId('summary'), 20000)))
        return aviso('VinteDuo: não encontrei o formulário. Escolhe "Algo de que não preciso mais" e carrega outra vez no botão.', true);
    }
    // A velocidade não interessa (pedido do Ricardo): dar tempo à página entre cada passo
    await esperar(1500);

    // Quando um passo automático falha, a pessoa fá-lo à mão e o botão continua sozinho quando o
    // passo seguinte aparecer (espera até 5 minutos).
    const ESPERA_PESSOA = 300000;
    const ficheirosDoPasso = () => {
      const passo = porId('step-photo');
      return passo && todos(passo).some((e) => e instanceof HTMLInputElement && e.type === 'file') ? passo : null;
    };

    // Passo 1: resumo e Continuar (se ainda não se passou ao passo das fotos)
    if (!ficheirosDoPasso()) {
      // O campo pode existir antes de a Wallapop o "ligar" (página ainda a carregar): nesse caso o
      // texto fica lá mas a Wallapop não o vê (contador 0/50, Continuar desativado). Esperar que o
      // componente esteja pronto e, se o contador não mudar, escrever outra vez (até 5 vezes).
      const resumo = () => porId('summary') as HTMLTextAreaElement | null;
      await ate(() => resumo()?.closest('walla-text-input')?.classList.contains('hydrated') ?? true, 15000);
      await esperar(1000);
      const visto = () => {
        const contador = porId('summary-char-counter')?.textContent ?? '';
        const b = botao(/^continuar$/i, porId('step-title') ?? document);
        return contador ? contador.startsWith(`${Math.min(dados.titulo.length, 50)}/`) : !!b && !desativado(b);
      };
      for (let i = 0; i < 5; i++) {
        escrever(resumo(), '\u200b'); // muda o valor, para a Wallapop notar a mudança seguinte
        escrever(resumo(), dados.titulo);
        if (await ate(visto, 2000)) break;
        await esperar(1500);
      }
      await esperar(1000);
      aviso('VinteDuo: resumo ✓ A continuar…', false, 0);
      if (!(await continuar('step-title', ficheirosDoPasso, 30000))) {
        aviso('VinteDuo: resumo ✓ Carrega em Continuar; eu continuo a seguir.', true, 0);
        if (!(await ate(ficheirosDoPasso, ESPERA_PESSOA))) return aviso('VinteDuo: parei. Carrega outra vez no botão para continuar.', true, 0);
      }
      await esperar(1500);
    }

    // Passo 2: fotografias. Confirma-se que a Wallapop as recebeu (aparecem miniaturas); se não,
    // tenta o outro campo de ficheiros e, por fim, larga-as na área das fotos.
    const passoFotos = ficheirosDoPasso()!;
    const fotos: File[] = (dados.fotos ?? []).slice(0, 10);
    const imagens = () => todos(passoFotos).filter((e) => e.tagName === 'IMG' || /^url\(/.test((e as HTMLElement).style?.backgroundImage ?? '')).length;
    const categoria = () => porId('step-category');
    let fotosOk = imagens() > 0; // já há fotos (2.º clique): não as juntar outra vez
    if (fotos.length && !fotosOk) {
      aviso(`VinteDuo: a juntar ${fotos.length} ${fotos.length === 1 ? 'fotografia' : 'fotografias'}…`, false, 0);
      const lista = () => {
        const dt = new DataTransfer();
        fotos.forEach((f) => dt.items.add(f));
        return dt;
      };
      const entradas = todos(passoFotos).filter((e): e is HTMLInputElement => e instanceof HTMLInputElement && e.type === 'file');
      // Primeiro o campo sem id (o que funciona na Wallapop, nov/2026), depois os outros
      entradas.sort((x, y) => Number(!!x.id) - Number(!!y.id));
      const antes = imagens();
      for (const entrada of entradas) {
        entrada.files = lista().files;
        entrada.dispatchEvent(new Event('change', { bubbles: true }));
        if (await ate(() => imagens() > antes, 8000)) {
          fotosOk = true;
          break;
        }
      }
      if (!fotosOk) {
        // Largar na área das fotos (como arrastar os ficheiros para lá)
        const area = (entradas[0]?.parentElement ?? passoFotos) as HTMLElement;
        for (const tipo of ['dragenter', 'dragover', 'drop']) area.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, dataTransfer: lista() }));
        fotosOk = !!(await ate(() => imagens() > antes, 8000));
      }
      // Dar tempo para as fotos acabarem de carregar (2 s por foto, no mínimo 3 s)
      if (fotosOk) await esperar(Math.max(3000, fotos.length * 2000));
    }
    if (fotosOk) {
      aviso('VinteDuo: fotografias ✓ A continuar…', false, 0);
      if (!(await continuar('step-photo', categoria, 60000))) aviso('VinteDuo: fotografias ✓ Carrega em Continuar; eu continuo a seguir.', true, 0);
    } else {
      aviso(
        fotos.length
          ? 'VinteDuo: a Wallapop não aceitou as fotografias. Junta-as à mão (Descarregar na janela Anunciar) e carrega em Continuar; eu continuo a seguir.'
          : 'VinteDuo: este produto não tem fotografias na app. Junta-as à mão e carrega em Continuar; eu continuo a seguir.',
        true,
        0,
      );
    }
    if (!(await ate(categoria, ESPERA_PESSOA))) return aviso('VinteDuo: parei. Carrega outra vez no botão para continuar.', true, 0);
    await esperar(1500);

    // Passo 3: categoria. A primeira das "Categorias sugeridas" pela Wallapop (revê-se antes de publicar).
    let nomeCategoria = '';
    if (!porId('title')) {
      const passo = categoria()!;
      const campo = todos(passo).find((e) => e instanceof HTMLInputElement && e.type === 'text') ?? passo.querySelector('walla-dropdown');
      abrirLista(campo ?? null);
      await esperar(1500);
      const opcoes = todos(passo).filter((e) => e.getAttribute('role') === 'option');
      const sugerida = opcoes.find((e) => /sugerid/i.test(texto(e.previousElementSibling ?? document.createElement('i')))) ?? opcoes[0];
      if (sugerida) {
        nomeCategoria = rotulo(sugerida);
        clicarComoPessoa((sugerida.querySelector('walla-list-item') ?? sugerida) as HTMLElement);
      }
      if (!(await ate(() => porId('title'), 10000))) {
        nomeCategoria = ''; // a pessoa escolhe; não dizer depois que foi a sugerida
        aviso('VinteDuo: escolhe a categoria; eu continuo a seguir.', true, 0);
        if (!(await ate(() => porId('title'), ESPERA_PESSOA))) return aviso('VinteDuo: parei. Carrega outra vez no botão para continuar.', true, 0);
      }
    }
    await esperar(2500); // a Wallapop escreve as sugestões dela no formulário; escrevemos por cima depois
    return final(nomeCategoria);
  })().catch((e) => aviso('VinteDuo: erro — ' + (e instanceof Error ? e.message : String(e)), true));
}

/** Endereço "javascript:" do botão da barra de favoritos. */
export const codigoBotaoWallapop = () => `javascript:(${preencherWallapop.toString()})(${JSON.stringify(ORIGEM_APP)});void 0`;
