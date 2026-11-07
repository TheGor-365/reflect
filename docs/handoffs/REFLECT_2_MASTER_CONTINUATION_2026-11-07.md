# REFLECT 2.0 — АКТУАЛЬНЫЙ MASTER PROMPT / ПЕРЕДАЧА РАЗРАБОТКИ

**Срез:** 7 ноября 2026 года, после первой попытки реального xAI-запроса из локального Reflect.  
**Статус файла:** ЕДИНАЯ АКТУАЛЬНАЯ ТОЧКА ВХОДА для следующего инженерного чата.  
**Проект:** CAREER → Reflect 2.0. **Репозиторий:** https://github.com/TheGor-365/reflect  
**Активный кодовый PR:** https://github.com/TheGor-365/reflect/pull/33 (Draft, stacked на #32).  
**Код, реально запущенный владельцем на Linux:** `12ed13c143042165f2268268413cb5da3f4d23a0`, каталог `~/reflect-stage33-qa`. **7/7 CI SUCCESS на этом SHA.**  
**Google Drive — предшествующий исторический журнал:** https://docs.google.com/document/d/1lHQQTQGIYANNYjJpWe1AhTsO0qlhPeOcg9f_LLuf2hM/edit  
**ВАЖНО:** перед новыми изменениями проверь живой `HEAD` PR #33, текущие статусы CI и эту дату. Позднейший docs-only коммит с данным master может изменить HEAD, не меняя код `12ed13c`. Не путай «CI успешно» с «реальный провайдер работает».

---

## 0. ПРЯМОЕ ЗАДАНИЕ СЛЕДУЮЩЕМУ ЧАТУ — НАЧНИ ДЕЙСТВОВАТЬ

Ты принимаешь продолжающуюся разработку **существующего** приложения Reflect 2.0. Не начинай продукт с нуля, не повторяй аудит, регистрацию аккаунтов, настройку Docker/Firebase, восстановление данных или создание тех же ключей. Пользователь поручил **автоматически** делать всё, что позволяют подключённые плагины GitHub, Google Drive/Docs, Gmail и другие доступные инструменты. Работай самостоятельно в безопасных **Draft PR**, коммить код, добавляй тесты, проверяй реальный CI и обновляй master и Drive. Ожидай от владельца только действий, для которых нет авторизованного безопасного интерфейса: локальные терминалы/браузер, ввод секретов, платные решения, staging/prod go/no-go, просмотр личных данных.

**Первая задача — диагностировать уже произошедший реальный отказ xAI, а не заново генерировать ключ и не нажимать повторно «Проверить Grok».** На снимке 2026-11-07 19:05 локальный UI показывает `Тест не выполнен (xai-http-error, HTTP 502)`; локальный Vite работает на `127.0.0.1:3100`, локальный proxy был запущен на `127.0.0.1:19107`. Это означает, что proxy получил неуспешный HTTP-ответ от xAI и отдал браузеру **свой** 502. **Настоящий upstream status `providerHttpStatus` ещё не получен**. Ни `grok-4.3`, ни `Chat`-ACL, ни сам ключ не признаны неисправными без этого значения. Не утверждай, что это точно 401/403/400/429. Одна реальная попытка уже состоялась; могло быть частичное потребление бюджета. Тело ошибки провайдера намеренно не передавалось браузеру.

**1–3 ближайших действия:**
1. Сначала **без новых платных вызовов** получить из уже записанного в Chrome Network запроса `smoke` безопасную часть вкладки **Response**: например `{"error":"xai-http-error","providerHttpStatus":400}`; или посмотреть xAI Console → Logs/Usage, фильтр ключа `Reflect-dev`, время первого запроса (около 19:05), не открывая/передавая секреты и личные данные. Если запрос в DevTools не сохранился — использовать UI Logs/Usage или улучшить диагностический код, не делать повторный вызов автоматически. НИКОГДА не просить копию вкладки **Request Headers**, там теоретически могут оказаться токены других приложений. В браузерной части Stage04E отправляется только JSON `{"confirm":"synthetic-only"}` и несекретный заголовок intent.
2. Параллельно самостоятельно открыть PR #33, `server/ai/localXaiSmoke.cjs`, `server/ai/xaiContract.cjs`, тесты и официальную xAI Responses API документацию. Построить fail-closed диагностику по `providerHttpStatus`, проверить допустимость параметров (`reasoning: {effort:'none'}`, `temperature:0.7`, `top_p:0.95`, `tools:[]`, `tool_choice:'none'`, `store:false`, `max_output_tokens:128`), доступ `Chat` ACL к `/v1/responses`, лимиты 2000 TPM / 2 RPM, expiry и наличие кредитов. Возможные классы проблем — неподдерживаемый параметр или неверный scope, а не обязательно неверный ключ. Исправления делай в Draft с фикстурными тестами, без реального ключа в CI.
3. Прежде чем предлагать **второй реальный** запрос, сверить xAI Billing/Usage, фактическое сохранение месячного $5 auto-top-up cap, проверить независимый invoiced spending limit, запросить короткое согласие владельца на ещё одну **синтетическую** платную попытку. Принцип: фиксированное синтетическое сообщение, один вызов, никаких журнальных записей. При повторном тесте процесс на 19107 надо перезапустить, потому что серверный one-shot lock израсходован; перезапуск — только после разбора отказа и согласования.

