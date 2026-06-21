function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushSegment(segments, path, text) {
  const normalized = String(text ?? "").trim();
  if (!normalized) return;
  segments.push({ path, text: normalized });
}

function extractFromContent(content, path, segments) {
  if (typeof content === "string") {
    pushSegment(segments, path, content);
    return;
  }

  if (Array.isArray(content)) {
    content.forEach((part, index) => {
      const nextPath = `${path}[${index}]`;
      if (typeof part === "string") {
        pushSegment(segments, nextPath, part);
        return;
      }

      if (!isObject(part)) return;
      if (typeof part.text === "string" && part.text.trim()) {
        pushSegment(segments, `${nextPath}.text`, part.text);
      }

      const type = String(part.type || "").toLowerCase();
      if (type === "image_url") {
        return;
      }
      if (type === "text" || type === "input_text") {
        return;
      }
    });
  }
}

function extractFromMessages(messages, path, segments) {
  if (!Array.isArray(messages)) return;
  messages.forEach((message, index) => {
    if (!isObject(message)) return;
    const nextPath = `${path}[${index}]`;
    if (typeof message.content === "string" || Array.isArray(message.content)) {
      extractFromContent(message.content, `${nextPath}.content`, segments);
    }
  });
}

function extractFromInput(input, path, segments) {
  if (typeof input === "string") {
    pushSegment(segments, path, input);
    return;
  }

  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      const nextPath = `${path}[${index}]`;
      if (typeof item === "string") {
        pushSegment(segments, nextPath, item);
        return;
      }
      if (!isObject(item)) return;
      if (typeof item.text === "string" && item.text.trim()) {
        pushSegment(segments, `${nextPath}.text`, item.text);
      }
      if (typeof item.content === "string" || Array.isArray(item.content)) {
        extractFromContent(item.content, `${nextPath}.content`, segments);
      }
    });
  }
}

function extractSensitiveText(body = {}) {
  const segments = [];

  if (typeof body.prompt === "string") {
    pushSegment(segments, "prompt", body.prompt);
  }

  if (typeof body.input === "string" || Array.isArray(body.input)) {
    extractFromInput(body.input, "input", segments);
  }

  if (Array.isArray(body.messages)) {
    extractFromMessages(body.messages, "messages", segments);
  }

  if (typeof body.message === "string") {
    pushSegment(segments, "message", body.message);
  }

  return {
    text: segments.map((item) => item.text).join("\n"),
    segments,
  };
}

module.exports = { extractSensitiveText };
