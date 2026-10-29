# VinteDuo — notas para o Claude

App do Ricardo e da Cass para gerir compras e vendas de brinquedos (sobretudo LEGO) na Vinted. Português de Portugal em toda a interface e no código.

## Visão: isto é também uma app de investimento

Os sets LEGO funcionam como um investimento: quando um set é retirado de produção, o preço tende a subir. Mas, como em qualquer investimento, **o tempo que o dinheiro fica preso conta tanto como o lucro**. Em todas as decisões (dados a guardar, análises, sugestões), pensar em:

- **Rentabilidade no tempo**, não só lucro: lucro ÷ custo, anualizado pelos dias entre a compra e a venda. Considerar também o capital parado (custo × dias em stock).
- **Tempo anunciado** vs. tempo em stock: são coisas diferentes, e as duas interessam.
- **Ciclo de vida do set**: quando sai, quando é retirado e como evolui o preço de mercado.
- **Objetivo futuro**: a app deve sugerir compras com base nas promoções do dia, comparando o preço da promoção com o histórico de venda dos sets e com o tempo esperado até vender.

Guardar os dados que permitam estas análises desde já, mesmo que ainda não apareçam na interface.

## Dados que já se guardam para isso

- `produtos.data_compra`, o custo (`preco_compra` + `custos_adicionais`) e, nas vendas, `data_venda`. Isto dá os dias com o capital preso.
- `produtos.anuncios` (jsonb): os períodos em que o produto esteve anunciado, no formato `{inicio, fim, motivo, conta_id, preco, precos[]}`.
  - São preenchidos automaticamente em `state.tsx` → `atualizarPeriodos` (`src/lib/anuncios.ts`).
  - Os registos com `aproximado: true` foram reconstruídos a partir de `data_anuncio`.
- Catálogo oficial de sets (Rebrickable) em `public/catalogo-sets.json`, com o ano de lançamento. É atualizado todos os meses pela GitHub Action.
- Dados de mercado em `public/mercado-sets.json`, gerados todos os dias por `scripts/mercado.py` (`.github/workflows/mercado.yml`):
  - **Brickset** (ligado, segredo `BRICKSET_API_KEY`): lançamento, retirada (real ou prevista), PVP e disponibilidade de ~15 mil sets desde 2005.
  - **BrickLink**: código preparado, mas **sem acesso** (a API é só para vendedores com loja).
  - **eBay** (Browse API, grátis): mediana dos preços **pedidos** por sets novos nas lojas eBay DE/FR/ES/IT, só para os nossos sets. A app aplica o **desconto real medido nas nossas vendas** (`calibrarEbay`, em out/2026 ~37%: vendemos a ~63% do pedido no eBay); `descontoEbay` (37%) é só a reserva quando há menos de 10 sets para comparar. **Cada venda compara-se com o eBay da mesma altura** (pedido do Ricardo): histórico `ebay_hist` (tarefa diária, desde 28/10/2026, ±30 dias) ou, sem histórico, o eBay de hoje só para sets ainda à venda na LEGO. Nunca comparar vendas antigas com o eBay de hoje para sets que mudaram de fase. Ajusta-se sozinho a cada venda. Ver o preço vendido do eBay (Marketplace Insights) é API restrita; fazer scrape do eBay ou da Vinted foi posto de parte (termos de uso). Segredos `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET`.
  - **Pokémon** (PokemonPriceTracker, plano grátis): preço TCGplayer (EUA) dos produtos Pokémon selados em stock, pesquisados pelo nome (função `pokemon_mercado`). Só aceita resultados inequívocos; senão guarda candidatos e a app pergunta "Qual destes é?". As associações manuais ficam em `definicoes.pokemon_ids`. Preços absurdos face ao custo são ignorados.
  - A lista dos nossos sets vem da função `sets_mercado(token)` no Supabase, protegida pelo `token_mercado` (em `definicoes`) e pelo segredo `VINTEDUO_TOKEN`.
  - As chaves ficam só nos segredos do GitHub (e, para a função `ebay-set`, nos segredos do Supabase), nunca no código, porque o repositório é público.