Сразу после этих задач продолжай защищённую Stage04F/04G интеграцию и Stage05 staging по условиям ниже. Пользователь хочет в итоге **реальный ИИ-диалог в Reflect**, а не бесконечную генерацию технических PR и тестовую заглушку.

## 1. ЧТО ТАКОЕ REFLECT: ИСТОЧНИК ИСТИНЫ И ЦЕННОСТЬ

Reflect — существующий личный продукт: дневник, размышления/сеансы, цели с шагами, отслеживание настроения, опциональный ИИ-помощник. **Не клиническая психотерапия, диагнозы или генератор «психологических баллов».** Дизайн утверждён как **Midnight Aurora**: тёмная/светлая темы, аккуратные карточки без бюрократических форм, резиновая mobile-first сетка, русскоязычный интерфейс, приоритет содержимого над метаданными. Английская локализация позже. Предполагаемая эволюция — desktop/web, PWA/native, голос, AI-подсказки и рекомендации только после подтверждения безопасности; монетизация/платежи — будущие продуктовые решения, НЕ часть выполненного MVP.

**Фактический стек в Draft-цепочке:** React 18, Vite 7.3.7 (миграция с CRA), Firebase 10 Auth/Firestore (client), Firebase Functions v2 в изолированных тестах, JS/JSX + инкрементальный strict TypeScript 5.9.3, Tailwind 3/PostCSS, Lucide, Node 22.x (на ноутбуке установлен `22.23.4`; default Node25 несовместим), npm ci, Vitest/RTL, Playwright/Chromium, тестовые Firebase emulators.

**Production:** Vercel `https://reflect-three.vercel.app`, настоящее Firebase приложение/проект `reflect-8fdc8` (Spark на момент раннего аудита). Старый `main` исторически отделён от большой **необъединённой stacked Draft** ветки. Ни код PR33, ни новая xAI-функция в production не выкатились. Не запускай тестовые записи в production/Preview, где старые Vercel `REACT_APP_*` переменные могли наследовать продовую Firebase-конфигурацию. Устаревший публичный клиентский Gemini API key — отдельный rotation/security release blocker; отключение его вызовов в новой сборке не доказывает, что ключ отозван.

**Firestore домен:** `artifacts/reflect-8fdc8/users/{uid}/{diaryNotes,goals,moods,sessions,profiles}`. Некоторые верхние документы отсутствуют при наличии вложенных коллекций: это нормально. `userId/UID` — основа доступа. Старые анонимные Auth identities, временные метки, вложенные reflections/versions и содержимое имеют ценность, их нельзя терять или «исправлять» массовыми миграциями.

## 2. ЧТО ВЛАДЕЛЕЦ УЖЕ СДЕЛАЛ НА СВОЁМ LINUX — НЕ ПОВТОРЯТЬ

**Последние прямые доказательства (скриншоты/терминалы пользователя от 2026-11-07):**

- В отдельной рабочей копии `~/reflect-stage33-qa` checkout `12ed13c` из ветки `work/reflect-stage04e-local-xai-key-smoke-2026-11-07` сделан успешно; `npm ci` добавил 370 пакетов, audit: `found 0 vulnerabilities` (для этого вывода npm).
- В терминале `cd ~/reflect-stage33-qa && export ASDF_NODEJS_VERSION=22.23.4 && bash scripts/start-xai-local-smoke.sh` прошёл скрытый ввод `Reflect-dev` **без появления секрета в чате**; сервер вывел `Reflect xAI local smoke: 127.0.0.1:19107, one synthetic paid attempt maximum.`
- В другом терминале Vite вывел `VITE v7.3.7 ready`, URL `http://127.0.0.1:3100/`.
- На экране Reflect «Сеансы → Новый сеанс» виден dev-only раскрывающийся блок `Тест Grok 4.3 · локальная разработка`. Владелец отметил согласие и нажал кнопку; UI перешёл в `Тест уже запущен`, результат — **`xai-http-error, HTTP 502`**. Значит работающий React UI и локальный proxy были связаны; **реальный успешный ответ Grok не получен**.
- Локальный **полный** xAI API key находится ТОЛЬКО на машине пользователя в `~/.config/reflect/keys/reflect-dev` с правами 0600. **Не проси ключ/скриншот секрета**, не пытайся заново создавать его или снимать маску, не передавай в `VITE_*`, shell history, GitHub, Gmail, Google Drive, ChatGPT или CI.
- Много прежних QA worktree (не удалять): `~/reflect-chat-qa`, `~/reflect-stage16-qa`, `~/reflect-stage22-qa`, `~/reflect-stage23-qa`, `~/reflect-stage24-qa`, `~/reflect-stage25-qa`, `~/reflect-stage26-qa` и текущий `~/reflect-stage33-qa`. User's running process state может измениться; проверяй PID перед остановкой. **Не выполнять `killall node`, `pkill -f firebase`, `firebase emulators:clear`, `rm -rf` или Git worktree prune.**

**Локальные тестовые сервисы (исторически настроены, не считать сейчас запущенными без подтверждения):**

