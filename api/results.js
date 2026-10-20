const { tally } = require("../lib/core");
const { getVotes } = require("../lib/store");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.status(200).json(tally(await getVotes()));
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: err.message });
  }
};
