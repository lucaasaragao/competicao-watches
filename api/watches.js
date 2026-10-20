const { watches } = require("../lib/core");

module.exports = (req, res) => {
  res.status(200).json(watches);
};
