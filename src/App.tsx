import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AcoesProvider } from './components/acoes';
import { LimpezaFotos } from './components/fotos';
import { Logo, ConfirmarProvider } from './components/ui';
import { hoje } from './lib/format';
import { dadosExemplo } from './lib/sample';
import { demoTemDados, storeDemo, storeSupabase } from './lib/store';
import type { Store, TabelaDados } from './lib/store';
import { sair, sessaoGuardada } from './lib/supabase';
import { Acertos } from './pages/Acertos';
import { Analises } from './pages/Analises';
import { Avaliar } from './pages/Avaliar';
import { Compras } from './pages/Compras';
import { Contas } from './pages/Contas';
import { Definicoes } from './pages/Definicoes';
import { Entrar } from './pages/Entrar';
import { Inventario } from './pages/Inventario';
import { Painel } from './pages/Painel';
import { ReverNomes } from './pages/ReverNomes';
import { navegar, useRota } from './router';
import { DadosProvider, useDados } from './state';

// Componente principal: decide se mostra o ecrã de entrar ou a app, e monta a estrutura
// (menu lateral no computador, barra de baixo no telemóvel) com o ecrã da rota atual.
//
// "Store" = onde os dados vivem. Há dois:
//   - storeSupabase: a base de dados real, partilhada entre os dois (precisa de sessão).
//   - storeDemo: dados de exemplo guardados só neste browser (localStorage), para experimentar.
// O resto da app não sabe qual dos dois está a usar: fala sempre com a mesma interface (ver lib/store.ts).
//
// Os "Providers" à volta da estrutura disponibilizam coisas a todos os componentes lá dentro:
//   - DadosProvider (state.tsx): os dados carregados e as funções guardar/apagar.
//   - ConfirmarProvider (ui.tsx): janelas de confirmação ("Apagar mesmo?").
//   - AcoesProvider (acoes.tsx): abrir formulários/janelas a partir de qualquer ecrã.

// Lembrar no browser se a última sessão foi em modo demonstração
const CHAVE_MODO = 'gv.modo';
const lerModo = () => {
  try {
    return localStorage.getItem(CHAVE_MODO);
  } catch {
    return null;
  }
};
const gravarModo = (m: string | null) => {
  try {
    if (m) localStorage.setItem(CHAVE_MODO, m);
    else localStorage.removeItem(CHAVE_MODO);
  } catch {
    /* ignorar */
  }
};

export function App() {
  // Ao abrir: modo demo, sessão guardada do Supabase, ou nada (mostra o ecrã de entrar)
  const [store, setStore] = useState<Store | null>(() => {
    if (lerModo() === 'demo') return storeDemo();
    const s = sessaoGuardada();
    return s ? storeSupabase(s.email) : null;
  });
  const [mensagem, setMensagem] = useState<string | null>(null);

  const terminar = useCallback(async () => {
    if (store?.modo === 'supabase') await sair();
    gravarModo(null);
    setStore(null);
    navegar('/');
  }, [store]);

  const expirou = useCallback(() => {
    setMensagem('A sessão terminou. Volta a entrar.');
    void sair();
    setStore(null);
  }, []);

  // Modo demonstração: na primeira vez, carrega os dados de exemplo (lib/sample.ts)
  async function entrarDemo() {
    const s = storeDemo();
    if (!demoTemDados()) {
      const ex = dadosExemplo(hoje());
      for (const t of ['pessoas', 'contas', 'compras', 'produtos', 'vendas', 'acertos', 'definicoes'] as TabelaDados[]) await s.guardar(t, ex[t]);
    }
    gravarModo('demo');
    setStore(s);
  }

  if (!store) {
    return (
      <Entrar
        mensagem={mensagem}
        aoEntrar={(email) => {
          setMensagem(null);
          gravarModo('supabase');
          setStore(storeSupabase(email));
        }}
        aoDemo={entrarDemo}
      />
    );
  }

  return (
    <DadosProvider store={store} aoExpirar={expirou} key={store.modo + store.utilizador}>
      <ConfirmarProvider>
        <AcoesProvider>
          <Estrutura aoSair={terminar} />
          {/* Apaga as fotografias dos produtos vendidos há mais de 30 dias (fica a miniatura) */}
          <LimpezaFotos />
        </AcoesProvider>
      </ConfirmarProvider>
    </DadosProvider>
  );
}

