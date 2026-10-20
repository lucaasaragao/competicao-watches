// Guarda os votos num único JSON: { "<hash do cpf>": { watchId, at } }
// - Na Vercel: arquivo privado "votos.json" no Vercel Blob. O SDK se autentica sozinho,
//   via BLOB_STORE_ID + token OIDC (stores novos) ou BLOB_READ_WRITE_TOKEN (stores antigos).
// - No computador: arquivo data/votes.json.
const fs = require("fs");
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
    const e = new Error(NOT_CONFIGURED);
    e.cause = err;
    return e;
  }
  return err;
}

// ---------- Vercel Blob ----------
async function blobRead() {
  const { get } = require("@vercel/blob");
  // useCache: false garante que lemos sempre a versão mais nova
  const res = await get(BLOB_PATH, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return { votes: {}, etag: null };
  const text = await new Response(res.stream).text();
  return { votes: JSON.parse(text || "{}"), etag: res.blob.etag };
}

async function blobWrite(votes, etag) {
  const { put } = require("@vercel/blob");
  await put(BLOB_PATH, JSON.stringify(votes), {
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
    return { votes: JSON.parse(fs.readFileSync(LOCAL_FILE, "utf8")), etag: null };
  } catch {
    return { votes: {}, etag: null };
  }
}

async function localWrite(votes) {
  fs.writeFileSync(LOCAL_FILE + ".tmp", JSON.stringify(votes, null, 2));
  fs.renameSync(LOCAL_FILE + ".tmp", LOCAL_FILE);
}

const read = useBlob ? blobRead : localRead;
const write = useBlob ? blobWrite : localWrite;

async function getVotes() {
  try {
    return (await read()).votes;
  } catch (err) {
    throw explain(err);
  }
}

// Registra o voto. Se outro voto entrou no meio, relê e tenta de novo.
async function addVote(voterId, watchId) {
  for (let attempt = 0; attempt < 8; attempt++) {
    let votes, etag;
    try {
      ({ votes, etag } = await read());
    } catch (err) {
      throw explain(err);
    }
    if (votes[voterId]) return { already: true, votes };
    votes[voterId] = { watchId, at: new Date().toISOString() };
    try {
      await write(votes, etag);
      return { already: false, votes };
    } catch (err) {
      const conflict =
        err?.name === "BlobPreconditionFailedError" || /already exists|precondition/i.test(err?.message || "");
      if (!conflict) throw explain(err);
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
    }
  }
  throw new Error("Muitos votos ao mesmo tempo. Tente de novo.");
}

module.exports = { getVotes, addVote };
