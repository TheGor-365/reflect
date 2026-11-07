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


### Stage04F cost receipt + Raw xAI log checkpoint — 2026-11-07

- **Owner evidence:** two screenshots on xAI Console 'Logs → Chat → Raw'
  for the first 19:05:30 Reflect synthetic request. Visible
  'logged.chat.request' has fixed Reflect system + test user prompt,
  'grok-4.3', maxTokens 128, temperature ~0.7, topP ~0.95,
  'TOOL_MODE_NONE', 'EFFORT_NONE' and
  'historyStatus: HISTORY_STATUS_COMPLETE'. None of these fields
  establishes upstream HTTP status or cost. Formatted view previously
  showed 'Response · Completed' with empty output panel. The original
  'xai-http-error, HTTP 502' from localhost remains **unresolved**.
  No live re-test authorized, no second paid call made.
- **New offline Stage04F code on PR #34:** 'server/ai/xaiCost.cjs'
  parses exact billed 'usage.cost_in_usd_ticks' (10^10 ticks/USD);
  unavailable receipt becomes **null, not free**. The
  'xaiProviderAdapter.cjs' returns both independently labelled actual
  charge and published-rate estimate. A pure integer USD-tick
  'planMoneyReservation' verifies server-supplied per-call/owner/global
  limits; no storage write or spending authorization is done. Synthetic
  test 'server/ai/xaiCost.test.cjs', adapter receipt tests and Stage04F
  CI are included. Official source:
  https://docs.x.ai/developers/cost-tracking (2026-11-07).
- **Important gate:** actual production hard cap awaits a real durable
  transactional server store with per-owner/global money reservation,
  idempotency ledger, crash reconciliation, authenticated per-message
  consent, genuine App Check staging and provider-side controls.
  No auto-retry, no private journal, no live provider call, no secret
  provisioning, no main merge/deploy in this stage.
- **Next owner action:** xAI Console Usage for Nov 7, ideally grouped by
  Reflect-dev key, screenshot with USD cost/request information; also
  verify saved Auto top-up and invoiced spending limit on Billing.
  Existing Chrome Network original 'smoke' response, if preserved, is
  the only direct source for the prior 'providerHttpStatus'. Do not
  publish API Key ID, secrets or other application logs.
- **Drive mirror:** not confirmed updated; use the latest GitHub PR #34
  handoff as the source of truth for this checkpoint.


### Owner xAI Usage screenshots — 2026-11-07 around 20:41–20:42 Yerevan

- Owner supplied **two** xAI Console 'Usage' screenshots, selected window
  **Nov 1–Nov 7, 2026**, 'Group by API Type', 'Granularity Day'.
  **All keys:** Spend '$0.00', Tokens '0', Requests '0'.
  **Filter to the same Reflect-dev API Key ID shown in the 19:05:30
  log:** Spend '$0.00', Tokens '0', Requests '0'. Bottom-left displayed
  remaining prepaid balance '$8.64' on both screenshots.
- Verified fact: **at the instant of these screenshots, Usage Explorer
  reports zero spend, tokens, and requests for the selected period/key**.
  This **contradicts the existence of a visible provider-side Chat log
  record** for the first attempt. Do not resolve the mismatch by
  speculation; the UI can have reporting differences/delay. Zero in
  the explorer is **NOT** confirmed cost '$0' for the particular call,
  and it is not proof that a completed answer reached the proxy.
- Existing prior diagnostic: local one-shot 'xai-http-error, HTTP 502'
  on original user-owned code revision. Real upstream HTTP status remains
  **unknown**. No new paid call is authorized. The provider-side log's
  'HISTORY_STATUS_COMPLETE' is a request log field, not an HTTP code.
- **NEXT OWNER ACTION:** inspect **Billing → API spend management**
  (API console billing, **not** separate Grok consumer subscription),
  screenshot of saved **Auto top-up** state/amount/monthly cap and
  monthly **invoiced billing limit** if exposed. Do not turn on, pay,
  modify another key or disclose payment card information. Prefer OFF
  for auto top-up and '$0' invoiced billing until signed-off tests,
  but actual saved values are not yet confirmed. Official reference:
  https://docs.x.ai/console/billing (accessed 2026-11-07).
