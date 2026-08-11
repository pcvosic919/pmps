import "dotenv/config";
import mongoose from "mongoose";
import { UserModel } from "../server/models/User";
import { hashPassword } from "../server/_core/password";

const OLD_EMAIL = "demo@demo.com";
const NEW_EMAIL = "adminpmp@demo.com";
const commit = process.argv.includes("--commit");

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required");
    await mongoose.connect(uri);

    const [oldAccount, newAccount, currentOwners] = await Promise.all([
        UserModel.findOne({ email: new RegExp(`^${OLD_EMAIL}$`, "i") }).select("email name role provider isActive isPlatformOwner sessionVersion passwordChangedAt +password"),
        UserModel.findOne({ email: new RegExp(`^${NEW_EMAIL}$`, "i") }).select("email name role provider isActive isPlatformOwner sessionVersion passwordChangedAt +password"),
        UserModel.find({ isPlatformOwner: true }).select("email name").lean()
    ]);

    if (oldAccount && newAccount && oldAccount._id.toString() !== newAccount._id.toString()) {
        throw new Error(`${NEW_EMAIL} already belongs to another account; migration stopped`);
    }
    const target = newAccount || oldAccount;
    if (!target) throw new Error(`Neither ${OLD_EMAIL} nor ${NEW_EMAIL} exists`);
    if (!target.password) throw new Error("The target account has no password; migration stopped");

    const passwordStorage = target.password.startsWith("scrypt$") ? "scrypt" : "legacy_plaintext";

    console.log(JSON.stringify({
        mode: commit ? "commit" : "dry-run",
        targetId: target._id.toString(),
        currentEmail: target.email,
        nextEmail: NEW_EMAIL,
        passwordStorage,
        loginPasswordPreserved: true,
        currentPlatformOwners: currentOwners.map((owner) => owner.email)
    }, null, 2));

    if (!commit) {
        console.log("Dry-run only. Re-run with --commit after reviewing the target account.");
        return;
    }

    const passwordHash = passwordStorage === "scrypt"
        ? target.password
        : await hashPassword(target.password);

    await UserModel.updateMany(
        { _id: { $ne: target._id }, isPlatformOwner: true },
        { $set: { isPlatformOwner: false } }
    );
    await UserModel.updateOne(
        { _id: target._id },
        {
            $set: {
                email: NEW_EMAIL,
                role: "admin",
                provider: "manual",
                password: passwordHash,
                isActive: true,
                isPlatformOwner: true,
                passwordChangedAt: target.passwordChangedAt || new Date()
            },
            $inc: { sessionVersion: 1 },
            $unset: { roles: 1 }
        }
    );
    await UserModel.createIndexes();
    console.log(`Platform owner migrated to ${NEW_EMAIL}; the login password was preserved and storage is scrypt.`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
