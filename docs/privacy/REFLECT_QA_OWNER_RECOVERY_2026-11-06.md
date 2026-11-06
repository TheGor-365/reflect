# Reflect 2.0 — Stage 03E: Owner archive verification and DEMO-only restore

Date: 2026-11-06. Draft PR #21, stacked on #20. **No production deployment, no account deletion, no real data import.**

## Purpose

PR #18 delivers a portable JSON **copy** of the current UID's five known Firestore data areas. The file is unencrypted and does not inherently prove integrity or historical authenticity. Stage 03E adds a conservative browser inspector and demonstrably working missing-record restore into **only** the isolated local Firebase Emulator.

## Owner UI

Account & Login -> "Копия моих данных" -> expand **"Проверить архив и восстановить тестовые записи"**.

- Select JSON locally. The file stays in browser memory; Reflect does not upload, cache in localStorage, send to AI, or print the note text in the interface or logs.
- Structural validation checks the format marker, version 1, the exact current Auth UID and Reflect app namespace, all four supported collections, profile ID, document IDs, duplicate entries, typed timestamps/dates/geopoints/bytes/references, prototype-pollution names, and nested shape. UI shows only counts and a warning that the file is unencrypted and not cryptographically authenticated.
- The **restore** button is not rendered outside the dedicated `demo-reflect-auth-qa` localhost emulator with `VITE_USE_FIREBASE_EMULATORS=true`; real production can at most inspect the archive.
- For small archives (max **100 documents / 1 MiB**), owner must explicitly check acknowledgement, type **ВОССТАНОВИТЬ**, and accept a separate browser confirmation. Otherwise it is read-only preview.

## Conflict safety

`src/security/ownerDataRecovery.js` uses a **single Firestore transaction**. It reads all targeted documents before any write. If a target already exists with matching normalized fields, it is untouched. If any target already exists but differs, the entire transaction aborts **with zero writes**; never overwrites or deletes. Missing documents alone are created, retaining their original document IDs and supported typed fields. Firestore Rules still enforce the signed-in UID at the server. No password, private Firebase token, or backend secret enters JSON.

The source file must have matching current UID and app namespace. Fields with unsupported/unsafe shapes, external reference paths, unexpected collections, invalid IDs, or oversized records cause a controlled failure. The parser enforces depth and data size limits; missing content is not silently omitted.

## Evidence

- 164 Vitest tests across 24 files and 9 Node QA tests plus TypeScript and build SUCCESS on functional branch (verify exact SHA in GitHub Actions before final acceptance).
- Isolated Chromium+Auth+Firestore browser E2E: export synthetic owner diary, mood and profile; delete *one and only one* known synthetic diary note from its sandbox, restore it from local JSON via UI, verify exactly one newly created note and Firestore readback; another guest UID cannot import that owner's JSON. All other previously existing data remain unchanged.
- Existing encrypted local drafts, week mood review, account scroll UX, known-path server rules and private Firebase snapshot export/import remain under regression tests.

## Limitations and release gates

1. **Never upload or disclose a real archive**. It may contain identifiable private diary text. The file is **not encrypted or signed**. A forged archive with matching UID can introduce fabricated *new* entries into a DEMO environment; this is why production recovery is disabled.
2. Not yet an end-to-end disaster recovery procedure for real accounts: production account recovery, email verification, all future collections/assets, backup integrity, longer transaction/paging support and staging Firestore Rules remain unverified.
3. Existing Firebase emulator started from PR #16 still uses old Rules until deliberately restarted from a PR #20+ worktree. Vite-only switch is not a Rules deploy. Don't restart without a fresh versioned snapshot and explicit confirmation of the Test UID/profile.
4. Current owner Test at test@example.com is a synthetic QA login. The account password must **never** be added to GitHub, Drive, test fixtures or any check-in file.

## Owner continuation

The owner has already installed `~/reflect-stage20-qa` at `02011fa`, confirmed Vite `127.0.0.1:3100` and prior private `qa:state -- save && status`; screenshot shows the connected Test profile and improved thin themed scrollbar. Avoid re-registering Test.

Next: confirm latest private snapshot is still available and update it after any recent synthetic edits; stop **only Vite**; fetch PR #21 and add `~/reflect-stage21-qa` as a separate worktree; `npm ci` and run Vite with the same demo env against unchanged Auth/Firestore. Inspect the new collapsed panel with a **synthetic** downloaded JSON only; do not share that file. Once QA accepted, plan a clean controlled emulator stop/start using new worktree's Rules and verify the exact same UID and Firestore documents after import.

The original production encrypted backup / restore emulator on port 18080 and all production deployments remain untouched.