- **Vale a pena?** (`src/lib/avaliar.ts`, `pages/Avaliar.tsx`, rota `#/avaliar`): escreve-se só o n.º do set e mostra até que preço comprar e quantas unidades (`precosCompra`): escalões bom (`margemVender`, 1 un.), muito bom (`margemCompraOtima` 40%, até 2) e oportunidade rara (`margemCompraRara` 75%, até 3), contando o stock, e nunca mais de `maxCapitalPorSet` (10%) do dinheiro em stock num só set. **Diversificar é uma decisão do Ricardo: não acumular muitos sets iguais salvo oportunidade de outro mundo.** Sem campo de preço nem de portes. Venda esperada: nossas vendas → eBay (ao vivo pela Edge Function `ebay-set`, ou o do dia) × `calibrarEbay` → PVP × `calibrarPvp` (rácio medido nas nossas vendas, à venda ~0,73 / retirado ~0,80). Tempo até vender pelo histórico (set → tema com ≥ 5 vendas → geral; datas de compra importadas são aproximadas). Preço máximo nunca acima de venda − 5 € (vagas DAC7). Links (só links, não se lê nada): `urlVinted`, `urlEbayVendidos`.
  - **Teste com o passado (out/2026, 102 vendas LEGO):** erro típico nossas vendas 11%, eBay 12%, PVP 20% (+18% de desvio). Nas nossas vendas os sets retirados **não subiram** como as taxas dos planos assumem (~0,80 do PVP depois da retirada vs. 1,10–1,48 assumido). Os planos ainda usam as taxas: mudar isso exige mostrar primeiro o impacto no stock.
  - **Edge Function `ebay-set`** (`supabase/functions/ebay-set/index.ts`, `verify_jwt` desligado porque confirma `e_membro` com o token de quem pede): chaves `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` nos segredos do Supabase (postos pelo Ricardo, nunca no chat). Sem chaves responde `sem_chaves`.
  - **Promoção da loja** (`components/AvaliarPromocao.tsx`, `avaliarPromocao`, `extrairSets`): desconto X% + lista de sets (ou texto colado da página da loja). Preço = PVP × (1 − X) (lojas grandes partem do PVP, decisão do Ricardo). Ordena pelo lucro "seguro" (venda × (1 − erro típico)), no máx. 2 compras por tema, mostra "compensa a partir de Y%" e exporta CSV. A app não lê links de lojas (CORS / termos de uso): cola-se o texto. Em out/2026 a mediana do desconto necessário era ~44%.
  - `definicoes.sets_avaliar`: sets acompanhados sem os ter; `sets_mercado` inclui-os para a tarefa diária.
- Cálculos de investimento em `src/lib/investimento.ts`: rentabilidade anualizada = lucro ÷ (custo × dias ÷ 365). Contam os vendidos e o stock.
- **Planos e tarefas** (`src/lib/plano.ts`): cada produto em stock tem o plano "vender" ou "guardar até X", e o Painel mostra "O que fazer" (anunciar a X €, baixar para Y €, rever).
  - **Princípio:** vender logo que o lucro previsto compense (`margemVender`), porque o dinheiro volta mais depressa para reinvestir.
  - **Exceção, a subida da retirada:** sets LEGO que saem de produção nos próximos 6 meses (ou saíram há menos de 6) guardam-se até ~6 meses depois da retirada, seja qual for o valor (decisão do Ricardo: o que interessa é avisar da retirada; regras `mesesAntesRetirada`, `mesesDepoisRetirada`). As taxas de valorização são fixas e genéricas, por isso não servem para decidir guardar fora desta janela. Análises por set mais complexas ficam para quando houver a API do BrickEconomy (paga).
  - Só se guarda quando vender agora dá pouco e a valorização esperada (por fase: à venda / retirado há menos de 2 anos / depois) rende pelo menos `rentabMinGuardar` por ano.
  - Preço de referência: as nossas vendas (2 anos) → BrickLink → eBay com desconto → TCGplayer (Pokémon) → PVP (×0,8 se ainda à venda; se retirado, PVP valorizado desde a retirada pelas taxas das regras, máx. ×2).
  - **Anuncia-se 1 unidade de cada produto de cada vez**: se já há um igual anunciado, não se sugere anunciar outro.
  - **Sinal nos cartões** (`sinais()`): bolinha verde (a correr) / amarela (há ação) / azul (guardado) / vermelha (anunciado > 60 dias ou prazo acabou) + uma linha com a próxima ação, em vez de etiquetas. Decisão do Ricardo: a interface deve ter sempre harmonia e o mínimo de etiquetas.
  - Regras editáveis em Definições (`regras_plano`). Decisões manuais em `planos` (por set + condição). Tarefas adiadas em `tarefas_adiadas`.

## Regras do negócio

- **Acertos (tipo Splitwise):** o custo volta a quem pagou e o lucro vai para a conta conjunta.
  - Contam só as vendas concluídas com `acertada = false`.
  - **Nunca alterar acertos nem marcar vendas como acertadas sem o utilizador pedir.**
- **Limites das contas da Vinted:** ano civil, 30 vendas / 2000 € (DAC7), com aviso aos 80%.
  - Para estes limites contam também as `vendas_externas`, guardadas em `definicoes`.
  - Não contam as vendas listadas em `definicoes.vendas_fora_limites`.
- **Interface:** o mais simples possível. Qualquer janela tem de se poder fechar, e o gesto de voltar fecha-a.

## Documentação (pedido do Ricardo)

- **Comentar todo o código** de forma didática, para quem não é programador perceber: um comentário no topo de cada ficheiro (para que serve e como funciona) e comentários nas funções e na lógica menos óbvia.
- **Manter o `README.md` atualizado** a cada mudança relevante: arquitetura, fluxo de dados, modelo de dados, fórmulas, dados externos, segurança e mapa dos ficheiros.

## Técnico

- React + TypeScript, compilado com esbuild (`node scripts/build.mjs`) para `docs/`, que é a pasta publicada no GitHub Pages.
  - Se `node_modules` não existir: `ln -s /opt/npm-tools/node_modules node_modules`.
- Testes: `npx tsx --test tests/*.test.ts`.
- Supabase: no código só vai a chave publishable. **Nunca pedir nem usar a palavra-passe da base de dados nem a chave service_role.**
- Dados guardados em `definicoes` (chave → jsonb), para não precisar de migrações: `listas`, `nomes_mantidos`, `vendas_externas`, `vendas_fora_limites`, `modelo_anuncio`, `regras_plano`, `planos`, `tarefas_adiadas`, `pokemon_ids`, `token_mercado`, `sets_avaliar`.
