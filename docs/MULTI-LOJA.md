# Passarela ERP — no ar

**Endereço:** https://meus-projetos-qzoj.vercel.app

Cada pessoa cria a própria loja e **nunca** vê dados de outra.

## Para usar (nada a instalar)

1. Abra https://meus-projetos-qzoj.vercel.app
2. Clique em **"Não tenho conta — criar a minha loja"**
3. Preencha nome da loja, seu nome, e-mail e senha
4. Pronto: você cai no painel da sua loja, já com categorias, tamanhos, cores, caixa e depósito criados.

Pode mandar esse link para qualquer pessoa: cada cadastro abre uma loja separada.

## O que está garantido (testado no site publicado)

O workflow **Teste da produção** (GitHub Actions) cria duas lojas no site real,
entra nas duas e confere que cada uma vê somente os próprios dados. Passou.

No ambiente de desenvolvimento também foi verificado:

| Verificação | Resultado |
|---|---|
| Cadastro de duas lojas | 200 / 200 |
| Login das duas contas | 200 / 200, cada uma na sua loja |
| Produto em cada loja | 201 / 201 |
| Maria vê | `Vestido da Maria R$199.90` (só o dela) |
| Joana vê | `Blusa da Joana R$89.90` (só o dela) |
| Joana abrindo produto da Maria pela URL | 404 |
| Joana alterando/excluindo produto da Maria | 404, nada muda |
| Caixa e DRE por loja | Maria com caixa aberto e DRE R$199,90; Joana zerada |
| Páginas do sistema | 23 de 23 em 200 |
| Testes automatizados | 57 de 57 |
| Migração em banco **com dados** | nada perdido, tudo carimbado na loja; reexecutar não quebra |

## Como o isolamento funciona

- Tabela `companies` (lojas) e `company_id` em todas as 46 tabelas de loja.
- `src/server/db/client.ts` reescreve **toda** consulta que passa pelo driver,
  acrescentando a loja da sessão — em `SELECT`, `UPDATE`, `DELETE` e `INSERT`,
  inclusive dentro de subconsultas, `UNION` e `LEFT JOIN`.
- Sem loja no contexto: leitura devolve vazio, gravação é bloqueada.
- O cadastro em `/api/auth/signup` cria a loja, o dono e os dados padrão dela.

## Deploy

- Cada push em `main` publica na Vercel automaticamente.
- **A migração do banco roda no build** (`scripts/migrate-build.mjs`): se o
  banco estiver atrasado, é atualizado antes do site subir; se a migração
  falhar, o build falha — melhor não publicar do que publicar quebrado.
- O app também aplica migrações pendentes no primeiro acesso de cada processo
  (`src/server/db/migrate-runtime.ts`), como rede de segurança.

## Se precisar mexer no código

```bash
npm run dev          # site local (porta 3000)
npm test             # 57 testes
npm run db:migrate   # aplica migrações no banco de DATABASE_URL
```

Detalhes da migração multi-loja: `drizzle/0001_multi_loja.sql`.