| Ресурс | Адрес/проект | Важная граница |
|---|---|---|
| Веб UI | `127.0.0.1:3100` | Vite из `~/reflect-stage33-qa`, проверять `lsof` при сомнениях |
| Новый xAI live smoke proxy | `127.0.0.1:19107` | только localhost, ключ-файл, одна попытка на процесс |
| QA Firebase Auth | `127.0.0.1:9099` | `demo-reflect-auth-qa`, synthetic Test account |
| QA Firebase Firestore | `127.0.0.1:18081` | тот же demo-проект, ценные тестовые записи |
| Отдельный restore Firestore | `127.0.0.1:18080` | восстановленные исторические данные, не затрагивать |
| Isolated Stage04C test Auth | `127.0.0.1:19097` | `demo-reflect-stage04c`, только временный CLI emulators:exec |
| Isolated Stage04C Firestore | `127.0.0.1:19083` | отдельные quota+kill-switch test docs |
| Isolated Stage04C Functions | `127.0.0.1:19005` | настоящая onCall v2, но ненастоящая криптоаттестация App Check |

Конфигурация локального Vite, уже применённая владельцем в этой ветке:

```bash
export ASDF_NODEJS_VERSION=22.23.4
export VITE_FIREBASE_CONFIG='{"apiKey":"demo-only-key","authDomain":"demo-reflect-auth-qa.firebaseapp.com","projectId":"demo-reflect-auth-qa","appId":"1:12345:web:demo"}'
export VITE_APP_ID=reflect-8fdc8
export VITE_USE_FIREBASE_EMULATORS=true
export VITE_ENABLE_XAI_DEV_SMOKE=true
npm run dev -- --strictPort
```

Эта JSON-конфигурация — **demo**, без реальных секретов. Она НЕ заменяет безопасную production-конфигурацию. Если UI не показывает последнюю ветку, сначала выясни точную CWD процесса на 3100 (`lsof -nP -iTCP:3100 -sTCP:LISTEN`, `readlink -f /proc/$PID/cwd`), не переустанавливай проект по привычке.

## 3. ДАННЫЕ, БЭКАПЫ И AUTH: ЧТО ПОДТВЕРЖДЕНО

- Stage00 ранее провёл **read-only** inventory production: 26 документов Firestore, 7 UID с данными, 11 anonymous Firebase Auth identities; целевые 7 соответствовали Auth. Созданы owner-only GPG backup и typed JSONL/manifest SHA256, локальный roundtrip decrypt/tar и 26/26 восстановленных typed docs в изолированном эмуляторе. **НЕ раскрывать ключи/личные данные или UID в коде и документации**.
- Google Drive исторически использует `My Drive/Reflect idea/REFLECT_PRIVATE_BACKUPS`, папка приватная. Не перемещай, не удаляй, не загружай её в репозиторий или ИИ.
- Существующий synthetic Test с email-логином был восстановлен после запуска Auth/Firestore из проверенного `qa:state` snapshot. Пользователь видел реальные две тестовые записи, редактор заголовка, историю двух версий. Восстановление и история **проверены визуально**, но production перенос не выполнялся.
- `npm run qa:state -- save`, `preflight`, `start` использовались, экспорт/импорт Auth+Firestore в owner-private каталог `~/.local/share/reflect-qa/demo-reflect-auth-qa/snapshots/...`. Не выполняй `qa:state start` поверх работающего экземпляра без проверки сохранённого snapshot и портов. Не превращай локальный тест в подтверждённую production-восстановимость.
- UID-preserving Auth link, email verification/recovery UI и правила по владельцу документально/в синтетических тестах появились. Важны дальнейшие реальные recovery corner-cases и правила production.

## 4. КАРТА ВЫПОЛНЕННОЙ РАЗРАБОТКИ (ВСЁ ЕЩЁ В DRAFT PR)

Это **implemented in Draft branches**, не автоматически `main` и не опубликованный релиз. Основная инженерная ветка началась с #3, #4…#33 стекуются друг на друга, два независимых документационных/backup PR #1 и #2 основаны на `main`. Не делать merge дочернего PR прямо в `main` без плана очистки цепочки и восстановимых проверок.

