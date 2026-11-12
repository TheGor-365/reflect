# Reflect 2.0 — актуальный план выполнения V1
**Дата:** 12 ноября 2026 · **Статус:** план и подтверждённые результаты, не разрешение на деплой.
**База:** [Product-to-Production Master Roadmap 2026-11-09](./REFLECT_2_PRODUCTION_MASTER_PLAN_2026-11-09.md). Этот документ обновляет *очередность и известные блокеры*, не отменяя продуктовые требования и контрольные ворота безопасности.

## 1. Цель и продуктовый контракт

**Цель V1:** новый пользователь получает постоянный аккаунт, ведёт приватный дневник, настроение, цели и сеансы; при добровольном согласии отправляет **ровно одно своё сообщение** в реальный Grok 4.3 и видит ответ; сохраняет и заново открывает сеанс; может экспортировать/удалить данные. Другие UID не имеют к ним доступа. Расходы AI ограничены, есть rollback и наблюдаемость.

**Порядок владельца:** рабочий аккаунт → закрытый Gate 5 → один контролируемый платный Grok → сквозная функциональная приёмка → безопасность/релиз. Визуальный полиш и расширенная локализация параллельно, но не вместо работающего MVP.

**Среды:** staging: Firebase `reflect-ai-staging`, Hosting `reflect-ai-staging.web.app`, Railway `reflect-ai-api-staging.up.railway.app`; production: `reflect-8fdc8`, Vercel `reflect-three.vercel.app`. Производственный доступ/релиз не одобрен.

## 2. Подтверждённые факты на 12.11.2026

| Элемент | Доказательства | Статус |
|---|---|---|
| Firebase Auth с Email/Password | Отдельный Firefox private test account **Jack** создан, реальное письмо Яндекс доставлено, Firebase подтвердил адрес, React UI показал «Email подтверждён» | **Live PASS** для доставки и подтверждения одного аккаунта |
| Сохранение прежних пользовательских записей | Аккаунт **Eric** после Hosting-публикаций отображает старую ленту/историю/профиль | **Визуально PASS**; доказательство точного UID/мультиустройства отдельно |
| PR #63 UX регистрации | HEAD `dda55bf8`: повтор пароля, статус неподтверждённого email; 382/382 unit PASS и браузерные эмуляторы; владелец опубликовал Hosting staging | **Deployed** |
| PR #64 автообновление | HEAD `abed937d`: `reload` и обновление Auth при возврате/видимости вкладки; 385/385 PASS | **Входит в опубликованный PR #65**, live UX по этому коду отдельно не изолирован |
| PR #65 one-click custom handler | HEAD `bef748fe78cdccb06085d48b3abba7cca6e94525`; 389/389 тестов, 3/3 CI PASS; владелец подтвердил Firebase Hosting release `Deploy complete!` | **Hosting deployed; новые реальные письма НЕ маршрутизируются туда** |
| Email Templates Action URL | Firebase Console Network `config?updateMask=notification.sendEmail.callbackU…` вернул **HTTP 400**, `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` / `INVALID_ARGUMENT`; текущий URL `reflect-ai-staging.firebaseapp.com/__/auth/action` | **Заблокировано сервером Firebase**; не повторять изменения, не покупать Blaze и не ждать Support по этому этапу |
| AI-01K Gate 5 | Stacked Draft PR #61 browser QA + #62–#65 source; live signed replay/cross-route/revoke tests и контролируемый Preview ON не завершены; backend Preview оставлен OFF | **PENDING**, отдельный GO на временный Railway staging Preview + соответствующую QA-сборку |
| Real xAI | Включение платного Grok, сквозная история/контекст и provider receipt пока не проверены | **NOT STARTED LIVE**, нужен отдельный GO и синтетическая проверка |
| PR-цепочка | #58–#65 — Draft/unmerged, ветки stacked; Hosting деплоится только из изолированных локальных worktree | **Не сливать main** без review и явного согласования |

