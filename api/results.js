const { tally, roundInfo } = require("../lib/core");
const { getRound } = require("../lib/store");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const round = await getRound();
    res.status(200).json({ ...tally(round.votes), ...roundInfo(round.startedAt) });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: err.message });
  }
};
