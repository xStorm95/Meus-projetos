# PASSARELA ERP

Sistema de gestão (ERP) completo para varejo de moda: PDV, estoque com grade
cor × tamanho, clientes/CRM com crediário, financeiro com DRE, compras,
orçamentos, trocas e devoluções, relatórios, auditoria, controle de acesso por
perfil e configurações da loja.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 ·
PostgreSQL + Drizzle ORM · Zod · Recharts · Vitest

> ⚠️ **Situação do módulo fiscal:** a tela `/fiscal` registra a intenção de
> emissão e valida os requisitos, mas **não transmite NFC-e/NF-e**. Nenhum
> documento é marcado como autorizado sem retorno real de um provedor
> homologado. O ponto de extensão está em `src/server/services/fiscal.ts`.

---

---

## 0. Palco — versão em arquivo único (HTML)

Além do ERP completo em Next.js, o repositório traz o **Palco**: a mesma proposta
de ERP de moda empacotada em **um único arquivo HTML** com cadastro/login reais,
perfil com foto e persistência no dispositivo — sem servidor, sem build e
funcionando offline.

**Arquivo para baixar/publicar:** [`web/palco.html`](web/palco.html) (~217 KB)

- Senhas com PBKDF2-HMAC-SHA256 (210 mil iterações) validado contra `node:crypto`
- Sessão que sobrevive a fechar o navegador
- Dados em IndexedDB com espelho em localStorage
- 40 testes automatizados (39 de lógica + 1 de navegador via jsdom)

```bash
npm run web:build   # gera web/palco.html
npm run web:test    # roda os testes do app offline
```

Detalhes, limites e atalhos: [`web/README.md`](web/README.md).

---

## 0.1 Palco Conta — banco na nuvem, pronto para Vercel

A versão da conta (cadastro, login e **perfil com foto**) que **não fica presa a um
computador**: os dados vivem em PostgreSQL na nuvem e a mesma conta abre em qualquer
aparelho. É o app em [`cloud/`](cloud/), feito para a Vercel.

**Para publicar:** <https://vercel.com/new> → importe `xStorm95/Meus-projetos` →
*Root Directory* `cloud` → variável `DATABASE_URL` (Neon/Postgres) → *Deploy*.
Passo a passo completo: [`cloud/README.md`](cloud/README.md).

```bash
cd cloud && npm install && npm run db:migrate && npm run dev   # http://localhost:3001
cd cloud && npm test                                           # 12 testes de integração
```

- senha com **scrypt** no servidor, sessão em cookie HttpOnly de 24 h
- foto redimensionada no navegador e salva no banco (`accounts.avatar`)
- login em outro aparelho mostra os mesmos dados e a mesma foto
- build de produção e migração idempotente validados

## 1. Rodar localmente

Pré-requisitos: **Node.js 20+** e um PostgreSQL 14+ (o projeto inclui um
PostgreSQL embutido via PGlite apenas para desenvolvimento).

```bash
npm install
cp .env.example .env          # ajuste DATABASE_URL e AUTH_SECRET
```

Gere um `AUTH_SECRET` (mínimo 32 caracteres):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Opção A — PostgreSQL embutido (avaliação/desenvolvimento)

```bash
npm run db:server       # sobe o Postgres embutido em 127.0.0.1:5432
npm run db:migrate      # cria o schema
npm run admin:create    # cria o administrador (senha solicitada)
npm run db:demo         # opcional: dados de demonstração
npm run dev             # http://localhost:3000
```

### Opção B — PostgreSQL real (recomendado)

Aponte `DATABASE_URL` para seu servidor (Neon, Supabase, RDS, Docker...) e rode:

```bash
npm run db:migrate
npm run admin:create
npm run dev
```

### Scripts disponíveis

| Script | Função |
| --- | --- |
| `npm run dev` | ambiente de desenvolvimento (Next + Postgres embutido) |
| `npm run build` / `npm start` | build e execução em produção |
| `npm run db:migrate` | aplica as migrações de `drizzle/` (idempotente) |
| `npm run db:seed` / `db:demo` | dados base / dados de demonstração |
| `npm run db:reset` | **apaga** e recria o banco (`-- --demo` inclui demonstração) |
| `npm run admin:create` | cria ou redefine o administrador |
| `npm run backup` | dump lógico em `backups/backup-*.sql` (`-- --gzip` comprime) |
| `npm run restore -- backups/arquivo.sql` | restaura um backup (não apaga dados) |
| `npm run test` | testes de integração das regras de negócio |
| `npm run typecheck` | verificação de tipos |

