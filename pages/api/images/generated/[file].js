import { promises as fs } from "fs";
import path from "path";

const MIME_BY_EXTENSION = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const file = path.basename(String(req.query.file || ""));
  const extension = path.extname(file).toLowerCase();
  const mime = MIME_BY_EXTENSION[extension];
  if (!file || !mime) {
    return res.status(404).json({ error: "图片不存在" });
  }

  const generatedDir = path.join(process.cwd(), "public", "generated-images");
  const filePath = path.join(generatedDir, file);
  if (!filePath.startsWith(generatedDir + path.sep)) {
    return res.status(404).json({ error: "图片不存在" });
  }

  try {
    const buffer = await fs.readFile(filePath);
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=300, must-revalidate");
    if (req.method === "HEAD") return res.status(200).end();
    return res.status(200).send(buffer);
  } catch {
    return res.status(404).json({ error: "图片不存在" });
  }
}