- Stage04F Draft #34 remains **fixture/CI-verified only**. No release,
  new credential, Firebase data, provider call, production deployment
  or claim of working Grok reply. Google Drive copy not synced.


## CHECKPOINT — 2026-11-07, owner authorizes one live synthetic AI turn in app

- Owner stated: 'у меня есть 8 долларов и автопополнение на 5, поехали, подключаем приложение и тестируем боевые функции'. Interpreted as consent to **one** user-initiated, bounded **synthetic** paid test, not unconditional payments, recurring auto top-up spending, production deployment, or actual diary transfer. xAI shared team balance screenshot shows $8.64, Usage Nov1–7 shows $0.00/0 tokens/0 requests despite provider Chat Logs showing one first attempt. **The first proxy HTTP502 upstream code is still unknown**. Any remaining limit settings are NOT verified.
- Latest **code** checkpoint '4200bdcc0cded3aaa265fc337f54b6a3700fdb7c': **8/8 GitHub Actions SUCCESS**, including React/Vite, TS, isolated Auth browser QA, Stage04A/B/C safety tests, Stage04E localhost gateway, Stage04F adapter. No provider credentials in CI and no live paid API request made by this chat.
- **In-app trial implementation** on Draft #34: 'server/ai/localXaiSmoke.cjs' now permits exactly three server-pinned *synthetic* scenarios (reflections, fictional daily tasks, workday clarity), never arbitrary browser text, history, diary or UID. The existing private local key file is reused, port remains 127.0.0.1:19107, one attempt per server process, no auto retry, 128 max output tokens, no tools. React Sessions' 'XaiDevSmoke.jsx' offers scenario selection and explicit one-request consent, displays real Grok reply, bounded upstream HTTP code on provider failure, token counts, and **actual** per-request 'cost_in_usd_ticks' if returned separately from estimated tariff. Unknown cost is labelled unknown, never '$0'. Unit/integration tests assert allowlist, replay lock, redaction and receipt.
- **New owner Linux runbook:** 'docs/roadmap/STAGE_04F_LIVE_SYNTHETIC_SESSIONS_2026-11-07.md'. Use a **new** ~/reflect-stage34-live worktree from the PR34 Draft branch, preserve historic ~/reflect-stage33-qa and Firebase emulators, restart only the old localhost Node proxy + Vite ports 19107/3100 via their own terminal Ctrl+C, reuse existing private key outside the repo, then click once inside Sessions. CLI, emulator secrets and all user data remain on owner's machine. The one paid request can only be initiated by owner.
- **NOT done / blocked:** a successful provider reply inside the app has NOT been confirmed; staging with real signed App Check/Auth, durable USD quota/ledger, cloud-bound Secret Manager, actual user message consent/persistence and full production AI remain future engineering gates. Do not re-enable 'AI_SESSION_ENABLED' or merge to 'main' until verified staging.
- **Future handoff:** check latest PR34 HEAD CI and owner screenshot of successful reply OR safe error/status + xAI cost. Never ask for key, Auth headers, card data, private diary or secrets. Confirmed Google Drive master sync does **not** exist; GitHub remains the authoritative updated checkpoint.


---

## CHECKPOINT — 2026-11-07, permanent hosted Grok bridge Stage04G (PR #35)

- **Latest owner evidence:** on Linux, source worktree
  ~/reflect-stage34-live at exact code 0e7a0a8, npm ci succeeded and new
  React Sessions UI rendered. Starting the new Node proxy on
  127.0.0.1:19107 failed EADDRINUSE; the old Stage04E proxy was still
  listening. The new React client sent a scenario object; the old proxy
  only accepted confirm=synthetic-only and returned local
  HTTP 400 invalid-payload **before any xAI call**. This specific
  failure is a version conflict on a local port, not a verified bad key.
  The first earlier real provider xai-http-error/proxy 502 remains a
  separate unresolved incident. The owner explicitly asked for a
  persistent integration usable in the published app, not a one-shot
  localhost test.
