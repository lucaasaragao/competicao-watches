const { voterFromRequest, isAdmin, roundInfo } = require("../lib/core");
const { getRound } = require("../lib/store");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const voterId = voterFromRequest(req);
  if (!voterId) return res.status(401).json({ error: "Faça login novamente." });
  let round;
  try {
    round = await getRound();
  } catch (err) {
    console.error(err);
    return res.status(503).json({ error: err.message });
  }
  res.status(200).json({
    votedFor: round.votes[voterId]?.watchId || null,
    isAdmin: isAdmin(voterId),
    ...roundInfo(round.startedAt),
  });
};