| Этап / PR | Подтверждённое содержание | Реальное состояние |
|---|---|---|
| #1 baseline / #2 backup | Зафиксированные требования и runbook, typed backup/restore инструменты | независимые Draft, не удалять историю |
| #3 P0 Auth | один auth listener, сохранение UID, корректная реакция на Firestore read error | код + тесты Draft |
| #4 Stage01A | CRA→Vite, явная env-конфигурация и isolate demo | тестирован Draft |
| #5 Stage01B | инкрементальный TypeScript strict | тестирован Draft |
| #6 Stage01C | pinned transitive dependency mitigation; не приравнивать `npm audit 0` к complete security | тестирован Draft |
| #7 Stage02A | Midnight Aurora shell, sidebar, dock, светлая/тёмная тема | код Draft, owner desktop/mobile QA |
| #8–#10 Stage02B1–B3A | multiline composer, Save to Diary, safe Firestore state, chat-scroll/dock | код Draft, владелец проверял новые UI |
| #11 Stage02B3B | локальные календарные даты дневника, фильтры, упорядочение | код Draft + тесты |
| #12/#14 Stage03A/B | email link с сохранением UID, подтверждение почты, сброс пароля | код Draft + synthetic QA |
| #13 Stage02C | цели/подзадачи/статусы/прогресс, транзакционные изменения | код Draft, owner UI |
| #15 Stage03C | частные экспортируемые Auth+Firestore QA snapshots | код Draft + owner export/import |
| #16 Stage02D | описательный обзор настроения за 7 дней без искусственных «психологических баллов» | код Draft |
| #17 Stage03A | opt-in зашифрованные локальные черновики | код Draft, компактный popover |
| #18 Stage03B | пользовательский JSON-экспорт всех собственных документов | код Draft, не равен production restore |
| #19/#20 Stage03D | Midnight Aurora scrolling и ограничение Firestore Rules для UID-owned коллекций | код Draft + synthetic rules тесты |
| #21 Stage03E | read-only анализ owner JSON + DEMO-only restore отсутствующих docs с confirmation | код Draft, владелец проверял JSON (3 docs, 2 diary notes) |
| #22 Stage02E | notebook-first journal, compact entry composer, Firestore-confirmed entry UI | код Draft + owner скриншоты |
| #23 Stage02F | compact Goals single-input/advanced, Sessions textarea снизу, compact lock popover | код Draft + owner approval скриншотов |
| #24 Stage03F | fail-closed local Auth+Firestore restore preflight | код Draft + owner snapshot gate |
| #25 Stage02G | content-first diary cards, fade-in animation, маленькая дата, иконки редактирования/версий, сохранение оригинала | код Draft + owner проверил изменённый заголовок и версии |
| #26 Stage03G | read-only schema inventory старых пользовательских документов | код Draft, owner numeric-only audit |
| #27 Stage03H | staging-only Firestore Rules с legacy field compatibility | код Draft, не production |
| #28 Stage03I | synthetic access matrix goals/moods/sessions | код Draft + rules тесты |
| #29 Stage04A | server-only AI policy: one-message consent, max chars/bytes/tokens, rate/day/global quota policy | код Draft, без API |
| #30 Stage04B | mock callable + атомарное reservation/ledger в isolated Firestore, replay protection | код Draft, без API |
| #31 Stage04C | реальная Firebase Functions v2 `onCall`, Auth и AppCheck flags, server kill-switch | **emulator-only**: действительная криптоаттестация ещё НЕ проверена |
| #32 Stage04D | xAI Grok 4.3 Responses contract, parser, cost estimate и синтетические fixture tests | **без реальных вызовов** |
| **#33 Stage04E** | **локальный UI→Node→xAI one-shot smoke, 0600 key file, single synthetic prompt** | **owner runtime проверен; real xAI response НЕ получен: upstream error** |

**Ссылки на этапы:** все PR по шаблону `https://github.com/TheGor-365/reflect/pull/{номер}`; branch/base HEAD сверяй через GitHub tools, потому что позже могли быть docs-only коммиты. Открой последовательно #33 → #32 → #31, затем **полную цепочку родителей до #3**, если меняешь зависимости или готовишь merge. *Не* используй название файла от 5 ноября как доказательство, что его начальный checkpoint всё ещё актуален.

**Точно подтверждённая CI-база #33 (код `12ed13c143042165f2268268413cb5da3f4d23a0`): все 7 workflows COMPLETED/SUCCESS:**
- Stage04E HTTP gateway synthetic **8/8**, xAI+policy **30/30**, frontend unit suite, TypeScript и Vite production build: https://github.com/TheGor-365/reflect/actions/runs/42388747108
- Vite locked: https://github.com/TheGor-365/reflect/actions/runs/42388747144
- TS: https://github.com/TheGor-365/reflect/actions/runs/42388747148
- Isolated Auth browser QA: https://github.com/TheGor-365/reflect/actions/runs/42388747147
- Stage04C v2 callable: https://github.com/TheGor-365/reflect/actions/runs/42388747134
- Stage04B Firestore quota: https://github.com/TheGor-365/reflect/actions/runs/42388747021
- Stage04A server policy: https://github.com/TheGor-365/reflect/actions/runs/42388747020

Это **CI с имитациями, а не green-check реального запроса к xAI**.

## 5. БИЛЛИНГ xAI И ТЕКУЩАЯ КОНФИГУРАЦИЯ КЛЮЧА

**Провайдер:** xAI Console / Grok, существующий team/workspace `android-sushi-diffuser`, также используется другим ИИ-приложением владельца. Ранее было два ключа `AI course`, `Default`; оба сохранены. Добавлен отдельный **`Reflect-dev`**, UI `Edit Key` после создания подтверждал:

| Параметр | Значение |
|---|---|
| Model ACL | **только `grok-4.3`**, Chat (1/8) |
| Endpoint ACL | **`Chat`** (пункт `Responses` отдельно в UI не показан) |
| Tokens/min | 2000 |
| Requests/min | 2 |
| Expiry | **07.12.2026 23:59** |
| Секрет | приватный локальный файл пользователя; не содержится в master |
| Был ли успешный запрос? | **Нет, первый получил upstream HTTP error** |

**Исторически показанный credit balance:** `$8.64`; дата скриншотов 2026-11-07, после попытки требуется новая сверка. Промо/платные кредиты и сроки их действия неизвестны. Отображавшиеся Usage 30d/7d = $0 и 0 requests относились ко времени **до** первого теста. Другие приложения делят этот же кошелёк — отдельный key НЕ создаёт отдельный бюджет.

**Billing UI:** владелец выставил trigger баланс ниже `$5`, amount `$5`, **Maximum monthly top-up amount `$5`** и toggle ON, но прямого скриншота **сохранённых** параметров после Save нет. Скриншот до нажатия показывал прежнюю карточку; месячный invoiced limit не найден/не подтверждён. Автопополнение — деньги владельца, без необходимости повторно просить разрешения на давно установленный параметр, но перед будущими платными тестами уточнить фактический сохранённый лимит/расход. Не менять ключи и тарифы другого приложения; не создавать другие ключи без необходимости.

