# Guia técnico da VinteDuo

Complementa o `README.md`. O README explica **como a app funciona** (dados, regras, fórmulas, ecrãs).
Este guia explica **onde vive cada parte, como se muda sem partir nada e que riscos estão em aberto**.
Estado a 16/11/2026.

> Fica na raiz do repositório de propósito: `node scripts/build.mjs` apaga e recria a pasta `docs/`,
> por isso nada escrito à mão pode ficar lá dentro.

---

## 1. Onde vive cada parte

| Parte | Onde está | Está no GitHub? |
|---|---|---|
| Código da app (React + TypeScript) | `src/` | Sim (`main`) |
| App publicada | `docs/` → GitHub Pages | Sim, gerada pelo build |
| Dados (produtos, vendas, acertos…) | Supabase, projeto `gestao-vinted` (`hunuxphczekrxilfmthb`), PostgreSQL 17, plano Free | Não |
| Estrutura inicial da base de dados | `supabase/schema.sql` | Sim, mas **desatualizado**: as alterações seguintes foram feitas por migrações |
| Migrações (13, de 26/10 a 15/11/2026) | Só no Supabase (`supabase_migrations.schema_migrations`); também dentro de cada cópia de segurança | **Não** |
| Edge Function `ebay-set` | `supabase/functions/ebay-set` + `_shared/ebay.ts` | Sim |
| Edge Function `ebay-rotacao` | `supabase/functions/ebay-rotacao` + `_shared/ebay.ts` | Sim |
| Edge Function `wallapop-rotacao` | Ativa em produção | **Só no ramo `wallapop`** |
| Agendamentos (pg_cron): `ebay-rotacao` a cada 7 min, `wallapop-rotacao` a cada 10 min | Só na base de dados (`cron.job`) | **Não** |
| Fotografias | Storage do Supabase, bucket privado `fotos` (~380 ficheiros, ~150 MB) | Não |
| Catálogo de sets (Rebrickable) | `public/catalogo-sets.json`, tarefa mensal `.github/workflows/catalogo.yml` | Sim |
| Dados de mercado (Brickset, eBay, Pokémon) | `public/mercado-sets.json`, tarefa diária `.github/workflows/mercado.yml` | Sim |
| Segredos das tarefas do GitHub | GitHub → Settings → Secrets (`VINTEDUO_TOKEN`, `BRICKSET_API_KEY`, eBay…) | Não (por segurança) |
| Segredos das Edge Functions | Supabase → Edge Functions → Secrets (`EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`) | Não (por segurança) |
| Códigos das integrações | `definicoes`: `token_mercado`, `token_promocoes`, `token_rotacao_ebay` | Não |
| Utilizador da base de dados `backup_leitura` (só leitura, para as cópias) | Supabase; palavra-passe só no secret `SUPABASE_DB_URL` do `vinteduo-backups` | Migração no Supabase e no `vinteduo-backups/migracoes/` |
| Cópias de segurança da base de dados | Repositório **privado** `vinteduo-backups` (Releases cifradas com `age`), diárias às 03:23 UTC | Sim (privado) |
| Chave privada das cópias | PC do Ricardo (fora do OneDrive) + cópia de reserva | Nunca |

As 12 migrações, por ordem: `restringir_e_membro`, `acertos_e_pagadores`, `acertos_partes_explicitas`,
`vendas_acertada`, `remover_estado_venda_pendente`, `sets_mercado_inclui_sets_avaliar`, `receber_promocao`,
`casa_compras_tabelas`, `remover_casa_compras_tabelas`, `ebay_pesquisas_rotacao`, `extensoes_cron_net`,
`wallapop_pesquisas`, `backup_leitura` (15/11).

**Consequência:** o GitHub da app sozinho não chega para reconstruir a produção. A base de dados
(estrutura, dados, migrações, agendamentos) recupera-se das cópias de segurança; falta trazer para o
repositório da app as migrações, os agendamentos e a função `wallapop-rotacao` (secção 9).