---

## 2. Testes

Os testes rodam **contra um banco real já migrado** (sem mocks), cobrindo
estoque, venda, cancelamento, crediário, caixa, orçamento, compra, troca,
permissões e auditoria.

```bash
npm run db:migrate      # banco precisa estar migrado
npm run admin:create    # precisa existir um ADMIN ativo
npm run test
```

Os registros criados usam o prefixo `VITEST...` e são removidos ao final.

---

## 3. Publicar em produção

### 3.1 Banco de dados

Use um PostgreSQL gerenciado (Neon, Supabase, RDS, Cloud SQL) ou um container.
Guarde a string de conexão com SSL, por exemplo:

```
DATABASE_URL=postgresql://usuario:senha@host:5432/banco?sslmode=require
```

### 3.2 Variáveis de ambiente obrigatórias

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
AUTH_SECRET=<32+ caracteres aleatórios>
APP_URL=https://seu-dominio.com
DEMO_AUTO_LOGIN=false        # NUNCA true em produção
```

Opcionais: `SESSION_TTL_HOURS`, `DB_POOL_MAX`, `UPLOAD_DIR`,
`FISCAL_PROVIDER`, `FISCAL_API_KEY`, `WHATSAPP_API_TOKEN`.

### 3.3 Deploy na Vercel (mais simples)

1. Suba o repositório no GitHub.
2. Em **Vercel → New Project**, importe o repositório (framework detectado:
   Next.js, build `npm run build`).
3. Em **Settings → Environment Variables**, cadastre as variáveis do item 3.2.
4. Rode as migrações **uma vez** apontando para o banco de produção:

   ```bash
   DATABASE_URL="postgresql://...prod..." npm run db:migrate
   DATABASE_URL="postgresql://...prod..." ADMIN_EMAIL=voce@loja.com ADMIN_PASSWORD='SenhaForte123' npm run admin:create
   ```

5. Deploy. Acesse `/login` e entre com o administrador.

> Observação: o PostgreSQL embutido (PGlite) **não roda na Vercel** (filesystem
> efêmero e somente leitura). Em produção use sempre um Postgres externo.

### 3.4 Deploy em VPS / Docker

```bash
npm ci
npm run build
npm start            # respeita PORT (padrão 3000)
```

Exemplo de `Dockerfile`:

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]
```

Com PM2 ou systemd na frente, e um proxy reverso (Nginx/Caddy) com HTTPS.

### 3.5 Checklist antes de abrir para a loja

- [ ] `DEMO_AUTO_LOGIN=false` e `NODE_ENV=production`
- [ ] `AUTH_SECRET` único e forte (nunca o do exemplo)
- [ ] `AUTH_SECRET` e `DATABASE_URL` fora do controle de versão
- [ ] backup agendado (`npm run backup` em cron, com retenção)
- [ ] HTTPS obrigatório (cookies de sessão são `secure` em produção)
- [ ] administrador criado, senha trocada, usuários da equipe cadastrados
- [ ] dados de demonstração **ausentes** (`npm run db:reset` antes do go-live)
- [ ] `APP_URL` apontando para o domínio real
- [ ] logo, nome da loja e cor de destaque ajustados em Configurações

---

## 4. Estrutura

```
src/
  app/
    (app)/          telas autenticadas (PDV, produtos, financeiro, fiscal...)
    api/            rotas REST (apiHandler + zod + permissões)
    login/          autenticação
  components/       UI (primitives, form, data-table) e views por módulo
  server/
    auth/           senha (scrypt), sessão (JWT em cookie), permissões
    db/             schema Drizzle e cliente Postgres
    lib/            dinheiro, datas, erros, auditoria, sequências, exportação
    services/       regras de negócio (vendas, estoque, caixa, financeiro...)
drizzle/            migrações SQL versionadas
scripts/            db-server, migrate, seed, admin, backup, restore, reset
tests/              testes de integração das regras
```

## 5. Segurança e LGPD

- Senhas com scrypt e custo elevado; bloqueio após 5 tentativas por 15 min.
- Sessões em cookie `HttpOnly`/`SameSite` com token hasheado no banco.
- Permissões por perfil + concessões/negações individuais (negação prevalece).
- Auditoria de todas as ações sensíveis (`audit_logs`, exportável em CSV).
- Anonimização de cliente (direito ao esquecimento) e retenção configurável.

Consulte `docs/` para os procedimentos operacionais.
