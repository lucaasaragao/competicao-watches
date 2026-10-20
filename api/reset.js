// Zera a votação e começa uma rodada nova de 24h. Só o admin (ADMIN_CPF) pode.
const { voterFromRequest, isAdmin, roundInfo } = require("../lib/core");
const { resetRound } = require("../lib/store");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const voterId = voterFromRequest(req);
  if (!voterId) return res.status(401).json({ error: "Faça login novamente." });
  if (!isAdmin(voterId)) return res.status(403).json({ error: "Só o administrador pode resetar a votação." });

  try {
    const { data } = await resetRound();
    res.status(200).json({ ok: true, ...roundInfo(data.startedAt) });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: err.message || "Não foi possível resetar a votação." });
  }
};
