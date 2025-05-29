const { Controller, Tag } = require("st-ethernet-ip");
const { createClient } = require("@supabase/supabase-js");

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const PLC_IP = "192.168.1.10";
const PLC_SLOT = 0; // CPU built-in port
const SCAN_RATE = 100; // ms between reads

// Supabase setup (via env)
const SUPABASE_URL = "https://pzndsucdxloknrgecijj.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6bmRzdWNkeGxva25yZ2VjaWpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDc2NjQ5NywiZXhwIjoyMDU2MzQyNDk3fQ.ozasWT_E1uuu1ceEmPSmLrEYhLBHsDWhgqKcGv9IZJk";
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

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  const plc = new Controller();

  // Subscribe tags before connect
  tagNames.forEach((name) => plc.subscribe(new Tag(name)));

  // Handle init & changes
  plc.forEach((tag) => {
    tag.on("Initialized", async (t) => {
      console.log(`INIT ${t.name}:`, t.value);
      await insertReading(t.name, t.value);
    });
    tag.on("Changed", async (t, prev) => {
      console.log(`CHG  ${t.name}:`, prev, "→", t.value);
      await insertReading(t.name, t.value);
    });
  });

  // Connect & start scan
  console.log(`Connecting to PLC @ ${PLC_IP} (slot ${PLC_SLOT})…`);
  await plc.connect(PLC_IP, PLC_SLOT);
  plc.scan_rate = SCAN_RATE;
  console.log(`Starting scan @ ${SCAN_RATE}ms...`);
  plc.scan();

  plc.on("error", (e) => console.error("PLC error:", e));
}

/**
 * Inserts a tag reading into Supabase
 */
async function insertReading(tagName, value) {
  const { error } = await supabase
    .from("tag_readings")
    .insert([
      { timestamp: new Date().toISOString(), tag_name: tagName, value },
    ]);
  if (error) {
    console.error("Supabase insert error:", error.message);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
