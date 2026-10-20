# Competição de Relógios

Votação simples entre 2 ou 3 relógios. O usuário entra com o CPF e vota uma única vez.

## Rodar

```bash
npm install
SECRET="uma-frase-secreta-longa" npm start
# http://localhost:3000
```

## Como funciona

- **Front:** HTML/CSS/JS puro em `public/` (login → escolha → resultado).
- **Back:** Express em `server.js`.
- **Relógios:** edite `data/watches.json` (id, nome, descrição, imagem). Imagens vão em `public/img/`.
- **Votos:** gravados em `data/votes.json`, criado no primeiro voto. Para zerar a votação, apague esse arquivo e reinicie.
- **CPF:** validado pelos dígitos verificadores e guardado só como hash (HMAC com o `SECRET`), nunca em texto. Um CPF = um voto.

## API

| Método | Rota | Uso |
|---|---|---|
| GET | `/api/watches` | lista os relógios |
| POST | `/api/login` | `{ cpf }` → `{ token, votedFor }` |
| GET | `/api/me` | quem está logado já votou? |
| POST | `/api/vote` | `{ watchId }` com `Authorization: Bearer <token>` |
| GET | `/api/results` | `{ total, counts }` |

## Hospedagem

O arquivo de votos precisa de disco persistente. Funciona em VPS, Render (com Disk) ou Railway (com Volume).
Em Vercel/Netlify (serverless) o JSON é apagado a cada deploy/reinício.

> Trocar o `SECRET` depois de começar a votação invalida o controle de quem já votou. Defina uma vez e mantenha.
