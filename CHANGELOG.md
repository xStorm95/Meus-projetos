# CHANGELOG — PASSARELA → ORION

Formato: um bloco por etapa do rebrand. Cada etapa é um commit.

## Etapa 1 — bugs críticos de período e isolamento

- **Fuso da loja**: todo período do dashboard usa `America/Sao_Paulo`.
  Antes, `todayKey()` em UTC fazia o card do período e o card do mês apontarem
  para meses diferentes (R$ 600,00 no período, R$ 0,00 no mês).
- `inicioDoDia` / `rangeToTimestamps`: início inclusivo, fim exclusivo, dia com
  24h exatas; venda das 22h/23h não “pula” para o dia seguinte.
- 21 janelas de data em 12 arquivos (relatórios, financeiro, fiscal, estoque,
  orçamentos, trocas) passaram a usar o mesmo helper.
- **Guardião multi-loja**: o filtro `company_id` não é mais injetado depois de
  `GROUP BY` (gerava `42804` e 500 no dashboard). Novo helper
  `inserirAntesDoGroup` em `src/server/db/client.ts`.
- Série do gráfico agrupa por `date_trunc('day', completed_at AT TIME ZONE ...)`.
- Testes: `dashboard-period` (11), `dashboard-consistency` (5, integração),
  regressão de `GROUP BY` em `tenant` (1). Suíte: 98 testes.

## Etapa 2 — números honestos e tipografia

- **Lucro com custo ausente**: nova consulta `semCusto` (linhas sem custo,
  total de linhas, produtos e receita afetada). Quando nada no período tem
  custo, o card mostra “—” e um aviso com link para `/produtos`; quando é
  parcial, mostra o valor e avisa quantos itens ficaram fora.
- **Badges**: variação sem base agora é `null` no backend (antes virava
  `+100%` verde). Na tela: “Novo” quando o indicador saiu de zero, “—” quando
  nada existe, cinza em 0% e cor invertida em despesa/custo.
- **Saudação** por horário de Brasília (“Bom dia/Boa tarde/Boa noite”),
  calculada no cliente para não divergir na hidratação.
- **Intl**: formatadores `brl`/`num` instanciados uma vez (o dashboard formata
  centenas de valores por render), locale fixo em `pt-BR` e `toNumber()`
  tratando string vazia/ inválida sem virar número errado.
- **`todayISO()` no fuso da loja** — o calendário e o filtro “Hoje” seguiam UTC.
- **Tipografia**: `--font-display` passou de Cormorant Garamond (serifada) para
  Sora, com `tabular-nums` garantido; Inter no corpo.
- **Modo demonstração**: passa a valer só com uma loja no banco
  (`demoAutoLoginPermitido()`), evitando abrir a loja de outro dono.
- **Isolamento**: dashboard resolve a loja com `withCompany` e o driver ganhou
  resolução de emergência pela sessão **sem flag global** (requisições
  simultâneas podiam se anular e zerar a tela).
- Testes novos: `dashboard-sem-custo` (7), `dashboard-badges` (5),
  `tenant-context` (3). Suíte: 113 testes.

## Etapa 3 — identidade ORION e landing pública

- **Módulo de marca** (`src/config/brand.ts`): nome, slogan, paleta, símbolo das
  três estrelas e contato em um só lugar. Componentes `OrionMark`/`OrionWordmark`.
- **Tema**: tema escuro `#0B0B0F` com acento `#7DB3FF`; a landing é sempre
  escura, o app interno ganhou o modo **automático** (segue o aparelho) e a
  preferência mudou para `orion:*` lendo a chave antiga uma vez.
- **Rotas**: painel movido para `/dashboard`; `/` virou a landing pública
  (header, hero, recursos, como funciona, planos sem checkout, LGPD, CTA).
- **Cadastro público** em `/cadastro` (cria loja + dono e já entra), com
  validação de senha espelhando o servidor e aceite dos termos.
- **Termos** (`/termos`) e **privacidade** (`/privacidade`) escritos a partir do
  que o sistema faz de fato (LGPD, controlador/operador, cookies, direitos).
- **SEO**: `robots.txt` e `sitemap.xml`; landing indexável com Open Graph e
  JSON-LD; `noindex` só na área logada e no login. O layout raiz não injeta mais
  o nome antigo da marca nem o `noindex` global.
- **Marca antiga fora do produto**: login, app shell, ícone, manifest, offline,
  service worker (com troca de cache), backups, textos de fiscal/configurações e
  dados de demonstração. Identificadores internos (`passarela_session`,
  `__passarela*`) ficam para a etapa 7 — renomear o cookie derrubaria sessões.
- Verificação: 31 rotas em 200, landing com 0 erros de SEO/marca, suíte 113/113.

## Pendências conhecidas

- Etapas 3 a 7 do rebrand (landing pública, painéis novos, Pix QR/NFC-e/
  etiquetas/offline, 2FA/permissões/auditoria/CSP, rename final para ORION).
- Dados reais ainda necessários para a landing: CNPJ, endereço, telefone/
  WhatsApp, e-mail e imagem de compartilhamento (OG).