Никогда не публиковать одноразовые email action-коды/ссылки, пароли, ID-token, App Check-token, UID, чувствительный контент или service account JSON в GitHub/чат.

## 3. Решение по email-авторизации: не блокировать MVP

**Текущий поддерживаемый сценарий P0:** Firebase Email/Password + стандартная доставка/обработчик Firebase. Это уже прошло живое подтверждение почты для Jack. После завершения действия у Firebase клиент Reflect (PR #64, уже включён в PR #65 Hosting) должен обновлять `emailVerified` при возвращении/видимости вкладки. **Важно:** отдельная кнопка «Завершить проверку» на стороне Firebase остаётся, а переход между разными браузерными профилями не переносит авторизацию автоматически. Это честный проверенный fallback, а не обещание one-click.

**Запрещённый ложный обход:** `ActionCodeSettings.url`/continueUrl НЕ заменяет глобальный URL обработчика, который определяется Firebase Email Templates. Также нельзя выдавать наличие `emailVerified` на клиенте за серверную авторизацию. Ссылку подтверждения нельзя превращать в доступ к чужому дневнику.

**Коммерческий альтернативный вариант, если UX-барьер блокирует выпуск:** серверная доставка кода подтверждения прямо в Reflect через существующий изолированный Railway + Firebase Admin + проверенного транзакционного email-провайдера (например Resend). Требуются подтверждённый домен отправителя, DNS SPF/DKIM/DMARC, защищённые server-only ключи и отдельное согласование стоимость/удержание данных/деплой.
- Пользователь регистрируется (анонимный Firebase UID привязывается к email), получает **6-значный код**, вводит его в той же форме. Можно вставить код без открытия внешнего URL.
- Backend принимает **подписанный Firebase ID token + App Check**, выбирает email только из текущего `auth.uid` (не из пользовательского JSON), проверяет неизменность UID/адреса/состояния аккаунта.
- Хранить лишь HMAC/хэш одноразового кода, TTL до 10 минут, лимит 5 попыток на выпуск, ограниченные повторные отправки по UID/IP и email, атомарное погашение/ревокация, non-enumerating responses, audit метаданных без кодов и персонального содержимого. Отправка/проверка находятся за отдельным server-only флагом **OFF** до QA.
- Только после серверной проверки подтверждения владения адресом Firebase Admin отмечает тот **же UID** как `emailVerified=true`; клиент принудительно обновляет Auth/ID token. Для security-sensitive функций всё равно требуется проверка актуального Firebase ID token на сервере.
- Не делать клиентский OTP или хранить коды/SMTP secrets в Vite/Firestore с публичными Rules. Не использовать Gmail как непроверенного массового production SMTP.
- Старые Jack/Eric не мигрировать, не удалять и не пере-регистрировать; применять новый путь только к новым/неподтверждённым аккаунтам после QA. Password reset/email change остаются на проверенном Firebase fallback, пока аналогичные защищённые маршруты не реализованы и не проверены.
- Публичный запуск OTP только после synthetic/emulator + реальный disposable mailbox E2E + cross-device + rate-limit/replay/expiry/security тестов и отдельного GO. Бесплатный тариф provider не равен гарантии доставки/коммерческой доступности.

**Решение на сегодня:** OTP — **условный улучшенный этап**, а не оправдание задержки работающего дневника и первого Grok. Не запускать почтовую инфраструктуру без подтверждённого домена и стоимости. Firebase template update считать **BLOCKED**; не просить владельца снова открывать DevTools или Save.

## 4. Очередность и Definition of Done

| Приоритет | Этап | Следующий проверяемый результат | Что считается завершением |
|---|---|---|---|
| **P0 — сейчас** | **05A: постоянный аккаунт** | Для Jack создать **синтетическую** заметку в приватном Firefox; войти в этот же email+пароль в независимом обычном Firefox/профиле без открытия старой сессии; проверить ту же заметку, профиль, refresh. Проверить вход/выход без создания нового guest UID и восстановление пароля на изолированном тестовом аккаунте. | Same UID подтверждается **фактом** того же авторского документа после независимого входа и/или безопасным локальным сравнением UID, без публикации UID; старые записи не потеряны; cross-UID Firestore чтение отвергнуто |
| **P0 — после 05A** | **AI-01K Gate 5** | Раздельный GO: короткий контролируемый staging backend Preview ON + предназначенная QA Hosting сборка; signed replay → 401, wrong route/UID deny, revoke → deny, Preview OFF → 404; без реальных личных данных | Подтверждённый браузерный отчёт по статус-кодам и откат Preview OFF, токены/контент не попадают в журналы |
| **P0** | **05B: Grok 4.3** | Настроенный persistent entitlement для verified account, budget ledger, App Check, одно-message consent; **одна** owner-approved платная синтетическая реплика с квитанцией употребления/стоимости | Реальный ответ xAI в UI, корректное сохранение и повторное открытие, retry/idempotency/quota verified; платные запросы не доступны гостям |
| **P1 параллельно** | **05C: Midnight Aurora UX** | Единые первый экран/лоадер/ошибки, favicon/PWA метаданные, mobile 320–430 и desktop, dark/light | Нет белых/пустых экранов, ошибки понятны, клавиатура/доступность проверены |
| **P1** | **05D: функциональная приёмка** | Матрица Diary/Moods/Goals/Sessions/Profile/Export/Delete; реальная персистентность после refresh, сбои без потери черновика | Core loop проходится новой учёткой, сохраняет все типы данных, экспорт/удаление протестированы, нет cross-user утечек |
| **P0 перед public** | **05E: Security/Release** | Firestore Rules, App Check, секреты/ротация, quotas/rate limit, GDPR-like privacy/terms, аудит логов, мониторинг, backup/rollback, CI, stacked PR review | Воспроизводимая QA приёмка и отдельно согласованный production GO; бюджет и право доступа проверены |
| **Позднее** | **06: рост и монетизация** | Локализация 3 UI языков (2 дополнительных — после утверждения), opt-in AI summaries, PWA/offline, research, pricing/retention | Только после stable V1 и подтверждённых пользовательских потребностей |

## 5. Ближайшие 1–3 действия владельца

1. **Не делать новых изменений Firebase Console.** Закрыть DevTools. Текущий встроенный Firebase email-handler оставить как резервный рабочий путь. Имеющийся Jack зарегистрирован и подтверждён.
2. В приватном Firefox **Jack** создать только синтетическую заметку с нейтральным содержимым (без личных данных); затем в обычном Firefox открыть staging и выбрать «Вход» в **существующий Jack**, не регистрировать нового пользователя; проверить заметку и refresh. Не трогать старый Chrome Eric.
3. Перед Gate 5 оформить **отдельный** scope/GO на временное изменение Railway staging Preview и Hosting QA. До него не менять серверные переключатели; Grok paid остаётся OFF.

## 6. Источники и правила доказательств
- Live evidence: owner’s screenshots, CLI build/deploy outputs, Firebase Console Network Response 2026-11-12; GitHub CI exact head #63–#65.
- Firebase [custom email handlers](https://firebase.google.com/docs/auth/custom-email-handler/); [continueUrl and ActionCodeSettings semantics](https://firebase.google.com/docs/auth/web/passing-state-in-email-actions/); [Admin-generated email action links](https://firebase.google.com/docs/auth/admin/email-action-links/).
- Отмечать стадии `CODE / CI PASS / HOSTING DEPLOYED / LIVE ACCOUNT PASS / PENDING / BLOCKED / PRODUCTION APPROVED` раздельно. Не считать прохождение CI или Hosting proof полной пользовательской/серверной приёмкой.
