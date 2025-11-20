// backend/src/routes/requests.js
import express from "express";
import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import { Donation } from "../models/Donation.js";
import { auth, requireRole } from "../middleware/auth.js";
import { generateCertificate } from "../utils/certificateGenerator.js";

const router = express.Router();

/* ------------------------------------------------------------
   Helper: Badge Calculator
------------------------------------------------------------ */
const computeBadgeLevel = (points) => {
  if (points >= 300) return "Platinum";
  if (points >= 150) return "Gold";
  if (points >= 50) return "Silver";
  return "Bronze";
};

/* ------------------------------------------------------------
   Helper: Find matching donors
------------------------------------------------------------ */
const findMatchingDonors = async ({ bloodGroup, pincode }) => {
  return User.find({
    role: "donor",
    isAvailable: true,
    bloodGroup,
    pincode,
  });
};

/* ------------------------------------------------------------
   Helper: Award Points when request is fulfilled
------------------------------------------------------------ */
const awardPointsForRequest = async (requestDoc) => {
  const isEmergency = !!requestDoc.isEmergency;

  // Populate hospital info for certificate
  await requestDoc.populate("hospital", "name");

  // Get all pledges
  const pledges = await Donation.find({
    request: requestDoc._id,
    status: "pledged",
  }).populate("donor");

  for (const donation of pledges) {
    const donor = donation.donor;
    if (!donor) continue;

    const points = isEmergency ? 20 : 10;

    // Mark pledge completed
    donation.status = "completed";
    donation.pointsAwarded = points;

    // Generate certificate
    try {
      const certificatePath = await generateCertificate({
        donorName: donor.name,
        hospitalName: requestDoc.hospital.name,
        bloodGroup: requestDoc.bloodGroup,
        units: requestDoc.units,
        donationDate: new Date(),
        certificateId: `${donation._id}-${Date.now()}`,
      });

      donation.certificateUrl = `/certificates/${certificatePath.split(/[\\/]/).pop()}`;
      donation.certificateGeneratedAt = new Date();
    } catch (certErr) {
      console.error("Certificate generation error:", certErr);
      // Continue even if certificate fails
    }

    await donation.save();

    // Update donor score
    donor.points = (donor.points || 0) + points;
    donor.badgeLevel = computeBadgeLevel(donor.points);
    await donor.save();
  }
};

