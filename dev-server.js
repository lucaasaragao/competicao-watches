// Servidor só para testar no computador: `npm run dev`. Na Vercel ele não é usado.
const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
for (const route of ["watches", "login", "me", "vote", "results"]) {
  app.all(`/api/${route}`, require(`./api/${route}`));
}
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}`));
