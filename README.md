# Gestão Vinted

App web para gerir compras e vendas de brinquedos (sobretudo LEGO) na Vinted, a dois, com os dados sincronizados. Funciona no telemóvel e no computador e pode ser instalada no ecrã inicial.

## O que faz

- **Inventário**: produtos com set LEGO, tema, condição, quantidade, custo, quem pagou, estado, conta e fotografias. Pesquisa, filtros e exportação para CSV.
- **Compras**: uma compra pode ter vários produtos. O custo pode ser indicado produto a produto, ou o valor total pode ser dividido igualmente. Os portes e outros custos são distribuídos automaticamente.
- **Vendas**: o valor líquido e o lucro são calculados automaticamente (preço − comissões − portes − outros custos − custo do produto). O estado do produto passa a "Vendido" quando todas as unidades são vendidas.
- **Contas da Vinted**: limites próprios por conta (anúncios ativos, n.º de vendas e valor vendido por período), com avisos quando se aproximam do limite.
- **Painel e Análises**: lucro, recebido, gasto, inventário, lucro por mês/conta/pessoa, comparação de preços pelo n.º do set, tempo até vender e produtos parados.
- **Segurança dos registos**: apagar pede sempre confirmação e todas as alterações ficam num histórico que não pode ser alterado.

## Configuração (uma vez)

### 1. Base de dados no Supabase

1. No Supabase, abre o projeto → **SQL Editor** → **New query**.
2. Abre o ficheiro [`supabase/schema.sql`](supabase/schema.sql), **substitui `EMAIL_1@exemplo.com` e `EMAIL_2@exemplo.com` pelos vossos emails**, cola tudo e carrega em **Run**.
3. **Authentication → Users → Add user → Create new user**: cria um utilizador para cada um (email + palavra-passe, com **Auto Confirm User** ativado).
4. **Authentication → Sign In / Providers**: desativa **Allow new users to sign up**, para mais ninguém poder criar conta.

Só os emails da tabela `membros` conseguem ver ou alterar dados. Para acrescentar alguém, acrescenta o email nessa tabela (Table Editor → membros).

### 2. Publicar no GitHub Pages

No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, pasta `/docs` → Save**.

A app fica em `https://ricardomarquescardoso.github.io/gestao-vinted/`.

### 3. Instalar no telemóvel

- **iPhone (Safari)**: botão Partilhar → **Adicionar ao ecrã principal**.
- **Android (Chrome)**: menu ⋮ → **Instalar app** ou **Adicionar ao ecrã principal**.

## Experimentar sem configurar nada

No ecrã de entrada, carrega em **Experimentar com dados de exemplo**. Os dados ficam só nesse browser. Com sessão iniciada, os dados de exemplo podem ser carregados e apagados em **Definições**.

## Executar no computador

É preciso ter o [Node.js](https://nodejs.org) (versão 20 ou mais recente).

```bash
npm install
npm run dev      # abre em http://localhost:5173 e atualiza ao gravar
npm test         # testes dos cálculos
npm run build    # gera a versão publicada na pasta docs/
```

Depois de alterar o código, corre `npm run build` e faz commit da pasta `docs/` para o GitHub Pages publicar a nova versão.

## Estrutura

```
src/
  config.ts          URL e chave pública do Supabase
  lib/calc.ts        cálculos de custo, lucro, limites e estatísticas
  lib/supabase.ts    ligação ao Supabase (login, dados, fotografias)
  lib/store.ts       dados no Supabase ou no modo de demonstração
  lib/sample.ts      dados de exemplo
  state.tsx          dados partilhados pela app + histórico de alterações
  components/        formulários e componentes
  pages/             ecrãs (Painel, Inventário, Compras, Vendas, Contas, Análises, Definições)
supabase/schema.sql  tabelas e regras de segurança
docs/                versão publicada (gerada por npm run build)
tests/               testes dos cálculos
```

**Tecnologias:** React + TypeScript, compilado com esbuild; Supabase (Postgres, autenticação e armazenamento de fotografias) com Row Level Security; publicado no GitHub Pages.
