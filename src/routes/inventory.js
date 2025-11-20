import express from "express";
import { auth, requireRole } from "../middleware/auth.js";
import { Inventory } from "../models/Inventory.js";
import { Lender } from "../models/Lender.js";

const router = express.Router();

// Upsert hospital inventory
router.post("/", auth, requireRole(["hospital"]), async (req, res) => {
  try {
    const { stocks } = req.body;
    if (!stocks || typeof stocks !== "object") {
      return res.status(400).json({ message: "stocks object is required" });
    }

    const inv = await Inventory.findOneAndUpdate(
      { hospital: req.userId },
      { stocks },
      { new: true, upsert: true }
    );

    res.json(inv);
  } catch (err) {
    console.error("Inventory upsert error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Lend blood to receiver - subtract from stock, add to bloodLent, record lender details
router.post("/lend", auth, requireRole(["hospital"]), async (req, res) => {
  try {
    const { bloodGroup, units, receiverName, receiverAddress, receiverPhone, receiverEmail, notes } = req.body;
    
    if (!bloodGroup || !units || units <= 0) {
      return res.status(400).json({ message: "Valid bloodGroup and units required" });
    }
    
    if (!receiverName || !receiverAddress || !receiverPhone) {
      return res.status(400).json({ message: "Receiver name, address, and phone are required" });
    }

    const inv = await Inventory.findOne({ hospital: req.userId });
    if (!inv) {
      return res.status(404).json({ message: "Inventory not found" });
    }

    const currentStock = inv.stocks.get(bloodGroup) || 0;
    if (currentStock < units) {
      return res.status(400).json({ message: "Insufficient blood stock" });
    }

    // Create lender record
    const lenderRecord = await Lender.create({
      hospital: req.userId,
      receiverName,
      receiverAddress,
      receiverPhone,
      receiverEmail,
      bloodGroup,
      units,
      notes,
    });

    // Subtract from stock
    inv.stocks.set(bloodGroup, currentStock - units);
    
    // Add to bloodLent
    const currentLent = inv.bloodLent.get(bloodGroup) || 0;
    inv.bloodLent.set(bloodGroup, currentLent + units);

    await inv.save();
    
    res.json({ 
      inventory: inv,
      lenderRecord 
    });
  } catch (err) {
    console.error("Blood lending error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Add donated blood from donor - add to stock
router.post("/donate", auth, requireRole(["hospital"]), async (req, res) => {
  try {
    const { bloodGroup, units } = req.body;
    
    if (!bloodGroup || !units || units <= 0) {
      return res.status(400).json({ message: "Valid bloodGroup and units required" });
    }

    const inv = await Inventory.findOneAndUpdate(
      { hospital: req.userId },
      {},
      { new: true, upsert: true }
    );

    // Add to stock
    const currentStock = inv.stocks.get(bloodGroup) || 0;
    inv.stocks.set(bloodGroup, currentStock + units);

    await inv.save();
    res.json(inv);
  } catch (err) {
    console.error("Blood donation error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get lending history for hospital
router.get("/lending-history", auth, requireRole(["hospital"]), async (req, res) => {
  try {
    const lenders = await Lender.find({ hospital: req.userId })
      .sort({ lendingDate: -1 })
      .lean();
    res.json(lenders);
  } catch (err) {
    console.error("Get lending history error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get my hospital's inventory
router.get("/mine", auth, requireRole(["hospital"]), async (req, res) => {
  try {
    const inv = await Inventory.findOne({ hospital: req.userId });
    if (!inv) {
      return res.json({ stocks: {}, bloodLent: {} });
    }
    res.json(inv);
  } catch (err) {
    console.error("Get my inventory error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Public: get inventory by city/pincode
router.get("/", async (req, res) => {
  try {
    const { city, pincode } = req.query;
    const filter = {};
    if (city) filter["hospital.city"] = city;
    if (pincode) filter["hospital.pincode"] = pincode;

    const data = await Inventory.find()
      .populate("hospital", "name city pincode")
      .lean();

    // Simple client-side filter after populate
    const filtered = data.filter((inv) => {
      if (city && inv.hospital.city !== city) return false;
      if (pincode && inv.hospital.pincode !== pincode) return false;
      return true;
    });

    res.json(filtered);
  } catch (err) {
    console.error("Inventory list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
