import mongoose, { Schema, Document } from "mongoose";
import { authProviders, roles, skillLevels, type AuthProvider, type Role, type UserCostRate, type UserCostRateHistory, type UserSkill } from "../../shared/types";

export interface IUser extends Document {
    email: string;
    name: string;
    password?: string;
    department?: string;
    title?: string;
    role: Role;
    roles: Role[];
    provider: AuthProvider;
    providerId?: string;
    isActive: boolean;
    skills: UserSkill[];
    costRate: UserCostRate;
    costRateHistory?: UserCostRateHistory[];
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
    roles: { type: [String], enum: roles, default: [] },
    provider: { type: String, enum: authProviders, default: "manual", required: true },
    providerId: { type: String },
    isActive: { type: Boolean, default: true, required: true },
    skills: [{
        category: { type: String, required: true },
        level: { type: String, enum: skillLevels, required: true }
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

UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ name: 1, _id: 1 });
UserSchema.index({ createdAt: -1 });

export const UserModel = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
