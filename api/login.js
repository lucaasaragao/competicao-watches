const { cleanCpf, isValidCpf, hashCpf, makeToken } = require("../lib/core");
const { getVotes } = require("../lib/store");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const cpf = cleanCpf(req.body?.cpf);
  if (!isValidCpf(cpf)) return res.status(400).json({ error: "CPF inválido." });
  const voterId = hashCpf(cpf);
  let votes;
  try {
    votes = await getVotes();
  } catch (err) {
    console.error(err);
    return res.status(503).json({ error: err.message });
  }
  res.status(200).json({ token: makeToken(voterId), votedFor: votes[voterId]?.watchId || null });
};
