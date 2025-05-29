#!/usr/bin/env ts-node

import { IO, IOConfig } from "st-ethernet-ip";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PLC_IP = "192.168.1.10";

// ─── I/O CONFIG ───────────────────────────────────────────────────────────────
const inputConfig: IOConfig["inputInstance"] = { assembly: 101, size: 12 * 2 };
const outputConfig: IOConfig["outputInstance"] = { assembly: 200, size: 16 };

const config: IOConfig = {
  configInstance: { assembly: 0, size: 0 },
  inputInstance: inputConfig,
  outputInstance: outputConfig,
};

// ─── TAG LABELS ───────────────────────────────────────────────────────────────
const tagNames = [
  "North Head Bearing", // Data[0]
  "South Head Bearing", // Data[1]
  "North Boot Bearing", // Data[2]
  "South Boot Bearing", // Data[3]
  "North Head Rub Block", // Data[4]
  "South Head Rub Block", // Data[5]
  "North Boot Rub Block", // Data[6]
  "South Boot Rub Block", // Data[7]
  "West Bearing", // Data[8]
  "East Bearing", // Data[9]
  "Rpm", // Data[10]
  "Inventory Placeholder", // Data[11]
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const scanner = new IO.Scanner();
  console.log(`🔌 Connecting to PLC @ ${PLC_IP}…`);

  const plc = await scanner.connectPLC({ target: PLC_IP, cpuSlot: 0 });
  plc.config(config);

  plc.on("ImplicitMessage", (msg: Buffer) => {
    const buf = Buffer.from(msg);
    const data: Record<string, number> = {};

    tagNames.forEach((label, idx) => {
      data[label] = buf.readInt16LE(idx * 2);
    });

    console.log({ timestamp: new Date().toISOString(), ...data });
    // ← TODO: push `data` into your cloud API / MQTT / DB
  });

  scanner.begin();
  console.log("✅ PLC bridge running (101:24B in → 200:16B out)");
}

main().catch((err) => {
  console.error("Fatal PLC bridge error:", err);
  process.exit(1);
});
