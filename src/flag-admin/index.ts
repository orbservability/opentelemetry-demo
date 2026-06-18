/**
 * flag-admin — tiny HTTP service for reading/writing flagd config.
 * Runs as a sidecar in the otel-demo compose stack.
 *
 * GET  /flags         → returns all flag states
 * PUT  /flags/:key    → body: { enabled: true/false, variant?: string }
 *
 * Flagd watches the JSON file, so changes propagate automatically.
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";

const FLAG_FILE = process.env.FLAG_FILE || "/flags/demo.flagd.json";
const PORT = parseInt(process.env.PORT || "8090", 10);

function readFlags() {
  return JSON.parse(readFileSync(FLAG_FILE, "utf-8"));
}

function writeFlags(data: any) {
  writeFileSync(FLAG_FILE, JSON.stringify(data, null, 2) + "\n");
}

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // GET /flags — return current state of all flags
  if (req.method === "GET" && url.pathname === "/flags") {
    try {
      const data = readFlags();
      const flags: Record<string, { enabled: boolean; variant: string; description: string }> = {};

      for (const [key, val] of Object.entries(data.flags) as any) {
        flags[key] = {
          enabled: val.defaultVariant !== "off",
          variant: val.defaultVariant,
          description: val.description || "",
        };
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ flags }));
    } catch (e: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // PUT /flags/:key — update a flag
  if (req.method === "PUT" && url.pathname.startsWith("/flags/")) {
    const key = url.pathname.slice("/flags/".length);
    let body = "";

    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const { enabled, variant } = JSON.parse(body);
        const data = readFlags();

        if (!data.flags[key]) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `flag '${key}' not found` }));
          return;
        }

        const flag = data.flags[key];
        const variants = Object.keys(flag.variants || {});

        if (variant && variants.includes(variant)) {
          flag.defaultVariant = variant;
        } else if (enabled === false) {
          flag.defaultVariant = "off";
        } else {
          // Find the "on" or first non-off variant
          const onVariant = variants.find((v) => v !== "off") || "on";
          flag.defaultVariant = onVariant;
        }

        writeFlags(data);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ key, variant: flag.defaultVariant }));
      } catch (e: any) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`flag-admin listening on :${PORT}`);
});