Официальные docs для новой проверки:
- https://docs.x.ai/developers/rest-api-reference/inference/responses
- https://docs.x.ai/developers/model-capabilities/text/best-practices
- https://docs.x.ai/developers/models/grok-4.3
- https://docs.x.ai/console/billing
- https://docs.x.ai/developers/faq/security
- https://docs.x.ai/developers/rest-api-reference/management/auth

У xAI штатная до 30 дней retention/audit API-контента, даже если `store:false` отключает stateful Responses storage. Не включать team-wide ZDR без оценки влияния на старое приложение и его Files/Collections. Нельзя включить передачу пользовательского дневника провайдеру автоматически.

## 6. КОД STAGE04E — ЧТО МЕНЯТЬ И КАК ДИАГНОСТИРОВАТЬ

**Repo path → роль:**

- `server/ai/policy.cjs`: `CONSENT_VERSION=2026-11-07`, `maxMessageChars=4000`, `maxMessageBytes=12000`, `maxInputTokens=1200`, `maxOutputTokens=512`, `maxPerMinute=2`, `maxPerUtcDay=10`, max user/day tokens=18000, max global/day tokens=120000. Строгая схема `requestId, message, consent`, серверный UID и App Check, предвыделенный token budget, ledger/idempotency. Серверная политика — ещё НЕ утверждённая production quota в деньгах.
- `server/ai/mockCallable.cjs`: mock responder без пользовательского текста, atomically reserves before reply, failure no refund. Не путать с живой моделью.
- `server/ai/firestoreQuota.cjs`: fail-closed demo allowlist project/hosts, owner/project budgets and idempotency ledger hash, server kill switch for 04C; защита от FBC project mismatch.
- `tests/ai-stage04c/functions/index.js` и `tests/ai-stage04c/firebase.json`: **Firebase Functions v2 `onCall` enforceAppCheck:true** в **временно поднятом emulator**, `REFLECT_STAGE04C_MOCK_ONLY=yes`; это не доказывает настоящую криптографическую аттестацию в облаке. Не деплоить оттуда в prod.
- `server/ai/xaiContract.cjs`: fixed `grok-4.3`, `https://api.x.ai/v1/responses`, при строгой политике строит `model`, `input` как роли system/user, `store:false`, `max_output_tokens`, `tools:[]`, `tool_choice:'none'`, `stream:false`, `truncation:'disabled'`; функция `extractXaiText` ожидает `status:'completed'`, `model:'grok-4.3'`, assistant output_text, usage input/output. Проверить на реальном ответе, но не писать JSON тела реального личного ответа в логи. Изменения схемы — с synthetic fixtures.
- `server/ai/localXaiSmoke.cjs`: server `127.0.0.1:19107`, Origin точно `http://127.0.0.1:3100`, POST `/smoke` с `X-Reflect-Smoke: explicit-one-shot`, body **только** `{"confirm":"synthetic-only"}`. Один попытка на процесс, `loadKey()` из `~/.config/reflect/keys/reflect-dev` (владелец, regular file, no symlink, 0600), outbound `POST https://api.x.ai/v1/responses`, `max_output_tokens:128`, `reasoning:{effort:'none'}`, temperature=0.7, top_p=0.95; ловит response !ok и отвечает `{error:'xai-http-error',providerHttpStatus:<upstream>}` с **HTTP 502**. Это критический путь первой ошибки.
- `scripts/start-xai-local-smoke.sh`: 0700 директория и hidden readline для секрета, no env/bundle/GitHub, проверка symlink/non-file; **уже выполнен** владельцем, повторно не спрашивай ключ.
- `src/features/Sessions/XaiDevSmoke.jsx`: проверяет `import.meta.env.DEV`, `VITE_ENABLE_XAI_DEV_SMOKE=true`, `VITE_USE_FIREBASE_EMULATORS=true`, exact `demo-reflect-auth-qa` + `reflect-8fdc8` + `127.0.0.1:3100`; UI показывает исходный backend HTTP502 и код, но **пока не показывает `providerHttpStatus`**, хотя backend возвращает. Соответственно самая дешёвая безопасная доработка — показывать клиенту только upstream status, не error body, через новый Draft commit + unit test. Это изменение кода не требует реального ключа. Можно также спросить уже существующий Chrome DevTools Network Response.
- `src/features/Sessions/Sessions.jsx`: подключает diagnostic в Sessions; обычный composer и Save to Diary не изменены.
- `src/api/geminiService.js`: `AI_SESSION_ENABLED=false`, обычный AI-send выключен; **не включать его ради smoke**.
- `.github/workflows/reflect-xai-local-smoke.yml`: тесты локального сервера и test fixture + Vite, GitHub Actions не имеют ключа.
- `docs/roadmap/STAGE_04E_LOCAL_XAI_SMOKE_2026-11-07.md`: исходный launch/README, до последнего owner-error (нужен addendum).

**Интерпретация upstream статуса** (не делай вывод до фактического числа): `400/422` — формат тела/неподдерживаемые параметры; `401` — секрет/авторизация; `403` — модель/Chat endpoint ACL, роль/команда или условия; `429` — rate/balance; `5xx` — временная ошибка провайдера. Точный диапазон/значение сверяй с официальными xAI Debugging Errors и логами, не придумывай причины. Если API вернул HTTP 200, но parser ответил `xai-transport-or-response-invalid`, тогда проблема **parser/schema**, а не ключ. В нашем фактическом случае код **`xai-http-error`** означает, что upstream `response.ok` был ложным.

