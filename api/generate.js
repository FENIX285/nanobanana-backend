const { kv } = require("./_lib/kv");
const { verifySession } = require("./_lib/auth");
const { calcCredits } = require("./_lib/pricing");
const { normalizeParts, callGeminiGenerateContent, extractImagesFromGeminiResponse } = require("./_lib/gemini");
const { v4: uuidv4 } = require("uuid");

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function bad(res, msg) { return json(res, 400, { ok: false, error: msg }); }

async function rateLimitOrThrow(userId) {
  // Simple: max 20 requests por minuto por usuario
  const key = `rl:${userId}:${Math.floor(Date.now() / 60000)}`;
  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, 70);
  if (n > 20) throw new Error("Rate limit: demasiadas solicitudes por minuto");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  const v = await verifySession(req.headers.authorization);
  if (!v.ok) return json(res, 401, { ok: false, error: v.error });

  const userId = v.payload.sub;
  try { await rateLimitOrThrow(userId); } catch (e) { return json(res, 429, { ok: false, error: e.message }); }

  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    let data = null;
    try { data = JSON.parse(body || "{}"); } catch (_) { return bad(res, "JSON inválido"); }

    const requestId = String(data.requestId || uuidv4()).trim();
    const idemKey = `idem:${userId}:${requestId}`;

    // Idempotencia: si ya procesaste este requestId, no lo cobres 2 veces
    const existing = await kv.get(idemKey);
    if (existing) {
      return json(res, 409, { ok: false, error: "Solicitud duplicada (requestId ya usado)" });
    }

    const model = String(data.model || "").trim();
    const imageSize = data.imageSize || null; // "1K" | "2K" | "4K" | null
    const candidateCount = data.candidateCount;

    const instruction = String(data.instruction || "").trim();
    const prompt = String(data.prompt || "").trim();
    const parts = normalizeParts(data.parts || []);
    const generationConfig = data.generationConfig || null; // opcional, si quieres pasar config directo

    if (!model) return bad(res, "Falta model");
    if (!prompt) return bad(res, "Falta prompt");
    if (!instruction) return bad(res, "Falta instruction");
    if (!Array.isArray(parts)) return bad(res, "parts inválido");

    const creditsInfo = calcCredits({ model, imageSize, candidateCount });
    if (!creditsInfo.ok) return bad(res, creditsInfo.error);

    const userKey = `user:${userId}`;
    const user = await kv.get(userKey);
    if (!user) return json(res, 404, { ok: false, error: "Usuario no existe" });

    const balance = Number(user.balance || 0);
    if (balance < creditsInfo.total) {
      return json(res, 402, {
        ok: false,
        error: "Créditos insuficientes",
        needed: creditsInfo.total,
        balance
      });
    }

    // Cobro upfront (sin pérdidas). Si hay error de backend (timeout/5xx), reembolsas.
    user.balance = balance - creditsInfo.total;
    await kv.set(userKey, user);

    // Marca idempotencia (si falla “duro”, la revertimos también)
    await kv.set(idemKey, { charged: creditsInfo.total, ts: Date.now() }, { ex: 60 * 60 * 6 });

    const finalTextPart = { text: `${instruction}\n\nPROMPT_USUARIO:\n${prompt}` };
    const payloadParts = [...parts, finalTextPart];

    // generationConfig base: siempre IMAGE, y candidateCount=1 porque el plugin hace loop
    const genCfg = generationConfig || {
      responseModalities: ["IMAGE"],
      candidateCount: 1
    };

    // Si quieres permitir tools/google_search, pásalo desde el cliente (opcional)
    const tools = data.tools || undefined;

    const contents = [{ parts: payloadParts }];

    try {
      // Nota: este endpoint genera 1 imagen por llamada.
      // El plugin llamará 1..4 veces. Aquí hacemos SOLO 1.
      const g = await callGeminiGenerateContent({
        model,
        contents,
        generationConfig: genCfg,
        tools
      });

      if (!g.ok) {
        // Error “duro” del API -> reembolso (para que el usuario no pague por fallos de infraestructura)
        // OJO: si el error es “prompt blocked / safety”, Gemini puede igual responder 200 con finishReason,
        // eso NO cae aquí.
        user.balance = (Number(user.balance || 0)) + creditsInfo.total;
        await kv.set(userKey, user);
        await kv.del(idemKey);
        return json(res, 502, { ok: false, error: g.error, refunded: true });
      }

      const images = extractImagesFromGeminiResponse(g.raw);

      // Si Gemini responde OK pero sin imagen (safety/no_image), no reembolsas (sin pérdidas)
      const finishReason = g.raw?.candidates?.[0]?.finishReason || null;

      return json(res, 200, {
        ok: true,
        requestId,
        chargedCredits: creditsInfo.total,
        perImageCredits: creditsInfo.perImage,
        images,
        finishReason,
        balance: Number((await kv.get(userKey))?.balance || user.balance || 0)
      });
    } catch (e) {
      // Error interno -> reembolso
      user.balance = (Number(user.balance || 0)) + creditsInfo.total;
      await kv.set(userKey, user);
      await kv.del(idemKey);
      return json(res, 500, { ok: false, error: e.message || String(e), refunded: true });
    }
  });
};
