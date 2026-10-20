# Competição de Relógios

Votação simples entre 2 ou 3 relógios. O usuário entra com o CPF e vota uma única vez.
Feito para rodar na **Vercel**: front estático em `public/` e funções serverless em `api/`.

## Estrutura

```
public/            front (HTML/CSS/JS puro)
  img/             imagens dos relógios
api/               funções da Vercel (uma por rota)
lib/core.js        CPF, token e contagem
lib/store.js       onde os votos ficam guardados
data/watches.json  lista de relógios: edite aqui
dev-server.js      servidor só para testar localmente
```

## Onde ficam os votos

Num único JSON, `{ "<hash do cpf>": { watchId, at } }`:

- **Na Vercel:** arquivo privado `votos.json` no **Vercel Blob**. Cada voto lê o arquivo, acrescenta o voto e grava só se ninguém alterou o arquivo no meio (ETag). Se houve conflito, tenta de novo. Assim votos simultâneos não se perdem.
- **No computador:** `data/votes.json`.

O CPF é validado pelos dígitos verificadores e nunca é guardado: só um hash irreversível (HMAC com `SECRET`).

## Variáveis de ambiente na Vercel

| Nome | O que é |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | criada sozinha ao conectar um Blob Store ao projeto |
| `SECRET` | frase longa e aleatória. **Não troque depois que a votação começar** (todo mundo poderia votar de novo) |

## Rodar localmente

```bash
npm install
npm run dev   # http://localhost:3000
```

## Zerar a votação

Apague o arquivo `votos.json` no Blob Store (Vercel → Storage), ou `data/votes.json` localmente.
