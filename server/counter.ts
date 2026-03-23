import fs from "fs";
import path from "path";

const COUNTER_FILE = path.join(process.cwd(), "upload_counter.json");

export function getUploadCount(): number {
  try {
    if (fs.existsSync(COUNTER_FILE)) {
      const data = fs.readFileSync(COUNTER_FILE, "utf-8");
      return JSON.parse(data).count || 0;
    }
  } catch (e) {
    console.error("Error reading counter:", e);
  }
  return 0;
}

export function incrementUploadCount(): number {
  let count = getUploadCount();
  count++;
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count }), "utf-8");
  } catch (e) {
    console.error("Error writing counter:", e);
  }
  return count;
}
