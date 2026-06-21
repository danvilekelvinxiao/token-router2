const fs = require("fs");
const path = require("path");
const { node_word_detection, get_instance } = require("node-word-detection");
const { normalizeText } = require("./normalize");

const detector = typeof get_instance === "function" ? get_instance() : node_word_detection;
let loadedSignature = "";
let systemWordLoaded = false;
const activeWords = new Set();

function readWordFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      console.warn(`[sensitive-proxy] word list not found: ${filePath}`);
      return [];
    }
    const content = fs.readFileSync(filePath, "utf8");
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch (error) {
    console.warn(`[sensitive-proxy] failed to load word list ${filePath}: ${error.message}`);
    return [];
  }
}

function resetWords() {
  for (const word of activeWords) {
    try {
      detector.remove_word(word);
    } catch {}
  }
  activeWords.clear();
  loadedSignature = "";
}

function addNormalizedWord(word) {
  const normalized = normalizeText(word);
  if (!normalized || activeWords.has(normalized)) return;
  detector.add_word(normalized);
  activeWords.add(normalized);
}

function loadWords(options = {}) {
  const signature = JSON.stringify({
    blocklistPath: options.blocklistPath || "",
    allowlistPath: options.allowlistPath || "",
    useSystemWords: Boolean(options.useSystemWords),
  });

  if (signature === loadedSignature && activeWords.size > 0) {
    return {
      blocklistWords: [...activeWords],
      allowlistWords: [],
      systemLoaded: systemWordLoaded,
    };
  }

  resetWords();
  const blocklistWords = readWordFile(options.blocklistPath);
  const allowlistWords = readWordFile(options.allowlistPath);

  if (options.useSystemWords && !systemWordLoaded && typeof detector.use_sys_sensitive_word === "function") {
    detector.use_sys_sensitive_word();
    systemWordLoaded = true;
  }

  blocklistWords.forEach(addNormalizedWord);
  allowlistWords.forEach((word) => {
    const normalized = normalizeText(word);
    if (!normalized) return;
    try {
      detector.remove_word(normalized);
    } catch {}
    activeWords.delete(normalized);
  });

  loadedSignature = signature;
  return {
    blocklistWords: blocklistWords.map((word) => normalizeText(word)).filter(Boolean),
    allowlistWords: allowlistWords.map((word) => normalizeText(word)).filter(Boolean),
    systemLoaded: systemWordLoaded,
  };
}

function checkSensitiveText(text, options = {}) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return { blocked: false, matchedWords: [] };
  }

  if (options.reload) {
    loadWords(options);
  }

  const matchedWords = Array.from(new Set(detector.find_word(normalizedText, -1) || []))
    .map((word) => normalizeText(word))
    .filter(Boolean);

  return {
    blocked: matchedWords.length > 0,
    matchedWords,
  };
}

module.exports = { loadWords, normalizeText, checkSensitiveText, resetWords, _detector: detector };