// Entradas do menu. As "principais" aparecem na barra de baixo do telemóvel; as outras em "Mais".
const MENU: { rota: string; nome: string; icone: ReactNode; principal?: boolean }[] = [
  { rota: '/', nome: 'Painel', principal: true, icone: <path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z" /> },
  { rota: '/produtos', nome: 'Produtos', principal: true, icone: <path d="M4 7h16v13H4zM2 3h20v4H2zm7 7h6v2H9z" /> },
  { rota: '/analises', nome: 'Análises', principal: true, icone: <path d="M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z" /> },
  // "Vale a pena?": até que preço comprar um set. Ícone: uma etiqueta de preço. Na barra de baixo no
  // lugar das Contas (pedido do Ricardo); as Contas passaram para "Mais".
  { rota: '/avaliar', nome: 'Vale a pena?', principal: true, icone: <path d="M21.4 11.6l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .6.2 1.1.6 1.4l9 9c.4.4.9.6 1.4.6s1-.2 1.4-.6l7-7c.4-.4.6-.9.6-1.4s-.2-1-.6-1.4zM6.5 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" /> },
  { rota: '/contas', nome: 'Contas', icone: <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" /> },
  { rota: '/compras', nome: 'Compras', icone: <path d="M7 4h14l-2 9H8.2l-.4 2H19v2H5.4l1.2-6L5 3H2V1h4.6zM8 20a2 2 0 1 0 0 .01zm9 0a2 2 0 1 0 0 .01z" /> },
  { rota: '/acertos', nome: 'Acertos', icone: <path d="M7 7h11l-3-3 1.4-1.4L22.8 9l-6.4 6.4L15 14l3-3H7zm10 10H6l3 3-1.4 1.4L1.2 15l6.4-6.4L9 10l-3 3h11z" /> },
  { rota: '/definicoes', nome: 'Definições', icone: <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.5 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" /> },
];

/** Ícone SVG simples (os desenhos dos ícones estão no MENU, como "paths" de 24×24). */
function Icone({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

/**
 * Estrutura visível depois de entrar: menu lateral (computador), barra de cima e de baixo
 * (telemóvel) e, no meio, o ecrã correspondente à rota atual.
 */
function Estrutura({ aoSair }: { aoSair(): void }) {
  const rota = useRota();
  const { store, carregando, erro, recarregar, ultimaAtualizacao } = useDados();
  const [aAtualizar, setAAtualizar] = useState(false);
  const base = '/' + (rota.split('/')[1] ?? '');

  // Escolher o ecrã pela rota. Algumas rotas antigas (/inventario, /vendas) continuam a funcionar.
  // O "key" obriga o React a recriar o ecrã quando a rota muda (para repor filtros iniciais).
  const pagina = useMemo(() => {
    switch (base) {
      case '/produtos': return <Inventario key={rota} inicial={rota.startsWith('/produtos/vendidos') ? 'vendidos' : 'por_vender'} />;
      case '/inventario': return <Inventario />;
      case '/compras': return <Compras />;
      case '/avaliar': return <Avaliar />;
      case '/vendas': return <Inventario key="vendas" inicial="vendidos" />;
      case '/contas': return <Contas />;
      case '/acertos': return <Acertos />;
      case '/analises': return <Analises />;
      case '/definicoes': return <Definicoes aoSair={aoSair} />;
      case '/mais': return <Mais />;
      case '/rever-nomes': return <ReverNomes />;
      default: return <Painel />;
    }
  }, [base, rota, aoSair]);

  // Voltar a ir buscar os dados à base de dados (ex.: para ver o que a outra pessoa registou)
  async function atualizar() {
    setAAtualizar(true);
    await recarregar();
    setAAtualizar(false);
  }

  return (
    <div className="app">
      <aside className="lateral">
        <div className="marca">
          <Logo />
          <span>VinteDuo</span>
        </div>
        <nav>
          {MENU.map((m) => (
            <a key={m.rota} href={`#${m.rota}`} className={base === m.rota ? 'ativo' : ''}>
              <Icone>{m.icone}</Icone>
              {m.nome}
            </a>
          ))}
        </nav>
        <div className="lateral-rodape">
          {store.modo === 'demo' && <span className="chip chip-demo">Modo demonstração</span>}
          <button className="link" onClick={atualizar} disabled={aAtualizar}>
            {aAtualizar ? 'A atualizar…' : '↻ Atualizar dados'}
          </button>
          {ultimaAtualizacao && <small className="mudo">às {ultimaAtualizacao.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</small>}
        </div>
      </aside>

      <header className="topo-movel">
        <div className="marca">
          <Logo />
          <span>VinteDuo</span>
          {store.modo === 'demo' && <span className="chip chip-demo">demo</span>}
        </div>
        <button className="btn-icone" onClick={atualizar} aria-label="Atualizar dados" disabled={aAtualizar}>
          <span className={aAtualizar ? 'a-rodar' : ''}>↻</span>
        </button>
      </header>

      <main className="principal">
        {erro && (
          <div className="faixa-erro">
            <strong>Não foi possível carregar os dados.</strong> {erro}{' '}
            <button className="link" onClick={atualizar}>Tentar de novo</button>
          </div>
        )}
        {carregando ? <div className="a-carregar">A carregar…</div> : pagina}
      </main>

      <nav className="barra-movel">
        {MENU.filter((m) => m.principal).map((m) => (
          <a key={m.rota} href={`#${m.rota}`} className={base === m.rota ? 'ativo' : ''}>
            <Icone>{m.icone}</Icone>
            <span>{m.nome}</span>
          </a>
        ))}
        <a href="#/mais" className={['/mais', '/contas', '/compras', '/analises', '/definicoes', '/rever-nomes'].includes(base) ? 'ativo' : ''}>
          <Icone><path d="M4 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" /></Icone>
          <span>Mais</span>
        </a>
      </nav>
    </div>
  );
}

function Mais() {
  return (
    <div className="pagina">
      <h1>Mais</h1>
      <nav className="menu-mais">
        {MENU.filter((m) => !m.principal).map((m) => (
          <a key={m.rota} href={`#${m.rota}`}>
            <Icone>{m.icone}</Icone>
            <span>{m.nome}</span>
            <span className="mudo">›</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
