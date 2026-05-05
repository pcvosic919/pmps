import dotenv from 'dotenv';
import path from 'path';

// Try to load from current directory, then from root (same as server/index.ts)
const envFile = '.env.local';
const pathsToTry = [
    path.resolve(process.cwd(), envFile),
    path.resolve(process.cwd(), '..', envFile),
];

for (const envPath of pathsToTry) {
    dotenv.config({ path: envPath, override: true });
}
dotenv.config(); // Final fallback

console.log('MONGODB_URI:', process.env.MONGODB_URI);

import { connectDB } from './server/db.js';
import { SystemSettingModel } from './server/models/Settings.ts';

async function checkSettings() {
  await connectDB();
  const settings = await SettingsModel.findOne({});
  console.log('System Settings:', JSON.stringify(settings, null, 2));
  process.exit(0);
}

checkSettings().catch(console.error);