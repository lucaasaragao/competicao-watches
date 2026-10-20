const { voterFromRequest, watches, tally } = require("../lib/core");
const { addVote } = require("../lib/store");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const voterId = voterFromRequest(req);
  if (!voterId) return res.status(401).json({ error: "Faça login novamente." });

  const watchId = req.body?.watchId;
  if (!watches.some((w) => w.id === watchId)) return res.status(400).json({ error: "Relógio não encontrado." });

  try {
    const { already, votes } = await addVote(voterId, watchId);
    if (already) return res.status(409).json({ error: "Você já votou.", votedFor: votes[voterId].watchId });
    res.status(200).json({ ok: true, votedFor: watchId, ...tally(votes) });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: err.message || "Não foi possível registrar o voto." });
  }
};
