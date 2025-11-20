// backend/src/routes/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

/* -----------------------------------------------------
   SIGNUP  (Admin signup disabled)
----------------------------------------------------- */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, role, bloodGroup, city, pincode } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ❌ prevent admin signup
    if (role === "admin") {
      return res.status(403).json({
        message: "Admin accounts cannot be created via signup.",
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      passwordHash: hash,
      role,
      bloodGroup: role === "donor" ? bloodGroup : undefined,
      city,
      pincode,
      isVerified: false,
      isActive: true,
      points: 0,
      badgeLevel: "Bronze",

      // hospital fields (initial)
      address: "",
      accreditationNumber: "",
      emergencyContact: "",
      latitude: null,
      longitude: null,
    });

    res.status(201).json({
      message: "Signup successful. Please log in.",
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -----------------------------------------------------
   LOGIN (Admin secured by master key + whitelist)
----------------------------------------------------- */
router.post("/login", async (req, res) => {
  try {
    const { email, password, adminKey } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    // banned users blocked
    if (user.isActive === false) {
      return res.status(403).json({
        message: "Your account is disabled by admin.",
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match)
      return res.status(400).json({ message: "Invalid credentials" });

    /* ---------------------------
       ADMIN EXTRA SECURITY
    ----------------------------*/
    if (user.role === "admin") {
      const allowedEmails = process.env.ALLOWED_ADMIN_EMAILS
        ? process.env.ALLOWED_ADMIN_EMAILS.split(",")
        : [];

      if (!allowedEmails.includes(user.email)) {
        return res.status(403).json({
          message: "You are not authorized as Admin.",
        });
      }

      if (!adminKey || adminKey !== process.env.ADMIN_MASTER_KEY) {
        return res.status(403).json({
          message: "Invalid Admin Access Key.",
        });
      }
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "supersecretjwtkey",
      { expiresIn: "7d" }
    );

    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      bloodGroup: user.bloodGroup,
      city: user.city,
      pincode: user.pincode,
      isVerified: user.isVerified,
      isActive: user.isActive,

      // ⭐ donor rewards
      points: user.points,
      badgeLevel: user.badgeLevel,

      // ⭐ hospital profile fields
      address: user.address,
      accreditationNumber: user.accreditationNumber,
      emergencyContact: user.emergencyContact,
      latitude: user.latitude,
      longitude: user.longitude,
    };

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -----------------------------------------------------
   GET CURRENT USER
----------------------------------------------------- */
router.get("/me", auth, async (req, res) => {
  const u = req.user;

  res.json({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    bloodGroup: u.bloodGroup,
    city: u.city,
    pincode: u.pincode,
    isVerified: u.isVerified,
    isActive: u.isActive,
    isAvailable: u.isAvailable,

    // ⭐ donor rewards
    points: u.points,
    badgeLevel: u.badgeLevel,

    // ⭐ hospital profile fields
    address: u.address,
    accreditationNumber: u.accreditationNumber,
    emergencyContact: u.emergencyContact,
    latitude: u.latitude,
    longitude: u.longitude,
  });
});

export default router;
