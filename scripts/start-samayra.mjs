#!/usr/bin/env node
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = process.env.PORT || process.env.DASHBOARD_PORT || "20128";
const host = process.env.OMNIROUTE_HOSTNAME || "0.0.0.0";
process.env.OMNIROUTE_HEADLESS = "1";
process.env.OMNIROUTE_DISABLE_BACKGROUND_SERVICES ||= "1";
process.env.OMNIROUTE_HOSTNAME = host;
process.env.PORT = port;
process.env.DASHBOARD_PORT = port;
process.env.API_PORT = port;

const server = spawn(process.execPath, ["scripts/dev/run-next.mjs", "start"], { stdio: "inherit", env: process.env });
let bot;
let stopping = false;
const waitForApi = async () => {
  const deadline = Date.now() + 180000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return true;
    } catch {}
    await delay(1500);
  }
  return false;
};
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  bot?.kill("SIGTERM");
  server.kill("SIGTERM");
  setTimeout(() => process.exit(code), 1800).unref();
};
server.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.warn("[SAMAYRA] TELEGRAM_BOT_TOKEN missing; starting API only.");
} else {
  void (async () => {
    const ready = await waitForApi();
    if (stopping) return;
    if (!ready) {
      console.error("[SAMAYRA] API did not become healthy within 3 minutes; bot polling not started.");
      return;
    }
    bot = spawn(process.execPath, ["bots/samayra-bot.mjs"], { stdio: "inherit", env: process.env });
    bot.on("exit", (code) => {
      if (!stopping) {
        console.error(`[SAMAYRA] Telegram process exited (${code}); restarting in 3 seconds.`);
        void delay(3000).then(() => {
          if (!stopping) {
            bot = spawn(process.execPath, ["bots/samayra-bot.mjs"], { stdio: "inherit", env: process.env });
          }
        });
      }
    });
  })();
}
