// Dados de exemplo, com datas relativas a hoje, para perceber como a app funciona.
// Todos os registos de exemplo têm identificadores que começam por PREFIXO_EXEMPLO,
// para poderem ser apagados de uma vez em Definições.

import { distribuirCompra, somarDias } from './calc';
import type { Compra, Conta, Dados, Pessoa, Produto, Venda } from './types';
import { LISTAS_PADRAO } from './types';

export const PREFIXO_EXEMPLO = '00000000-0000-4000-8000-';
const id = (n: number) => `${PREFIXO_EXEMPLO}${String(n).padStart(12, '0')}`;
export const eExemplo = (x: { id?: string }) => !!x.id?.startsWith(PREFIXO_EXEMPLO);

export function dadosExemplo(hoje: string): Dados {
  const d = (n: number) => somarDias(hoje, -n);

  const pessoas: Pessoa[] = [
    { id: id(1), nome: 'Ricardo' },
    { id: id(2), nome: 'Ana' },
  ];
  const [ricardo, ana] = pessoas.map((p) => p.id);

  const base: Omit<Conta, 'id' | 'nome'> = {
    utilizador_vinted: null, notas: null, ativa: true, limite_anuncios: null, limite_vendas: null,
    limite_valor: null, periodo: 'mensal', periodo_dias: null, periodo_inicio: null, periodo_fim: null, alerta_pct: 80, titular_id: null,
  };
  const contas: Conta[] = [
    { ...base, id: id(11), nome: 'Conta principal', titular_id: ricardo, utilizador_vinted: 'ricardo_bricks', limite_anuncios: 10, limite_vendas: 8, limite_valor: 600 },
    { ...base, id: id(12), nome: 'Conta da Ana', titular_id: ana, utilizador_vinted: 'ana.toys', limite_anuncios: 6, limite_vendas: 30, periodo: 'rolante', periodo_dias: 30 },
  ];
  const [principal, contaAna] = contas.map((c) => c.id);

  const compras: Compra[] = [];
  const produtos: Produto[] = [];
  let nProduto = 100;

  const pBase = (x: Partial<Produto>): Produto => ({
    id: id(nProduto++), compra_id: null, nome: '', descricao: null, marca: 'LEGO', tema: null, set_numero: null,
    condicao: 'Usado completo', quantidade: 1, data_compra: null, preco_compra: 0, custos_adicionais: 0,
    pessoa_id: null, tipo_pagamento: 'pessoa', estado: 'por_anunciar', conta_id: null, data_anuncio: null, preco_anuncio: null,
    notas: null, fotos: [], ...x,
  });

  function compra(
    n: number, dias: number, pagador: string, metodo: string, vendedor: string,
    distribuicao: Compra['distribuicao'], valor: number, portes: number,
    itens: (Partial<Produto> & { preco?: number })[],
  ) {
    const c: Compra = {
      id: id(n), data: d(dias), metodo_pagamento: metodo, vendedor,
      pessoa_id: pagador === 'conjunta' || pagador === 'dividido' ? null : pagador,
      tipo_pagamento: pagador === 'conjunta' || pagador === 'dividido' ? pagador : 'pessoa',
      valor_artigos: distribuicao === 'igual' ? valor : itens.reduce((a, i) => a + (i.preco || 0), 0),
      portes, outros_custos: 0, distribuicao, notas: null,
    };
    compras.push(c);
    const custos = distribuirCompra(c, itens.map((i) => ({ quantidade: i.quantidade || 1, preco: i.preco || 0 })));
    itens.forEach(({ preco: _p, ...i }, k) =>
      produtos.push(pBase({ ...i, compra_id: c.id, data_compra: c.data, pessoa_id: c.pessoa_id, tipo_pagamento: c.tipo_pagamento, ...custos[k] })),
    );
  }

  // Lote de 3 sets comprado de uma vez, custo dividido igualmente
  compra(21, 120, ricardo, 'MB WAY', 'OLX — lote particular', 'individual', 0, 6, [
    { nome: 'Millennium Falcon (microfighter)', set_numero: '75295', tema: 'Star Wars', preco: 6, estado: 'vendido', conta_id: principal, data_anuncio: d(115) },
    { nome: 'Carro de bombeiros', set_numero: '60374', tema: 'City', preco: 18, estado: 'vendido', conta_id: principal, data_anuncio: d(115) },
    { nome: 'Hogwarts: primeira aula de voo', set_numero: '76395', tema: 'Harry Potter', preco: 26, estado: 'anunciado', conta_id: contaAna, data_anuncio: d(110), preco_anuncio: 35 },
  ]);
  compra(22, 95, 'conjunta', 'Cartão', 'Loja (promoção)', 'individual', 0, 0, [
    { nome: 'Lamborghini Sián FKP 37', set_numero: '42115', tema: 'Technic', condicao: 'Novo e selado', preco: 289, estado: 'vendido', conta_id: contaAna, data_anuncio: d(94) },
    { nome: 'Carro de bombeiros', set_numero: '60374', tema: 'City', condicao: 'Novo e selado', quantidade: 2, preco: 39.98, estado: 'vendido', conta_id: principal, data_anuncio: d(90) },
  ]);
  compra(23, 60, ricardo, 'Saldo Vinted', 'Vinted — joao_lego', 'individual', 0, 3.5, [
    { nome: 'Ninjago — Dragão do Lloyd', set_numero: '71766', tema: 'Ninjago', condicao: 'Usado incompleto', preco: 22, custos_adicionais: 0, estado: 'vendido', conta_id: contaAna, data_anuncio: d(55), notas: 'Faltam 2 peças, encomendadas na Pick a Brick' },
    { nome: 'Minifiguras série 25 (lote)', tema: 'Minifiguras', quantidade: 5, preco: 15, estado: 'anunciado', conta_id: principal, data_anuncio: d(50), preco_anuncio: 5 },
  ]);
  compra(24, 35, 'dividido', 'Dinheiro', 'Feira da Ladra', 'igual', 40, 0, [
    { nome: 'Caixa de peças avulsas 2 kg', marca: 'LEGO', condicao: 'Só peças', estado: 'anunciado', conta_id: contaAna, data_anuncio: d(30), preco_anuncio: 45 },
    { nome: 'Playmobil — Quinta', marca: 'Playmobil', set_numero: null, condicao: 'Usado completo', estado: 'por_anunciar' },
  ]);
  compra(25, 12, ricardo, 'Transferência', 'Marketplace — Pedro', 'individual', 0, 4, [
    { nome: 'Rivendell', set_numero: '10316', tema: 'Icons', condicao: 'Usado completo', preco: 360, estado: 'anunciado', conta_id: principal, data_anuncio: d(10), preco_anuncio: 480 },
    { nome: 'Millennium Falcon (microfighter)', set_numero: '75295', tema: 'Star Wars', preco: 8, estado: 'anunciado', conta_id: principal, data_anuncio: d(10), preco_anuncio: 15 },
  ]);
  compra(26, 3, ana, 'Cartão', 'Loja (promoção)', 'individual', 0, 0, [
    { nome: 'Flores silvestres', set_numero: '10313', tema: 'Icons', condicao: 'Novo e selado', quantidade: 3, preco: 107.97, estado: 'por_anunciar' },
  ]);

  // Produto registado sem compra (ex.: oferecido ou já tínhamos em casa)
  produtos.push(pBase({ nome: 'Hot Wheels — pista Loop', marca: 'Hot Wheels', condicao: 'Usado completo', data_compra: d(80), preco_compra: 0, pessoa_id: ana, estado: 'anunciado', conta_id: contaAna, data_anuncio: d(78), preco_anuncio: 18, notas: 'Já tínhamos em casa' }));

  const p = (nome: string, n = 0) => produtos.filter((x) => x.nome === nome)[n];
  const vBase = { data_conclusao: null, comissao: 0, outros_custos: 0, notas: null, quantidade: 1 };
  const vendas: Venda[] = [
    { ...vBase, id: id(301), produto_id: p('Millennium Falcon (microfighter)').id, data_venda: d(100), data_conclusao: d(96), preco_venda: 14, conta_id: principal, pessoa_id: ricardo, portes: 0, estado: 'concluida' },
    { ...vBase, id: id(302), produto_id: p('Carro de bombeiros').id, data_venda: d(88), data_conclusao: d(84), preco_venda: 32, conta_id: principal, pessoa_id: ricardo, portes: 0, estado: 'concluida' },
    { ...vBase, id: id(303), produto_id: p('Lamborghini Sián FKP 37').id, data_venda: d(70), data_conclusao: d(65), preco_venda: 365, conta_id: contaAna, pessoa_id: ana, portes: 0, comissao: 0, estado: 'concluida', notas: 'Entrega em mão em Braga' },
    { ...vBase, id: id(304), produto_id: p('Carro de bombeiros', 1).id, data_venda: d(45), data_conclusao: d(41), preco_venda: 29, conta_id: principal, pessoa_id: ana, estado: 'concluida', portes: 0 },
    { ...vBase, id: id(305), produto_id: p('Carro de bombeiros', 1).id, data_venda: d(20), data_conclusao: d(16), preco_venda: 31, conta_id: principal, pessoa_id: ricardo, estado: 'concluida', portes: 0 },
    { ...vBase, id: id(306), produto_id: p('Ninjago — Dragão do Lloyd').id, data_venda: d(18), data_conclusao: d(14), preco_venda: 48, conta_id: contaAna, pessoa_id: ana, estado: 'concluida', portes: 0, outros_custos: 2.4, notas: 'Custo das peças em falta' },
    { ...vBase, id: id(307), produto_id: p('Minifiguras série 25 (lote)').id, quantidade: 2, data_venda: d(6), data_conclusao: d(2), preco_venda: 11, conta_id: principal, pessoa_id: ricardo, estado: 'concluida', portes: 0 },
    { ...vBase, id: id(308), produto_id: p('Minifiguras série 25 (lote)').id, quantidade: 1, data_venda: d(1), preco_venda: 6, conta_id: principal, pessoa_id: ricardo, estado: 'pendente', portes: 0 },
    { ...vBase, id: id(309), produto_id: p('Hogwarts: primeira aula de voo').id, data_venda: d(25), preco_venda: 33, conta_id: contaAna, pessoa_id: ana, estado: 'cancelada', portes: 0, notas: 'Comprador desistiu' },
  ];

  const definicoes = Object.entries(LISTAS_PADRAO).map(([chave, l]) => ({ chave, valor: l.valores }));

  return { pessoas, contas, compras, produtos, vendas, acertos: [], definicoes };
}
