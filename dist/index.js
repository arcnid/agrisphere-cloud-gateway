"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const st_ethernet_ip_1 = require("st-ethernet-ip");
const supabase_js_1 = require("@supabase/supabase-js");
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
    console.error("Error: SUPABASE_URL and SUPABASE_KEY must be set as environment variables.");
    process.exit(1);
}
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_KEY);
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
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function connectWithRetry(controller) {
    return __awaiter(this, void 0, void 0, function* () {
        let attempt = 0;
        let delayMs = INITIAL_RETRY_DELAY;
        while (attempt < MAX_CONNECT_RETRIES) {
            try {
                attempt++;
                console.log(`Connecting to PLC @ ${PLC_IP} (slot ${PLC_SLOT}), attempt ${attempt}...`);
                yield controller.connect(PLC_IP, PLC_SLOT);
                console.log("PLC connected successfully.");
                return;
            }
            catch (err) {
                console.error(`Connection attempt ${attempt} failed:`, err.message || err);
                if (attempt < MAX_CONNECT_RETRIES) {
                    console.log(`Retrying in ${delayMs}ms...`);
                    yield delay(delayMs);
                    delayMs *= 2;
                }
                else {
                    console.error(`Exceeded maximum retries (${MAX_CONNECT_RETRIES}). Exiting.`);
                    process.exit(1);
                }
            }
        }
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const plc = new st_ethernet_ip_1.Controller();
        // Subscribe tags before connect
        tagNames.forEach((name) => plc.subscribe(new st_ethernet_ip_1.Tag(name)));
        // Handle init & changes
        plc.forEach((tag) => {
            tag.on("Initialized", (t) => __awaiter(this, void 0, void 0, function* () {
                console.log(`INIT ${t.name}:`, t.value);
                yield insertReading(t.name, t.value);
            }));
            tag.on("Changed", (t, prev) => __awaiter(this, void 0, void 0, function* () {
                console.log(`CHG  ${t.name}:`, prev, "→", t.value);
                yield insertReading(t.name, t.value);
            }));
            return tag;
        });
        // catch runtime errors and attempt reconnect
        plc.on("error", (err) => __awaiter(this, void 0, void 0, function* () {
            console.error("PLC error:", err.message || err);
            console.log("Attempting to reconnect...");
            try {
                plc.disconnect();
            }
            catch (_a) { }
            yield connectWithRetry(plc);
            plc.scan_rate = SCAN_RATE;
            plc.scan();
        }));
        // initial connect + scan
        yield connectWithRetry(plc);
        plc.scan_rate = SCAN_RATE;
        console.log(`Starting scan @ ${SCAN_RATE}ms...`);
        plc.scan();
    });
}
/**
 * Inserts a tag reading into Supabase
 */
function insertReading(tagName, value) {
    return __awaiter(this, void 0, void 0, function* () {
        const { error } = yield supabase
            .from("tag_readings")
            .insert([
            { timestamp: new Date().toISOString(), tag_name: tagName, value },
        ]);
        if (error) {
            console.error("Supabase insert error:", error.message);
        }
    });
}
main().catch((err) => {
    console.error("Fatal error in main():", err.message || err);
    process.exit(1);
});
