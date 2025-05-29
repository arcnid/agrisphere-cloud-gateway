import { Controller, Tag } from "st-ethernet-ip";
import { exec } from "child_process";
import { promisify } from "util";
import mysql from "mysql2/promise";

const execAsync = promisify(exec);

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const PLC_IP = "192.168.1.10";
const PLC_SLOT = 0; // CPU built-in port
const SCAN_RATE = 1000; // ms between reads
const MAX_CONNECT_RETRIES = 5; // how many times to retry
const INITIAL_RETRY_DELAY = 2000; // ms

// ─── MYSQL POOL ──────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host: "172.31.37.116",
  port: 3306,
  user: "admin",
  password: "Agsadmin_1",
  database: "agtraining", // ← set your DB name here
  waitForConnections: true,
  connectionLimit: 10,
  timezone: "Z",
});

// ─── TAGS ───────────────────────────────────────────────────────────────────
const tagNames = [
  "Agrisphere:O.Data[0]",
  "Agrisphere:O.Data[1]",
  "Agrisphere:O.Data[2]",
  "Agrisphere:O.Data[3]",
  "Agrisphere:O.Data[4]",
  "Agrisphere:O.Data[5]",
  "Agrisphere:O.Data[6]",
  "Agrisphere:O.Data[7]",
  "Agrisphere:O.Data[8]",
  "Agrisphere:O.Data[9]",
  "Agrisphere:O.Data[10]",
  "Agrisphere:O.Data[11]",
];

// ─── TAG → LABEL MAP ─────────────────────────────────────────────────────────
const tagLabelMap: Record<string, string> = {
  "Agrisphere:O.Data[10]": "West Bearing",
  "Agrisphere:O.Data[0]": "North Head Bearing",
  "Agrisphere:O.Data[4]": "North Head Rub Block",
  "Agrisphere:O.Data[1]": "South Head Bearing",
  "Agrisphere:O.Data[5]": "South Head Rub Block",
  "Agrisphere:O.Data[6]": "North Boot Rub Block",
  "Agrisphere:O.Data[7]": "South Boot Rub Block",
  "Agrisphere:O.Data[2]": "North Boot Bearing",
  "Agrisphere:O.Data[3]": "South Boot Bearing",
  "Agrisphere:O.Data[9]": "East Bearing",
  "Agrisphere:O.Data[8]": "Rpm",
  "Agrisphere:O.Data[11]": "Inventory Placeholder",
};

// ─── LED HELPERS ──────────────────────────────────────────────────────────────
// A4 bit-masks: green = 64, red = 128, orange = 192
const LED_MASKS = {
  off: 0,
  green: 128,
  red: 64,
  orange: 192,
} as const;

/**
 * Set the A4 LED color via piTest.
 * Must be run as root (sudo piTest).
 */
async function setA4(color: keyof typeof LED_MASKS) {
  const mask = LED_MASKS[color];
  console.log(`Setting A4 LED to ${color} (mask: ${mask})`);
  try {
    await execAsync(`piTest -w RevPiLED,${mask}`);
  } catch (err: any) {
    console.error("Failed to set A4 LED:", err.stderr || err);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(controller: Controller) {
  let attempt = 0;
  let delayMs = INITIAL_RETRY_DELAY;

  // indicate “trying to connect”
  await setA4("red");

  while (attempt < MAX_CONNECT_RETRIES) {
    try {
      attempt++;
      console.log(
        `Connecting to PLC @ ${PLC_IP} (slot ${PLC_SLOT}), attempt ${attempt}...`
      );
      await controller.connect(PLC_IP, PLC_SLOT);
      console.log("PLC connected successfully.");
      // success → green
      await setA4("green");
      return;
    } catch (err: any) {
      console.error(
        `Connection attempt ${attempt} failed:`,
        err.message || err
      );
      if (attempt < MAX_CONNECT_RETRIES) {
        console.log(`Retrying in ${delayMs}ms...`);
        await delay(delayMs);
        delayMs *= 2;
      } else {
        console.error(
          `Exceeded maximum retries (${MAX_CONNECT_RETRIES}). Exiting.`
        );
        // blink red to show fatal error
        for (let i = 0; i < 6; i++) {
          await setA4(i % 2 === 0 ? "off" : "red");
          await delay(200);
        }
        process.exit(1);
      }
    }
  }
}

async function main() {
  const plc = new Controller();

  // ─── CREATE & SUBSCRIBE TAGS ────────────────────────────────────────────────
  const tags = tagNames.map((name) => new Tag(name));
  tags.forEach((tag) => plc.subscribe(tag));

  // ─── ERROR HANDLING & RECONNECT ─────────────────────────────────────────────
  plc.on("error", async (err: Error) => {
    console.error("PLC error:", err.message || err);
    console.log("Attempting to reconnect...");
    try {
      plc.disconnect();
    } catch {}
    await connectWithRetry(plc);
    plc.scan_rate = SCAN_RATE;
    plc.scan();
  });

  // ─── INITIAL CONNECT & SCAN ─────────────────────────────────────────────────
  await connectWithRetry(plc);
  plc.scan_rate = SCAN_RATE;
  console.log(`Starting scan @ ${SCAN_RATE}ms...`);
  plc.scan();

  // wait one scan cycle so tag.value has actual data
  await delay(SCAN_RATE);
  console.log("🚀 Initial sweep (after first scan): pushing all tag values…");
  for (const tag of tags) {
    try {
      await insertReading(tag.name, tag.value);
    } catch (err) {
      console.error(`Failed to push ${tag.name}:`, err);
    }
  }

  console.log("🔧 Debug: current tag values:");
  tags.forEach((tag) => {
    console.log(`${tag.name.padEnd(30)} ≔ ${tag.value}`);
  });
  console.log("🚀 Initial sweep (after one scan): pushing all tag values…");

  // ─── PERIODIC PUSH (every 30 minutes) ────────────────────────────────────────
  const THIRTY_MIN = 30 * 60 * 1000;
  setInterval(async () => {
    console.log("⏰ 30-minute sweep: pushing all tag values…");
    for (const tag of tags) {
      try {
        await insertReading(tag.name, tag.value);
      } catch (err) {
        console.error(`Failed to push ${tag.name}:`, err);
      }
    }
  }, THIRTY_MIN);
}

/**
 * Inserts a tag reading into MySQL.
 */
async function insertReading(tagName: string, value: any) {
  const displayName = tagLabelMap[tagName] || tagName;
  const sql = `
    INSERT INTO tag_readings
      (\`timestamp\`, tag_name, value, display_name)
    VALUES
      (UTC_TIMESTAMP(), ?, ?, ?)
  `;
  try {
    const [result] = await pool.execute(sql, [tagName, value, displayName]);
    console.log("MySQL insert OK:", result);
  } catch (err: any) {
    console.error("MySQL insert error:", err.message);
  }
}

main().catch((err: any) => {
  console.error("Fatal error in main():", err.message || err);
  process.exit(1);
});
