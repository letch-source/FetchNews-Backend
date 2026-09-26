# FetchNews API contract

Shared contract between the backend (`backend/`, Node/Express, deployed on Render) and the iOS
app (`App/ApiClient.swift`, `App/Models.swift`). **When an endpoint changes, update this file in
the same commit** so both sides can pull the change instead of relaying it by hand.

Generated from `backend/index.js`, `backend/routes/*.js` and `App/ApiClient.swift`.
Request/response types marked "see Models.swift" are the Swift `Codable` structs the app decodes;
they are the source of truth for the client. Fields not listed here were not verified.

## Basics

| | |
|---|---|
| Production base URL | `https://fetchnews-backend.onrender.com` |
| Local dev base URL | `http://<host>:3001` (set in `ApiClient.base`) |
| Content type | `application/json` |
| Auth | `Authorization: Bearer <JWT>` |
| Rate limit | 100 requests / 15 min per IP on `/api/*`; exceeded -> `429 {"error": "Too many requests, please try again later."}` |
| Error shape | `{"error": "<message>"}`, sometimes plus `message`, `dailyCount`, `limit` (the Swift `ErrorResponse`) |

Common auth errors from the middleware: `401 Access token required`, `401 Invalid token`,
`401 Token expired`, `403 Account must be linked to Google. Please sign in with Google.`

Auth column: **Y** = `authenticateToken` (required), **opt** = `optionalAuth`, **-** = public,
**admin** = also requires an admin user. "iOS" = the app currently calls it.

## Auth (`/api/auth`)

| Method | Path | Auth | iOS | Body / notes |
|---|---|---|---|---|
| POST | `/api/auth/google` | - | Y | `{idToken}` -> `AuthResponse {message, token, user}` |
| POST | `/api/auth/register` | - | | email + password (legacy; login is Google-only per middleware) |
| POST | `/api/auth/signup` | - | Y* | client `signup(email,password)`; see mismatch note 5 |
| POST | `/api/auth/login` | - | | email + password |
| POST | `/api/auth/logout` | - | | |
| GET | `/api/auth/me` | Y | Y | -> `UserResponse {user}` |
| PUT | `/api/auth/name` | Y | Y | `{name}` (nullable) |
| POST | `/api/auth/timezone` | Y | Y | `{timezone}` (IANA name) |
| POST | `/api/auth/subscription` | Y | | |
| GET | `/api/auth/usage` | Y | | daily usage |
| POST | `/api/auth/admin/set-premium` | Y (admin) | Y | `{email, isPremium, adminEmail?}` |
| POST | `/api/auth/forgot-password` | - | | |
| POST | `/api/auth/reset-password` | - | | |
| GET | `/api/auth/verify-email?token=` | - | Y | -> message string |
| POST | `/api/auth/resend-verification` | Y | | |
| POST | `/api/auth/disconnect-google` | Y | | |

`User` (see Models.swift): `id, email, emailVerified, isPremium, dailyUsageCount, subscriptionId?,
subscriptionExpiresAt?, customTopics[], summaryHistory[], selectedTopics[], name?`.

Legacy, defined directly in `index.js` alongside the router: `GET /api/user`, `POST /api/topics`,
`DELETE /api/topics`, `POST /api/location` (use `authMiddleware`, not `authenticateToken`).

## Summaries and audio (defined in `index.js`)

| Method | Path | Auth | iOS | Body / notes |
|---|---|---|---|---|
| POST | `/api/summarize` | opt | Y | `{topics: [String], wordCount, location?, geo?, goodNewsOnly?, country?}`; `?noTts=1` skips audio. Used when exactly 1 topic. -> `SummarizeResponse {combined?, items[]}`. `400 topics must be an array`; `429` on daily limit |
| POST | `/api/summarize/batch` | opt | Y | `{batches: [{topics, wordCount, goodNewsOnly, ...}]}`; `?noTts=1`. Used for 2+ topics. -> `BatchSummarizeResponse {results[], batches[]}` (each `{items[], combined?}`) |
| POST | `/api/generate-welcome` | opt | Y | -> `TopicSection` |
| POST | `/api/tts` | - | Y | `{text, voice="alloy", speed=1.0}`; `400 text is required`, `501 TTS not configured` |
| POST | `/api/fetch-assistant` | Y | Y | `{fetchId, userMessage, conversationHistory=[], audioProgress?, currentTime?, totalDuration?}` -> `AssistantResponse {response, suggestedQuestions?, fetchContext?}` |
| GET | `/media/*` | - | | static audio files |

