// Tipos de dados da app. Os nomes dos campos são iguais às colunas da base de dados.

export type EstadoProduto = 'por_anunciar' | 'anunciado' | 'vendido' | 'devolvido' | 'cancelado';
export type EstadoVenda = 'pendente' | 'concluida' | 'cancelada' | 'devolvida';
export type TipoPeriodo = 'mensal' | 'semanal' | 'anual' | 'rolante' | 'personalizado';
export type Distribuicao = 'igual' | 'individual';
/** Quem pagou: uma pessoa (pessoa_id), a conta conjunta, ou dividido em partes iguais. */
export type TipoPagamento = 'pessoa' | 'conjunta' | 'dividido';
/** Uma "parte" nos acertos: o id de uma pessoa ou a conta conjunta. */
export const CONJUNTA = 'conjunta';

export interface Pessoa {
  id: string;
  nome: string;
  criado_em?: string;
}

export interface Conta {
  id: string;
  nome: string;
  utilizador_vinted: string | null;
  notas: string | null;
  ativa: boolean;
  limite_anuncios: number | null;
  limite_vendas: number | null;
  limite_valor: number | null;
  periodo: TipoPeriodo;
  periodo_dias: number | null;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  alerta_pct: number;
  titular_id: string | null; // quem recebe o dinheiro das vendas desta conta
  criado_em?: string;
}

export interface Compra {
  id: string;
  data: string; // AAAA-MM-DD
  pessoa_id: string | null;
  tipo_pagamento: TipoPagamento;
  metodo_pagamento: string | null;
  vendedor: string | null;
  valor_artigos: number;
  portes: number;
  outros_custos: number;
  distribuicao: Distribuicao;
  notas: string | null;
  criado_em?: string;
}

export interface Produto {
  id: string;
  compra_id: string | null;
  nome: string;
  descricao: string | null;
  marca: string | null;
  tema: string | null;
  set_numero: string | null;
  condicao: string | null;
  quantidade: number;
  data_compra: string | null;
  preco_compra: number; // total pago por todas as unidades
  custos_adicionais: number; // portes, peças em falta, etc. (total)
  pessoa_id: string | null;
  tipo_pagamento: TipoPagamento;
  estado: EstadoProduto;
  conta_id: string | null;
  data_anuncio: string | null;
  preco_anuncio: number | null;
  notas: string | null;
  fotos: string[];
  /** Períodos em que esteve anunciado (guardado automaticamente). */
  anuncios?: PeriodoAnuncio[];
  criado_em?: string;
}

/** Um período em que o produto esteve anunciado na Vinted. */
export interface PeriodoAnuncio {
  inicio: string; // data ou data e hora (ISO)
  fim?: string | null; // vazio enquanto continua anunciado
  motivo?: 'vendido' | 'retirado' | 'outro';
  conta_id?: string | null;
  preco?: number | null; // preço com que foi anunciado
  precos?: { quando: string; preco: number | null }[]; // mudanças de preço durante o anúncio
  aproximado?: boolean; // reconstruído a partir da data de anúncio (sem hora)
}

export interface Venda {
  id: string;
  produto_id: string;
  quantidade: number;
  data_venda: string;
  data_conclusao: string | null;
  preco_venda: number;
  conta_id: string | null;
  pessoa_id: string | null;
  comissao: number;
  portes: number;
  outros_custos: number;
  estado: EstadoVenda;
  notas: string | null;
  /** Já acertada fora da app (o lucro e o custo já foram distribuídos). */
  acertada?: boolean;
  criado_em?: string;
}

export interface Historico {
  id: string;
  quando: string;
  utilizador: string | null;
  tabela: string;
  registo_id: string;
  acao: 'criar' | 'editar' | 'apagar';
  antes: unknown;
  depois: unknown;
}

export interface Acerto {
  id: string;
  data: string;
  de: string; // id da pessoa ou 'conjunta'
  para: string;
  valor: number;
  notas: string | null;
  criado_em?: string;
}

export interface Definicao {
  chave: string;
  valor: string[];
}

export interface Dados {
  pessoas: Pessoa[];
  contas: Conta[];
  compras: Compra[];
  produtos: Produto[];
  vendas: Venda[];
  acertos: Acerto[];
  definicoes: Definicao[];
}

export type Tabela = keyof Dados | 'historico';

export const ESTADOS_PRODUTO: { valor: EstadoProduto; nome: string }[] = [
  { valor: 'por_anunciar', nome: 'Por anunciar' },
  { valor: 'anunciado', nome: 'Anunciado' },
  { valor: 'vendido', nome: 'Vendido' },
  { valor: 'devolvido', nome: 'Devolvido' },
  { valor: 'cancelado', nome: 'Cancelado' },
];

export const ESTADOS_VENDA: { valor: EstadoVenda; nome: string }[] = [
  { valor: 'pendente', nome: 'Pendente' },
  { valor: 'concluida', nome: 'Concluída' },
  { valor: 'cancelada', nome: 'Cancelada' },
  { valor: 'devolvida', nome: 'Devolvida' },
];

export const PERIODOS: { valor: TipoPeriodo; nome: string }[] = [
  { valor: 'mensal', nome: 'Mês civil' },
  { valor: 'semanal', nome: 'Semana (seg. a dom.)' },
  { valor: 'anual', nome: 'Ano civil' },
  { valor: 'rolante', nome: 'Últimos N dias' },
  { valor: 'personalizado', nome: 'Datas definidas por nós' },
];

export const LISTAS_PADRAO: Record<string, { nome: string; valores: string[] }> = {
  condicoes: {
    nome: 'Condições',
    valores: ['Novo e selado', 'Novo sem selo', 'Usado completo', 'Usado incompleto', 'Com caixa', 'Sem caixa', 'Com instruções', 'Sem instruções', 'Só peças'],
  },
  metodos_pagamento: {
    nome: 'Métodos de pagamento',
    valores: ['MB WAY', 'Cartão', 'Transferência', 'Dinheiro', 'Saldo Vinted', 'PayPal'],
  },
  marcas: { nome: 'Marcas', valores: ['LEGO', 'Playmobil', 'Hot Wheels', 'Outra'] },
  temas: {
    nome: 'Temas',
    valores: ['City', 'Technic', 'Star Wars', 'Harry Potter', 'Friends', 'Creator', 'Ninjago', 'Ideas', 'Icons', 'Duplo', 'Classic', 'Marvel', 'Speed Champions', 'Minecraft'],
  },
};
