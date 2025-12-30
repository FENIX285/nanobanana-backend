const { kv } = require("./_lib/kv");
const { signSession } = require("./_lib/auth");

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function bad(res, msg) { return json(res, 400, { ok: false, error: msg }); }

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    let data = null;
    try { data = JSON.parse(body || "{}"); } catch (_) { return bad(res, "JSON inválido"); }

    const token = String(data.token || "").trim();
    const deviceId = String(data.deviceId || "").trim();
    if (!token) return bad(res, "Falta token");
    if (!deviceId) return bad(res, "Falta deviceId");

    // token:<TOKEN> -> userId
    const userId = await kv.get(`token:${token}`);
    if (!userId) return json(res, 401, { ok: false, error: "Token inválido" });

    const userKey = `user:${userId}`;
    const user = (await kv.get(userKey)) || null;
    if (!user) return json(res, 401, { ok: false, error: "Usuario no encontrado" });

    // Opcional: bloquear sharing del token (bind a 1 dispositivo)
    const BIND_DEVICE = String(process.env.BIND_DEVICE || "true").toLowerCase() === "true";
    if (BIND_DEVICE) {
      if (!user.deviceId) {
        user.deviceId = deviceId;
        await kv.set(userKey, user);
      } else if (user.deviceId !== deviceId) {
        return json(res, 403, { ok: false, error: "Token ya está vinculado a otro dispositivo" });
      }
    }

    const sessionJwt = await signSession({
      sub: userId,
      deviceId,
      plan: user.plan || "default"
    });

    return json(res, 200, {
      ok: true,
      sessionJwt,
      user: { id: userId, plan: user.plan || "default" },
      balance: Number(user.balance || 0)
    });
  });
};
