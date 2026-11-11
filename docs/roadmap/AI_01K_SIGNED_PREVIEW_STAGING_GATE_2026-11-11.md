# Reflect 2.0 — AI-01K: подписанный предварительный просмотр контекста

**2026-11-11 | Draft implementation / No deploy / No Grok context dispatch**

## Проверенная основа

- AI-01I: в реальном браузере на Firebase Hosting staging владелец выполнил `grant → list/readback → revoke → list/readback`; последний показанный серверный список пуст. Зафиксировано в Draft PR #56.
- AI-01J: Draft PR #57, server-only `sessionContextPreview.cjs`, 57/57 тестов, Firebase Emulator PASS. Один owner-scoped `sessions/{sourceId}` с `chatHistory`; два независимых проверки действующего приватного grant до/после серверного чтения. Текст ещё не показывался через HTTP и не передавался Grok.
- Live Railway staging на `b247312863c2593563f5f53bc01aaa6ca994e535`, consent API включён. Рабочий `/v1/ai/reply` читает только текущее сообщение. Никаких реальных grant на момент последнего скриншота не было.

## Что реализовано в AI-01K

### 1. Новый *отдельный, выключенный по умолчанию* HTTP endpoint

- `POST /v1/privacy/context-preview` — только staging, только точный Origin `https://reflect-ai-staging.web.app`, без query-строки, JSON <= 512 байт и единственный набор ключей `{grantId, sourceId, scope:"session-turns"}`.
- Firebase Auth ID token с проверкой отзыва; одноразовый Firebase App Check с **явным** `alreadyConsumed === false` и верным appId; серверная проверка прав аккаунта (entitlement).
- UID берётся **только** из проверенного Auth. Проверка consent на сервере до чтения и после него. Без действующего гранта, на чужой source, после revoke, без entitlement или при ошибке Firestore — отказ.
- Дополнительная приватная транзакционная квота `_reflectAiPrivate/reflect-8fdc8/contextPreviewQuotas/{uid}`: максимум **20 preview в UTC-час на UID**, атомарно между Railway-инстансами. Квота списывается до чтения. Браузерный доступ к приватному пространству запрещён staging-source Rules.
- Ответ только текущему аутентифицированному браузеру: не более 4 последних сообщений (только user/assistant), 700 UTF-8 байт на сообщение, 2400 суммарно, count/truncated, SHA-256 от конкретного массива и метаданных. Нет профиля, дневника, целей, чужих сеансов, секретов, UID, серверных путей.
- `Cache-Control: no-store, private`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, строгое CORS, ошибки только по безопасному коду. **Endpoint никогда не вызывает модель.**
- Включение только при **двух существующих** staging-гейтах и самостоятельном новом серверном флаге `REFLECT_CONTEXT_PREVIEW_API_ENABLED=yes`. Новая переменная по умолчанию OFF. Флаг требует активного уже проверенного `REFLECT_CONTEXT_CONSENT_API_ENABLED=yes`.

### 2. UI — просмотр и отдельная локальная отметка (не передача)

- `VITE_ENABLE_REFLECT_CONTEXT_PREVIEW=true` (по умолчанию false), только при активном уже проверенном consent UI, Firebase staging App Check и allowlisted Railway origin.
- Внутри «Контекст и доступ к истории», после явного «Проверить разрешения», выбирается **один активный grant**. Без grant клиент не запрашивает историю.
- «Показать точный фрагмент»: один подписанный серверный запрос. Содержимое показывается в виде React text nodes (`pre`) с исходными переносами и Unicode, без `innerHTML`. Есть индикация обрезания, счётчик сообщений и байт. Не происходит автоматических запросов при открытии страницы.
- Только после просмотра активируется **отдельный** checkbox «Я прочитал именно этот фрагмент…» и кнопка «Подтвердить состав (без отправки)». Она устанавливает локальное состояние, привязанное к hash: **не вызывает HTTP, не записывает consent в базу, не даёт модели новых прав и не создаёт постоянную авторизацию**. При смене аккаунта, обновлении списка грантов, отзыве, выборе источника и повторной загрузке фрагмента локальная отметка удаляется.
- Важно: это НЕ согласие на реальную передачу в Grok. Для AI-01L требуется новое отдельное целевое согласие после актуального preview и серверного recheck непосредственно перед provider dispatch.

### 3. Тесты

- Node HTTP: unsigned, чужой Origin, неправильно потреблённый App Check, лишние поля, невалидные ID, недействующая entitlement, квота, строгие заголовки, no secret leakage.
- Node quota: 20/час на UID, независимость двух аккаунтов, reset по часу UTC, corrupted counter fails closed.
- React UI: отсутствие автоматического получения истории, точные escape-safe текстовые элементы, отдельная локальная отметка, очистка при revoke/смене UID, ошибки без личных данных.
- Existing synthetic Firebase Auth/Firestore Emulator: privileged preview after grant, deny after revoke, browser deny для приватных grant/quota.
- CI boundary: запрет импорта preview в действующий provider/handler, отдельные default-OFF флаги и запрет нечаянного xAI history feed.

## Строгая последовательность будущей приёмки

1. Exact-head CI 100% green, Draft PR остаётся без merge. Никакой production/main/Rules-мутации.
2. **Отдельный staging deployment review**: выложить серверный код с `REFLECT_CONTEXT_PREVIEW_API_ENABLED=no`, проверить существующий AI/consent и новый путь → 404. Не трогать provider.
3. По отдельному go/no-go включить **только серверный preview** на staging, проверить negative HTTP и Auth/App Check replay (без реальных данных).
4. По отдельному go/no-go выложить Hosting staging с `VITE_ENABLE_REFLECT_CONTEXT_PREVIEW=true`; пользователь самостоятельно выдаёт одно краткое разрешение **для несекретного тестового сеанса**, просматривает ровно выбранный текст, подтверждает состав локально, отзывает grant и проверяет отсутствие повторного preview.
5. Только после безопасной приёмки UI и отдельного согласования архитектуры разрабатывать provider pathway: previewHash и источник привязаны к моментальному snapshot, новый signed confirmation, JIT grant recheck, budget/cost cap, cancellation/revocation semantics и явное раскрытие xAI retention. Ничего из этого **не активируется данным PR**.

## STOP / не подтверждено

- CI может подтвердить только синтетические и emulator тесты: реальные Auth/App Check/preview HTTP и пользовательский просмотр пока не проверены.
- Byte caps не являются токеновыми caps; контент из сеанса — untrusted user data, никогда не system prompt.
- Не включать использование локального reviewHash в оплачиваемом вызове; локальное подтверждение не сохраняется и не должно считаться постоянным согласием.
- Не пересылать никому настоящие Firebase ID/App Check токены, скриншоты с личным содержимым сеансов или Network headers; для проверки использовать отдельный несекретный тестовый сеанс.
