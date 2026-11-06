# Reflect 2.0 — Owner data export (Stage 03B, 2026-11-06)

**Implementation:** Draft PR #18, stacked on PR #17. **No production deployment.**

## What the owner can download

The Account & Login dialog exposes **«Скачать мои данные (JSON)»** to the currently authenticated Firebase UID (including a guest UID). Only an explicit action and a browser confirmation start the read. The client makes **server-confirmed** Firestore reads for these five known storage areas under `artifacts/{appId}/users/{uid}`:

1. `profiles/userProfile` (single optional document).
2. `sessions` (all returned documents, including stored message histories).
3. `goals` (including subtasks, reflections and checklist fields).
4. `moods` (including comments and intensity).
5. `diaryNotes` (including entries and timestamps).

The exported JSON has `format = "reflect-owner-data-export"` and `schemaVersion = 1`, the current UID/app namespace, a timestamp, and the document IDs plus their field values. Firestore Timestamp, Date, GeoPoint, Bytes and DocumentReference values are marked with explicit types. Firebase access tokens, passwords, recovery codes, provider secrets and application encryption keys are **never** requested or included.

## Safety properties

- The action does not write to Firestore, change Auth sessions, call an AI provider, or store plaintext in Reflect localStorage.
- Firebase Authentication and Firestore Rules enforce the current UID's document paths. A detected UID switch, failed collection read, unsupported field, duplicate document ID or result exceeding **25 MiB** aborts without delivering a partial archive.
- No browser file is created until all five data areas have been fetched and validated. The user must approve a specific warning describing the **unencrypted JSON**.
- The app triggers a browser download. It **cannot verify whether the user actually saved the file**, whether it was backed up, or whether device storage is encrypted.
- Fetches are sequential and **not a transactional cross-collection snapshot**. Concurrent edits may be reflected differently across sections.
- A copy can contain extraordinarily sensitive notes and profile information. Store offline or in a private encrypted vault; never commit to Git, attach to a support ticket or index via an external AI.
- No restore or delete operation exists in this stage. A JSON copy is not a substitute for the separately verified encrypted Stage-00 backup/recovery workflow.

## Acceptance and future work

Unit tests validate owner scope, field preservation, unsupported values, failed reads, changing UID, double-click prevention and cancellation. Isolated Chromium E2E creates two synthetic UIDs, downloads their respective JSON files, verifies the first UID's diary and mood, and confirms the second UID's download does not include the first's documents. E2E also continues to validate Auth+Firestore emulator snapshot import/export.

Before *any* destructive account deletion: (1) add a tested and independently usable restore path or strongly documented portable reader, (2) establish a complete account data inventory beyond the five current collections (including future server-side AI and assets), (3) verify Firestore Rules under production-equivalent staging and separate real-user KYC/Auth recovery, and (4) secure explicit, revocable confirmation. Do not assume deleted anonymous accounts can be recovered through email.

## Owner QA

Keep the already running `demo-reflect-auth-qa` emulators on 9099/18081. After the local QA snapshot is successfully saved, switch **only the Vite worktree** to the latest PR #18 and open **Аккаунт и вход → Копия моих данных**. For the first manual trial, use a **synthetic account only** and open the download locally to inspect the five known areas. Avoid sending this file to the chat; a screenshot of the status/error text is sufficient.

**Known non-release gate:** a quarantined `www.google.com` image request appeared in isolated Auth browser QA; the test blocks it. Do not mark third-party network privacy proven until the request origin is investigated.
