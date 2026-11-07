# Palco · Conta

Página de **login, cadastro e perfil com foto** em **um único arquivo HTML**
(`app/palco-conta.html`, ~101 KB). Sem servidor, sem framework, sem dependências.
Funciona offline e abrindo com dois cliques.

## Como usar

1. Baixe `app/palco-conta.html`.
2. Abra no navegador.
3. Clique em **Criar conta** → nome, e-mail e senha → pronto, você está logada.
4. Volte depois: a sessão continua ativa e sua foto está lá.

Para publicar, suba o arquivo em qualquer hospedagem estática (Netlify Drop,
Vercel, GitHub Pages, cPanel) ou renomeie para `index.html`.

## O que é real

| Recurso | Como funciona |
| --- | --- |
| Cadastro | Validação de nome, e-mail (com checagem de duplicado em tempo real), senha forte e confirmação. CPF e telefone opcionais, com validação de dígito. |
| Senha | **PBKDF2-HMAC-SHA256, 210.000 iterações + salt aleatório**. A senha em texto puro nunca é gravada nem exportada. |
| Login | Comparação em tempo constante; 5 erros bloqueiam a conta por 15 minutos. |
| Sessão | Token de 32 bytes com validade de 24 h. Fechar o navegador **não** desloga. |
| Perfil | Nome, e-mail, telefone, CPF, nascimento, cidade, bio e **foto**. |
| Foto | Upload por clique ou arrastar, JPG/PNG/WEBP até 15 MB, redimensionada para 512 px e **confirmada no armazenamento** depois de salvar. |
| Segurança | Troca de senha (exige a atual), excluir conta (exige senha), sair. |
| Extras | Tema claro/escuro, layout responsivo, aviso de "tudo salvo", atalhos de acessibilidade. |

## Onde os dados ficam

1. **IndexedDB** (principal)
2. **localStorage** (espelho automático e fallback — janela privada, `file://`)
3. memória (último recurso; a interface avisa)

Nada é enviado para servidor algum. Limpar os dados do navegador apaga a conta —
não existe recuperação de senha porque não há para onde enviar e-mail.

## Desenvolvimento

```bash
npm run app:build   # gera app/palco-conta.html
npm run app:test    # 13 testes de lógica + 1 teste de navegador (jsdom)
```

```
app/
  template.html        esqueleto do arquivo final
  build.js             junta CSS + JS em um arquivo
  assets/
    styles.css         temas claro/escuro, layout, componentes
    core.js            validações puras (e-mail, senha, CPF, datas)
    hash.js            SHA-256/HMAC/PBKDF2 (Web Crypto + fallback próprio)
    auth.js            cadastro, login, sessão, perfil e foto
    icons.js           ícones SVG inline
    app.js             telas e interações
  tests/               auth.test.js (lógica) e e2e.test.js (navegador)
  palco-conta.html     ★ arquivo publicado (gerado)
```

Os testes de navegador cobrem o fluxo completo: cadastro → perfil → foto →
**recarregar a página e conferir que a foto e os dados continuam lá** →
sair → entrar de novo → trocar a senha.
