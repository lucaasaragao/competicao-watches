const { voterFromRequest } = require("../lib/core");
const { getVotes } = require("../lib/store");

module.exports = async (req, res) => {
  const voterId = voterFromRequest(req);
  if (!voterId) return res.status(401).json({ error: "Faça login novamente." });
  const votes = await getVotes();
  res.status(200).json({ votedFor: votes[voterId]?.watchId || null });
};
