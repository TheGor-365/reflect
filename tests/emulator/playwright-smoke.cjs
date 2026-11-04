#!/usr/bin/env node
"use strict";

// Real-browser synthetic test. NEVER contacts production Firebase or AI.
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

const PROJECT = "demo-reflect-auth-qa";
const ROOT = path.resolve(__dirname, "../..");
const BASE = "http://127.0.0.1:3100";
const LOCAL_PORTS = new Set(["3100", "9099", "18081"]);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function verifyEmulatorProcess() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:18081" ||
      process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") {
    throw new Error("Refusing E2E: expected dedicated localhost demo emulators only");
  }
}

async function awaitReactServer(server, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error("Vite server exited before ready");
    try {
      const response = await fetch(BASE + "/", {
        signal: AbortSignal.timeout(1500)
      });
      if (response.ok) return;
    } catch (error) {
      // Server may still be compiling.
    }
    await delay(1000);
  }
  throw new Error("Vite dev server did not start on the fixed localhost port");
}

function protectBrowser(context) {
  return context.route("**/*", async (route) => {
    const address = new URL(route.request().url());
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(address.hostname);
    const allowedPort = LOCAL_PORTS.has(address.port);
    if (local && allowedPort && ["http:", "ws:"].includes(address.protocol)) {
      await route.continue();
    } else if (
      address.protocol === "https:" &&
      ["fonts.googleapis.com", "fonts.gstatic.com"].includes(address.hostname)
    ) {
      // Existing index.html loads Google Fonts. In private QA, cancel the
      // fetch entirely and fall back to system fonts; never touch the web.
      await route.abort("blockedbyclient");
    } else {
      await route.abort("blockedbyclient");
      // Synthetic CI only: origin is safe to log; never print path/query or tokens.
      throw new Error(
        "E2E blocked non-demo network origin: " +
        address.protocol + "//" + address.host
      );
    }
  });
}

async function profile(page, name) {
  await page.getByText("Добро пожаловать!").waitFor({ timeout: 30000 });
  await page.locator("#name").fill(name);
  await page.locator("#age").fill("30");
  await page.getByRole("button", { name: "Сохранить и продолжить" }).click();
  await page.getByRole("button", { name }).waitFor({ timeout: 30000 });
}

async function uidInSidebar(page) {
  // Stage 02A keeps the UID in an explicit disclosure to avoid visual noise.
  // Exercise the accessible UI rather than relying on an always-visible ID.
  const account = page.locator("aside details.reflect-account-details");
  await account.locator("summary").click();
  const uid = (await account.locator("code").innerText()).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(uid)) {
    throw new Error("Could not find synthetic UID in account disclosure");
  }
  return uid;
}

async function runBrowserSuite() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });
  try {
    const firstContext = await browser.newContext();
    await protectBrowser(firstContext);
    const first = await firstContext.newPage();
    await first.goto(BASE, { waitUntil: "domcontentloaded" });
    await profile(first, "Synthetic Alpha");
    const firstUid = await uidInSidebar(first);

    await first.getByPlaceholder("Что нового? Добавьте заметку...").fill("Synthetic alpha journal entry");
    await first.getByRole("button", { name: "Сохранить заметку" }).click();
    await first.getByText("Synthetic alpha journal entry", { exact: true })
      .waitFor({ timeout: 30000 });

    await first.reload({ waitUntil: "domcontentloaded" });
    await first.getByRole("button", { name: "Synthetic Alpha" })
      .waitFor({ timeout: 30000 });
    const afterReloadUid = await uidInSidebar(first);
    if (firstUid !== afterReloadUid) {
      throw new Error("UID changed after reload of the same browser context");
    }
    await first.getByText("Synthetic alpha journal entry", { exact: true })
      .waitFor({ timeout: 30000 });
    if (await first.getByText("Добро пожаловать!").count()) {
      throw new Error("Existing synthetic profile unexpectedly triggered onboarding");
    }

    const secondContext = await browser.newContext();
    await protectBrowser(secondContext);
    const second = await secondContext.newPage();
    await second.goto(BASE, { waitUntil: "domcontentloaded" });
    await profile(second, "Synthetic Beta");
    const secondUid = await uidInSidebar(second);
    if (secondUid === firstUid) {
      throw new Error("Different browser contexts shared an anonymous Auth UID");
    }
    await second.getByText("Записей пока нет.").waitFor({ timeout: 30000 });
    if (await second.getByText("Synthetic alpha journal entry", { exact: true }).count()) {
      throw new Error("Synthetic Beta can see Synthetic Alpha's journal");
    }

    await secondContext.close();
    await firstContext.close();
    console.log("PASS: synthetic anonymous UID persists across reload");
    console.log("PASS: synthetic profile and journal survive reload");
    console.log("PASS: second browser has independent UID and no first-user records");
    console.log("PASS: browser network confined to localhost demo ports");
  } finally {
    await browser.close();
  }
}

async function main() {
  verifyEmulatorProcess();
  const config = {
    apiKey: "synthetic-qa-only-key",
    authDomain: PROJECT + ".firebaseapp.com",
    projectId: PROJECT,
    appId: "1:12345:web:synthetic"
  };
  const env = {
    ...process.env,
    VITE_FIREBASE_CONFIG: JSON.stringify(config),
    VITE_APP_ID: "reflect-8fdc8",
    VITE_USE_FIREBASE_EMULATORS: "true",
    HOST: "127.0.0.1",
    PORT: "3100",
    BROWSER: "none",
    CI: "true"
  };
  const server = spawn("npm", ["start"], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let lastOutput = "";
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => {
      lastOutput = (lastOutput + chunk.toString("utf8")).slice(-5000);
    });
  }

  try {
    await awaitReactServer(server);
    await runBrowserSuite();
  } catch (error) {
    console.error("Demo E2E failed:", error.message);
    // Contains build diagnostics for dummy demo config only.
    console.error("Vite output (synthetic environment):", lastOutput);
    throw error;
  } finally {
    try { process.kill(-server.pid, "SIGTERM"); } catch (error) { /* already stopped */ }
  }
}

main().catch(() => { process.exitCode = 1; });
