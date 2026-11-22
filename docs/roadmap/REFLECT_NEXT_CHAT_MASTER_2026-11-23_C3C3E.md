# REFLECT 2.0 — MASTER HANDOFF FOR NEXT CHAT (2026-11-23, C3C3e)

> This is an evidence-backed handoff, not authorization to deploy, merge or edit existing dirty source. Read the latest live tracker/status first; later owner terminal output supersedes this record.

## COPY AS THE FIRST MESSAGE IN THE NEW CHAT

Ты — продолжающий технический руководитель Reflect 2.0. Продолжаем **существующий** React/Vite + Firebase Auth/Firestore + Node.js/Railway/xAI проект, не начинай заново. Основной результат: коммерчески пригодный source-backed continuous reflection, долговременная память, Mindspace, подтверждённые пользователем факты/коррекции, контролируемый egress, без нарушения приватности и денежной идемпотентности. Общайся на русском, в каждой итерации 1–3 действия → пользовательский терминальный лог/скриншот → проверка → GitHub checkpoint.

### 1. Где читать источник истины ПЕРЕД предложением действий

**GitHub**: https://github.com/TheGor-365/reflect

**Документационная ветка, НЕ ветка для деплоя**: `docs/reflect-live-roadmap-2026-11-21`.

Открой ВЖИВУЮ в таком порядке:
1. Последние комментарии [Issue #136 — live tracker](https://github.com/TheGor-365/reflect/issues/136), особенно checkpoint C3C3d и новый C3C3e. Проверь наличие более свежих сообщений относительно даты handoff.
2. [`docs/roadmap/REFLECT_STATUS_LATEST.md`](https://github.com/TheGor-365/reflect/blob/docs/reflect-live-roadmap-2026-11-21/docs/roadmap/REFLECT_STATUS_LATEST.md) — читай **последние датированные разделы снизу**, не только старый заголовок.
3. [`docs/roadmap/REFLECT_MASTER_ROADMAP_TO_PRODUCTION_MVP.md`](https://github.com/TheGor-365/reflect/blob/docs/reflect-live-roadmap-2026-11-21/docs/roadmap/REFLECT_MASTER_ROADMAP_TO_PRODUCTION_MVP.md) — от `## 0. START PROMPT`, затем `## 1–4`, `## 5–8` и поздние датированные обновления. Во вступлении ещё есть **исторический** `CURRENT STOP` за 21 ноября и `Revision` за 22 ноября, их нельзя принимать за актуальную точку.
4. [`docs/privacy/REFLECT_C3C3D_CONTROL_REPRO_AND_C3C3E_SOURCE_BOUNDARIES_2026-11-23.md`](https://github.com/TheGor-365/reflect/blob/docs/reflect-live-roadmap-2026-11-21/docs/privacy/REFLECT_C3C3D_CONTROL_REPRO_AND_C3C3E_SOURCE_BOUNDARIES_2026-11-23.md).
5. Этот файл-handoff. В Google Drive отдельный документ checkpoint `https://docs.google.com/document/d/1ghbp5di6VR_L0S20qqAonwcRewvSiO4onpfzP3Dbehg/edit` — дополняет, но не заменяет GitHub/локальные логи.

**Главное различие**: LOCAL состояние — только реальные последние логи и точные локальные файлы владельца; GitHub docs — только опубликованные документы, не backend deployment; staging/production — только подтверждённые SHA runtime и тесты. Чаты не синхронизируют локальные деревья автоматически.

### 2. Точное окружение и защита

- Backend Linux: `~/reflect-r10-railway-review`, **dirty detached HEAD** `1c4c121e0e449f1a9360e4fb4588dcf58352e699`.
- Frontend Linux: `~/reflect-r9-2-workflow`, грязная отдельная ветка `feat/reflect-r9-2-workflow-2026-11-18`; baseline `6f20f8b31f91729b569f1c4d8a0465e865385811`. Не считай фронтенд автоматически синхронизированным с backend.
- Node `22.23.4` (asdf), Firebase CLI локально `15.34.2`, OpenJDK `21.0.12.1`.
- Оригинал `server/hosted/firestore.rules`: pinned **Git blob SHA `2cc47d40020e349edc6617a2f9e03578efe39799`**. Он **содержит подтверждённые проблемы**, но пользователь не давал разрешения исправлять/деплоить текущий production.
- **Изолированный** кандидат C3C3b `server/hosted/firestore.pg04d4b3c3c3b.compat.rules`: SHA256 `780bee8885d3ff4ef66153d6aaa4c81fd2add72d039c361a1314a878839dc9b2`; это тестовый локальный файл, а не live Rules.
- Беречь грязный `server/railway/index.cjs`, `server/privacy/contextConsent.cjs`, `server/memory/*`, фронтенд, untracked-модули, snapshots. Запрещены без явного согласия `git reset --hard`, `git clean`, `git add -A`, `git restore` по широкому шаблону, merge/commit/push исходников, конфиги/секреты/env, удаление данных, production/staging/Firebase Rules/Railway deploy, включение provider/платный xAI.
- Все новые тесты только synthetic `demo-*` Firestore Emulator, loopback, исключённые cloud credentials, scoped exact cleanup **без recursiveDelete**, никаких настоящих ID/записей, историй чатов, логов с токенами.

### 3. Последние доказанные результаты (НЕ повторять)

1. **C3C1 original Rules**: genuine client baseline **20/20 observations**, **7/7 запрещённых privacy-политикой owner writes ошибочно ALLOW — EXPECTED_RED**. Не признавать оригинал безопасным.
2. **C3C2 candidate**: genuine client Rules **40/40 PASS**, 7/7 прежних unsafe DENY, но регрессия реального owner CRUD (`goals`, `moods`, `diaryNotes`, `profiles`, `aiSettings`), не выпускать.
3. **C3C3a**: upload владельца metadata-only source inventory, SHA256 `43ad78a4069c3b56927d525b0ba83cf5f7a597cdad0e4db6bf408dc18e652e3e`, проверен; 200 frontend файлов, 86 Firestore client occurrences, 37 collection hints, 65 dynamic review entries. Это не AST-доказательство полного покрытия.
4. **C3C3b candidate v2**: genuine client Firestore Emulator **80/80 PASS, 7/7 prohibited erasure/post-fence writes DENY**, шесть source-подтверждённых owner коллекций в тестах ALLOW (`sessions`, `goals`, `moods`, `diaryNotes`, `profiles`, `aiSettings`), scoped cleanup PASS, exit0. Реальный browser/Auth/AppCheck/field-level compatibility и production — НЕ проверены.
5. **C3C3c**: четыре типа erasure-маркеров в отдельном demo Emulator **4/4 PASS**, coverage HTTP200, cleanup PASS. `evaluation error` при ожидаемом DENY; sourcePosition audit C3C3c2 отнёс семь `undefined` к строкам 28:3, 29:2, 33:2 (публичный/приватный `!exists()`, allow write call site). Не путать undefined с отказом с ошибкой исполнения.
6. **C3C3d independent minimal control**: genuine client test **4/4 PASS**, `NO_MARKER=ALLOW`, `MARKER_EXISTS=DENY` (валидный `!exists()` + generic `evaluation error`), `LITERAL_FALSE=DENY` (обычный `false`), `FOREIGN_OWNER=DENY` (обычный `false`); ruleCoverage HTTP200, exact cleanup PASS, exit0. Это воспроизводит диагностическую неоднозначность Emulator, **не** означает, что исходные правила доказанно чисты. Не ослабляй erasure fences ради исчезновения лога.

**Privacy Gate = BLOCKED; `CLEAN_EVAL=NOT_CERTIFIED`**. Открыты B2.1/B2.3, PG01–08, локальные реальные Admin writers и erasure transactional guards, field-level/dynamic CRUD, browser Auth/AppCheck+owner exact grant+approval, mixed workers, staging rollback, provider/cost tests. Провайдер history OFF.

### 4. СЕЙЧАС C3C3e — последний владелец прислал READ-ONLY метаданные трёх локальных untracked Memory-модулей

`src/features/Memory/topicEvidenceContract.js`:
- FOUND, **156 строк**; SHA256 **`e0e704d3fcb21753af0f5d68db6fd8e0a4f85654b595f2837e5b66029739377e`**.
- direct `firebase/firestore`=0; `firebase-admin`=0; named Firestore API-call hints=NONE; literal keyword hits `diaryNotes:2, goals:2, sessions:3`.

`src/features/Memory/topicMemoryAudit.r102c.js`:
- FOUND, **210 строк**; SHA256 **`91e007d14c30d9e022e4920c78ad57366ac97eeae617427a2c44ead08b9c1d0e`**.
- Firebase client/admin references=0; direct Firestore API-call hints=NONE; `sessions:5`.

`src/features/Memory/topicMemoryProjection.js`:
- FOUND, **305 строк**; SHA256 **`f622336a705bc12eb5a8b347fe27f3f4d903e0ff6a820dbe8c399420081a3cfa`**.
- Firebase client/admin references=0; direct Firestore API-call hints=NONE; `sessions:4`.

User's code printed `PASS: C3C3e read-only Memory metadata inspection`, `SOURCE_CONTENT_PRINTED=NO`. **Это лишь статические строковые совпадения**; 0 прямых вызовов/импортов **не означает отсутствия косвенных** Firestore side effects через импортируемые API и consumers; также не доказывает, что модули используются в runtime. Эти три файла отсутствуют в закреплённом удалённом HEAD. НЕ публиковать их содержимое в GitHub без отдельного согласования.

### 5. Следующий проверяемый подэтап — C3C3e1: dependency / trust boundary без изменений

**Сначала** прочитай последнюю GitHub документацию/issue, убедись, что новые метаданные уже отражены, и не повторяй C3C3d или C3C3e. Сверь с последним локальным выводом.

**Далее одно безопасное действие**: предложи адресную read-only команду, которая по этим трём файлам и их релевантным consumers определяет только **имена относительных import/export путей, вызовы переданных store/db/API объектов, агрегированные counts** и SHA/строки. Не раскрывай source bodies, пользовательские данные, absolute home paths, .env, секреты. Отдельно проверить направление зависимостей: эти файлы сами вызывают Firestore, получают DB через dependency injection, вызываются из persisted ledger/sessions или только чистые преобразователи? Если статических метаданных мало, запрашивай короткие обезличенные адресные выдержки кода, а не весь worktree.

**Потом** построить матрицу `writer → collection/path → data fields → owner/source authorization → trusted/untrusted input → Rules/Admin/transaction`. Критичен `aiSettings/preferences`: это owner-editable **preferences, не grant**; настоящие `_reflectAiPrivate/.../contextGrants`, approval receipts и история должны проверяться сервером. Проверить client forged fields / overwrite sensitive data / cross-owner, но опираться на реальные field schema и код, не выдумывать имена полей. Для памяти `memoryEvents`, `memoryProjections`, `memoryTopics`: клиентский pre-fence write даже в рамках owner может иметь вопрос доверия к evidence/projections; проверить provenance и source admission в отдельном gate. C3C3b разрешает широкие операции внутри подтверждённых коллекций: это ещё не field-level least-privilege и не продуктовая безопасность.

**Параллельный, следующий по Master roadmap блокер** после client field audit — R10.3-C2C2-B2.1 writer census текущего грязного backend (`hostedBudget.cjs`, `contextConsent.cjs`, `aiTurnRecovery.cjs`, `server/memory/*`, `server/railway/index.cjs`) и B2.3 retention, затем PG01–08. Он не закрыт на основании синтетических тестов и старого GitHub исходника.

После одного реального шага собери короткий checkpoint и обнови **Issue #136 + STATUS_LATEST + Master Roadmap**, а при значительном этапе — и Drive. GitHub code SHA для локальной dirty работы указывай `LOCAL_ONLY`; GitHub docs SHA — только документальный commit. Не приписывай реальный deploy.

### 6. Формат взаимодействия и запрет на ложный PASS

Перед действием укажи ID/цель/файлы/ожидаемые PASS и риски, дай **1–3 команды или действия**, затем дождись вывода пользователя. Не обещай фоновую работу, не требуй повторных регистраций или перекоммитов, не проси .env/ключи/токены и не делай дорогостоящих тестов без явного scope. Для синтетических кейсов отделяй `UNIT_PASS / EMULATOR_PASS / BROWSER_PASS / STAGING_ACCEPTED / PROD_ACCEPTED`. Приватные/удалённые данные только по законному user-approved scope; всегда fail-closed для любых недоказанных privacy и billing путей.

Начни с краткого: **«C3C3e metadata PASS; следующий C3C3e1 — безопасный dependency graph + writer/field trust audit; Privacy Gate BLOCKED»**, затем подтверди актуальность GitHub checkpoint и предложи **одно** read-only локальное действие. Не запускай код, не меняй Rules, не разворачивай Railway без разрешения.
