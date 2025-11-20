// backend/src/models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["donor", "hospital", "admin"],
      required: true,
    },

    // Donor-related
    bloodGroup: { type: String },
    isAvailable: { type: Boolean, default: false },

    // Shared
    phone: { type: String },
    city: { type: String },
    pincode: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },

    // Hospital-specific
    address: { type: String },
    accreditationNumber: { type: String },
    emergencyContact: { type: String },

    // Hospital verification documents
    licenseCertificateNumber: { type: String },
    gstNumber: { type: String },
    verificationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    verificationNotes: { type: String }, // Admin notes for rejection reason

    // Profile picture (Cloudinary URL)
    profileImageUrl: { type: String },

    // Rewards
    points: { type: Number, default: 0 },
    badgeLevel: {
      type: String,
      enum: ["Bronze", "Silver", "Gold", "Platinum"],
      default: "Bronze",
    },

    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