`Item`: `id, title, summary, url?, source?, topic?, audioUrl?`. `Combined`: `id, title, summary, audioUrl?`.

## Topics

| Method | Path | Auth | iOS | Notes |
|---|---|---|---|---|
| GET | `/api/custom-topics/predefined` | - | Y | `PredefinedTopicsResponse` |
| GET | `/api/custom-topics` | Y | Y | -> topic names |
| POST | `/api/custom-topics` | Y | Y | `{topic}` |
| PUT | `/api/custom-topics` | Y | Y | `{customTopics: [String]}` |
| DELETE | `/api/custom-topics/bulk` | Y | Y | `{topics: [String]}` |
| DELETE | `/api/custom-topics/:topic` | Y | | |
| GET | `/api/trending-topics` | - | Y | `TrendingTopicsResponse` |
| POST | `/api/trending-topics/update` | ? | | trending refresh |
| GET | `/api/trending-topics/:topic/sources` | ? | | |
| GET | `/api/recommended-topics` | Y | Y | -> `[TopicSection]` |
| GET | `/api/recommended-topics/names` | Y | Y | `RecommendedTopicsResponse` |
| POST | `/api/topics/analyze` | Y | Y | topic intelligence |
| POST | `/api/topics/analyze-batch` | Y | Y | |
| POST | `/api/topics/learn-from-feedback` | Y | Y | |
| GET | `/api/topics/suggestions/:topic` | Y | Y | |
| GET | `/api/articles/by-category/:category` | opt | | cached articles |
| GET | `/api/articles/cache-stats` | - | | |

## User data

| Method | Path | Auth | iOS | Notes |
|---|---|---|---|---|
| GET | `/api/preferences` | Y | Y | `UserPreferences {selectedVoice, playbackRate, upliftingNewsOnly, length, lastFetchedTopics[], selectedTopics?, excludedNewsSources[], selectedCountry?}` |
| PUT | `/api/preferences` | Y | Y | full `UserPreferences` |
| GET | `/api/preferences/debug` | Y | | |
| GET | `/api/news-sources` | Y | Y | `NewsSourcesResponse` |
| PUT | `/api/news-sources` | Y | Y | `{excludedSources: [String]}` |
| GET | `/api/summary-history` | Y | Y | `[SummaryHistoryEntry]` |
| POST | `/api/summary-history` | Y | Y | `{summaryData}` |
| DELETE | `/api/summary-history/:id` | Y | Y | removes one entry; idempotent (200 even if the id is already gone) -> `{message, summaryHistory[]}` |
| DELETE | `/api/summary-history` | Y | | clears all history |
| GET | `/api/saved-summaries` | Y | Y | |
| POST | `/api/saved-summaries` | Y | Y | `{summaryData}` |
| DELETE | `/api/saved-summaries/:id` | Y | Y | |
| DELETE | `/api/saved-summaries` | Y | | clears all |
| GET | `/api/saved-summaries/check/:id` | Y | Y | -> Bool |
| POST | `/api/article-feedback` | Y | | |
| POST | `/api/article-feedback/with-comment` | Y | Y | `{articleId, url?, title?, source?, topic?, ...}` |
| GET | `/api/article-feedback` | Y | | |

## Scheduled summaries (`/api/scheduled-summaries`)

