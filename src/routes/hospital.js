// backend/src/routes/hospital.js
import express from "express";
import { auth, requireRole } from "../middleware/auth.js";
import { uploadProfileImage } from "../middleware/upload.js";

const router = express.Router();

/* ----------------------------------------------------------
   Hospital PROFILE – get & update
---------------------------------------------------------- */

// GET hospital profile
router.get("/me/profile", auth, requireRole(["hospital"]), async (req, res) => {
  const u = req.user;
  res.json({
    user: {
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      city: u.city,
      pincode: u.pincode,
      address: u.address,
      accreditationNumber: u.accreditationNumber,
      emergencyContact: u.emergencyContact,
      latitude: u.latitude,
      longitude: u.longitude,
      profileImageUrl: u.profileImageUrl,
      licenseCertificateNumber: u.licenseCertificateNumber,
      gstNumber: u.gstNumber,
      verificationStatus: u.verificationStatus,
      verificationNotes: u.verificationNotes,
    },
  });
});

// UPDATE hospital profile (no picture here)
router.patch(
  "/me/profile",
  auth,
  requireRole(["hospital"]),
  async (req, res) => {
    try {
      const {
        name,
        phone,
        city,
        pincode,
        address,
        accreditationNumber,
        emergencyContact,
        latitude,
        longitude,
        licenseCertificateNumber,
        gstNumber,
      } = req.body;

      if (name !== undefined) req.user.name = name;
      if (phone !== undefined) req.user.phone = phone;
      if (city !== undefined) req.user.city = city;
      if (pincode !== undefined) req.user.pincode = pincode;
      if (address !== undefined) req.user.address = address;
      if (accreditationNumber !== undefined)
        req.user.accreditationNumber = accreditationNumber;
      if (emergencyContact !== undefined)
        req.user.emergencyContact = emergencyContact;

      if (latitude !== undefined) req.user.latitude = latitude;
      if (longitude !== undefined) req.user.longitude = longitude;

      // Update verification documents
      if (licenseCertificateNumber !== undefined)
        req.user.licenseCertificateNumber = licenseCertificateNumber;
      if (gstNumber !== undefined) req.user.gstNumber = gstNumber;

      // If hospital updates their documents, reset verification to pending
      if (licenseCertificateNumber !== undefined || gstNumber !== undefined) {
        req.user.verificationStatus = "pending";
        req.user.verificationNotes = "";
      }

      await req.user.save();

      res.json({
        user: {
          id: req.user._id,
          name: req.user.name,
          email: req.user.email,
          role: req.user.role,
          phone: req.user.phone,
          city: req.user.city,
          pincode: req.user.pincode,
          address: req.user.address,
          accreditationNumber: req.user.accreditationNumber,
          emergencyContact: req.user.emergencyContact,
          latitude: req.user.latitude,
          longitude: req.user.longitude,
          profileImageUrl: req.user.profileImageUrl,
          licenseCertificateNumber: req.user.licenseCertificateNumber,
          gstNumber: req.user.gstNumber,
          verificationStatus: req.user.verificationStatus,
          verificationNotes: req.user.verificationNotes,
        },
      });
    } catch (err) {
      console.error("Update hospital profile error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// UPLOAD hospital profile picture
router.post(
  "/me/profile-picture",
  auth,
  requireRole(["hospital"]),
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
      console.error("Hospital profile picture error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
