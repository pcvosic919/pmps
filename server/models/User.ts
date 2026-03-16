import mongoose, { Schema, Document } from "mongoose";
import { roles } from "../../shared/types";

export interface IUser extends Document {
    email: string;
    name: string;
    password?: string;
    department?: string;
    title?: string;
    role: string;
    roles: string[];
    provider: "manual" | "oauth" | "entra";
    providerId?: string;
    isActive: boolean;
    skills: { category: string; level: string }[];
    costRate: { dailyRate: number; hourlyRate: number; currency: string };
    costRateHistory?: { dailyRate: number; hourlyRate: number; currency: string; updatedAt: Date }[];
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String },
    department: { type: String },
    title: { type: String },
    role: { type: String, enum: roles, default: "user", required: true },
    roles: { type: [String], default: [] },
    provider: { type: String, enum: ["manual", "oauth", "entra"], default: "manual", required: true },
    providerId: { type: String },
    isActive: { type: Boolean, default: true, required: true },
    skills: [{
        category: { type: String, required: true },
        level: { type: String, enum: ["junior", "mid", "senior"], required: true }
    }],
    costRate: {
        dailyRate: { type: Number, default: 0 },
        hourlyRate: { type: Number, default: 0 },
        currency: { type: String, default: "TWD" }
    },
    costRateHistory: [{
        dailyRate: { type: Number },
        hourlyRate: { type: Number },
        currency: { type: String },
        updatedAt: { type: Date, default: Date.now }
    }]
}, { timestamps: true });

export const UserModel = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
