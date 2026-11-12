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

## Pendências conhecidas

- Etapas 3 a 7 do rebrand (landing pública, painéis novos, Pix QR/NFC-e/
  etiquetas/offline, 2FA/permissões/auditoria/CSP, rename final para ORION).
- Dados reais ainda necessários para a landing: CNPJ, endereço, telefone/
  WhatsApp, e-mail e imagem de compartilhamento (OG).
