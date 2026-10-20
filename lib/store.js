// Guarda a rodada num único JSON: { "startedAt": ISO, "votes": { "<hash do cpf>": { watchId, at } } }
// (o formato antigo, só com os votos, ainda é aceito na leitura)
// - Na Vercel: arquivo privado "votos.json" no Vercel Blob. O SDK se autentica sozinho,
//   via BLOB_STORE_ID + token OIDC (stores novos) ou BLOB_READ_WRITE_TOKEN (stores antigos).
// - No computador: arquivo data/votes.json.
const fs = require("fs");
const { roundInfo } = require("./core");
const path = require("path");

const BLOB_PATH = "votos.json";
const LOCAL_FILE = path.join(__dirname, "..", "data", "votes.json");
// Na Vercel o disco é somente leitura, então lá sempre usamos o Blob
const useBlob = Boolean(process.env.VERCEL || process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

const NOT_CONFIGURED =
  "Armazenamento de votos não configurado. Conecte um Blob Store ao projeto na Vercel e faça Redeploy.";

// Transforma erros de credencial/store do Blob numa mensagem clara
function explain(err) {
  const msg = String(err?.message || "");
  if (/token|store|oidc|credential|BlobStoreNotFound|access/i.test(msg + err?.name)) {
    const e = new Error(`${NOT_CONFIGURED} [Detalhe: ${msg.slice(0, 200)}]`);
    e.cause = err;
    return e;
  }
  return err;
}

// Converte o que estiver no arquivo para { startedAt, votes }.
// Sem arquivo: rodada ainda não começou (startedAt = null).
// Formato antigo (só votos): a rodada começou no voto mais antigo.
function normalize(raw) {
  if (!raw || typeof raw !== "object") return { startedAt: null, votes: {} };
  if (raw.votes && typeof raw.votes === "object") return { startedAt: raw.startedAt || null, votes: raw.votes };
  const votes = raw;
  const times = Object.values(votes)
    .map((v) => Date.parse(v?.at))
    .filter((t) => !Number.isNaN(t));
  return { startedAt: times.length ? new Date(Math.min(...times)).toISOString() : null, votes };
}

// ---------- Vercel Blob ----------
async function blobRead() {
  const { get } = require("@vercel/blob");
  // useCache: false garante que lemos sempre a versão mais nova
  const res = await get(BLOB_PATH, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return { data: normalize(null), etag: null };
  const text = await new Response(res.stream).text();
  return { data: normalize(JSON.parse(text || "{}")), etag: res.blob.etag };
}

async function blobWrite(data, etag) {
  const { put } = require("@vercel/blob");
  await put(BLOB_PATH, JSON.stringify(data), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    cacheControlMaxAge: 60,
    // Só grava se ninguém mudou o arquivo desde a leitura (evita perder votos simultâneos)
    ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
  });
}

// ---------- Arquivo local ----------
async function localRead() {
  try {
    return { data: normalize(JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8"))), etag: null };
  } catch {
    return { data: normalize(null), etag: null };
  }
}

async function localWrite(data) {
  fs.writeFileSync(LOCAL_FILE + ".tmp", JSON.stringify(data, null, 2));
  fs.renameSync(LOCAL_FILE + ".tmp", LOCAL_FILE);
}

const read = useBlob ? blobRead : localRead;
const write = useBlob ? blobWrite : localWrite;

function isConflict(err) {
  return err?.name === "BlobPreconditionFailedError" || /already exists|precondition/i.test(err?.message || "");
}

// Lê, aplica `change` e grava só se ninguém mexeu no arquivo no meio (ETag).
// Se houve conflito, relê e tenta de novo. `change` devolve { data } para gravar
// ou { skip: true } para não gravar nada; o resto do objeto volta para quem chamou.
async function update(change) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let data, etag;
    try {
      ({ data, etag } = await read());
    } catch (err) {
      throw explain(err);
    }
    const result = change(data);
    if (result.skip) return result;
    try {
      await write(result.data, etag);
      return result;
    } catch (err) {
      if (!isConflict(err)) throw explain(err);
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
    }
  }
  throw new Error("Muita gente votando ao mesmo tempo. Tente de novo.");
}

// Devolve { startedAt, votes } da rodada atual
async function getRound() {
  try {
    return (await read()).data;
  } catch (err) {
    throw explain(err);
  }
}

// Registra o voto. Respostas: { closed } | { already } | { ok }; sempre com `data`.
async function addVote(voterId, watchId) {
  return update((data) => {
    if (roundInfo(data.startedAt).closed) return { skip: true, closed: true, data };
    if (data.votes[voterId]) return { skip: true, already: true, data };
    const now = new Date().toISOString();
    const next = {
      startedAt: data.startedAt || now, // o primeiro voto começa a rodada
      votes: { ...data.votes, [voterId]: { watchId, at: now } },
    };
    return { ok: true, data: next };
  });
}

// Começa uma rodada nova: apaga todos os votos e reinicia o relógio de 24h
async function resetRound() {
  return update(() => ({ ok: true, data: { startedAt: new Date().toISOString(), votes: {} } }));
}

module.exports = { getRound, addVote, resetRound };
