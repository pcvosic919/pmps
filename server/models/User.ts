import mongoose, { Schema, Document } from "mongoose";
import { authProviders, featurePermissions, roles, skillLevels, type AuthProvider, type PermissionOverrides, type Role, type UserCostRate, type UserCostRateHistory, type UserSkill } from "../../shared/types";

export interface IUser extends Document {
    email: string;
    name: string;
    password?: string;
    passwordChangedAt?: Date;
    sessionVersion: number;
    isPlatformOwner: boolean;
    department?: string;
    employeeCode?: string;
    managedDepartments: string[];
    title?: string;
    role: Role;
    permissionOverrides: PermissionOverrides;
    provider: AuthProvider;
    providerId?: string;
    isActive: boolean;
    skills: UserSkill[];
    costRate: UserCostRate;
    costRateHistory?: UserCostRateHistory[];
    lastLoginAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String, select: false },
    passwordChangedAt: { type: Date },
    sessionVersion: { type: Number, default: 0, min: 0, required: true },
    isPlatformOwner: { type: Boolean, default: false, required: true },
    department: { type: String },
    employeeCode: { type: String, trim: true },
    managedDepartments: { type: [String], default: [] },
    title: { type: String },
    role: { type: String, enum: roles, default: "user", required: true },
    permissionOverrides: {
        allow: { type: [String], enum: featurePermissions, default: [] },
        deny: { type: [String], enum: featurePermissions, default: [] }
    },
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
    }],
    lastLoginAt: { type: Date }
}, { timestamps: true });

UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ name: 1, _id: 1 });
UserSchema.index({ email: 1, _id: 1 });
UserSchema.index({ department: 1, _id: 1 });
UserSchema.index({ employeeCode: 1, _id: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ lastLoginAt: -1 });
UserSchema.index(
    { isPlatformOwner: 1 },
    { unique: true, partialFilterExpression: { isPlatformOwner: true } }
);
UserSchema.index({ name: "text", email: "text", department: "text", employeeCode: "text" });

export const UserModel = mongoose.models.User || mongoose.model<IUser>("User", UserSchema);
