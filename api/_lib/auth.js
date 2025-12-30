const { SignJWT, jwtVerify } = require("jose");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const JWT_SECRET = mustEnv("JWT_SECRET");
const secretKey = new TextEncoder().encode(JWT_SECRET);

async function signSession(payload, expiresInSeconds = 60 * 60 * 12) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .sign(secretKey);
}

async function verifySession(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, error: "Missing Bearer token" };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, error: "Invalid/expired session" };
  }
}

module.exports = { signSession, verifySession };
