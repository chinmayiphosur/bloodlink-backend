// backend/src/routes/chat.js
import express from "express";
import { Chat } from "../models/Chat.js";
import { Request } from "../models/Request.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

/* ----------------------------------------------------------
   GET chat history for request
---------------------------------------------------------- */
router.get("/:id", auth, async (req, res) => {
  try {
    const messages = await Chat.find({ request: req.params.id })
      .populate("sender", "name role")
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.error("Chat history error", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ----------------------------------------------------------
   POST new message
---------------------------------------------------------- */
router.post("/:id", auth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: "No message" });

    const newMsg = await Chat.create({
      request: req.params.id,
      sender: req.userId,
      message,
    });

    // Populate sender info for the response
    await newMsg.populate("sender", "name role");

    const io = req.app.get("io");

    const messageData = {
      sender: { 
        _id: newMsg.sender._id,
        name: newMsg.sender.name, 
        role: newMsg.sender.role 
      },
      message: newMsg.message,
      createdAt: newMsg.createdAt,
    };

    console.log(`💬 Broadcasting message to room chat:${req.params.id}`, messageData);

    // broadcast to donor + hospital room (including sender)
    io.to(`chat:${req.params.id}`).emit(`chat:${req.params.id}`, messageData);

    res.json(newMsg);
  } catch (err) {
    console.error("Chat send error", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