**Риск безопасности:** узкий smoke endpoint — только для локальной разработки/синтетического текста; Origin-check НЕ заменяет Firebase Auth/App Check и не гарантирует защиту от локального вредоносного процесса. Ни перенос localhost proxy в публичный сервер, ни выдача обычного AI через него не разрешены.

## 7. ДАЛЬНЕЙШИЙ ПЛАН — ПО УМОЛЧАНИЮ ВЫПОЛНЯТЬ АВТОМАТИЧЕСКИ

### P0. Stage04E диагностика первого live запроса (текущий blocker)
- `GET PR33`/HEAD, diff и фактические CI; уточнить upstream providerHttpStatus, xAI Usage, сохр. billing cap. Установить причину на основании наблюдений.
- В новой Draft commit добавить UI upstream status (без содержимого), тесты `server/ai/localXaiSmoke.test.cjs`, возможную строгую проверку allowed status, документацию; запретить повторный paid call без явного разрешения.
- После исправления: один новый synthetic call, owner screenshot, проверка токенов/модели и реального расхода в Usage; только тогда отметить Stage04E `real provider verified`. При неуспехе без лишних платных попыток переключиться на независимую задачу.

### P1. Stage04F — production-grade provider adapter, server-side only
- В отдельной Draft ветке (на текущей зависимости) адаптер xAI Responses API с подстановкой credential исключительно из **Firebase Secret Manager/секретного vault**, никак не из `VITE_*`/реакта/Firestore/user doc. Нужна безопасная изоляция xAI команды. Изменение секретов/биллинг функций — только после подходящего staging и явного согласия владельца; не проси вставлять секрет в чат.
- Настоящее `Firebase onCall` + verified Auth + genuine signed App Check, binding `uid`, owner-only session collection, **one-message** explicit consent, sanitize input, requestId/idempotency, UTC quotas, global money budget, atomic reservations, timeout, circuit breaker, kill-switch, strict response validation and redacted errors; ни история, ни профиль не отправляются без отдельного согласия.
- Защитить от replay, parallel requests, partial writes, orphaned session, provider failure, malformed payload, prompt-injection и очень длинных текстов; метрики без записи тел дневника. Подготовить unit+emulator+staging QA. Согласовать реальный лимит расходов и xAI retention/legal; не обещать Zero Data Retention без официального статуса.

### P2. Stage04G — безопасный пользовательский AI-сеанс
- После green staging и go/no-go подключить `Sessions` composer к auth callable. В UI явное согласие на отправку **только текущего выбранного сообщения** (не скрытая автоотправка всей истории); видимые loading/error/cancel/retry, сохранение несданного текста, отдельный источник для AI reply и пользовательская кнопка сохранения.
- Обычный `AI_SESSION_ENABLED` включать **только** для нужного окружения/контролируемого rollout при действительном backend; в production не включать до approvals. При наличии истории — серверная идемпотентность и согласованное хранение с schema version/owner.
- ИИ — инструмент рефлексии, не диагноз/терапевт; рекомендации в цели только через review/approve, никакой автогенерации фиктивных mood scores.

### P3. Stage03/05 — защита данных и настоящий staging/release
- Создать **отдельный настоящий Firebase staging project** (не `reflect-8fdc8`, не synthetic 9099/18081) только после согласования расходов/согласий и контролей. Проверить signed App Check (валидный, invalid, replay), Firebase Auth/Rules, wrong-owner cross-account, quota/kill-switch, root/callable fail-closed, secret rotation, strict isolation Vercel Preview.
- Утвердить пользовательское восстановление, export import из legacy JSON, schema compatibility, account recovery, deletion/retention и app-specific document limits. НЕ тестировать на реальном приватном архиве без необходимости, обычный synthetic QA sufficient.
- Проверить mobile keyboard, screen reader, reduced motion, dark/light, WCAG 2.2 AA как **target**, а не сертификацию; регрессию Goals, Diary, Moods, Sessions, profile. Подготовить контролируемое объединение stacked Draft PR #3…#33, review dependency conflicts, rollback and release checklist. **Ни один PR автоматически не мерджить в `main`**, Vercel production/deploy — только после явного go/no-go.

### P4. Stage06 — продуктовая доработка после безопасного AI
- Упрощение/полировка UX по реальным user screenshots: компактный дневник и дата полупрозрачным текстом внизу, анимация новой карточки, оригинал + версии, цели single input, расширенные настройки по раскрытию, компактный locked draft, bottom chat textarea. Не нарушать user-approved UX крупными redesign без наблюдаемого дефекта.
- Private weekly mood insights, удобный просмотр/редактирование целей/подзадач, поиск/фильтры в дневнике, RU→EN, производительность, PWA/native/voice позже. Платные функции/маркетинг/мобильный релиз — отдельные решения с безопасным банкингом.

## 8. AUTONOMOUS PLUGIN WORKFLOW — ПРАВА, ОГРАНИЧЕНИЯ, ИСТОЧНИКИ

**Источники в порядке приоритета для живого состояния:** (1) последний screenshot/CLI пользователя, (2) GitHub API HEAD/diff/tests/CI по **точному** SHA, (3) срез этой передачи, (4) одобренные roadmap и старый historical handoff, (5) официальные актуальные xAI/Firebase/Vercel API docs, (6) Gmail/Drive уведомления только как вспомогательные сведения. GitHub+Drive НЕ синхронизируются автоматически между чатами.

