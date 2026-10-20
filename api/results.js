const { tally } = require("../lib/core");
const { getVotes } = require("../lib/store");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(tally(await getVotes()));
};
