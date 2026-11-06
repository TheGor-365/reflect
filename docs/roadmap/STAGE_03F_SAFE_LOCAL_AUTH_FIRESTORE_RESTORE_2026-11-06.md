# Reflect 2.0 — Stage 03F: safe local Auth + Firestore restore gate (2026-11-06)

**State:** implementation Draft, stacked on Stage 02F PR #23. This work does **not** run on the owner's Linux machine, restart an emulator, prove a restored UID, merge to main, or deploy Firebase Rules.

## Existing verified context and blocker

- Owner's local URL 127.0.0.1:3100 shows Stage 02F compact Goals and bottom Session composer as desired at desktop. No user 390px light/dark or actual Firestore create verification yet.
- Owner's emulator setup: Firebase demo project `demo-reflect-auth-qa`, Auth 127.0.0.1:9099, Firestore 127.0.0.1:18081, namespace `reflect-8fdc8`. Local Test account and original UID MUST survive. Vite runs separately on 3100; another restored/backup Firestore 18080 must remain untouched.
- The recorded prior attempt started a **second** emulator while 9099/18081 were occupied; it failed to bind. This is not evidence that the Test account was restored from a backup.
- A prior user-exported plaintext JSON only contained a profile and empty collections; it is neither an Auth export nor a proof of restored notes. Do not use it to overwrite the Test account. Do not upload that file.

## Engineering change

The private demo-only `npm run qa:state` utility now has fail-closed guards:

1. `npm run qa:state -- save` verifies the exact running local Auth/Firestore hub and checks the newly created private snapshot contains an actual Auth payload plus Firestore export metadata, not just a syntactically valid `firebase-export-metadata.json`. If missing, it returns an error and the live emulators stay running.
2. `npm run qa:state -- preflight` is **read-only**. It verifies the newest private Auth/Firestore snapshot contains both payloads. It refuses relative-path escapes and symlink components; it does not decode, print, modify or upload private data.
3. `npm run qa:state -- start` refuses empty/malformed backups and refuses occupied QA ports 9099/18081 **before** spawning Firebase. It imports only the most recent verified private snapshot. An explicitly named `start-empty` is reserved for entirely new demo QA when **no** existing snapshot exists. Never use it for the current Test account.
4. Existing `status` and `latest` report verified payload presence rather than trusting a manifest-only file. Export-on-exit still writes to a fresh private path (not the existing imported archive).
5. Tests cover missing payload, malformed path, symlink, occupied port, normal import and explicit empty-start contracts with synthetic fixtures and ephemeral listening ports. A Node QA test never binds the owner's fixed 9099/18081.

These checks do **not** validate the semantic contents of Firestore binaries or the number of Auth accounts, and do not prove the imported UID is identical. A successful preflight is a prerequisite, **not** a completed restore test.

## Next safe owner-side acceptance (never automatic)

1. On the running Stage 02F Test app, create a clearly **synthetic** small journal note and observe its presence after reload. Do not expose private note text/UID/password. Keep Vite 3100 and Auth/Firestore 9099/18081 running.
2. In a spare Linux terminal, from an explicit new Stage 03F worktree at the exact PR head and Node 22, run `npm ci && npm run qa:state -- save && npm run qa:state -- preflight`. Both must pass **before** any stop. Show only a screenshot of the PASS / ERROR lines. If either fails, leave running emulators alone.
3. Only with user approval and a passing preflight: identify the exact terminal of the **existing** QA emulator, cleanly Ctrl+C that one process, launch `npm run qa:state -- start` once and verify the **same existing Test login**, same UID and same synthetic diary note after reload under scoped Firestore Rules. If the process reports a conflict or missing archive, do not run `start-empty`, re-register, clear worktrees or change ports.

## Gates not yet satisfied

- Local same-UID Auth + Firestore snapshot import and actual scoped Rules reload: **not verified**.
- Local passphrase recovery, personal-data recovery, production-equivalent staging migration/legacy-field Rules review: **not verified**.
- Stage 04 paid/opt-in server AI backend and Stage 05 accessibility/reversible release remain later stages.

No production deploy, no main merge, no Firebase project creation, no private records or credentials added to this branch.

Reference: [Firebase Emulator Suite import/export documentation](https://firebase.google.com/docs/emulator-suite/install_and_configure), especially `--import`, `--export-on-exit` and overwrite risk.