**GitHub:** использовать connected GitHub plugin для checkout/read file/diff/PR, commits в новую или существующую Draft branch, CI мониторинг. Нельзя просить пользователя вручную применять патч, если плагин может сделать это безопасно. Не переписывать историю `main`, не force push и не затрагивать другие репозитории. Stacked PR: новый PR указывать base на предыдущую ветку, а не main.

**Google Drive/Docs:** хранить одну актуальную доступную master-передачу без ключей и PII; исторический 117KB cumulative handoff содержит уникальные подробности, не удалять как «дубликат» автоматически, только архивировать/пометить superseded. Личные документы и GPG backups не читать/не делиться/не переносить без отдельного запроса. Любая операция записи — проверить содержимое ссылкой/прочтением.

**Gmail:** только релевантные письма об Actions, Firebase, xAI Billing/security/Vercel и сроках. Не считать письмо о падении старого SHA свидетельством падения нового HEAD. Не рассылать письма без поручения. Не запрашивать коды, пароли, токены.

**Browser/Linux:** если в этом чате нет реального компьютерного доступа — не утверждай, что видел пользовательский экран, порт, ключ-файл, процесс или Usage. Проси один проверяемый screenshot/вывод только для необходимого локального действия. Никаких удалённых shell-команд и автоматического background work без инструментов.

**Документируй каждую итерацию:** факты/источник/дата; изменённые объекты и ссылки; `не начато`, `в работе`, `CI-проверено`, `owner QA подтверждено`, `blocked`, `production release blocked`; следующий конкретный 1–3 шага. Секреты никогда не вклеивать в master, PR, коммиты, тестовые fixture, Drive и логи.

## 9. ПЕРВЫЕ КОНКРЕТНЫЕ ДЕЙСТВИЯ НОВОГО ЧАТА

**Без дополнительных вопросов запусти следующий цикл:**

1. GitHub plugin: прочитай https://github.com/TheGor-365/reflect/pull/33, состояние/HEAD, README/изменённые файлы `server/ai/localXaiSmoke.cjs`, `server/ai/xaiContract.cjs`, `src/features/Sessions/XaiDevSmoke.jsx`, `.github/workflows/reflect-xai-local-smoke.yml`, `server/ai/localXaiSmoke.test.cjs`. Сверь CI по latest HEAD, PR32 base и текущий master. Затем **самостоятельно** устрани известный UX пробел: UI должен показывать только **upstream `providerHttpStatus`**, раздельно от proxy HTTP502, без вывода secret/error body; покрой тестом; опубликуй Draft commit и CI.
2. Одновременно попроси один screenshot **без секрета**: Chrome `F12 → Network → smoke → Response` после первой попытки ИЛИ xAI Console `API Keys → Reflect-dev → View logs` (если Network недоступен). Цель — получить именно upstream status; не требуй сброса теста, повторного ввода ключа и не отправляй новую paid request. В этом же checkpoint проверить Usage/Billing, не делать необязательных кликов.
3. Сверь официальный контракт и проверь, какой ошибкой это объясняется, исправь код и тесты. После подтверждения безопасности/бюджета проведи **один** ручной synthetic re-test из локального Reflect с согласия владельца, затем двигайся к Stage04F без остановки работы на абстрактных советах.

**Не принимать за итог:** «ключ создан», «CI 7/7», «прошла синтетическая мок-проверка». Инженерный KPI этого этапа — **реальный успешный ответ Grok из приложения, корректные расходы xAI, отсутствие утечки личных данных и готовый план безопасного облачного backend**.

---

## 10. ДОЛЖНЫ ОСТАВАТЬСЯ ОТДЕЛЬНЫМИ ИСТОРИЧЕСКИЕ ССЫЛКИ

- Полный исторический GitHub checkpoint (уникальная хронология старых PR, на 7 ноября ≈117KB; **архив, не новый master**): `docs/handoffs/REFLECT_2_CONTINUATION_2026-11-05.md` в ветке текущего стека.
- Исходный Stage04E runbook: https://github.com/TheGor-365/reflect/blob/work/reflect-stage04e-local-xai-key-smoke-2026-11-07/docs/roadmap/STAGE_04E_LOCAL_XAI_SMOKE_2026-11-07.md
- Stage04D / политика xAI: https://github.com/TheGor-365/reflect/blob/work/reflect-stage04e-local-xai-key-smoke-2026-11-07/docs/roadmap/STAGE_04D_XAI_SELECTION_PRIVACY_BILLING_2026-11-07.md
- Старый Google Docs historical mirror (уникальная копия истории, требует пометки ARCHIVE): https://docs.google.com/document/d/1lHQQTQGIYANNYjJpWe1AhTsO0qlhPeOcg9f_LLuf2hM/edit

**Правило очистки:** удалять только **точно проверенные дубли/obsolete handoff** после того, как содержимое и работающие ссылки заменены и зафиксирован архив. Запрет на удаление уникальных backup, auditing, recoverability, consent или branch-history документов. Пользователь просил очистить неактуальные мастера, **но это не разрешение уничтожать единственный источник сведений об истории/доказательствах**. У других проектов (`Turbo Chat`, `Cafe`, `AI Course` и т. д.) свои мастера, их НЕ ТРОГАТЬ.

**Итоговая цель пользователя:** продолжить существующую разработку Ref­lect 2.0 автоматически, с безопасной приватной памятью, реальным серверным Grok и корректными затратами. Никаких фиктивных «готово», скрытого релиза, сброса истории или повторной выдачи уже созданного ключа.

