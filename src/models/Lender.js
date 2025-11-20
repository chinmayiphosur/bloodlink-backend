import mongoose from "mongoose";

const LenderSchema = new mongoose.Schema({
  hospital: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  receiverName: { 
    type: String, 
    required: true 
  },
  receiverAddress: { 
    type: String, 
    required: true 
  },
  receiverPhone: { 
    type: String, 
    required: true 
  },
  receiverEmail: { 
    type: String 
  },
  bloodGroup: { 
    type: String, 
    required: true,
    enum: ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"]
  },
  units: { 
    type: Number, 
    required: true,
    min: 1
  },
  lendingDate: { 
    type: Date, 
    default: Date.now 
  },
  notes: { 
    type: String 
  }
}, { timestamps: true });

export const Lender = mongoose.model("Lender", LenderSchema);
