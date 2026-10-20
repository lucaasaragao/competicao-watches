const { cleanCpf, isValidCpf, hashCpf, makeToken, isAdmin, roundInfo } = require("../lib/core");
const { getRound } = require("../lib/store");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const cpf = cleanCpf(req.body?.cpf);
  if (!isValidCpf(cpf)) return res.status(400).json({ error: "CPF inválido." });
  const voterId = hashCpf(cpf);
  let round;
  try {
    round = await getRound();
  } catch (err) {
    console.error(err);
    return res.status(503).json({ error: err.message });
  }
  res.status(200).json({
    token: makeToken(voterId),
    votedFor: round.votes[voterId]?.watchId || null,
    isAdmin: isAdmin(voterId),
    ...roundInfo(round.startedAt),
  });
};
