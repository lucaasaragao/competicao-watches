const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
// Troque em produção (variável de ambiente SECRET). Usado para "hashear" o CPF e assinar o token.
const SECRET = process.env.SECRET || "troque-este-segredo";

const DATA_DIR = path.join(__dirname, "data");
const WATCHES_FILE = path.join(DATA_DIR, "watches.json");
const VOTES_FILE = path.join(DATA_DIR, "votes.json");

// ---------- Armazenamento em JSON ----------
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// Escrita atômica: grava num arquivo temporário e renomeia (evita JSON corrompido)
function writeJson(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const watches = readJson(WATCHES_FILE, []);
// votes: { "<hash do cpf>": { watchId, at } }
let votes = readJson(VOTES_FILE, {});

// ---------- CPF ----------
function cleanCpf(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function isValidCpf(cpf) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

// Não guardamos o CPF em texto puro, só um hash (LGPD)
function hashCpf(cpf) {
  return crypto.createHmac("sha256", SECRET).update(cpf).digest("hex");
}

// Token simples: "<hash>.<assinatura>"
function makeToken(voterId) {
  const sig = crypto.createHmac("sha256", SECRET).update("token:" + voterId).digest("hex");
  return `${voterId}.${sig}`;
}

function readToken(token) {
  const [voterId, sig] = String(token || "").split(".");
  if (!voterId || !sig) return null;
  const expected = makeToken(voterId).split(".")[1];
  if (sig.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? voterId : null;
}

function results() {
  const counts = Object.fromEntries(watches.map((w) => [w.id, 0]));
  for (const v of Object.values(votes)) if (v.watchId in counts) counts[v.watchId]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { total, counts };
}

// ---------- API ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/watches", (req, res) => {
  res.json(watches);
});

app.post("/api/login", (req, res) => {
  const cpf = cleanCpf(req.body.cpf);
  if (!isValidCpf(cpf)) return res.status(400).json({ error: "CPF inválido." });
  const voterId = hashCpf(cpf);
  res.json({ token: makeToken(voterId), votedFor: votes[voterId]?.watchId || null });
});

app.get("/api/me", (req, res) => {
  const voterId = readToken(req.get("Authorization")?.replace("Bearer ", ""));
  if (!voterId) return res.status(401).json({ error: "Faça login novamente." });
  res.json({ votedFor: votes[voterId]?.watchId || null });
});

app.post("/api/vote", (req, res) => {
  const voterId = readToken(req.get("Authorization")?.replace("Bearer ", ""));
  if (!voterId) return res.status(401).json({ error: "Faça login novamente." });
  if (votes[voterId]) return res.status(409).json({ error: "Você já votou.", votedFor: votes[voterId].watchId });

  const { watchId } = req.body;
  if (!watches.some((w) => w.id === watchId)) return res.status(400).json({ error: "Relógio não encontrado." });

  // Node processa uma requisição por vez neste trecho síncrono, então não há corrida entre votos
  votes[voterId] = { watchId, at: new Date().toISOString() };
  writeJson(VOTES_FILE, votes);
  res.json({ ok: true, votedFor: watchId, ...results() });
});

app.get("/api/results", (req, res) => {
  res.json(results());
});

app.listen(PORT, () => console.log(`Competição de relógios rodando em http://localhost:${PORT}`));
