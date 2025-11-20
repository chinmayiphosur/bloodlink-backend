// backend/src/routes/admin.js
import express from "express";
import { auth, requireRole } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Request } from "../models/Request.js";
import { Donation } from "../models/Donation.js";
import { Inventory } from "../models/Inventory.js";
import fs from "fs";
import { logFilePath } from "../middleware/logger.js";

const router = express.Router();

// Get high-level stats & simple analytics
router.get("/stats", auth, requireRole(["admin"]), async (req, res) => {
  try {
    const [
      totalDonors,
      totalHospitals,
      totalAdmins,
      openRequests,
      totalDonations,
      emergencyOpen,
      fulfilledRequests,
      pendingVerifications,
    ] = await Promise.all([
      User.countDocuments({ role: "donor" }),
      User.countDocuments({ role: "hospital" }),
      User.countDocuments({ role: "admin" }),
      Request.countDocuments({ status: "open" }),
      Donation.countDocuments(),
      Request.countDocuments({ isEmergency: true, status: "open" }),
      Request.countDocuments({ status: "fulfilled" }),
      User.countDocuments({
        role: "hospital",
        verificationStatus: "pending",
        $or: [
          { licenseCertificateNumber: { $exists: true, $ne: "" } },
          { gstNumber: { $exists: true, $ne: "" } },
        ],
      }),
    ]);

    // simple breakdown by blood group for donors
    const bloodGroupAgg = await User.aggregate([
      { $match: { role: "donor", bloodGroup: { $ne: null } } },
      { $group: { _id: "$bloodGroup", count: { $sum: 1 } } },
    ]);

    res.json({
      totalDonors,
      totalHospitals,
      totalAdmins,
      openRequests,
      totalDonations,
      emergencyOpen,
      fulfilledRequests,
      pendingVerifications,
      donorsByBloodGroup: bloodGroupAgg,
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Approve/verify a user
router.patch("/users/:id/verify", auth, requireRole(["admin"]), async (req, res) => {
  try {
    const { isVerified } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isVerified: !!isVerified },
      { new: true }
    ).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("Verify user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Verify/Reject hospital documents
router.patch("/hospitals/:id/verify-documents", auth, requireRole(["admin"]), async (req, res) => {
  try {
    const { verificationStatus, verificationNotes } = req.body;

    if (!verificationStatus || !["approved", "rejected", "pending"].includes(verificationStatus)) {
      return res.status(400).json({ message: "Invalid verification status" });
    }

    const hospital = await User.findById(req.params.id);
    if (!hospital || hospital.role !== "hospital") {
      return res.status(404).json({ message: "Hospital not found" });
    }

    hospital.verificationStatus = verificationStatus;
    hospital.verificationNotes = verificationNotes || "";
    
    // Also update isVerified field for backward compatibility
    if (verificationStatus === "approved") {
      hospital.isVerified = true;
    } else if (verificationStatus === "rejected") {
      hospital.isVerified = false;
    }

    await hospital.save();

    res.json({
      _id: hospital._id,
      name: hospital.name,
      email: hospital.email,
      verificationStatus: hospital.verificationStatus,
      verificationNotes: hospital.verificationNotes,
      isVerified: hospital.isVerified,
    });
  } catch (err) {
    console.error("Verify hospital documents error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get pending hospital verifications
router.get("/hospitals/pending-verification", auth, requireRole(["admin"]), async (req, res) => {
  try {
    const pendingHospitals = await User.find({
      role: "hospital",
      verificationStatus: "pending",
      $or: [
        { licenseCertificateNumber: { $exists: true, $ne: "" } },
        { gstNumber: { $exists: true, $ne: "" } },
      ],
    }).select("-passwordHash");

    res.json(pendingHospitals);
  } catch (err) {
    console.error("Get pending hospitals error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🏥 Update hospital location (already used by HospitalDashboard)
router.patch("/hospital/location", auth, requireRole(["hospital"]), async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({ message: "Coordinates required" });
    }

    req.user.latitude = latitude;
    req.user.longitude = longitude;
    await req.user.save();

    // Broadcast to donors/admins as hospitalLocationUpdated
    const io = req.app.get("io");
    io.emit("hospitalLocationUpdated", {
      userId: req.user._id,
      name: req.user.name,
      latitude,
      longitude,
    });

    res.json({ message: "Hospital location updated", latitude, longitude });
  } catch (err) {
    console.error("Hospital location error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// List all users (for admin panel)
router.get("/users", auth, requireRole(["admin"]), async (req, res) => {
  try {
    const users = await User.find().select("-passwordHash");
    res.json(users);
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🆕 Toggle user active (ban / unban)
router.patch("/users/:id/active", auth, requireRole(["admin"]), async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be boolean" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select("-passwordHash");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("Toggle active error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🧾 Download system logs
router.get("/logs", auth, requireRole(["admin"]), async (req, res) => {
  try {
    if (!fs.existsSync(logFilePath)) {
      return res.status(404).json({ message: "Log file not found yet" });
    }

    res.setHeader("Content-Type", "text/plain");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=\"bloodlink-logs.txt\""
    );

    const stream = fs.createReadStream(logFilePath);
    stream.pipe(res);
  } catch (err) {
    console.error("Logs download error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// 📊 Comprehensive Analytics for Admin
router.get("/analytics", auth, requireRole(["admin"]), async (req, res) => {
  try {
    // 1. Hospitals with low stock (total stock < 10 units)
    const inventories = await Inventory.find().populate("hospital", "name city pincode");
    const lowStockHospitals = inventories
      .map(inv => {
        const totalStock = Object.values(inv.stocks.toObject() || {}).reduce((sum, val) => sum + val, 0);
        return {
          hospitalId: inv.hospital._id,
          hospitalName: inv.hospital.name,
          city: inv.hospital.city,
          pincode: inv.hospital.pincode,
          totalStock,
        };
      })
      .filter(h => h.totalStock < 10)
      .sort((a, b) => a.totalStock - b.totalStock);

    // 2. Blood group shortage analysis (total available across all hospitals)
    const bloodGroups = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
    const bloodGroupShortage = bloodGroups.map(bg => {
      const totalAvailable = inventories.reduce((sum, inv) => {
        return sum + (inv.stocks.get(bg) || 0);
      }, 0);
      return { bloodGroup: bg, totalAvailable };
    }).sort((a, b) => a.totalAvailable - b.totalAvailable);

    // 3. Demand vs Supply (requested vs available)
    const openRequests = await Request.find({ status: "open" });
    const demandVsSupply = bloodGroups.map(bg => {
      const demand = openRequests
        .filter(r => r.bloodGroup === bg)
        .reduce((sum, r) => sum + r.units, 0);
      
      const supply = inventories.reduce((sum, inv) => {
        return sum + (inv.stocks.get(bg) || 0);
      }, 0);

      return { bloodGroup: bg, demand, supply };
    });

    res.json({
      lowStockHospitals,
      bloodGroupShortage,
      demandVsSupply,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 📊 Get weekly donations count
router.get("/analytics/weekly-donations", auth, requireRole(["admin"]), async (req, res) => {
  const data = await Donation.aggregate([
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json(data);
});

// 🩸 Blood stock levels
router.get("/analytics/stocks", auth, requireRole(["admin"]), async (req, res) => {
  const hospitals = await User.find({ role: "hospital" }).select("stocks name");
  res.json(hospitals);
});

// 👥 Active donors count
router.get("/analytics/active-donors", auth, requireRole(["admin"]), async (req, res) => {
  const active = await User.countDocuments({ role: "donor", isAvailable: true });
  const inactive = await User.countDocuments({ role: "donor", isAvailable: false });

  res.json({ active, inactive });
});

export default router;
