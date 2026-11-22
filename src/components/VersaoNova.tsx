// Aviso "Há uma versão nova — Recarregar" (pedido do Ricardo, nov/2026).
//
// PORQUÊ: a app recarrega os DADOS de minuto a minuto, mas o PROGRAMA só muda quando se recarrega a
// página. Um telemóvel com a app aberta há dias continua com a versão antiga, que pode gravar dados à
// maneira antiga (ex.: na troca para os anúncios por plataforma). Por isso, quando há uma versão
// publicada mais recente, aparece uma faixa no topo com o botão "Recarregar".
//
// COMO: cada compilação (scripts/build.mjs) gera um código de versão, que fica dentro do programa
// (VERSAO_APP) e num ficheiro à parte, versao.json. A app vai ler versao.json (sem cache) ao abrir,
// ao voltar à app e de 5 em 5 minutos; se o código for diferente do seu, mostra a faixa.

import { useEffect, useState } from 'react';

// Posto pelo esbuild no momento da compilação (ver scripts/build.mjs, opção "define")
declare const VERSAO_APP: string;
const versaoAtual = typeof VERSAO_APP === 'string' ? VERSAO_APP : '';

/** Lê a versão publicada (sem usar cópias guardadas pelo browser). null = não se sabe. */
async function versaoPublicada(): Promise<string | null> {
  try {
    const r = await fetch(`versao.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as { versao?: unknown };
    return typeof j.versao === 'string' ? j.versao : null;
  } catch {
    return null; // sem rede: tenta-se outra vez mais tarde
  }
}

export function VersaoNova() {
  const [nova, setNova] = useState(false);
  useEffect(() => {
    if (!versaoAtual) return; // compilação sem código de versão (ex.: testes de lógica)
    let ativo = true;
    const ver = async () => {
      const v = await versaoPublicada();
      if (ativo && v && v !== versaoAtual) setNova(true);
    };
    void ver();
    const aoVoltar = () => document.visibilityState === 'visible' && void ver();
    document.addEventListener('visibilitychange', aoVoltar);
    const t = setInterval(() => document.visibilityState === 'visible' && void ver(), 5 * 60000);
    return () => {
      ativo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
      clearInterval(t);
    };
  }, []);
  if (!nova) return null;
  return (
    <div className="versao-nova" role="alert">
      <span>Há uma versão nova da app.</span>
      <button type="button" className="btn btn-primario btn-pequeno" onClick={() => location.reload()}>
        Recarregar
      </button>
    </div>
  );
}
