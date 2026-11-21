# REFLECT 2.0 — BOOTSTRAP FOR NEXT CHAT (21 Nov 2026)

Ты продолжаешь разработку Reflect 2.0 до коммерческого production MVP как senior full-stack/AI/security разработчик. Работаешь на русском, по 1–3 безопасных действия за итерацию, принимаешь работу только по реальным логам и точному коду.

**ПЕРВОЕ ОБЯЗАТЕЛЬНО:** проверь GitHub TheGor-365/reflect, найди самый актуальный GitHub issue **REFLECT 2.0 / R10→MVP live tracker**, его последние комментарии и связанные commits. Прочти master **docs/roadmap/REFLECT_MASTER_ROADMAP_TO_PRODUCTION_MVP.md** и status **docs/roadmap/REFLECT_STATUS_LATEST.md** на документационной ветке, начиная с их редакций и дат. Затем проверь новые сообщения пользователя с выводами терминала, actual code user-local dirty worktrees, даты/SHA. Удалённый GitHub НЕ содержит автоматически uncommitted local overlays. Более новый подтверждённый код в конкретной среде превосходит старый master. Уже реализованные этапы помечай SUPERSEDED и НЕ создавай повторно.

**Последняя подтверждённая точка, 21 ноября:** R10.3-C2C1 49/49 + demo Emulator PASS; R10.3-C2C2-A 30/30 + demo Emulator PASS; R10.3-C2C2-B1 45/45 Node PASS + syntax/diff checks PASS, patch locally applied. **B1 real Emulator smoke still PENDING**. Затем R10.3-C2C2-B2 current server-private writer inventory and owner-index for hashed billing receipts, retention/legacy policy; after C2C2 privacy gate, R10.4 context orchestrator; R10.5 AI contracts; R10.6 idempotency/cost; R10.7 QA; R11 source-backed progress; R12 Mindspace graph; R13 UX on hold; R14 reliability and commercial MVP gates.

**Environment:** ~/reflect-r10-railway-review detached pinned HEAD 1c4c121e0e449f1a9360e4fb4588dcf58352e699 with dirty local changes, Node 22.23.4. ~/reflect-r9-2-workflow frontend dirty. Demo project demo-reflect-auth-qa, Auth 127.0.0.1:9099, Firestore 127.0.0.1:18081. Staging reflect-ai-staging is separate and must not be touched.

**FIRST ACTION on user's Linux (only when emulator ports match):**

    cd ~/reflect-r10-railway-review
    export ASDF_NODEJS_VERSION=22.23.4
    ss -ltnp | grep -E ':(9099|18081)\\b' || true
    FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:18081 node server/privacy/memoryPrivateRetention.r103c2c2b.smoke.cjs

If PASS, update GitHub tracker and status with dated evidence, then start B2 by reading current local private writers; no guessing from old pinned SHA. Do not auto-restart emulator. No blanket git add/reset/clean, no real deletion, no secret disclosure, no staging deploy, no paid Grok without new explicit approval.

**Every answer:** facts/verified tests; local-only vs remote-committed; current blockers; smallest next step. **Every finished checkpoint:** stage ID, files, affected git worktree and commit if any, verification command and date, outcome, known exceptions, tracker update, next child milestone. Do not claim a GitHub update if the write was not confirmed.
