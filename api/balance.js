const { kv } = require("./_lib/kv");
const { verifySession } = require("./_lib/auth");

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  const v = await verifySession(req.headers.authorization);
  if (!v.ok) return json(res, 401, { ok: false, error: v.error });

  const userId = v.payload.sub;
  const user = await kv.get(`user:${userId}`);
  if (!user) return json(res, 404, { ok: false, error: "Usuario no existe" });

  return json(res, 200, { ok: true, balance: Number(user.balance || 0) });
};