- **Created stacked Draft PR #35:**
  https://github.com/TheGor-365/reflect/pull/35
  Branch work/reflect-stage04g-hosted-ai-bridge-2026-11-07,
  base PR #34 branch (NOT main). No deployment, merge, paid xAI request,
  secret upload, user data transfer or old-process termination occurred.
- **Server implementation:** separate Firebase Functions v2 package
  server/hosted/functions/index.cjs, actual onCall named reflectAiReply,
  enforceAppCheck:true, consumeAppCheckToken:true, Firebase Auth, exact
  registered appId, strict reflect-ai-stage-* allowlist and runtime
  opt-in. xAI key is bound with Firebase defineSecret REFLECT_XAI_KEY
  and never imported into Vite, git, logs or CI. A deterministic
  source packaging script copies only vetted server/ai modules;
  no root firebase.json or uncontrolled production fallback.
- **Durable budget and security:** server/ai/hostedBudget.cjs atomically
  checks server-owned Firestore flag (OFF unless enabled),
  per-user/per-project daily token + USD tick budgets, and a
  permanently retained hashed request-ID ledger. Provisional
  reservation $0.01/request, $0.05/owner/day and $0.20/global/day;
  these are NOT a guaranteed provider hard billing limit. On
  failure/timeouts, reservations remain; no automatic retry. Actual
  provider costs are recorded if available, and over-reservation
  disables further requests. Private message and model output are
  never stored in budget documents.
- **Browser integration:** in src/firebase/config.js a dedicated
  VITE AI staging flag enforces project allowlist and initializes
  reCAPTCHA Enterprise App Check before Auth/Firestore/Functions clients.
  src/api/reflectAssistantService.js uses httpsCallable with
  limitedUseAppCheckTokens:true, exact consent version, bounded one
  user-selected text and random request ID; no profile/archive/history.
  Ordinary Sessions UI now sends directly to hosted AI only in an
  explicitly configured staging preview; per-message checkbox
  discloses xAI 30-day default audit retention. Responses stay local
  until the user manually clicks Save Session. The previous
  geminiService AI_SESSION_ENABLED remains false and no unapproved
  production AI switch is enabled.
- **Isolated tests:** real Firestore Emulator against independent
  reflect-ai-stage-fixture01 and deny-all test rules. Covered signed
  context placeholder (no forged App Check accepted by production),
  policy, consent, kill switch, one successful response, replay after
  success/failure and next UTC day, error redaction, overspend kill
  switch and no prompt/UID in ledger. Frontend tests cover consent,
  single-message-only data and explicit save. Dedicated workflow
  reflect-ai-hosted-bridge.yml validates server packaging plus
  existing UI, TypeScript and isolated Auth tests. **Do not call
  emulator success a real signed staging attestation.**
- **Staging rules:** server/hosted/firestore.rules allows only
  UID-scoped user content for separate new staging project and
  explicitly denies browser access to _reflectAiPrivate. It is NOT
  deployed. The Functions and Firestore rules deploys require
  separate, explicit owner review of the targeted stage project.
- **Operational runbook:**
  docs/roadmap/STAGE_04G_HOSTED_XAI_PERMANENT_INTEGRATION_2026-11-07.md
  describes new separate Firebase staging project, real signed App
  Check and Web App registration, GCP/Blaze costs, local-only secret
  manager prompt, exact staging deployment config and Vercel Preview
  public env variables. Firebase/GCP fees are separate from the
  existing xAI $8.64 team wallet; xAI auto-topup $5 is enabled by
  owner report, saved billing cap still unverified.
- **User next action (1):** open Firebase Console and locate/create
  a **separate** staging project, not the owner's existing Test or
  live project; report its selected project ID and app registration
  screenshot (without keys/secrets). Check Blaze billing before
  confirming a charge. DO NOT ask the owner to reset old worktrees
  or paste the xAI key here.
