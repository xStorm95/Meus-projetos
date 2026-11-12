# DECISÕES — migração PASSARELA → ORION

Registro das ambiguidades encontradas no caminho e da decisão tomada em cada
uma. A regra combinada foi: **na dúvida, escolher o caminho mais simples e
registrar aqui**.

---

## Identidade visual

| Tema | Decisão | Motivo |
| --- | --- | --- |
| Fundo escuro | `#0B0B0F` | Definido no pedido; aplicado como `--bg-app` do tema escuro. |
| Acento | `#7DB3FF` | Azul claro com contraste suficiente sobre `#0B0B0F` (WCAG AA em texto normal). |
| Wordmark | `ORION` em caixa alta, `letter-spacing: 0.3em` | Legibilidade do nome curto. |
| Símbolo | Três estrelas (Cinturão de Órion) | Referência direta ao nome, sem desenho complexo. |
| Títulos | Sora (fallback Space Grotesk → Manrope → Inter) | Sem serifa e com números tabulares de verdade. **Cormorant Garamond foi removida**: serifada old-style, os números não alinhavam em colunas de KPI/tabela. |
| Corpo | Inter | Já estava no projeto, ótima legibilidade em tela. |

## Taxonomia de números do dashboard

| Situação | O que aparece | Por quê |
| --- | --- | --- |
| Período anterior zerado e o indicador cresceu | badge **“Novo”** (cinza) | Não existe base de comparação. Antes o backend calculava `+100%` e pintava de verde, como se tivesse dobrado. |
| Período anterior zerado e o indicador também está zerado | **“—”** | Não aconteceu nada; “Novo” seria mentira. |
| Variação exatamente 0 | **“0,0%”** cinza | Neutro. |
| Variação positiva / negativa | verde / vermelho | Em despesa e custo a cor se inverte (`variationInvertida`). |

## Lucro quando falta custo de compra

`sale_items.unit_cost` é `NOT NULL DEFAULT 0`, então produto sem custo entra na
venda como **custo zero** e o lucro vira “venda cheia”. Decisão:

- **não** tornar `costPrice` obrigatório no cadastro (quebraria o fluxo de quem
  cadastra rápido e importa planilha);
- o dashboard consulta quantas linhas de venda do período estão sem custo;
- **todos** os itens sem custo → o card de lucro mostra **“—”** e um aviso com
  link para `/produtos` (não exibimos número inventado);
- **parte** dos itens sem custo → o lucro continua (é válido para o resto),
  com aviso dizendo quantos de quantos itens estão fora da conta.

## Fuso horário

Todo período é resolvido em `America/Sao_Paulo` (`src/server/lib/dates.ts`):
`todayKey()`, `inicioDoDia()` e `rangeToTimestamps()` (início inclusivo, fim
exclusivo, dia = 24h exatas). O calendário (`todayISO()`) usa o mesmo fuso —
em UTC, das 21h à meia-noite o “hoje” do usuário já era o dia seguinte.

## Modo demonstração (`DEMO_AUTO_LOGIN`)

O acesso automático entra como “o administrador ativo mais antigo do banco”.
Isso é aceitável só enquanto existe **uma** loja. A partir da segunda loja, o
modo demo passa a ser **ignorado** (`demoAutoLoginPermitido()` consulta a
quantidade de lojas em runtime): senão um dono novo cairia na loja de outra
pessoa. Nenhuma variável de ambiente nova é necessária.

## Isolamento por loja (multi-loja)

O guardião no driver acrescenta `company_id` em toda tabela de loja. Duas
correções necessárias:

1. **Condição de filtro nunca depois de `GROUP BY`** — era isso que derrubava
   o dashboard com `argument of AND must be type boolean, not type uuid`.
2. **Contexto explícito nas páginas**: no App Router, `layout` e `page` rodam
   em contextos assíncronos separados, então o `enterWith` da sessão não
   alcança as consultas da página. A página do dashboard envolve suas consultas
   em `withCompany(user.companyId)` e, como rede de segurança, o driver resolve
   a loja pela sessão (cookie) quando não há contexto — **sem estado global**,
   porque um flag global compartilhado fazia requisições simultâneas se
   anularem e a tela abria zerada.

## Pagamento e assinaturas

Desabilitados (decisão do produto). Nenhuma tela de checkout na landing: o CTA
é “Testar grátis” (cadastro) + WhatsApp.

## Rotas: landing em `/` e app em `/dashboard`

O dashboard morava em `/`; para a landing ser pública e indexável, o painel
passou para `/dashboard` (o menu, o login, o 404 e os erros apontam para lá).
`/` é a landing, sempre acessível sem login. Quem já tinha o link antigo na
raiz passa a ver a landing e entra pelo botão “Entrar”.

## Tema: escuro por identidade, claro por escolha

- A landing é **sempre escura** (escopo `.theme-dark`, independente do aparelho).
- O app interno tem três estados: **automático** (segue o aparelho, padrão),
  claro e escuro. A preferência fica no navegador (`orion:theme`), com leitura da
  chave antiga (`passarela:theme`) para não perder a escolha de quem já usava.
- As duas seleções (`html.dark` e `.theme-dark`) compartilham o mesmo bloco de
  variáveis, então não há tema “meio escuro”.

## SEO

- `robots.txt` e `sitemap.xml` gerados pelo Next (`src/app/robots.ts`,
  `src/app/sitemap.ts`): só as páginas públicas são indexáveis.
- O layout raiz deixou de injetar `noindex` (era aplicado em TODAS as páginas,
  inclusive na landing); o `noindex` agora mora na área logada e no login.
- Dados estruturados `SoftwareApplication` na landing, com `canonical` e Open
  Graph. A imagem OG depende de uma URL pública — pendente do deploy.

## Identificadores internos com o nome antigo

`passarela_session` (cookie), `__passarela*` (globais do driver) e
`passarela-tenant` (marca interna do SQL) **continuam** nesta etapa: renomear o
cookie derrubaria todas as sessões ativas e os globais não aparecem para o
usuário. A limpeza é a etapa 7 (rename final), feita com cuidado e com o
cookie antigo aceito por um período de transição.

## Dados reais pendentes (não inventados)

WhatsApp, telefone, e-mail e cidade em `src/config/brand.ts` estão vazios ou
com valor provisório. Enquanto não forem informados, o botão “Falar no
WhatsApp” da landing aponta para a seção de planos, em vez de abrir um link
quebrado. CNPJ/razão social não aparecem em nenhuma página pública.

## Deploy

O domínio é mantido (`meus-projetos-qzoj.vercel.app`). Não há renomeação de
projeto na Vercel para não invalidar links já compartilhados.