---

## 2. Fazer uma alteração à app

1. Mudar o código em `src/` (comentado de forma didática, como pede o `CLAUDE.md`).
2. Testes: `npm test` (lógica) e `npm run test:navegador` (ecrã). Ver secção 7.
3. Verificação de tipos: sem `@types/react` instalados (sem rede), usa-se um *shim* local do React
   só para verificar, fora do repositório. O único aviso esperado é o do `import './styles.css'`.
4. Compilar: `node scripts/build.mjs`. Gera também `docs/versao.json`: as apps abertas com uma versão
   anterior mostram a faixa "Há uma versão nova — Recarregar" (`components/VersaoNova.tsx`, verifica ao
   abrir, ao voltar à app e de 5 em 5 min). **Apaga e recria `docs/`** (só aceita apagar `docs/` ou uma pasta
   temporária: `scripts/destino.mjs`). Antes de publicar, correr também `npm run test:navegador`.
   - Se `node_modules` não existir: `ln -s /opt/npm-tools/node_modules node_modules`.
5. Atualizar o `README.md` (e o `CLAUDE.md`, se mudar uma regra).
6. Commit e push para `main` (só com autorização do Ricardo). O GitHub Pages publica em ~1 minuto.
   - As tarefas automáticas também fazem push para `main` (dados de mercado, todos os dias).
     Antes de publicar, `git pull` para não haver conflitos, e voltar a compilar se `docs/` mudou.
7. Mudanças que afetem muitos produtos (planos, preços): mostrar primeiro o impacto no stock real.

O `index.html` e os ficheiros gerados levam um código de versão no endereço, para o telemóvel não
ficar com uma cópia antiga.

---

## 3. Gravações: o que acontece quando algo corre mal

Tudo passa por `guardar()` e `apagar()` em `src/state.tsx`.

- **Falha ao gravar:** é lançado um `ErroGravacao`. Se o formulário não o tratar, um ouvinte geral
  (`unhandledrejection`) mostra "Não foi guardado: …". Nada mostra sucesso sem a gravação ter terminado.
- **Sessão expirada:** um 401 da base de dados vira `SessaoExpirada` (`src/lib/supabase.ts`). A app
  volta ao ecrã de entrada; se foi a meio de uma gravação, avisa para confirmar se ficou registada.
- **Repetir sem duplicar:** os formulários de venda e compra criam o id **uma vez** e reutilizam-no.
  Carregar duas vezes, ou repetir depois de uma resposta perdida, atualiza a mesma linha (upsert).
- **Fotografias:** no Editar produto, o ✕ só tira a foto do formulário. Ela só é apagada do Storage
  depois de o produto ser gravado com sucesso.
- **Duas pessoas ao mesmo tempo:** `definicoes` é gravada com fusão a três (`lib/sincronizar.ts`).
  As outras tabelas gravam a linha inteira: a última gravação de cada linha ganha.
- **Histórico:** é escrito pela app depois de cada gravação. É só de consulta.

---

## 4. Base de dados

- **Acesso:** RLS ligada em todas as tabelas de `public`. A política `membros` deixa ler e escrever
  quem tem o email em `public.membros` (função `e_membro()`, que lê o email do token de login).
  `membros` não tem política: não se lê pela app.
- **Tabelas:** `membros`, `pessoas`, `contas`, `compras`, `produtos`, `vendas`, `acertos`,
  `definicoes`, `historico`, `anuncios`, `catalogo_sets` (vazia, não usada).
