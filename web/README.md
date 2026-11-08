# Passarela da Moda

Sistema de gestão para loja de moda — **um único arquivo que roda no seu computador**, sem internet,
sem instalação, **sem login e sem cadastro**.

**Arquivo para baixar:** [`Passarela-da-Moda.html`](../Passarela-da-Moda.html) (≈ 224 KB)
Baixe → dê dois cliques → o programa abre no navegador. Pronto.

## O que ele faz

| Área | O que tem |
| --- | --- |
| **Painel** | faturamento, lucro, ticket médio, estoque baixo, gráficos |
| **PDV** | venda rápida, desconto, troco, pagamento dividido, fiado |
| **Vendas** | histórico, cancelamento (devolve estoque), quitar fiado |
| **Produtos** | cadastro com **foto**, tamanho, cor, categoria, custo, preço, estoque |
| **Clientes** | cadastro com telefone, CPF, aniversário, histórico e saldo devedor |
| **Financeiro** | despesas, contas pagas, resultado do período |
| **Relatórios** | mais vendidos, margem, exportação em CSV |
| **Configurações** | nome da loja, tema, cor de destaque, alerta de estoque |

## Como os dados são salvos

Nada fica na internet. Tudo fica em dois lugares:

1. **No navegador** (IndexedDB) — o programa abre já com seus dados no dia seguinte.
2. **Num arquivo no seu computador** — clique em **"Escolher arquivo de dados"** (embaixo, na
   barra da esquerda) e escolha onde salvar, por exemplo:

   ```
   Documentos\Passarela\passarela-da-moda.passarela.json
   ```

Depois disso **toda alteração é gravada nesse arquivo automaticamente**: produtos, fotos, vendas,
clientes, despesas e configurações. É o seu backup vivo.

- Copie esse arquivo para um pen drive ou para a nuvem quando quiser.
- Em outro computador, abra o programa e escolha esse mesmo arquivo: **os dados aparecem lá**.
- Quer salvar uma cópia avulsa? **Meu perfil → Baixar backup** gera um `.json` completo.

> A gravação direta em arquivo usa a File System Access API (Chrome, Edge e Opera).
> Em navegadores sem esse recurso (Firefox/Safari), use **Baixar arquivo manualmente** na barra
> lateral — os dados continuam salvos no navegador de qualquer forma.

## Detalhes técnicos

- HTML + CSS + JavaScript puro num só arquivo, sem dependências, sem build para o usuário final.
- Fotos de produto e foto de perfil são redimensionadas no próprio navegador (menos espaço, mesma nitidez).
- Logo em vetor (SVG embutido) — nítida em qualquer tamanho e impressão.
- Funciona de `file://` (dois cliques) e também em qualquer pasta/hospedagem, se quiser.

## Desenvolver

```bash
npm run web:build     # gera Passarela-da-Moda.html e web/dist/palco.html
npm run web:test      # 30 testes de lógica + 1 de navegador + 2 de arquivo
```

Organização do código em `web/src/`:

```
core.js     validações e cálculos puros (CPF, datas, totais, margem)
db.js       armazenamento: IndexedDB + gravação em arquivo no computador
store.js    regras de negócio (produtos, vendas, clientes, despesas, backup)
ui.js       componentes (modais, toasts, gráficos, avatar, upload de foto)
icons.js    ícones SVG
app.js      telas e navegação
styles.css  aparência (tema claro/escuro, cor de destaque)
template.html  molde do arquivo único
brand/      logo oficial em SVG e PNG (512 e 256 px)
```

## Testes

```
30 testes de lógica      (web/tests/core.test.js + web/tests/store.test.js)
1  teste de navegador    (web/tests/e2e.test.js — jsdom, fluxo completo)
2  testes de arquivo     (web/tests/file.test.js — grava e relê do disco)
```