| Method | Path | Auth | iOS | Notes |
|---|---|---|---|---|
| GET | `/` | Y | Y | `[ScheduledSummary]` |
| POST | `/` | Y | Y | `ScheduledSummary` |
| PUT | `/:id` | Y | Y | `ScheduledSummary` (+ optional `timezone`) |
| DELETE | `/:id` | Y | Y | |
| POST | `/:id/execute` | Y | | run one now |

## Notifications and subscriptions

| Method | Path | Auth | iOS | Notes |
|---|---|---|---|---|
| POST | `/api/notifications/register-token` | Y | Y | APNs device token |
| POST | `/api/notifications/unregister-token` | Y | Y | |
| GET / PUT | `/api/notifications/preferences` | Y | | |
| POST | `/api/notifications/fetch-ready` | Y | Y | `{fetchTitle}` |
| POST | `/api/notifications/test` | Y | | |
| GET | `/api/notifications/diagnostics` | Y | | |
| POST | `/api/subscriptions/validate-receipt` | Y | Y | `{receipt, transactionID, platform: "ios"}` |

## Admin, ops and health

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health`, `/api/test`, `/api/test-newsapi` | - | health / diagnostics |
| GET / POST | `/api/admin/` | Y | admin actions log |
| GET | `/api/admin/stats`, `/users`, `/user-data/:email`, `/global-news-sources` | Y | |
| POST | `/api/admin/users/:email/reset-usage`, `/global-news-sources` | Y | |
| GET | `/api/admin/cache/status`, `/cache/stats`, `/categorization-status` | Y | |
| POST | `/api/admin/cache/refresh`, `/categorize-articles` | Y | |
| GET / PUT / DELETE | `/api/admin/trending-topics` | Y | trending override |
| GET | `/api/scheduler/health`, `/executions`, `/stats`, `/circuit-breaker`, `/queue`, `/lock` | admin | |
| POST | `/api/scheduler/circuit-breaker/reset`, `/queue/clear`, `/lock/release`, `/lock/cleanup` | admin | |
| POST, GET | `/api/test-fetch`, `/api/test-fetch/cache-stats`, `/sample-articles/:topic` | - | **public, no auth**; see note 6 |
| GET | `/admin`, `/admin/` | - | static admin UI |
| GET | `/.well-known/apple-app-site-association` | - | served from `public/.well-known/`, which is not in the repo |

## Known mismatches (found while writing this)

The iOS client calls these, but no matching route exists in `backend/`. Each will 404 (or match
a different route) today. Decide per item whether to fix the client or add the route.

1. `ApiClient.removeCustomTopic` -> `POST /api/custom-topics/remove`. Server only has
   `DELETE /api/custom-topics/:topic` and `DELETE /api/custom-topics/bulk`.
2. `ApiClient.updateUserPreference` -> `PATCH /api/preferences/:preference`. Server has only
   `GET/PUT /api/preferences` (no PATCH anywhere in `backend/`).
3. `ApiClient.triggerScheduledSummaries` -> `POST /api/scheduled-summaries/execute`. Server only
   has `POST /api/scheduled-summaries/:id/execute`.
4. `ApiClient.getAdminActions` -> `GET /api/admin-actions`. Server mounts the admin actions router
   at `GET /api/admin/`.
5. ~~`ApiClient.deleteSummaryFromHistory` -> `DELETE /api/summary-history/:id`~~ fixed by adding
   that route. Still open: `/api/auth/signup` and `/api/auth/login` exist both in `routes/auth.js`
   (as `/register`, `/login`) and as older handlers in `index.js`; the router is mounted first so it
   wins for `/login`. `signup` has no router equivalent (and the client's `signup` has no callers).
6. `/api/test-fetch` routes are mounted without auth (the `authenticateToken` lines are commented
   out with "For production safety" notes). Consider gating them.
7. `/.well-known/apple-app-site-association` is served from `public/.well-known/`, which does not
   exist in the repo, so universal links will 404 unless that file is added at deploy time.

## Change log

- Initial version, generated from the code at commit `22f5894`.
- Added `DELETE /api/summary-history/:id` (fixes swipe-to-delete in `SummaryHistoryView`).