- **Anúncios em várias plataformas (em curso, nov/2026):** fase 1 aplicada a 22/11/2026
  (`supabase/migrations/20261122_anuncios_por_plataforma.sql`): `contas.plataforma`, tabela
  `anuncios` e o gatilho `espelhar_anuncios` em `produtos` (copia `produtos.anuncios` para a tabela).
  **Enquanto o gatilho existir, a verdade é `produtos.anuncios`**: não escrever na tabela à mão.
  Fase 2: a app passa a ler/escrever a tabela; fase 3: sai o gatilho e as colunas `conta_id`,
  `preco_anuncio`, `data_anuncio`. Contas novas criadas na app ficam `vinted` até a fase 2 trazer o
  seletor de plataforma (corrigir à mão se se criar uma conta Wallapop/eBay antes disso).
  Decisões: documento do Projeto `claude/anuncios-multiplataforma-2026-11.md`.
- **Evitar migrações:** dados novos vão para `definicoes` (chave → jsonb). A lista de chaves está no `CLAUDE.md`.
- **Mudar estrutura:** só por migração, com aprovação, e registada no README.
  Nunca alterar acertos nem marcar vendas como acertadas sem pedido explícito.
- **Funções chamadas de fora:** `sets_mercado(token)`, `receber_promocao(...)`,
  `registar_pesquisa_ebay(...)`, `sets_rotacao_ebay(...)`, protegidas pelos códigos em `definicoes`.
- **Extensões:** `pg_cron`, `pg_net`, `pgcrypto`, `uuid-ossp`, `supabase_vault` (vazio).

---

## 5. Integrações e tarefas automáticas

| O quê | Quando | Onde |
|---|---|---|
| Catálogo de sets | Mensal | `.github/workflows/catalogo.yml` → `public/catalogo-sets.json` |
| Mercado (Brickset, eBay, Pokémon) | Diário | `.github/workflows/mercado.yml` + `scripts/mercado.py` → `public/mercado-sets.json` |
| Procurar no eBay (botão) | A pedido | Edge Function `ebay-set` (confirma `e_membro` com o token de quem pede) |
| Rotação do Continente no eBay | A cada 7 min | pg_cron → Edge Function `ebay-rotacao` |
| Rotação Wallapop | A cada 10 min | pg_cron → Edge Function `wallapop-rotacao` (código só no ramo `wallapop`) |
| Promoções de outra app | A pedido | RPC `receber_promocao` com `token_promocoes` |
| Piloto Wallapop (anúncios) | A pedido | No browser: `postMessage` entre a app e o botão da barra de favoritos (`lib/wallapop.ts`); não passa pelo servidor |

As Edge Functions publicam-se com o ficheiro partilhado `_shared/ebay.ts`.

---

## 6. Segurança

- No código só vai a **chave publishable** do Supabase (`src/config.ts`).
- Nunca se pede nem se usa a palavra-passe da base de dados nem a chave `service_role`.
- O repositório da app é **público**: nenhuma chave, palavra-passe ou código entra no código.
- Os códigos das integrações estão em `definicoes`, por isso qualquer membro os vê. Também vão na
  exportação JSON de Definições. **Pendente:** a exportação deve deixar de os incluir.
- **Avisos do Supabase em aberto:** proteção contra palavras-passe divulgadas desligada; extensão
  `pg_net` instalada no esquema `public`.
- O bucket `fotos` é privado; a app usa endereços assinados temporários.

---

## 7. Testes

Fazem parte do projeto (em `tests/`, no Git). Como correr e as regras: README → "Testes".

- **Lógica:** `tests/*.test.ts` com `node:test` via `tsx` (`npm test`).
- **Ecrã:** `tests/navegador/*.test.mjs` com Playwright (`npm run test:navegador`). A app é compilada para
  uma pasta temporária e servida pelo próprio teste no seu endereço; todos os pedidos ao Supabase são
  respondidos por um **Supabase simulado** em memória, com dados fictícios e sessão falsa. Qualquer
  escrita que tente sair da simulação faz o teste falhar. Não precisam de rede, dados pessoais nem
  serviços pagos.
- Cada funcionalidade ou correção importante traz os seus testes.
- Ainda não há CI (os testes não correm sozinhos a cada push) nem `package-lock.json`.

