const { kv } = require("../_lib/kv");
const { v4: uuidv4 } = require("uuid");

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

    const plan = String(data.plan || "default");
    const initialCredits = Number(data.initialCredits || 0);

    const userId = `u_${uuidv4()}`;
    const token = `NB-${uuidv4().split("-")[0].toUpperCase()}-${uuidv4().split("-")[1].toUpperCase()}`;

    await kv.set(`user:${userId}`, { balance: initialCredits, plan, createdAt: Date.now(), deviceId: null });
    await kv.set(`token:${token}`, userId);

    return json(res, 200, { ok: true, token, userId, balance: initialCredits, plan });
  });
};
