/**
 * 1 crédito = $0.01
 * Objetivo: margen bruto suficiente para que te quede ~$0.01 neto por imagen en promedio.
 *
 * Basado en costos oficiales:
 * - Flash 1K: $0.039 / imagen
 * - Pro 1K/2K: $0.134 / imagen
 * - Pro 4K: $0.24 / imagen
 *
 * Sugerencia segura (con buffer):
 * - Flash: 6 créditos
 * - Pro 1K/2K: 18 créditos
 * - Pro 4K: 30 créditos
 */
const CREDITS_PER_IMAGE = {
  "gemini-2.5-flash-image": {
    "AUTO": 6
  },
  "gemini-3-pro-image-preview": {
    "AUTO": 18, // si el usuario no elige, trátalo como 2K para no perder
    "1K": 18,
    "2K": 18,
    "4K": 30
  }
};

function normalizeImageSize(imageSize) {
  if (!imageSize) return "AUTO";
  const v = String(imageSize).toUpperCase().trim();
  if (v === "1K" || v === "2K" || v === "4K") return v;
  return "AUTO";
}

function calcCredits({ model, imageSize, candidateCount }) {
  const cc = Math.max(1, Math.min(4, Number(candidateCount) || 1));
  const size = normalizeImageSize(imageSize);
  const modelMap = CREDITS_PER_IMAGE[model];
  if (!modelMap) return { ok: false, error: "Modelo no soportado" };

  const perImg = modelMap[size] ?? modelMap["AUTO"];
  const total = perImg * cc;

  return { ok: true, perImage: perImg, total, normalizedSize: size, candidateCount: cc };
}

module.exports = { calcCredits, normalizeImageSize };
