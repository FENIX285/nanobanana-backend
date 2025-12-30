const { kv } = require("../_lib/kv");

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  const admin = req.headers["x-admin-secret"];
  if (!admin || admin !== process.env.ADMIN_SECRET) {
    return json(res, 401, { ok: false, error: "No autorizado" });
  }
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  let body = "";
  req.on("data", c => body += c);
  req.on("end", async () => {
    let data = null;
    try { data = JSON.parse(body || "{}"); } catch (_) { data = {}; }

    const token = String(data.token || "").trim();
    const amount = Number(data.amount || 0); // positivos para recargar; negativos para debitar admin
    if (!token) return json(res, 400, { ok: false, error: "Falta token" });
    if (!Number.isFinite(amount) || amount === 0) return json(res, 400, { ok: false, error: "amount inválido" });

    const userId = await kv.get(`token:${token}`);
    if (!userId) return json(res, 404, { ok: false, error: "Token no existe" });

    const userKey = `user:${userId}`;
    const user = await kv.get(userKey);
    if (!user) return json(res, 404, { ok: false, error: "Usuario no existe" });

    const newBal = Math.max(0, Number(user.balance || 0) + amount);
    user.balance = newBal;
    await kv.set(userKey, user);

    return json(res, 200, { ok: true, userId, balance: newBal });
  });
};