/* ------------------------------------------------------------
   CREATE BLOOD REQUEST
------------------------------------------------------------ */
router.post("/", auth, requireRole(["hospital"]), async (req, res) => {
  try {
    const { bloodGroup, units, city, pincode, isEmergency } = req.body;

    const expiresAt = new Date(
      Date.now() + (isEmergency ? 12 : 24) * 3600 * 1000
    );

    const requestDoc = await Request.create({
      hospital: req.userId,
      bloodGroup,
      units,
      city: city || req.user.city,
      pincode: pincode || req.user.pincode,
      isEmergency,
      expiresAt,
    });

    const donors = await findMatchingDonors({
      bloodGroup,
      pincode: pincode || req.user.pincode,
    });

    requestDoc.matchedDonors = donors.map((d) => d._id);
    await requestDoc.save();

    // Emergency WebSocket Alerts
    if (isEmergency) {
      const io = req.app.get("io");
      donors.forEach((donor) => {
        io.to(String(donor._id)).emit("emergencyAlert", {
          requestId: requestDoc._id,
          bloodGroup,
          units,
          hospitalName: req.user.name,
        });
      });
    }

    res.json({ request: requestDoc, matchedDonorsCount: donors.length });
  } catch (err) {
    console.error("Create request error", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------
   GET USER-SPECIFIC REQUESTS
------------------------------------------------------------ */
router.get("/mine", auth, async (req, res) => {
  try {
    /* ----------------- Hospital ----------------- */
    if (req.userRole === "hospital") {
      const myReqs = await Request.find({ hospital: req.userId })
        .sort({ createdAt: -1 })
        .populate("acceptedDonor", "name email phone")
        .lean();

      for (let reqObj of myReqs) {
        reqObj.pledgedDonors = await Donation.find({
          request: reqObj._id,
        }).populate("donor", "name email phone");
      }

      return res.json(myReqs);
    }

    /* ----------------- Donor ----------------- */
    if (req.userRole === "donor") {
      const donorReqs = await Request.find({
        matchedDonors: req.userId,
      })
        .populate("hospital", "name email phone city pincode")
        .populate("acceptedDonor", "name email phone");

      return res.json(donorReqs);
    }

    /* ----------------- Admin ----------------- */
    if (req.userRole === "admin") {
      return res.json(await Request.find());
    }

    res.status(400).json({ msg: "Invalid role" });
  } catch (err) {
    console.error("Mine error", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------
   DONOR PLEDGE
------------------------------------------------------------ */
router.post("/:id/pledge", auth, requireRole(["donor"]), async (req, res) => {
  try {
    const requestDoc = await Request.findById(req.params.id).populate(
      "hospital",
      "name"
    );

    if (!requestDoc) return res.status(404).json({ message: "Not found" });

    const exists = await Donation.findOne({
      donor: req.userId,
      request: requestDoc._id,
    });

    if (exists) {
      return res.status(400).json({ message: "Already pledged" });
    }

    await Donation.create({
      donor: req.userId,
      request: requestDoc._id,
      status: "pledged",
    });

    // Notify Hospital
    req.app
      .get("io")
      .to(String(requestDoc.hospital._id))
      .emit("donorPledged", {
        donorId: req.userId,
        donorName: req.user.name,
        requestId: requestDoc._id,
        hospitalName: requestDoc.hospital.name,
      });

    res.json({ success: true });
  } catch (err) {
    console.error("Pledge error", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ------------------------------------------------------------
   HOSPITAL ACCEPTS DONOR
------------------------------------------------------------ */
router.patch(
  "/:id/accept-donor",
  auth,
  requireRole(["hospital"]),
  async (req, res) => {
    try {
      const { donorId } = req.body;
      const requestDoc = await Request.findById(req.params.id);

      if (!requestDoc)
        return res.status(404).json({ message: "Not found" });

      if (requestDoc.hospital.toString() !== req.userId) {
        return res
          .status(403)
          .json({ message: "Cannot modify others' requests" });
      }

      requestDoc.acceptedDonor = donorId;
      await requestDoc.save();

      req.app.get("io").to(String(donorId)).emit("donorAccepted", {
        hospitalName: req.user.name,
        requestId: req.params.id,
      });

      res.json({ message: "Donor accepted", request: requestDoc });
    } catch (err) {
      console.error("Accept donor error", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------------------------------------
   UPDATE STATUS (FULFILLED / CANCELLED / OPEN / EXPIRED)
------------------------------------------------------------ */
router.patch(
  "/:id/status",
  auth,
  requireRole(["hospital", "admin"]),
  async (req, res) => {
    try {
      const { status } = req.body;
      const allowed = ["open", "fulfilled", "expired", "cancelled"];

      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const reqDoc = await Request.findById(req.params.id);
      if (!reqDoc)
        return res.status(404).json({ message: "Request not found" });

      if (
        req.userRole === "hospital" &&
        reqDoc.hospital.toString() !== req.userId
      ) {
        return res.status(403).json({ message: "Not your request" });
      }

      // Must accept donor before fulfilling
      if (status === "fulfilled" && !reqDoc.acceptedDonor) {
        return res.status(400).json({
          message: "Select a donor before marking fulfilled",
        });
      }

      reqDoc.status = status;
      await reqDoc.save();

      // ⭐ Give Rewards Here
      if (status === "fulfilled") {
        await awardPointsForRequest(reqDoc);
      }

      res.json(reqDoc);
    } catch (err) {
      console.error("Status update error", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
