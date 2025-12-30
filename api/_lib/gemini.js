function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const GEMINI_API_KEY = mustEnv("GEMINI_API_KEY");
const BASE = "https://generativelanguage.googleapis.com/v1beta";

function normalizeParts(parts) {
  // Acepta inlineData (camel) o inline_data (snake), igual para mimeType/mime_type.
  if (!Array.isArray(parts)) return [];
  return parts.map(p => {
    if (!p || typeof p !== "object") return p;

    // inlineData -> inline_data
    if (p.inlineData && !p.inline_data) {
      const id = p.inlineData;
      p.inline_data = {
        data: id.data,
        mime_type: id.mimeType || id.mime_type || "image/png"
      };
      delete p.inlineData;
    }
    if (p.inline_data && p.inline_data.mimeType && !p.inline_data.mime_type) {
      p.inline_data.mime_type = p.inline_data.mimeType;
      delete p.inline_data.mimeType;
    }

    // fileData -> file_data (si alguna vez lo usas)
    if (p.fileData && !p.file_data) {
      const fd = p.fileData;
      p.file_data = {
        file_uri: fd.fileUri || fd.file_uri,
        mime_type: fd.mimeType || fd.mime_type
      };
      delete p.fileData;
    }
    if (p.file_data && p.file_data.fileUri && !p.file_data.file_uri) {
      p.file_data.file_uri = p.file_data.fileUri;
      delete p.file_data.fileUri;
    }
    if (p.file_data && p.file_data.mimeType && !p.file_data.mime_type) {
      p.file_data.mime_type = p.file_data.mimeType;
      delete p.file_data.mimeType;
    }

    return p;
  });
}

async function callGeminiGenerateContent({ model, contents, generationConfig, tools }) {
  const url = `${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    contents,
    generationConfig
  };
  if (tools) body.tools = tools;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { json = null; }

  if (!resp.ok) {
    const msg = json?.error?.message || text || `HTTP ${resp.status}`;
    return { ok: false, status: resp.status, error: msg, raw: json };
  }

  return { ok: true, raw: json };
}

function extractImagesFromGeminiResponse(raw) {
  const out = [];
  const candidates = raw?.candidates || [];
  for (const c of candidates) {
    const parts = c?.content?.parts || [];
    const imgPart = parts.find(p => p?.inlineData?.data || p?.inline_data?.data);
    if (imgPart) {
      const b64 = imgPart.inlineData?.data || imgPart.inline_data?.data;
      const mime = imgPart.inlineData?.mimeType || imgPart.inline_data?.mime_type || "image/png";
      out.push(`data:${mime};base64,${b64}`);
    }
  }
  return out;
}

module.exports = { normalizeParts, callGeminiGenerateContent, extractImagesFromGeminiResponse };
