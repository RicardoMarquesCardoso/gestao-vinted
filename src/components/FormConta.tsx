import { useState } from 'react';
import { lerNumero } from '../lib/format';
import type { Conta, TipoPeriodo } from '../lib/types';
import { PERIODOS } from '../lib/types';
import { useDados } from '../state';
import { paraCampo, vazioANull } from './acoes';
import { Campo, Dinheiro, Janela, useConfirmar } from './ui';

export function FormConta({ id, aoFechar }: { id?: string; aoFechar(): void }) {
  const { dados, guardar, apagar, aviso } = useDados();
  const confirmar = useConfirmar();
  const existente = dados.contas.find((c) => c.id === id);
  const inteiro = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

  const [f, setF] = useState(() => ({
    nome: existente?.nome ?? '',
    utilizador_vinted: existente?.utilizador_vinted ?? '',
    ativa: existente?.ativa ?? true,
    limite_anuncios: inteiro(existente?.limite_anuncios),
    limite_vendas: inteiro(existente?.limite_vendas),
    limite_valor: paraCampo(existente?.limite_valor),
    periodo: (existente?.periodo ?? 'mensal') as TipoPeriodo,
    periodo_dias: inteiro(existente?.periodo_dias ?? 30),
    periodo_inicio: existente?.periodo_inicio ?? '',
    periodo_fim: existente?.periodo_fim ?? '',
    alerta_pct: inteiro(existente?.alerta_pct ?? 80),
    notas: existente?.notas ?? '',
  }));
  const mudar = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const nOuNull = (s: string) => (s.trim() === '' ? null : lerNumero(s));

  async function submeter() {
    if (!f.nome.trim()) return aviso('Dá um nome à conta.', 'erro');
    if (f.periodo === 'personalizado' && (!f.periodo_inicio || !f.periodo_fim))
      return aviso('Indica o início e o fim do período.', 'erro');
    const c: Conta = {
      id: existente?.id ?? crypto.randomUUID(),
      nome: f.nome.trim(),
      utilizador_vinted: vazioANull(f.utilizador_vinted),
      notas: vazioANull(f.notas),
      ativa: f.ativa,
      limite_anuncios: nOuNull(f.limite_anuncios),
      limite_vendas: nOuNull(f.limite_vendas),
      limite_valor: nOuNull(f.limite_valor),
      periodo: f.periodo,
      periodo_dias: f.periodo === 'rolante' ? Math.max(Math.round(lerNumero(f.periodo_dias)) || 30, 1) : null,
      periodo_inicio: f.periodo === 'personalizado' ? f.periodo_inicio : null,
      periodo_fim: f.periodo === 'personalizado' ? f.periodo_fim : null,
      alerta_pct: Math.min(Math.max(Math.round(lerNumero(f.alerta_pct)) || 80, 1), 100),
    };
    try {
      await guardar('contas', [c]);
      aviso(existente ? 'Conta atualizada.' : 'Conta criada.');
      aoFechar();
    } catch (e) {
      aviso(`Erro ao guardar: ${e instanceof Error ? e.message : e}`, 'erro');
    }
  }

  async function eliminar() {
    if (!existente) return;
    const usada = dados.vendas.some((v) => v.conta_id === existente.id) || dados.produtos.some((p) => p.conta_id === existente.id);
    const ok = await confirmar({
      titulo: 'Apagar conta',
      texto: usada
        ? `A conta "${existente.nome}" tem produtos ou vendas associados, que vão ficar sem conta. Em vez de apagar, podes desmarcar "Conta ativa". Apagar mesmo assim?`
        : `Apagar a conta "${existente.nome}"?`,
      botao: 'Apagar conta',
      perigo: true,
    });
    if (!ok) return;
    try {
      await apagar('contas', existente.id);
      aviso('Conta apagada.');
      aoFechar();
    } catch (e) {
      aviso(`Erro ao apagar: ${e instanceof Error ? e.message : e}`, 'erro');
    }
  }

  return (
    <Janela
      titulo={existente ? 'Editar conta' : 'Nova conta da Vinted'}
      aoFechar={aoFechar}
      rodape={
        <>
          {existente && (
            <button className="btn btn-perigo-texto" onClick={eliminar}>
              Apagar
            </button>
          )}
          <span className="espaco" />
          <button className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn btn-primario" onClick={submeter}>
            Guardar
          </button>
        </>
      }
    >
      <div className="grelha-form">
        <Campo rotulo="Nome da conta *">
          <input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} placeholder="Ex.: Conta principal" />
        </Campo>
        <Campo rotulo="Utilizador na Vinted">
          <input value={f.utilizador_vinted} onChange={(e) => mudar('utilizador_vinted', e.target.value)} />
        </Campo>
        <label className="caixa campo-largo">
          <input type="checkbox" checked={f.ativa} onChange={(e) => mudar('ativa', e.target.checked)} /> Conta ativa
        </label>
      </div>

      <h4 className="secao-form">Limites</h4>
      <p className="nota">Deixa em branco os limites que não se aplicam. Define-os de acordo com as regras que se aplicam a esta conta.</p>
      <div className="grelha-form">
        <Campo rotulo="Máx. de anúncios ativos">
          <input inputMode="numeric" value={f.limite_anuncios} onChange={(e) => mudar('limite_anuncios', e.target.value.replace(/\D/g, ''))} />
        </Campo>
        <Campo rotulo="Máx. de vendas no período">
          <input inputMode="numeric" value={f.limite_vendas} onChange={(e) => mudar('limite_vendas', e.target.value.replace(/\D/g, ''))} />
        </Campo>
        <Campo rotulo="Máx. de valor vendido no período">
          <Dinheiro valor={f.limite_valor} mudar={(v) => mudar('limite_valor', v)} placeholder="" />
        </Campo>
        <Campo rotulo="Período dos limites">
          <select value={f.periodo} onChange={(e) => mudar('periodo', e.target.value as TipoPeriodo)}>
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        {f.periodo === 'rolante' && (
          <Campo rotulo="Número de dias">
            <input inputMode="numeric" value={f.periodo_dias} onChange={(e) => mudar('periodo_dias', e.target.value.replace(/\D/g, ''))} />
          </Campo>
        )}
        {f.periodo === 'personalizado' && (
          <>
            <Campo rotulo="De">
              <input type="date" value={f.periodo_inicio} onChange={(e) => mudar('periodo_inicio', e.target.value)} />
            </Campo>
            <Campo rotulo="Até">
              <input type="date" value={f.periodo_fim} onChange={(e) => mudar('periodo_fim', e.target.value)} />
            </Campo>
          </>
        )}
        <Campo rotulo="Avisar a partir de (%)" ajuda="Ex.: 80 avisa quando chega a 80% do limite">
          <input inputMode="numeric" value={f.alerta_pct} onChange={(e) => mudar('alerta_pct', e.target.value.replace(/\D/g, ''))} />
        </Campo>
        <Campo rotulo="Notas" largo>
          <textarea rows={2} value={f.notas} onChange={(e) => mudar('notas', e.target.value)} placeholder="Regras da conta, observações…" />
        </Campo>
      </div>
    </Janela>
  );
}
