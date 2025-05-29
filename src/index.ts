// ethip-listener.ts
import { IO, IOConfig } from "st-ethernet-ip";

async function startListener() {
  // 1) Create the scanner (listens on UDP 2222 by default)
  const scanner = new IO.Scanner();

  // 2) Define the same assembly IDs & sizes your PLC Produce uses.
  //    - configInstance: (optional) data **you** send to the PLC (size in bytes)
  //    - inputInstance:  data coming **from** the PLC (size in bytes)
  //    - outputInstance: data going **to** the PLC (size in bytes)
  //
  // Swap these placeholders for the values from your PLC programmer:
  const config: IOConfig = {
    configInstance: { assembly: 0, size: 0 }, // usually 0 if you don't send config
    inputInstance: { assembly: 101, size: 12 }, // e.g. PLC’s “assembly 101” → 12 bytes
    outputInstance: { assembly: 102, size: 4 }, // e.g. PLC’s “assembly 102” → 4  bytes
  };

  // 3) Add a connection: (config, RPI in ms, PLC_IP)
  //    RPI = Requested Packet Interval (how often PLC will send)
  const RPI_MS = 50;
  const PLC_IP = "192.168.1.50";
  const conn = scanner.addConnection(config, RPI_MS, PLC_IP);

  // 4) Handle the first “connected” event
  conn.on("connected", () => {
    console.log("🔗 Implicit session established with PLC");
    console.log("▶ Input data buffer:", conn.inputData);
    console.log("◀ Output data buffer:", conn.outputData);

    // 5) (Optional) alias fields for easy access:
    //    skip 0 bytes, read a 16-bit integer as “sensorValue”
    conn.addInputInt(0, "sensorValue");
    //    skip 2 bytes, read a BOOL (bit 3) as “alarm”
    conn.addInputBit(2, 3, "alarm");

    // 6) Whenever new UDP packets arrive, you can grab values like:
    setInterval(() => {
      console.log(
        "Sensor=",
        conn.getValue("sensorValue"),
        "Alarm=",
        conn.getValue("alarm")
      );
    }, 200);
  });

  // 7) Handle disconnects (e.g. PLC fault or network hiccup)
  conn.on("disconnected", () => {
    console.warn("⚠️ Disconnected from PLC, waiting to re-connect…");
  });
}

startListener().catch((err) => console.error("💥 Startup error:", err));
