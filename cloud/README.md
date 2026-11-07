# Palco · conta na nuvem

Cadastro, login e perfil **com foto**, com os dados em **PostgreSQL na nuvem** — a mesma conta abre em
qualquer aparelho. Pronto para publicar na Vercel.

```
cloud/
├── src/db/         schema Drizzle, conexão (pg + pool), migração idempotente
├── src/lib/        hash scrypt, sessões, validações compartilhadas, cliente HTTP
├── src/app/api/    auth (signup/login/logout/session), profile (+avatar, +password), account
├── src/app/        /login, /perfil (protegida), /
├── tests/          teste de integração ponta a ponta contra a API real
├── scripts/        utilitário de banco
└── vercel.json     região gru1 (São Paulo), framework Next
```

## O que já funciona (testado)

- `npm test` → **12 testes de integração verdes** contra um Postgres real (PGlite via TCP):
  cadastro, sessão HttpOnly, e-mail duplicado, senha fraca, senha errada genérica,
  **login no "aparelho 2" abrindo a mesma conta**, **foto enviada no aparelho 1 aparecendo no 2**,
  edição de perfil sincronizada, troca de senha invalidando a antiga, logout encerrando a sessão,
  rota protegida devolvendo 401.
- `npm run build` → build de produção limpo (Next 15 + TypeScript strict).
- Senha: **scrypt** (N=32768, r=8, p=1) no servidor, comparação em tempo constante.
  O hash nunca sai do servidor.
- Sessão: token de 32 bytes aleatórios, guardado **como SHA-256** na tabela `sessions`,
  entregue ao navegador em cookie **HttpOnly + SameSite=Lax + Secure em produção**, validade 24 h.
- Bloqueio automático: 5 tentativas erradas → 15 minutos.
- Foto: JPG/PNG/WEBP até 15 MB, redimensionada para 512 px no navegador, salva em `accounts.avatar`
  (base64, até ~700 KB) — aparece em qualquer aparelho depois do login.

## Rodar localmente (5 minutos)

Precisa de um PostgreSQL. O mais rápido é o **Neon** gratuito (já é o mesmo banco da produção):

1. Crie um projeto em <https://neon.tech> e copie a *connection string*.
2. No repositório:

```bash
cd cloud
cp .env.example .env.local     # cole a DATABASE_URL do Neon
npm install
npm run db:migrate             # cria accounts e sessions
npm run dev                    # http://localhost:3001
```

Sem Neon? Um Postgres local serve:

```bash
docker run -d --name palco-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
# DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
```

Rodar os testes de integração com o servidor no ar:

```bash
npm run dev          # em um terminal
npm test             # em outro
```

## Publicar na Vercel

1. **Banco** — crie o banco no [Neon](https://neon.tech) (ou Vercel → Storage → Postgres).
   Copie a connection string (`...?sslmode=require`).
2. **Importar o repositório** — <https://vercel.com/new> → *Import Git Repository* →
   selecione `xStorm95/Meus-projetos`.
3. **Root Directory**: `cloud` (importante — o app está nessa pasta).
   Framework: *Next.js* (detectado sozinho).
4. **Environment Variables**:

   | Nome           | Valor                                                    |
   | -------------- | -------------------------------------------------------- |
   | `DATABASE_URL` | a connection string do Neon (`?sslmode=require`)          |
   | `DB_POOL_MAX`  | `3` (opcional; segura o pool em serverless)              |

5. **Deploy**. O endereço final é algo como `https://palco-conta.vercel.app`.
6. **Criar as tabelas**: rode `npm run db:migrate` apontando para o banco de produção
   (na sua máquina, com a `DATABASE_URL` de produção no `.env.local`).
   Alternativa: só abrir o site e criar a primeira conta — a API aplica o schema na primeira
   chamada (`ensureSchema`), de forma idempotente.

### Domínio próprio (opcional)

Vercel → Project → Settings → Domains → adicione `conta.seudominio.com` e aponte o CNAME indicado.

## Variáveis de ambiente

| Nome          | Obrigatória | Descrição                                        |
| ------------- | ----------- | ------------------------------------------------ |
| `DATABASE_URL`| sim         | PostgreSQL com SSL (`sslmode=require`)           |
| `DB_POOL_MAX` | não         | conexões por instância serverless (padrão `3`)   |
| `APP_URL`     | não         | usado só pelos testes locais                     |

## API

| Método | Rota                      | O que faz                                        |
| ------ | ------------------------- | ------------------------------------------------ |
| POST   | `/api/auth/signup`        | cria conta + abre sessão (201)                   |
| POST   | `/api/auth/login`         | autentica e abre sessão                          |
| POST   | `/api/auth/logout`        | apaga a sessão no banco e o cookie               |
| GET    | `/api/auth/session`       | conta atual + dispositivos conectados            |
| GET    | `/api/profile`            | dados da conta                                   |
| PATCH  | `/api/profile`            | atualiza nome, e-mail, telefone, CPF, cidade...  |
| PUT    | `/api/profile/avatar`     | salva a foto (data URL ≤ 700 KB)                 |
| DELETE | `/api/profile/avatar`     | remove a foto                                    |
| POST   | `/api/profile/password`   | troca a senha (exige a atual)                    |
| DELETE | `/api/account`            | exclui a conta (exige a senha)                   |

Erros seguem o formato `{ "error": "mensagem", "fields": { "campo": "motivo" } }` com status
`400/401/409/413/422/429/500`.

## Escolhas técnicas

- **`pg` + Drizzle** em vez de `@vercel/postgres`: funciona em qualquer Postgres (Neon, Supabase,
  Railway, RDS) e não amarra o projeto a um fornecedor.
- **Pool reaproveitado** entre invocações (`globalThis`) para não estourar conexões em serverless.
- **Migração idempotente** chamada no primeiro request de escrita: funciona até em deploy sem passo
  de build customizado. `npm run db:migrate` faz o mesmo explicitamente.
- **Validações puras** em `src/lib/validation.ts`, usadas no cliente (feedback imediato) *e* no
  servidor (fonte da verdade).

## Segurança — resumo

- senha em scrypt no servidor, nunca em texto puro nem no navegador;
- token de sessão aleatório, persistido só como hash;
- cookie HttpOnly (JavaScript da página não lê), SameSite=Lax, Secure em produção;
- mensagem igual para e-mail inexistente e senha errada (não revela quem tem conta);
- lockout progressivo por conta;
- `Cache-Control: no-store` em todas as rotas de API;
- headers `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

> Observação honesta: **a URL `*.vercel.app` só existe depois que você importa o repositório e
> faz o deploy** — eu não consigo publicar em nome da sua conta Vercel. Tudo o que é necessário
> (código, `vercel.json`, migração, env vars, passos) está neste diretório.
