#!/usr/bin/env node
"use strict";
// Synthetic-only test against a fixed LOCAL demo Firestore Emulator.
// NEVER use this with production credentials, user data, or non-loopback hosts.
const fs = require("node:fs");
const path = require("node:path");
const { doc, getDoc, setDoc, deleteDoc } = require("firebase/firestore");
const {
  assertFails, assertSucceeds, initializeTestEnvironment
} = require("@firebase/rules-unit-testing");

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:18080") {
    throw new Error("Refusing tests: expected 127.0.0.1:18080 demo emulator only");
  }

  const rules = fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8");
  const environment = await initializeTestEnvironment({
    projectId: "demo-reflect-restore",
    firestore: { host: "127.0.0.1", port: 18080, rules }
  });

  try {
    const alice = environment.authenticatedContext("SYNTHETIC_ALICE");
    const bob = environment.authenticatedContext("SYNTHETIC_BOB");
    const guest = environment.unauthenticatedContext();
    const aliceDb = alice.firestore();
    const bobDb = bob.firestore();
    const guestDb = guest.firestore();

    const ownNote = "artifacts/reflect-8fdc8/users/SYNTHETIC_ALICE/diaryNotes/SYNTHETIC_N1";
    const ownProfile = "artifacts/reflect-8fdc8/users/SYNTHETIC_ALICE/profiles/userProfile";
    const bobGoal = "artifacts/reflect-8fdc8/users/SYNTHETIC_BOB/goals/SYNTHETIC_G1";

    await assertSucceeds(setDoc(doc(aliceDb, ownNote), { title: "synthetic-note" }));
    await assertSucceeds(getDoc(doc(aliceDb, ownNote)));
    await assertSucceeds(setDoc(doc(aliceDb, ownProfile), { name: "synthetic" }));
    await assertSucceeds(setDoc(doc(bobDb, bobGoal), { name: "synthetic-goal" }));

    await assertFails(getDoc(doc(bobDb, ownNote)));
    await assertFails(setDoc(doc(bobDb, ownNote), { title: "forbidden" }));
    await assertFails(deleteDoc(doc(bobDb, ownNote)));
    await assertFails(getDoc(doc(aliceDb, bobGoal)));
    await assertFails(setDoc(doc(aliceDb, bobGoal), { name: "forbidden" }));
    await assertFails(getDoc(doc(guestDb, ownProfile)));
    await assertFails(setDoc(doc(guestDb, ownNote), { title: "forbidden" }));
    await assertFails(getDoc(doc(aliceDb, "other/confidential")));

    process.stdout.write(
      "PASS: 12 synthetic owner-isolation checks (4 allowed, 8 denied) in demo emulator only\n"
    );
  } finally {
    await environment.cleanup();
  }
}

main().catch((error) => {
  console.error("Security Rules synthetic test FAILED:", error?.message || String(error));
  process.exitCode = 1;
});
