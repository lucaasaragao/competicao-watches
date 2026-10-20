const { voterFromRequest, watches, tally, roundInfo } = require("../lib/core");
const { addVote } = require("../lib/store");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const voterId = voterFromRequest(req);
  if (!voterId) return res.status(401).json({ error: "Faça login novamente." });

  const watchId = req.body?.watchId;
  if (!watches.some((w) => w.id === watchId)) return res.status(400).json({ error: "Relógio não encontrado." });

  try {
    const { closed, already, data } = await addVote(voterId, watchId);
    const info = roundInfo(data.startedAt);
    if (closed) return res.status(403).json({ error: "Votação encerrada.", ...info });
    if (already) return res.status(409).json({ error: "Você já votou.", votedFor: data.votes[voterId].watchId, ...info });
    res.status(200).json({ ok: true, votedFor: watchId, ...tally(data.votes), ...info });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: err.message || "Não foi possível registrar o voto." });
  }
};
