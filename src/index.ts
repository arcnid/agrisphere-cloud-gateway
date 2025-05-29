import { Controller, Tag } from "st-ethernet-ip";
import { createClient } from "@supabase/supabase-js";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const PLC_IP = "192.168.1.10";
const PLC_SLOT = 0; // CPU built-in port
const SCAN_RATE = 100; // ms between reads
const MAX_CONNECT_RETRIES = 5; // how many times to retry
const INITIAL_RETRY_DELAY = 2000; // ms

// Supabase setup (via env)
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Error: SUPABASE_URL and SUPABASE_KEY must be set as environment variables."
  );
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(controller: Controller) {
  let attempt = 0;
  let delayMs = INITIAL_RETRY_DELAY;
  while (attempt < MAX_CONNECT_RETRIES) {
    try {
      attempt++;
      console.log(
        `Connecting to PLC @ ${PLC_IP} (slot ${PLC_SLOT}), attempt ${attempt}...`
      );
      await controller.connect(PLC_IP, PLC_SLOT);
      console.log("PLC connected successfully.");
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
        process.exit(1);
      }
    }
  }
}

async function main() {
  const plc = new Controller();

  // Subscribe tags before connect
  tagNames.forEach((name) => plc.subscribe(new Tag(name)));

  // Handle init & changes
  plc.forEach((tag: Tag) => {
    tag.on("Initialized", async (t: Tag) => {
      console.log(`INIT ${t.name}:`, t.value);
      await insertReading(t.name, t.value);
    });
    tag.on("Changed", async (t: Tag, prev: any) => {
      console.log(`CHG  ${t.name}:`, prev, "→", t.value);
      await insertReading(t.name, t.value);
    });
    return tag;
  });

  // catch runtime errors and attempt reconnect
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

  // initial connect + scan
  await connectWithRetry(plc);
  plc.scan_rate = SCAN_RATE;
  console.log(`Starting scan @ ${SCAN_RATE}ms...`);
  plc.scan();
}

/**
 * Inserts a tag reading into Supabase
 */
async function insertReading(tagName: string, value: any) {
  const { error } = await supabase
    .from("tag_readings")
    .insert([
      { timestamp: new Date().toISOString(), tag_name: tagName, value },
    ]);
  if (error) {
    console.error("Supabase insert error:", error.message);
  }
}

main().catch((err: any) => {
  console.error("Fatal error in main():", err.message || err);
  process.exit(1);
});
