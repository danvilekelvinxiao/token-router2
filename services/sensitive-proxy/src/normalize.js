function normalizeText(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { normalizeText };
