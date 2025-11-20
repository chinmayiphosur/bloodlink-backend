// backend/src/models/Request.js
import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
  {
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bloodGroup: { type: String, required: true },
    units: { type: Number, default: 1 },
    city: String,
    pincode: String,
    isEmergency: { type: Boolean, default: false },
    expiresAt: Date,

    // All matched donors
    matchedDonors: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    ],

    // 🆕 Selected donor (Hospital accepted donor)
    acceptedDonor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: ["open", "fulfilled", "expired", "cancelled"],
      default: "open",
    },
  },
  { timestamps: true }
);

export const Request = mongoose.model("Request", requestSchema);
