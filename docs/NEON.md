# Conectar no Neon (banco de dados na nuvem) — passo a passo

O sistema já está pronto para rodar com o banco no **Neon** (PostgreSQL na nuvem,
plano gratuito). Só falta a sua conta e a string de conexão.

> ⚠️ **Nunca** cole a senha do banco no chat. Ela vai apenas no arquivo
> `.env.local` (que já está no `.gitignore` e nunca é enviado ao GitHub).

---

## 1. Criar a conta e o projeto (2 minutos)

1. Abra **https://neon.tech** e entre com o GitHub ou e-mail.
2. Clique em **New Project**.
3. Preencha:
   - **Project name:** `passarela`
   - **Postgres version:** a sugerida (17)
   - **Region:** `AWS us-east-1` (ou a mais próxima — `sa-east-1` se aparecer)
4. Clique em **Create project**.

## 2. Copiar a string de conexão

Na tela do projeto, procure **Connection string** (ou *Connect*):

- **Branch:** `main`
- **Database:** `neondb`
- **Role:** `neondb_owner`
- **Pooled connection:** ✅ **ligado** (importante para o site não estourar conexões)

Copie algo assim (a senha é sua, não compartilhe):

```
postgresql://neondb_owner:SENHA@ep-xxxx-123456-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
```

> Use a que tem **`-pooler`** no endereço e **`?sslmode=require`** no final.

## 3. Colar no projeto

Na raiz do projeto, crie o arquivo **`.env.local`** (se ainda não existir) e
substitua a linha do banco:

```env
DATABASE_URL="postgresql://neondb_owner:SENHA@ep-xxxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
DB_POOL_MAX="5"

AUTH_SECRET="GERE_COM_openssl_rand_base64_48"
SESSION_TTL_HOURS="12"
APP_URL="http://localhost:3000"
NODE_ENV="development"
USE_EMBEDDED_PG="false"
DEMO_AUTO_LOGIN="false"
```

Para gerar o `AUTH_SECRET` (chave que assina o cookie de login):

```bash
openssl rand -base64 48
```

## 4. Criar as tabelas

```bash
npm run db:migrate
```

Deve aparecer `[migrate] banco atualizado.`

## 5. Criar seu usuário (dono da loja)

```bash
npm run admin:create
```

O sistema pergunta nome, e-mail e senha (a senha não aparece na tela).
Ou, sem interação:

```bash
ADMIN_EMAIL="voce@email.com" ADMIN_NAME="Seu Nome" ADMIN_PASSWORD="SuaSenhaForte1" npm run admin:create
```

## 6. Rodar o site

```bash
npm run dev
```

Abra **http://localhost:3000** → tela de login → entre com o e-mail e senha que
você criou. **Cadastro** também está disponível em `/login` → *Criar conta*
(cada nova conta cria a própria loja, com dados separados).

## 7. Conferir que está no Neon

```bash
node -e "const{Client}=require('pg');const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>c.query('select count(*) from users')).then(r=>{console.log('usuários no Neon:',r.rows[0].count);process.exit(0)})"
```

> Precisa carregar as variáveis antes: `set -a && . ./.env.local && set +a`

---

## Dados de demonstração (opcional)

```bash
npm run db:demo
```

Cria 15 produtos, 20 clientes, 195 vendas nos últimos 90 dias e um caixa aberto
— tudo marcado com `[DEMO]`, fácil de identificar e apagar.

---

## Deploy (quando quiser colocar no ar)

O projeto é Next.js: **Vercel** é o caminho mais curto.

1. Suba o repositório no GitHub (já está).
2. Em **https://vercel.com** → *New Project* → importe o repositório.
3. Em **Environment Variables**, cole as mesmas variáveis do `.env.local`:
   `DATABASE_URL`, `AUTH_SECRET`, `SESSION_TTL_HOURS`, `APP_URL`
   (com a URL final da Vercel), `NODE_ENV=production`.
4. **Deploy**. Depois rode as migrações apontando para o Neon de produção:
   ```bash
   DATABASE_URL="postgresql://.../neondb?sslmode=require" npm run db:migrate
   ```
5. Crie o usuário administrador no banco de produção (`npm run admin:create`
   com a mesma `DATABASE_URL`).

> **Sobre "usuário" aqui:** o login é e-mail + senha com hash (scrypt) e cookie
> de sessão `httpOnly`. Não existe senha no código nem dado de teste em produção.

---

## Problemas comuns

| Sintoma | Causa / solução |
| --- | --- |
| `DATABASE_URL é obrigatório` | O `.env.local` não está sendo lido: rode os comandos na raiz do projeto. |
| `password authentication failed` | Senha copiada errada — gere outra em *Connect* no Neon. |
| `too many connections` | Use a string com **`-pooler`** e mantenha `DB_POOL_MAX` baixo (5). |
| `relation "settings" does not exist` | Falta `npm run db:migrate`. |
| Login não entra | Confirme que rodou `npm run admin:create` no **mesmo** banco do `.env.local`. |
| Site abre mas fica em branco no deploy | `AUTH_SECRET` ausente nas variáveis da Vercel. |
