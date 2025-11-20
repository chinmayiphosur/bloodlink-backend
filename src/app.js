// backend/src/app.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import requestsRoutes from "./routes/requests.js";
import donorsRoutes from "./routes/donors.js";
import inventoryRoutes from "./routes/inventory.js";
import adminRoutes from "./routes/admin.js";
import chatRoutes from "./routes/chat.js";   // ✅ import chat routes
import hospitalRoutes from "./routes/hospital.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const createApp = () => {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173", credentials: true }));
  app.use(express.json());

  // Serve static certificate files
  const certificatesPath = path.join(__dirname, "../certificates");
  app.use("/certificates", express.static(certificatesPath));

  app.get("/", (req, res) => {
    res.send("BloodLink API is running");
  });

  // ✅ All API routes are under /api/...
  app.use("/api/auth", authRoutes);
  app.use("/api/requests", requestsRoutes);
  app.use("/api/donors", donorsRoutes);
  app.use("/api/inventory", inventoryRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/chat", chatRoutes);   // ✅ chat endpoints, matches frontend api.get("/chat/...")
  app.use("/api/hospital", hospitalRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  return app;
};
