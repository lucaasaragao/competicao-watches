const crypto = require("crypto");
const watches = require("../data/watches.json");

// A votação fica aberta por 24 horas a partir do primeiro voto (ou do último reset)
const VOTING_DURATION_MS = 24 * 60 * 60 * 1000;

// Defina SECRET nas variáveis de ambiente da Vercel. Não troque depois que a votação começar.
const SECRET = process.env.SECRET || "troque-este-segredo";

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

// O CPF nunca é guardado: só um hash irreversível (LGPD)
function hashCpf(cpf) {
  return crypto.createHmac("sha256", SECRET).update(cpf).digest("hex");
}

function sign(voterId) {
  return crypto.createHmac("sha256", SECRET).update("token:" + voterId).digest("hex");
}

function makeToken(voterId) {
  return `${voterId}.${sign(voterId)}`;
}

// Lê o token do header Authorization e devolve o id do eleitor (ou null)
function voterFromRequest(req) {
  const token = String(req.headers.authorization || "").replace("Bearer ", "");
  const [voterId, sig] = token.split(".");
  if (!voterId || !sig) return null;
  const expected = sign(voterId);
  if (sig.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? voterId : null;
}

// Admin: quem tem o CPF de ADMIN_CPF (variável de ambiente). Comparamos só os hashes.
function isAdmin(voterId) {
  const adminCpf = cleanCpf(process.env.ADMIN_CPF);
  if (!voterId || !isValidCpf(adminCpf)) return false;
  const expected = hashCpf(adminCpf);
  return voterId.length === expected.length && crypto.timingSafeEqual(Buffer.from(voterId), Buffer.from(expected));
}

// Situação da rodada: sem startedAt = ainda não começou (votação aberta)
function roundInfo(startedAt, now = Date.now()) {
  const start = startedAt ? Date.parse(startedAt) : NaN;
  if (Number.isNaN(start)) return { startedAt: null, endsAt: null, closed: false, now: new Date(now).toISOString() };
  const ends = start + VOTING_DURATION_MS;
  return {
    startedAt: new Date(start).toISOString(),
    endsAt: new Date(ends).toISOString(),
    closed: now >= ends,
    now: new Date(now).toISOString(),
  };
}

function tally(votes) {
  const counts = Object.fromEntries(watches.map((w) => [w.id, 0]));
  for (const v of Object.values(votes)) if (v.watchId in counts) counts[v.watchId]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { total, counts };
}

module.exports = {
  VOTING_DURATION_MS,
  watches,
  cleanCpf,
  isValidCpf,
  hashCpf,
  makeToken,
  voterFromRequest,
  isAdmin,
  roundInfo,
  tally,
};
