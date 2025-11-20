// backend/src/middleware/logger.js
import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, "..", "..", "logs");
const logFilePath = path.join(logsDir, "app.log");

// ensure logs directory exists
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const line = `[${new Date().toISOString()}] ${req.method} ${
      req.originalUrl
    } ${res.statusCode} - ${duration}ms\n`;
    fs.appendFile(logFilePath, line, (err) => {
      if (err) {
        console.error("Failed to write log:", err);
      }
    });
  });
  next();
};

export { logFilePath };
