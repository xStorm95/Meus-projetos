# Palco — ERP de moda em um único arquivo HTML

Aplicação **autônoma** (um só arquivo, sem servidor, sem build, sem dependências):
cadastro, login, perfil com foto, PDV, produtos, estoque, clientes, fiado,
financeiro, relatórios, backup/restore e configurações.

> **O arquivo para baixar e publicar é `web/palco.html`** (~217 KB).
> Ele já vem pronto: CSS, JavaScript e ícones embutidos.

---

## 1. Como usar

1. Baixe `web/palco.html`.
2. Dê dois cliques — abre no navegador. Funciona até **offline** e por `file://`.
3. Crie sua conta na aba **Criar conta**. A primeira conta é a administradora.
4. Pronto: seus dados ficam salvos e você continua logado ao voltar.

Para publicar: suba `palco.html` em qualquer hospedagem estática (Netlify Drop,
Vercel, GitHub Pages, Hostinger, cPanel...) ou renomeie para `index.html`.

## 2. O que é real (e o que não é)

| Recurso | Como funciona de verdade |
| --- | --- |
| Cadastro / login | Contas reais gravadas no navegador. Senha protegida com **PBKDF2-HMAC-SHA256, 210.000 iterações + salt aleatório** (formato `pbkdf2$iterações$salt$hash`). A senha em texto puro **nunca** é salva nem exportada. |
| Sessão persistente | Token de 32 bytes + validade de 12 h salvos no armazenamento local. Fechar o navegador não desloga. |
| Bloqueio de tentativas | 5 erros de senha bloqueiam a conta por 15 minutos (com registro em disco). |
| Perfil com foto | Upload de JPG/PNG/WEBP, redimensionado para 512 px e salvo como data URL no seu armazenamento. |
| Produtos, vendas, clientes, despesas | CRUD completo, com validações (CPF/CNPJ, estoque, desconto, fiado) e persistência. |
| PDV | Carrinho, desconto, troco, baixa de estoque transacional e recibo para impressão. |
| Fiado | Saldo em aberto por venda, recebimento parcial ou total. |
| Backup | Exporta/importa um JSON com todos os dados (sem hashes de senha). |
| Relatórios | Agregações reais + CSV compatível com Excel pt-BR e impressão. |

**Limites que você precisa saber (transparência):**

- Os dados ficam **no seu dispositivo** (IndexedDB, com espelho em localStorage).
  Não há servidor nem sincronização entre aparelhos — outro computador começa vazio.
- Limpar os dados do navegador **apaga o sistema**. Baixe o backup em
  **Meu perfil → Backup** com frequência.
- Não há "esqueci minha senha": como não existe servidor, não há para quem enviar
  e-mail. Guarde a senha ou o backup.
- Sem emissão fiscal e sem processamento de cartão — os pagamentos são registrados,
  não cobrados.

## 3. Armazenamento

1. **IndexedDB** (principal, suporta as fotos)
2. **localStorage** (espelho automático, também serve de fallback se o IndexedDB
   estiver bloqueado, ex.: janela privada)
3. **memória** (último recurso; avisa na barra lateral)

O chip na barra lateral mostra qual está ativo.

## 4. Atalhos

| Tecla | Ação |
| --- | --- |
| `F2` | Abrir o PDV |
| `F3` | Produtos |
| `F4` | Vendas |
| `/` | Focar a busca da tela atual |
| `Esc` | Fechar modal |

## 5. Desenvolvimento

```bash
npm run web:build   # gera web/palco.html e web/dist/palco.html
npm run web:test    # 39 testes de lógica + 1 teste de navegador (jsdom)
```

Estrutura:

```
web/
  src/
    template.html   esqueleto do arquivo final
    styles.css      todo o CSS (temas claro/escuro + 6 paletas)
    core.js         regras puras: dinheiro, CPF/CNPJ, vendas, DRE, validações
    hash.js         SHA-256/HMAC/PBKDF2 próprios + Web Crypto
    db.js           IndexedDB com fallback para localStorage
    store.js        autenticação, sessão, CRUD, agregações
    icons.js        ícones SVG inline
    ui.js           toasts, modais, avatar, gráficos, máscaras, downloads
    app.js          telas e interações
  tests/            core, store e e2e (jsdom)
  build.js          junta tudo em um arquivo
  palco.html        ★ arquivo publicado (gerado)
```

O `hash.js` foi validado contra o `node:crypto`: SHA-256, HMAC-SHA256 e PBKDF2
produzem saída idêntica byte a byte.