---

## 8. Riscos técnicos conhecidos

1. **Fotografias sem cópia de segurança** (fase 2 adiada). A base de dados tem cópia diária. Ver secção 9.
2. **Produção ≠ GitHub:** migrações, agendamentos e `wallapop-rotacao` só existem na produção.
3. **`supabase/schema.sql` desatualizado:** não serve, sozinho, para recriar a base de dados.
4. **`catalogo.yml` faz push sem `git pull --rebase`** (o `mercado.yml` faz). Se as duas tarefas se
   cruzarem, o catálogo pode falhar a publicar.
5. **Sem CI e sem lockfile:** uma versão nova de uma dependência pode mudar o build sem aviso.
6. **Edição concorrente** fora de `definicoes`: a última gravação ganha (raro com duas pessoas).
7. **Piloto Wallapop:** depende do formulário da Wallapop (ids `summary`, `title`, `description`,
   `price_amount`, `condition`, escalões de peso `0`–`5` e o botão "Continuar"); se mudar, o botão deixa
   de preencher até ser ajustado (copiar e colar continua a funcionar). Se o Continuar falhar, o botão
   volta aos dois cliques. A app marca como anunciado quando o formulário fica preenchido, não quando
   se publica.

---

## 9. Recuperação e próximos passos

### Cópias de segurança (fase 1, a funcionar desde 16/11/2026)
- **Onde:** repositório privado `vinteduo-backups` (o README de lá tem a configuração, o restauro
  passo a passo e a lista do que se refaz à mão). Decisões e estado: documento do Projeto
  `claude/copias-seguranca-2026-11.md`.
- **O quê:** só a base de dados (estrutura, dados, logins, migrações, regras das fotos, agendamentos).
  **Sem** fotografias (fase 2, adiada), sem códigos das integrações, sem sessões de login.
- **Como:** todos os dias às 03:23 UTC, com o utilizador só de leitura `backup_leitura` (Session
  pooler) e `pg_dump` 17. Cada cópia é restaurada num Supabase temporário, comparada com a produção e
  testada (login, API, RLS) antes de ser marcada como válida; depois é cifrada (`age`).
- **Ensaio de restauro:** feito a 16/11/2026 no PC do Ricardo (decifrar com a chave privada e conferir).
- **Limpeza das cópias antigas:** desligada (só simula) até aprovação expressa do Ricardo.
- **Desastre:** restaurar num projeto Supabase **novo**, nunca sobre a produção (`restaurar.sh` recusa).

### Lições da montagem (para não repetir)
- `supabase db dump` muda para o utilizador `postgres`: não funciona com um utilizador só de leitura.
  Usar `pg_dump` direto, da mesma versão principal da produção (17).
- `log_statement = ddl` na produção: nunca escrever palavras-passe em claro em `alter role`; usar o
  código SCRAM gerado localmente.
- O Session pooler guarda a palavra-passe em cache: depois de a mudar, pode recusar durante uns minutos.
- `pg_read_all_data` dá acesso a todos os esquemas; com as permissões que o Supabase dá a todos
  (PUBLIC), o utilizador pode usar o `pg_net` e agendar `pg_cron`, mas não alterar dados da app.
- O `pg_dump` ≥ 17.6 acrescenta `\restrict`/`\unrestrict`; há funções com fins de linha do Windows
  no corpo: nenhum filtro pode mexer nisso.
- O ensaio com a chave verdadeira apanhou uma cópia de reserva da chave errada: testar sempre com a
  chave guardada, não só com a original.

### Próximos passos
1. Trazer as 13 migrações para `supabase/migrations/`, os agendamentos (sem códigos) e
   `wallapop-rotacao` para o `main`.
2. Fase 2 das cópias (fotografias) e limpeza das cópias antigas, quando o Ricardo aprovar.
3. Corrigir os pontos 4 e 5 da secção 8 e os avisos do Supabase (secção 6).