---

## CHECKPOINT — 2026-11-07, Stage04E diagnostic visibility

- Latest source-of-truth PR #33 before this patch: Draft, stacked on #32; HEAD `d0ed8c4cf186754fa409eb08e986b1574e56e8c9`, **7/7 workflows SUCCESS**. Historical owner runtime at `12ed13c` had one real xAI upstream non-2xx response, reported as proxy HTTP 502. The actual xAI `providerHttpStatus` **is still unknown**. No second paid request was made.
- New Draft patch: client renders the bounded upstream code separately from local proxy HTTP, accepts only a known diagnostic error code, does not display provider body. The server now has synthetic regression coverage for 400/401/403/404/422/429/500/503; frontend formatter has fixture tests. No provider request parameters, one-shot guard, Auth, Firebase data, production settings or secrets changed.
- Root cause remains **BLOCKED ON EVIDENCE**: first Chrome `Network → smoke → Response` safe fields or xAI Console Logs, plus Usage/Billing and cap check. Don't ask for Request Headers, keys or private journal. Next paid synthetic attempt requires explicit new approval and no automation.
- Official reference: https://docs.x.ai/developers/debugging and https://docs.x.ai/developers/rest-api-reference/inference/responses . Stage04F server-only adapter and real signed App Check staging remain future gates. This checkpoint does not certify a live Grok response or production readiness.


---

## CHECKPOINT — 2026-11-07, Stage04F server-only adapter draft

- **Dependency:** PR #33, exact parent HEAD 'ea374013b343462557aa9a05d300fc464eabb084', 7/7 successful CI. New Stage04F implementation is on branch 'work/reflect-stage04f-server-xai-adapter-2026-11-07', stacked on #33 (not 'main').
- **New code:** 'server/ai/xaiProviderAdapter.cjs' with explicitly injected transport and credential reader; fixed xAI model/endpoint, strict one-message contract, reasoning none, 20s timeout, 96KiB streamed response limit, redacted upstream/transport errors and **no automatic retries**. New 'xaiProviderAdapter.test.cjs' fixture tests, isolated Actions workflow and 'docs/roadmap/STAGE_04F_SERVER_XAI_ADAPTER_2026-11-07.md' technical gate. No secret manager provisioning, production callable, network calls or private data.
- **Not yet delivered:** real signed Firebase App Check staging, server-side USD spending limits, irreversible idempotency/reservation design, production secret binding, per-message consent UI and live Grok answer. Mock quota and synthetic tests do not prove these.
- **First live Stage04E error still unresolved:** proxy HTTP502 is known; xAI 'providerHttpStatus' and cost after the attempt unknown. Need original Chrome Network Response or xAI Console Logs, plus current Billing/Usage screenshot. Never rerun paid call without explicit new owner approval. Keep old local key and QA worktree untouched.
- **Production:** blocked, no main merge or deployment. No claim that Google Drive Markdown has been updated; only GitHub branch document changes until separately verified.


### Stage04F verification, exact head 293f195 — 2026-11-07

- **Draft PR #34:** https://github.com/TheGor-365/reflect/pull/34 — base #33; no merge or deployment. Current code HEAD before this docs-only checkpoint: '293f195c9bd562f96b64f16198eb47a7ec068733'.
- **All four triggered checks SUCCESS** for that exact commit: Stage04F adapter fixture+frontend+typecheck+build https://github.com/TheGor-365/reflect/actions/runs/42395112239; Stage04A pure policy, Stage04B isolated Firestore atomic quota, Stage04C Firebase v2 callable emulator. The first Stage04F run had a synthetic abort-test watchdog error; fixed in '293f195', retested green.
- **Not proven:** successful provider response, exact upstream HTTP code for first paid smoke, saved billing constraints, signed App Check staging, deployed Secret Manager, real money cap. Root cause of original 502 is still blocked on evidence.
- **Owner next single action:** recover existing first Chrome 'Network -> smoke -> Response' safe JSON containing 'providerHttpStatus', or provider key 'Reflect-dev' Logs around the prior test. Do not send headers, key or journal. **Do not restart localhost one-shot or submit another paid request.**


### Owner xAI Console Logs screenshot — 2026-11-07, same first Stage04E test

- A **single matching xAI Chat log row** at browser-shown 19:05:30,
  model 'grok-4.3', temperature ~0.7, max 128 output tokens,
  identical Reflect system instruction. Right panel visibly states
  **Response · Completed**; the rendered response section is empty.
- **Evidence classification:** request reached xAI and provider recorded
  completed generation. Exact upstream HTTP status, response payload,
  actual cost/token usage, client delivery and billing controls **remain
  unverified**. Do not interpret 'Completed' as proof of HTTP 200.
  Original old localhost UI showed 'xai-http-error, HTTP 502'; the local
  gateway emitted that error for an upstream non-2xx response. No safe
  root-cause fix can be selected yet.
- **Next owner action:** on the existing log entry select the **Raw**
  tab (not the browser Request Headers); share a **redacted screenshot**
  showing HTTP/result status and usage if available, never key/token,
  sensitive content or other apps. If not visible, look at Usage and
  the old 'Network → smoke → Response' if retained.
- Draft Stage04F implementation remains stacked PR #34, no real
  provider calls or production deploy. Source screenshot preserved in
  this chat only; no raw image, key ID or request ID uploaded to GitHub.
