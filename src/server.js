// backend/src/server.js
import dotenv from "dotenv";
dotenv.config();
import http from "http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { connectDB } from "./config/db.js";

const PORT = process.env.PORT || 4000;

const start = async () => {
  await connectDB();

  const app = createApp();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  app.set("io", io);

  io.on("connection", (socket) => {
    console.log("🔗 WebSocket client connected:", socket.id);

    // User joins their personal room for notifications
    socket.on("joinUser", (userId) => {
      socket.join(String(userId));
      console.log(`👤 User ${userId} joined their notification room`);
    });

    // client joins a chat room
    socket.on("joinChat", (requestId) => {
      socket.join(`chat:${requestId}`);
      console.log(`📌 Client ${socket.id} joined room chat:${requestId}`);
    });

    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });

  server.listen(PORT, () => {
    console.log(`🚀 BloodLink backend running on port ${PORT}`);
  });
};

start();
