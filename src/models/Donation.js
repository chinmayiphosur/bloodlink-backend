// backend/src/models/Donation.js
import mongoose from "mongoose";

const donationSchema = new mongoose.Schema(
  {
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      required: true,
    },
    status: {
      type: String,
      enum: ["pledged", "completed"],
      default: "pledged",
    },
    // reward points given for this donation
    pointsAwarded: { type: Number, default: 0 },

    // geofencing alert already sent?
    arrivalAlertSent: { type: Boolean, default: false },

    // donation certificate
    certificateUrl: { type: String },
    certificateGeneratedAt: { type: Date },
  },
  { timestamps: true }
);

export const Donation = mongoose.model("Donation", donationSchema);
