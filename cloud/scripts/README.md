# Scripts

- `npm run db:migrate` — cria/atualiza as tabelas `accounts` e `sessions` no banco apontado por
  `DATABASE_URL`. É idempotente: pode rodar quantas vezes quiser, inclusive em produção.
