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
- Dados de mercado em `public/mercado-sets.json`, gerados todas as semanas por `scripts/mercado.py` (`.github/workflows/mercado.yml`):
  - **Brickset**: lançamento, retirada, PVP e disponibilidade de todos os sets desde 2005.
  - **BrickLink**: preço médio de venda dos últimos 6 meses na Europa (EUR, sem IVA), novo e usado, só para os nossos sets.
  - A lista dos nossos sets vem da função `sets_mercado(token)` no Supabase, protegida pelo `token_mercado` (em `definicoes`) e pelo segredo `VINTEDUO_TOKEN`.
  - As chaves ficam só nos segredos do GitHub, nunca no código, porque o repositório é público.
- Cálculos de investimento em `src/lib/investimento.ts`: rentabilidade anualizada = lucro ÷ (custo × dias ÷ 365). Contam os vendidos e o stock.

## Regras do negócio

- **Acertos (tipo Splitwise):** o custo volta a quem pagou e o lucro vai para a conta conjunta.
  - Contam só as vendas concluídas com `acertada = false`.
  - **Nunca alterar acertos nem marcar vendas como acertadas sem o utilizador pedir.**
- **Limites das contas da Vinted:** ano civil, 30 vendas / 2000 € (DAC7), com aviso aos 80%.
  - Para estes limites contam também as `vendas_externas`, guardadas em `definicoes`.
  - Não contam as vendas listadas em `definicoes.vendas_fora_limites`.
- **Interface:** o mais simples possível. Qualquer janela tem de se poder fechar, e o gesto de voltar fecha-a.

## Técnico

- React + TypeScript, compilado com esbuild (`node scripts/build.mjs`) para `docs/`, que é a pasta publicada no GitHub Pages.
  - Se `node_modules` não existir: `ln -s /opt/npm-tools/node_modules node_modules`.
- Testes: `npx tsx --test tests/*.test.ts`.
- Supabase: no código só vai a chave publishable. **Nunca pedir nem usar a palavra-passe da base de dados nem a chave service_role.**
- Dados guardados em `definicoes` (chave → jsonb), para não precisar de migrações: `listas`, `nomes_mantidos`, `vendas_externas`, `vendas_fora_limites`, `modelo_anuncio`.
