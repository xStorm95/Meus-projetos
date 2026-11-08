# Palco — site online com cadastro, login e dados salvos

Este é o **site completo** que roda na Vercel: cadastro e login reais, e **tudo o que você faz fica
salvo no banco de dados** (produtos, vendas, clientes, financeiro e a foto de perfil).

Ao entrar de novo — no mesmo celular, em outro, ou depois de sair da conta — os dados estão lá.

```
cloud/
├── src/app/login        tela de entrada (cadastro + login)
├── src/app/app          entrega o ERP (public/palco.html)
├── src/app/perfil       conta: dados, foto, segurança
├── src/app/api/         auth, profile, avatar, state (dados do ERP), health
├── src/db/              schema Drizzle + migração idempotente (PostgreSQL)
├── public/palco.html     o ERP completo (gerado por node web/build.js)
└── tests/               12 testes de API + 1 teste de navegador ponta a ponta
```

## Como o site funciona

1. **`/login`** — criar conta (nome, e-mail, senha) ou entrar. Senha criptografada com scrypt no
   servidor, sessão em cookie HttpOnly de 24 h.
2. **`/app`** — o sistema inteiro (PDV, produtos, estoque, clientes, financeiro, relatórios, perfil).
   Cada alteração é gravada na tabela `user_state` do PostgreSQL, **por conta**.
3. **`/perfil`** — dados da conta e foto de perfil, salva no banco e visível em qualquer aparelho.
4. **Sair** — encerra a sessão no servidor. Ao entrar de novo, tudo volta.

Sem servidor (arquivo solto `index.html`), o mesmo programa roda em modo local com senha única
`admin123` — útil para testar offline.

## Verificado nesta entrega

```bash
npm run web:test      # 39 testes de lógica + 1 de navegador (modo offline)
npm run cloud:test    # 12 testes de API contra PostgreSQL real
npm run cloud:e2e     # navegador simulado: cadastro → produto → sair → entrar → outro aparelho
```

Resultado do teste ponta a ponta (`cloud:e2e`), executado de verdade:

```
1) modo nuvem com cadastro: true
2) cadastrou e entrou: true | nuvem: true
3) chip: Nuvem (PostgreSQL)
4) produto criado: Vestido Nuvem
5) gravado no PostgreSQL — chaves: [ 'products' ] | produtos: 1
6) saiu pela interface — voltou ao login: true
7) login de novo — produtos recuperados: 1
8) foto no servidor: data:image/png;base64,iVBO… | cidade: Ipatinga
9) outro aparelho — produtos: 1 | foto do perfil: true
```

## Publicar na Vercel — passo a passo

### 1. Banco de dados (grátis)
1. Crie uma conta em <https://neon.tech> e um projeto.
2. Copie a **connection string** (`postgresql://...?sslmode=require`). Guarde.

### 2. Importar o repositório
1. Abra <https://vercel.com/new>.
2. Conecte o GitHub e escolha **`xStorm95/Meus-projetos`**.
3. Em **Root Directory**, escreva `cloud` (importante!).
4. Framework: **Next.js** (detectado automaticamente).

### 3. Variáveis de ambiente
Clique em *Environment Variables* e adicione:

| Nome | Valor |
| --- | --- |
| `DATABASE_URL` | a connection string do Neon |
| `DB_POOL_MAX` | `3` (opcional) |

### 4. Deploy
Clique em **Deploy**. Em ~2 minutos você recebe o endereço:

```
https://SEU-PROJETO.vercel.app
```

Abra, clique em **Criar conta**, crie a sua e pronto: o site está no ar.

> As tabelas são criadas automaticamente na primeira conta criada (`ensureSchema`).
> Se preferir criar antes, rode `npm run db:migrate` na pasta `cloud` com a `DATABASE_URL` de produção.

### 5. Conferir que está tudo certo
- `https://SEU-PROJETO.vercel.app/api/health` → `{"app":"palco","cloud":true}`
- `https://SEU-PROJETO.vercel.app/api/cron` → `{"database":"ok"}`

## Rodar localmente

```bash
cd cloud
cp .env.example .env.local     # cole a DATABASE_URL
npm install
npm run dev                    # http://localhost:3001
```

Sem Neon, use um Postgres local:

```bash
docker run -d --name palco-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
# DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
```

## API

| Método | Rota | O que faz |
| --- | --- | --- |
| GET | `/api/health` | identifica o app (o cliente decide modo nuvem/offline) |
| POST | `/api/auth/signup` | cria conta e abre sessão |
| POST | `/api/auth/login` | entra (e-mail + senha), com bloqueio após 5 erros |
| POST | `/api/auth/logout` | encerra a sessão no banco |
| GET | `/api/auth/session` | conta atual + dispositivos conectados |
| GET | `/api/state` | **todos os dados da conta** (snapshot) |
| PUT | `/api/state/:chave` | salva uma parte do estado (`products`, `sales`, ...) |
| DELETE | `/api/state` | apaga os dados da conta (mantém a conta) |
| GET/PATCH | `/api/profile` | ler/editar dados da conta |
| PUT/DELETE | `/api/profile/avatar` | salvar/remover a foto |
| POST | `/api/profile/password` | trocar a senha |
| DELETE | `/api/account` | excluir a conta |

## Segurança

- senha com **scrypt** (N=32768) no servidor; hash nunca sai do banco
- sessão: token aleatório de 32 bytes, guardado como SHA-256, cookie HttpOnly + SameSite=Lax
- bloqueio de 15 min após 5 tentativas erradas
- mensagem idêntica para e-mail inexistente e senha errada
- `Cache-Control: no-store` em todas as rotas de API
- cada conta só lê e grava os **próprios** dados (`user_state.account_id`)
- limite de 4 MB por chave de estado (as fotos de produto são reduzidas no navegador)

> **Sobre o link:** o endereço `*.vercel.app` é criado no momento do deploy, na sua conta Vercel.
> Todo o código e as instruções estão aqui — o deploy leva cerca de 2 minutos depois do passo 2.
