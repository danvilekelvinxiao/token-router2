function buildSensitiveErrorResponse({ exposeMatchedWords = false, matchedWords = [] } = {}) {
  const error = {
    message: "请求包含平台禁止发送的敏感内容",
    type: "sensitive_words_error",
    code: "sensitive_words_detected",
  };

  if (exposeMatchedWords && matchedWords.length > 0) {
    error.matched_words = matchedWords;
  }

  return { error };
}

module.exports = { buildSensitiveErrorResponse };