- **Still BLOCKED:** actual deployed signed App Check negative QA,
  hosted live grok-4.3 success, cross-project deployment permission,
  secret provisioning, billable GCP project approval, verified
  provider-side financial safeguards and subsequent production
  release review. GitHub master is current; the Drive Markdown
  mirror was not edited or verified during this turn.


### 2026-11-07 Owner Firebase STAGING project created

- Owner provided screenshots in this conversation: Firebase Console success page for **Reflect AI Staging** and its Project Overview URL, showing **actual Project ID reflect-ai-staging** and **Spark plan**. App registration button **Add app** visible; no registered staging Web App confirmed yet.
- **Do not recreate the project.** Existing original Firebase project **reflect-8fdc8** and unrelated iLab **ilab-343511** unchanged.
- Stage04G code compatibility fixed in the existing **Draft PR #35**: browser staging allowlist plus server STAGING_ID regex now accept exact **reflect-ai-staging**, while still rejecting the original production/Test project; isolated fixture stage remains allowed. Added regression coverage of allowed real stage and denied existing projects.
- Owner's next safe **single** operation in console: **Add app → Web**, nickname **Reflect AI Staging Web**, do NOT enable optional Hosting, choose **Register app**, screenshot showing the registered app's name / App ID. No xAI API key or Firebase private key required, do not post web config if it contains identifiers they prefer to mask. This remains free Spark setup; no paid Firebase deployment yet.
- **Cloud Functions v2 requires Blaze** and separate GCP billing. No credit, saved monthly spending limit, new invoice, Secret Manager binding, App Check, live model invocation or production deployment confirmed or authorized at this checkpoint. Stage04G code changes remain Draft only.
- Updated technical runbook docs/roadmap/STAGE_04G_HOSTED_XAI_PERMANENT_INTEGRATION_2026-11-07.md with the real project ID. GitHub is authoritative; the Google Drive Markdown mirror has not been synced.


### 2026-11-07 Staging Web App registered — owner screenshots

- On NEW Firebase project `reflect-ai-staging`, Web App registration
  is completed. Screenshot shows Console **Add Firebase SDK** step,
  registered Firebase public Web App ID
  `1:599679789981:web:d4d8743dbff0fe40af1d74`,
  public auth domain `reflect-ai-staging.firebaseapp.com`.
  These are Firebase client config identifiers, **not the xAI secret**.
  **Do not repeat Web App registration or npm install**; existing
  React app already uses Firebase SDK. **Spark** plan was confirmed
  on previous screenshot; no billing upgrade observed here.
- Existing `src/hooks/useAuth.js` invokes `signInAnonymously`.
  Next owner steps: **Continue to console**, then in the new
  project **Security > Authentication > Get started >
  Sign-in method > Anonymous > Enable > Save**. Screenshot the
  provider enabled, without needing to reveal any private information.
- Unverified: Anonymous Auth enabled, Firestore database and private
  rules deployed, actual registered App Check, provider secret
  bound, Cloud Functions deployment, GCP/Blaze paid billing,
  xAI successful hosted reply. Avoid production original
  `reflect-8fdc8` and private journal data.
- Stage04G remains stacked Draft PR #35. The GitHub master is
  updated; Drive Markdown mirror is not confirmed synced.

### Staging Authentication enabled — 2026-11-07 owner screenshot

- Firebase Console project `reflect-ai-staging` → Authentication → Sign-in method visibly lists **Anonymous: Enabled**. This is configuration evidence; no identity migration or live Grok backend connection is claimed.
- Next stage: create isolated Cloud Firestore **Standard edition**, database **(default)**, **Production mode** (deny initial client access), with **us-central1 regional location** to co-locate the current hosted Functions v2 region. Database location is immutable. Test mode is unsafe for a private diary because it permits public database access. Do NOT create new records, set public rules, or touch `reflect-8fdc8`.
- Firebase Spark plan remains the last observed billing tier. Cloud Function deployment and xAI secret binding still await separate Blaze/GCP billing review and owner approval.
- Source: owner screenshot in this chat; no connected console changes were performed by the assistant. GitHub master updated, Drive mirror not confirmed synced.


### 2026-11-07 Firestore database (default) created — screenshot evidence

