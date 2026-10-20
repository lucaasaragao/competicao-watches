# Competição de Relógios

Votação simples entre 2 ou 3 relógios. O usuário entra com o CPF e vota uma única vez.
A votação fica aberta por **24 horas** e o administrador pode zerá-la a qualquer momento.
Feito para rodar na **Vercel**: front estático em `public/` e funções serverless em `api/`.

## Estrutura

```
public/            front (HTML/CSS/JS puro)
  img/             imagens dos relógios
api/               funções da Vercel (uma por rota)
lib/core.js        CPF, token, admin, prazo de 24h e contagem
lib/store.js       onde os votos ficam guardados
data/watches.json  lista de relógios: edite aqui
dev-server.js      servidor só para testar localmente
```

## Rotas

| Rota | O que faz |
|---|---|
| `GET /api/watches` | lista de relógios |
| `POST /api/login` | `{ cpf }` → `{ token, votedFor, isAdmin, startedAt, endsAt, closed }` |
| `GET /api/me` | mesmos dados do login para quem já tem token |
| `POST /api/vote` | `{ watchId }`. 409 se já votou, 403 `"Votação encerrada."` depois do prazo |
| `GET /api/results` | `{ total, counts, startedAt, endsAt, closed }` |
| `POST /api/reset` | só admin (403 para os demais): apaga os votos e começa uma rodada nova |

## Onde ficam os votos

Num único JSON, `{ "startedAt": "<ISO>", "votes": { "<hash do cpf>": { watchId, at } } }`:

- **Na Vercel:** arquivo privado `votos.json` no **Vercel Blob**. Cada voto (e cada reset) lê o arquivo, faz a mudança e grava só se ninguém alterou o arquivo no meio (ETag). Se houve conflito, tenta de novo. Assim votos simultâneos não se perdem.
- **No computador:** `data/votes.json`.

O formato antigo (só os votos, sem `startedAt`) ainda é lido: nesse caso a rodada conta a partir do voto mais antigo.

O CPF é validado pelos dígitos verificadores e nunca é guardado: só um hash irreversível (HMAC com `SECRET`).

## Prazo de 24 horas

- A rodada começa no **primeiro voto** (quando o arquivo é criado) ou num **reset**. Antes disso a votação está aberta e o relógio ainda não começou a contar.
- Ela termina em `startedAt + 24h` (constante `VOTING_DURATION_MS` em `lib/core.js`).
- Depois disso ninguém vota mais. Quem entra vai direto para o resultado final, com o vencedor (ou o empate) em destaque.
- Enquanto está aberta, a tela de resultado mostra quanto tempo falta e se atualiza a cada 10 segundos.

## Zerar a votação (admin)

Defina `ADMIN_CPF` na Vercel com o CPF do administrador (só números). Ele entra normalmente pelo CPF, pode votar como qualquer pessoa e vê um link discreto **"Resetar votação"** nas telas de voto e de resultado. Depois de confirmar, todos os votos são apagados e uma nova rodada de 24 horas começa na hora (funciona também depois que a votação encerrou).

O CPF do admin nunca vai para o código: o servidor compara o hash do CPF de quem entrou com o hash de `ADMIN_CPF`.

Também dá para zerar na mão: apague o arquivo `votos.json` no Blob Store (Vercel → Storage), ou `data/votes.json` localmente. Aí a próxima rodada começa no primeiro voto.

## Variáveis de ambiente na Vercel

| Nome | O que é |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | criada sozinha ao conectar um Blob Store ao projeto |
| `SECRET` | frase longa e aleatória. **Não troque depois que a votação começar** (todo mundo poderia votar de novo) |
| `ADMIN_CPF` | CPF do administrador, só números. Quem entra com ele pode resetar a votação |

## Rodar localmente

```bash
npm install
npm run dev   # http://localhost:3000
ADMIN_CPF=<seu cpf de teste> npm run dev   # para testar o reset
```
