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

## Etapa 4 — painéis, Excel e importação de clientes

### Curva ABC: classe olha o acumulado ANTERIOR ao item

A = itens que somam os primeiros 80% da receita, B até 95%, C o resto. O item
que **cruza** a linha de 80% continua sendo A — é ele quem sustenta o
faturamento. Se a classe olhasse o acumulado **depois** do item, uma loja com um
campeão isolado (88% do faturamento) o classificaria como “B” e a classe A
ficaria vazia: leitura errada da curva. As comparações usam tolerância
(`Math.abs(x - 80) < 1e-9`) porque somas de decimais não fecham exatamente em
80,0000. A curva é sempre **do período selecionado** — não existe “curva de
sempre”, e a tela diz isso.

### Metas: sem meta não há progresso

`users.monthly_goal` já existia no cadastro de usuário. O painel mostra
realizado, progresso e **projeção pela média diária do mês até hoje** (não uma
regra de três sobre o período do dashboard, que pode ser de um dia só). Quem não
tem meta aparece com “—”, nunca 0% nem 100%, e a tela oferece o atalho para
cadastrar.

### Comparativo de lojas: única exceção ao isolamento, e autorizada

Comparar lojas exige ler mais de uma — o único ponto do produto que abre mão do
guardião. Regras:

- `runAsSystem` (não `runWithCompany(null)`: `null` significa “sem loja” e o
  guardião falha fechado, devolvendo zero linhas);
- autorização **no servidor** por `PLATFORM_ADMIN_EMAILS` ou pelo e-mail do
  usuário da loja **mais antiga** (o dono natural da instalação);
- a rota ainda exige `reports.view`;
- o comparativo devolve **só totais por loja** (faturamento, vendas, ticket,
  lucro, produtos, estoque). Nenhum cliente, venda ou item de outra loja aparece.
- Sem base de comparação a variação é `null` → “—”. Com uma única loja, a tela
  explica em vez de mostrar uma tabela de uma linha.

### Excel (.xlsx) sem biblioteca nova

`src/server/lib/export.ts` ganhou `xlsxResponse`, que monta o arquivo com um ZIP
“stored” escrito na mão (CRC32 próprio) + os XML do formato. Zero dependência
nova, funciona no runtime da Vercel, e o arquivo abre no Excel, Google Sheets e
LibreOffice (validado com `openpyxl`). Recursos: cabeçalho em negrito e
congelado, autofiltro e largura de coluna calculada.

- **Números são números**: custo, preço, estoque, totais e quantidades viram
  valor numérico, para somar e filtrar na planilha.
- **CSV continua em pt-BR** (vírgula decimal, data DD/MM/AAAA): é o formato que
  abre certo no Excel configurado em português. Por isso as duas saídas existem
  — não é redundância, é o mesmo dado em duas convenções.

### Importação de clientes: planilha real, LGPD respeitada

- Colunas aceitas com ou sem acento e com sinônimos (`nome`/`cliente`,
  `cpf`/`cnpj`/`documento`, `celular`/`telefone`), separador `;` ou `,`,
  tolerância a aspas.
- **Documento inválido é descartado com aviso**, não zerado: se entrasse como
  “”, dois clientes diferentes colidiriam no mesmo documento e um seria
  descartado como “duplicado” — pior do que não importar. O mesmo vale para UF
  inexistente (“ZZ”) e e-mail malformado.
- Documento repetido é **ignorado** (padrão), contado em `skipped`; a linha não
  aborta a importação.
- **Consentimento de marketing não é presumido** (LGPD): `lgpdConsent: false` e
  a tela informa quantos cadastros entraram sem consentimento.
- Limite de 2.000 linhas por importação e 2 MB por arquivo.
