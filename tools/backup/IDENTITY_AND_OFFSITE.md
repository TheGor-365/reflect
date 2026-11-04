# Stage 00 — Private Auth / Firestore UID mapping and protected archive

Status: live Firestore contents were restored and compared in the owner's **local Firestore Emulator** on 2026-11-04 (26 documents; typed-field readback MATCH). The separate Firebase Auth export contains 11 accounts. **Identity continuity and second encrypted copy are pending.** This runbook never sends private data to GitHub or ChatGPT.

## 1. Offline identity mapping — only aggregate counts

From `~/reflect-backup-work/backup-tools` on Linux:
```bash
git pull --ff-only
source .venv/bin/activate
python -m unittest discover -s tests -p 'test_reflect_*.py' -q
python -m tools.backup.check_identity_links \
  --firestore "$HOME/reflect-backup-work/private/reflect-firestore-2026-11-04.jsonl" \
  --auth "$HOME/reflect-backup-work/private/reflect-auth-2026-11-04.json"
```

The tool:
- verifies the Firestore archive SHA-256, manifest, per-collection counts and relative paths **before parsing UIDs**;
- requires that the Auth file is private (regular file, mode 600 in a mode-700 directory);
- maps document paths `artifacts/reflect-8fdc8/users/{uid}/...` to `localId` in the Auth export;
- prints **counts only**, not UIDs, names, diary contents, emails or tokens;
- does not contact Firebase or modify any environment;
- marks `auth_browser_sessions_restored=false` even if every UID matches. Anonymous sessions cannot be recreated by restoring Auth JSON alone.

If `firestore_scopes_without_exported_auth` is greater than zero, do not assume data is lost or delete anything. Record the discrepancy and investigate before auth changes.

## 2. Encrypted off-device backup — human-controlled

The source JSONL and Auth export are sensitive. Keep plaintext only in `$HOME/reflect-backup-work/private` and **never inside git**, public/AI-indexed Drive folders, CI logs, or chat. On Linux, first check whether GnuPG is installed (`gpg --version`). Use a long unique passphrase and retain it in a password manager; NEVER paste it into a chat or shell command argument.

This example writes an encrypted bundle outside the Git repository:

```bash
cd "$HOME/reflect-backup-work/private"
umask 077
set -o pipefail
tar -cf - \
  reflect-firestore-2026-11-04.jsonl \
  reflect-firestore-2026-11-04.manifest.json \
  reflect-auth-2026-11-04.json \
  | gpg --symmetric --cipher-algo AES256 \
        --output "$HOME/reflect-backup-work/reflect-private-2026-11-04.tar.gpg"
chmod 600 "$HOME/reflect-backup-work/reflect-private-2026-11-04.tar.gpg"
sha256sum "$HOME/reflect-backup-work/reflect-private-2026-11-04.tar.gpg"
```

Verify **decryption and archive readability** locally:

```bash
gpg --decrypt "$HOME/reflect-backup-work/reflect-private-2026-11-04.tar.gpg" \
  | tar -tf -
```

This should list three expected filenames, never individual personal entries. If decrypt fails, do not claim the encrypted bundle is usable. Copy **only the encrypted bundle** to a separately controlled storage device or restricted private Drive location that is not shared with AI indexing or external collaborators. Verify copy checksum at the destination before marking the off-device step done. Do not upload decrypted originals.

## 3. Identity and restore gates

- [x] 26 Firestore documents recovered to separate local demo Firestore Emulator and all restored field values verified by read-back.
- [x] 11 Firebase Auth account records exported to private JSON.
- [ ] Offline UID association counts reviewed, without revealing identifiers.
- [ ] Usable second encrypted off-device copy verified.
- [ ] Test anonymous-account persistence and secure upgrade/link flow before altering existing auth settings. Firestore recovery alone does not reestablish browser sign-in; old `createTime/updateTime` are server-managed and not preserved by the REST restore tool.
- [ ] Review client Security Rules/rollback on a separate local emulator test before production auth/data changes.

GitHub PR #2 is tools-only and remains draft. Do not merge or deploy it as a production data migration.
