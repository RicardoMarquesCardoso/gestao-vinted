// Piloto Wallapop (pedido do Ricardo, nov/2026): preencher o anúncio da Wallapop a partir da app.
//
// COMO FUNCIONA (sem chaves, sem publicação automática):
//   1. Na janela Anunciar, com uma conta "… (Wallapop)", carrega-se em "Abrir na Wallapop": a app
//      abre o formulário de publicação da Wallapop noutro separador e fica à escuta.
//   2. No separador da Wallapop carrega-se no botão "VinteDuo → Wallapop" da barra de favoritos
//      (um "bookmarklet", instalado uma vez a partir de Definições). Esse botão pede os dados à app
//      (que está no separador que abriu este, "window.opener") e preenche o formulário:
//        - 1.º clique (início do formulário): o resumo e as fotografias;
//        - 2.º clique (formulário final, depois de a Wallapop sugerir título/descrição): escreve por
//          cima o título e a descrição, e escolhe o estado, o preço e o escalão de peso.
//   3. Os "Continuar" e o "Publicar" são sempre carregados pela pessoa.
//
// Este ficheiro tem as regras (testadas em tests/wallapop.test.ts) e o código do botão.
// A Wallapop (pt.wallapop.com) limita o título a 50 caracteres e a descrição a 640.

import { textoAnuncio, produtoNovo } from './anuncio';
import type { ModeloAnuncio } from './anuncio';
import type { Produto } from './types';

export const URL_PUBLICAR_WALLAPOP = 'https://pt.wallapop.com/app/catalog/upload';
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
 */
export function preencherWallapop(origemApp: string) {
  const aviso = (texto: string, erro?: boolean) => {
    const d = document.createElement('div');
    d.textContent = texto;
    d.style.cssText = `position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);padding:10px 16px;border-radius:10px;font:15px system-ui,sans-serif;color:#fff;background:${erro ? '#b3261e' : '#13a89e'};box-shadow:0 4px 16px rgba(0,0,0,.25)`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), erro ? 6000 : 3000);
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

  (async () => {
    const app = window.opener as Window | null;
    if (!app) return aviso('Abre a Wallapop pelo botão "Abrir na Wallapop" da VinteDuo.', true);

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

    const titulo = document.getElementById('title') as HTMLInputElement | null;
    if (titulo) {
      // 2.º clique: formulário final
      escrever(titulo, dados.titulo);
      escrever(document.getElementById('description') as HTMLTextAreaElement | null, dados.descricao);
      escrever(document.getElementById('price_amount') as HTMLInputElement | null, dados.preco);
      // Estado: abrir a lista e escolher a opção com o texto certo
      let estadoOk = false;
      const condicao = document.getElementById('condition');
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
        const r = document.getElementById(String(dados.escalao)) as HTMLInputElement | null;
        if (r && r.type === 'radio') {
          r.click();
          pesoOk = true;
        }
      }
      const falta = [!estadoOk && 'estado', !pesoOk && 'peso', dados.escalao == null && 'peso (desconhecido)'].filter(Boolean);
      return aviso(falta.length ? `VinteDuo: preenchido. Falta escolher: ${falta.join(', ')}.` : 'VinteDuo: preenchido ✓ Revê a categoria e publica.', falta.length > 0);
    }

    const resumo = document.getElementById('summary') as HTMLTextAreaElement | null;
    if (!resumo) return aviso('VinteDuo: não encontrei o formulário de publicação da Wallapop.', true);
    // 1.º clique: resumo e fotografias
    escrever(resumo, dados.titulo);
    const fotos: File[] = dados.fotos ?? [];
    const entrada = (todos(document).find((e) => e instanceof HTMLInputElement && e.type === 'file' && e.multiple && !e.id) ??
      todos(document).find((e) => e instanceof HTMLInputElement && e.type === 'file')) as HTMLInputElement | undefined;
    if (fotos.length && entrada) {
      const dt = new DataTransfer();
      fotos.slice(0, 10).forEach((f) => dt.items.add(f));
      entrada.files = dt.files;
      entrada.dispatchEvent(new Event('change', { bubbles: true }));
    }
    aviso(fotos.length && entrada ? `VinteDuo: resumo e ${Math.min(fotos.length, 10)} fotografia(s) ✓ Carrega em Continuar.` : 'VinteDuo: resumo ✓ (sem fotografias). Carrega em Continuar.', !(fotos.length && entrada));
  })().catch((e) => aviso('VinteDuo: erro — ' + (e instanceof Error ? e.message : String(e)), true));
}

/** Endereço "javascript:" do botão da barra de favoritos. */
export const codigoBotaoWallapop = () => `javascript:(${preencherWallapop.toString()})(${JSON.stringify(ORIGEM_APP)});void 0`;
