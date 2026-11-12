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

## Etapa 4 — painéis novos e planilhas Excel

- **Página `/paineis`** (menu *Análise → Painéis*):
  - **Curva ABC** de produtos e de clientes (Pareto 80/95), com resumo por
    classe, barra de participação e tabela com acumulado;
  - **Metas do mês**: realizado, progresso, projeção pela média diária e
    “faltam X” por vendedor — sem meta, mostra “—” e o atalho para cadastrar;
  - **Comparativo de lojas** (só para administrador da plataforma): totais por
    loja, ticket médio, estoque a custo e variação contra o período anterior.
    Com uma loja só, explica em vez de inventar comparação.
- **Exportação `.xlsx`** em clientes, produtos, vendas (vendas/itens/pagamentos)
  e em todos os relatórios (`format=xlsx`). ZIP + XML escritos no projeto, sem
  dependência nova; cabeçalho congelado, autofiltro e números somáveis. Os
  botões **Excel** aparecem ao lado dos de CSV em `/clientes` e `/relatorios`.
- **Importação de clientes por CSV** (`/api/customers/import`) com diálogo em
  `/clientes`: arrastar arquivo ou colar, modelo pronto para baixar, resumo de
  importados/ignorados/avisos por linha e lembrete de consentimento LGPD.
  Documento, UF e e-mail inválidos são descartados com aviso em vez de virar
  dado errado no cadastro.
- Correção no CSV de clientes: voltou a usar vírgula decimal (`1.500,00`) — a
  versão em Excel é que leva número puro.
- Testes: `export-xlsx` (6, inclui leitor de ZIP próprio) e `curva-abc` (6).
  Suíte: **125 testes em 14 arquivos**.

## Etapa 5 — Pix, etiquetas, cupom fiscal e PDV offline

- **Pix estático** (BR Code) gerado no próprio projeto (`src/server/lib/pix.ts`):
  payload EMV com CRC16-CCITT-FALSE, chave, recebedor, cidade, valor e `txid`
  derivado da venda (`VENDA<numero>`). Sem provedor, sem taxa e sem internet no
  caixa — o QR é só texto.
- **QR Code próprio** (`src/lib/qr.ts`), sem biblioteca: versões 1–15, correção
  de erro M, escolha de máscara por penalidade, tabela de blocos e padrões de
  alinhamento completos. Validado lendo os SVG com ZXing em 28 combinações.
- `/api/pix` devolve a configuração e, com `?valor=&venda=`, a cobrança pronta.
  A tela do PDV mostra o QR, o valor, o `txid`, botão **Copiar** e **Baixar SVG**.
  Valor zero é recusado com explicação (não é erro de sistema).
- **Configurações → Pagamentos e etiquetas**: chave, nome do recebedor e cidade
  do Pix; tamanho da etiqueta (60x40 / 50x30), preço, código de barras e texto
  extra. PATCH por seção (`payments` / `labels`).
- **Etiquetas** em `/produtos/[id]/etiquetas`: prévia fiel ao papel, quantidade
  por variação, impressão em folha A4 com CSS `@media print` (sem PDF, sem
  dependência) e preferências vindas das configurações.
- **Cupom do documento fiscal** (DANFE simplificado, 80 mm) em
  `/api/fiscal/documents/[id]/danfe`: emitente, destinatário, itens com NCM e
  CSOSN, totais, pagamentos, chave em grupos de quatro e tributos aproximados
  (`DANFE_TAX_PERCENT`, opcional). **Tarja honesta**: “SEM VALOR FISCAL —
  PENDENTE DE AUTORIZAÇÃO” enquanto não houver autorização da SEFAZ, e
  “HOMOLOGAÇÃO” / “CANCELADO” / “AUTORIZADO” conforme o status real.
  Botão **Imprimir cupom** na tela `/fiscal`.
- **Numeração fiscal corrigida em duas frentes**: (1) `settings.fiscalNextNumberNfce`
  é número inicial, não contador — agora o número vem de `MAX(number)` por
  modelo+série, com retry em `23505`; (2) o índice único herdado da migração
  inicial era **global**, então só a primeira loja da instalação conseguia
  emitir — a migração `0004` troca por `(company_id, model, series, number)`.
- **PDV offline** (`src/lib/pdv-offline.ts`): venda sem rede entra numa fila em
  `localStorage`, o topo do PDV mostra o estado (online / N na fila), com
  **Enviar agora** e **Descartar** por venda. Só vale para venda à vista: com
  crediário ou pagamento dividido o PDV avisa e não enfileira (o limite de
  crédito e a baixa de estoque precisam do servidor). A fila é por navegador —
  não sincroniza entre máquinas. Desligável em Configurações.
- **Referência de produto**: a referência automática usava os últimos 4 dígitos
  do relógio e colidia em criações na mesma janela de 10 s (teste instável).
  Agora, quando a referência é automática, o sistema tenta outros sufixos;
  referência digitada pelo usuário continua dando erro de duplicidade.
- Testes: `qr-code` (7), `pix-brcode` (9), `danfe` (9). Suíte:
  **150 testes em 17 arquivos**.
