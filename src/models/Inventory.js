import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
  {
    hospital: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    stocks: {
      type: Map,
      of: Number,
      default: {},
    },
    bloodLent: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

export const Inventory = mongoose.model("Inventory", inventorySchema);
