// backend/src/routes/donors.js
import express from "express";
import { auth, requireRole } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Request } from "../models/Request.js";
import { Donation } from "../models/Donation.js";
import { uploadProfileImage } from "../middleware/upload.js";

const router = express.Router();

// Toggle donor availability
router.patch(
  "/me/availability",
  auth,
  requireRole(["donor"]),
  async (req, res) => {
    try {
      const { isAvailable } = req.body;
      if (typeof isAvailable !== "boolean") {
        return res.status(400).json({ message: "isAvailable must be boolean" });
      }
      req.user.isAvailable = isAvailable;
      await req.user.save();
      res.json({ isAvailable: req.user.isAvailable });
    } catch (err) {
      console.error("Availability error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// Get nearby open requests for donor WITH hospital contact + coords
router.get(
  "/me/nearby-requests",
  auth,
  requireRole(["donor"]),
  async (req, res) => {
    try {
      const { bloodGroup, pincode } = req.user;
      const query = {
        status: "open",
        bloodGroup,
      };
      if (pincode) query.pincode = pincode;

      const requests = await Request.find(query)
        .sort({ createdAt: -1 })
        .populate(
          "hospital",
          "name email phone city pincode latitude longitude"
        );

      res.json(requests);
    } catch (err) {
      console.error("Nearby requests error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ----------------------------------------------------------
   Donor PROFILE – get & update
---------------------------------------------------------- */

// GET donor profile
router.get("/me/profile", auth, requireRole(["donor"]), async (req, res) => {
  const u = req.user;
  res.json({
    user: {
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      bloodGroup: u.bloodGroup,
      phone: u.phone,
      city: u.city,
      pincode: u.pincode,
      isAvailable: u.isAvailable,
      profileImageUrl: u.profileImageUrl,
      points: u.points,
      badgeLevel: u.badgeLevel,
    },
  });
});

// UPDATE donor profile (no picture here)
router.patch("/me/profile", auth, requireRole(["donor"]), async (req, res) => {
  try {
    const { name, bloodGroup, phone, city, pincode, isAvailable } = req.body;

    if (name !== undefined) req.user.name = name;
    if (bloodGroup !== undefined) req.user.bloodGroup = bloodGroup;
    if (phone !== undefined) req.user.phone = phone;
    if (city !== undefined) req.user.city = city;
    if (pincode !== undefined) req.user.pincode = pincode;
    if (typeof isAvailable === "boolean") req.user.isAvailable = isAvailable;

    await req.user.save();

    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        bloodGroup: req.user.bloodGroup,
        phone: req.user.phone,
        city: req.user.city,
        pincode: req.user.pincode,
        isAvailable: req.user.isAvailable,
        profileImageUrl: req.user.profileImageUrl,
        points: req.user.points,
        badgeLevel: req.user.badgeLevel,
      },
    });
  } catch (err) {
    console.error("Update donor profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// UPLOAD donor profile picture
router.post(
  "/me/profile-picture",
  auth,
  requireRole(["donor"]),
  uploadProfileImage.single("image"),
  async (req, res) => {
    try {
      if (!req.file || !req.file.path) {
        return res.status(400).json({ message: "Image upload failed" });
      }

      req.user.profileImageUrl = req.file.path;
      await req.user.save();

      res.json({
        profileImageUrl: req.user.profileImageUrl,
      });
    } catch (err) {
      console.error("Donor profile picture error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ----------------------------------------------------------
   LIVE LOCATION + GEOFENCE ALERTS
---------------------------------------------------------- */

// Get donor's completed donations with certificates
router.get(
  "/me/certificates",
  auth,
  requireRole(["donor"]),
  async (req, res) => {
    try {
      const donations = await Donation.find({
        donor: req.user._id,
        status: "completed",
        certificateUrl: { $exists: true, $ne: null },
      })
        .populate({
          path: "request",
          populate: {
            path: "hospital",
            select: "name",
          },
        })
        .sort({ createdAt: -1 });

      res.json(donations);
    } catch (err) {
      console.error("Get certificates error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Donor updates live GPS location
router.patch(
  "/me/location",
  auth,
  requireRole(["donor"]),
  async (req, res) => {
    try {
      const { latitude, longitude } = req.body;

      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return res.status(400).json({ message: "Coordinates required" });
      }

      // Save to user
      req.user.latitude = latitude;
      req.user.longitude = longitude;
      await req.user.save();

      const io = req.app.get("io");
      if (io) {
        io.emit("donorLocationUpdated", {
          userId: req.user._id,
          name: req.user.name,
          latitude,
          longitude,
        });
      }

      // Geofencing: for each pledged donation, check distance to hospital
      const pledges = await Donation.find({
        donor: req.user._id,
        status: "pledged",
      }).populate({
        path: "request",
        populate: {
          path: "hospital",
          select: "name latitude longitude _id",
        },
      });

      for (const donation of pledges) {
        const reqDoc = donation.request;
        const hospital = reqDoc?.hospital;
        if (
          !hospital ||
          typeof hospital.latitude !== "number" ||
          typeof hospital.longitude !== "number"
        ) {
          continue;
        }

        const distKm = haversineKm(
          latitude,
          longitude,
          hospital.latitude,
          hospital.longitude
        );

        if (distKm <= 1 && !donation.arrivalAlertSent) {
          donation.arrivalAlertSent = true;
          await donation.save();

          if (io) {
            io.emit("donorNearHospital", {
              hospitalId: hospital._id.toString(),
              donorId: req.user._id.toString(),
              donorName: req.user.name,
              requestId: reqDoc._id.toString(),
              distanceKm: distKm,
            });
          }
        }
      }

      res.json({ latitude, longitude });
    } catch (err) {
      console.error("Donor location error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
