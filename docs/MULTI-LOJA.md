# Multi-loja — como funciona e como publicar

Cada pessoa cria a própria loja em `/cadastro` e **nunca** vê dados de outra.
O isolamento é aplicado no driver do banco: toda consulta ganha
`company_id = <loja da sessão>` automaticamente (ver `src/server/db/tenant.ts`
e `src/server/db/client.ts`). Sem loja no contexto, nada é lido nem gravado.

## O que já foi testado (ambiente de desenvolvimento)

| Verificação | Resultado |
|---|---|
| Cadastro de duas lojas | `Ateliê Aurora` e `Bella Boutique` — HTTP 200 |
| Login das duas contas | HTTP 200, cada uma na sua loja |
| Produto criado em cada loja | 201 (o bug do `99,90` foi corrigido) |
| Maria vê | `Vestido da Maria R$199.90` |
| Joana vê | `Blusa da Joana R$89.90` |
| Joana abrindo o produto da Maria pela URL | 404 |
| Joana excluindo/alterando produto da Maria | 404 (nada muda) |
| Caixa | o da Maria aberto; o da Joana fechado |
| DRE | Maria R$199,90 (CMV R$50,00); Joana R$0,00 |
| Páginas do sistema | 23 de 23 em HTTP 200 |
| Testes automatizados | 57 de 57 |
| Build de produção | 58 rotas compiladas sem erro |
| Migração em banco COM dados | 2 produtos, 1 cliente, 1 usuário preservados e carimbados na loja criada; rodar de novo não quebra |

## Publicar (uma vez)

1. **Trocar a senha do Neon** (a antiga apareceu em conversa):
   painel do Neon → projeto → *Roles* → `neondb_owner` → *Reset password*.
2. Na Vercel → projeto → *Settings* → *Environment Variables*: atualizar
   `DATABASE_URL` com a senha nova (a mesma URL, senha trocada).
3. Aplicar a migração no banco de produção (uma vez):
   ```bash
   npm run db:migrate
   ```
   Rodar de novo é seguro: a migração não apaga nada e não duplica loja.
4. Deploy (push na branch ou *Redeploy* no painel da Vercel).

## Dia a dia

- Cadastro aberto: `https://SEU-SITE/cadastro`
- Cada dono entra com o próprio e-mail e senha e cai na própria loja.
- O nome e a cor da loja ficam em **Configurações**.