- Owner's Firebase Console screenshot in this conversation displays project **Reflect AI Staging** `reflect-ai-staging`, **Firestore → Data**, database **(default)** with empty collections and text "Your database is ready to go. Just add data." Billing plan shown **Spark**. This establishes the database exists, but not its stored region, currently published Security Rules or backup setting. The previous wizard had `nam5 (United States)` selected; the final database location is NOT independently revalidated on the Data screenshot.
- Repo file `server/hosted/firestore.rules` in Draft PR #35 contains staging-specific UID-scoped read/write access to `artifacts/reflect-8fdc8/users/{uid}/...`, deny-all on `_reflectAiPrivate`, and deny-all catchall. Do not confuse the app namespace `reflect-8fdc8` (intentional shared collection name) with the actual **staging project ID** `reflect-ai-staging`; no data is shared between Firebase projects.
- **Next owner action:** on `reflect-ai-staging` only, open Firestore → Rules, replace starter deny-all with the exact vetted `server/hosted/firestore.rules` code, **Publish**, then screenshot deployed rules. Never apply to the original `reflect-8fdc8` Firebase project. Existing data should remain empty.
- Still unverified: rules publication, App Check registration, staging Cloud Functions/Secret Manager, Blaze/GCP budget approval and live provider reply. No claims of backend deployment or billing changes.

### 2026-11-07 Staging Firestore Security Rules published (owner screenshot)

- Firebase Console `reflect-ai-staging` → Firestore (default) → Rules shows
  a new version marked "Today 11:46 PM" and a green toast "Published
  changes can take up to a minute to propagate". Visible rules deny
  client read/write of `_reflectAiPrivate/{document=**}`, permit
  `artifacts/reflect-8fdc8/users/{uid}/{document=**}` only for matching
  authenticated UID, and deny all other paths. Published code
  matches the staged policy in `server/hosted/firestore.rules`.
- This verifies **rules publication** in the staging project, **not**
  actual emulator/production negative-access tests or live cloud AI.
  Billing remains Spark; functions, real secret and App Check are not
  yet deployed/registered.
- Next owner action: open **Security → App Check** in Firebase
  project `reflect-ai-staging`; inspect the Web App row and supported
  reCAPTCHA Enterprise registration flow. Do NOT toggle enforcement
  before registering a score-based Web key for the final staging
  preview domain and checking signed-token traffic. Official source:
  https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider .
  Registered staging Web App ID remains
  `1:599679789981:web:d4d8743dbff0fe40af1d74`.
- No change was performed in owner production Firebase
  `reflect-8fdc8`; no new provider request or secret exposure.


### 2026-11-08 App Check registered (owner screenshots)

- Firebase Console project `reflect-ai-staging` → App Check → Apps:
  `Reflect AI Staging Web` now shows **Fraud Defense / Registered**,
  green check. The previous screenshot showed the owner-entered public
  reCAPTCHA Enterprise Site Key and default **1 hour** token TTL before
  saving. This proves **App Check registration**, not real signed token
  delivery from a published site nor enforced API gate.
- The site key is publicly configured via
  `VITE_APP_CHECK_SITE_KEY` in an isolated staging build; the xAI
  secret must never enter any frontend variable. The React code already
  calls `initializeAppCheck` with `ReCaptchaEnterpriseProvider`
  only after matching approved staging project.
- **Next owner-owned, no-billing step:** open **Hosting & Serverless →
  Hosting → Get started** in the NEW project, check/create the default
  Hosting site and verify its actual `.web.app` domain. Firebase
  projects created after Oct 15 2026 defer default Hosting site
  creation; do not assume site ID or blindly change another site.
  Official reference:
  https://firebase.google.com/docs/hosting/default-site .
  Do not paste generic npm/Firebase CLI commands over the existing
  React code, and do not deploy yet.
- **No App Check Enforcement yet** until real signed tokens are
  observed; Firebase Auth Anonymous, Firestore default and staging
  security rules were already confirmed in this chat. Functions v2
  deployment still requires separate Blaze/GCP billing approval;
  no deployment/paid xAI request or production changes made.
