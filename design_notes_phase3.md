# Metabolic Insights: Phase 3 Architecture and Product Design

## Product positioning

The first release will be a **secure web-based personal health intelligence platform** that gives each user a protected workspace for understanding how glucose, activity, nutrition, and sleep interact. Because several requested providers have material platform or partner limitations, the product will use a **connector abstraction** that supports three integration states: production-ready direct OAuth connectors, configurable partner-dependent connectors, and future native-bridge connectors.

## Integration strategy

| Source category | Requested providers | First-version strategy | Reasoning |
| --- | --- | --- | --- |
| Continuous glucose monitoring | Dexcom, Glooko | Build connector records, OAuth configuration model, sync status, and import pipeline scaffolding. Treat Dexcom as direct-OAuth capable and Glooko as partner-gated. | Dexcom publishes developer authentication documentation, while Glooko access appears more partner-oriented. |
| Activity | Fitbit, Google Fit, Apple Health | Implement Fitbit-style OAuth scaffolding, retain Google Fit as deprecated legacy status, and model Apple Health as a future native companion integration. | Fitbit is web-friendly, Google Fit is deprecated for new developers, and Apple Health depends on native HealthKit access. |
| Nutrition | MyFitnessPal, Cronometer | Provide connector management and normalization model, but treat production enablement as approval-dependent or unavailable until credentials and partner access are obtained. | Public availability is uncertain or limited for these sources. |
| Sleep | Oura, Fitbit, Apple Health | Implement Oura- and Fitbit-compatible connector scaffolding, and model Apple Health as native-bridge only. | Oura and Fitbit are realistic web-based connectors, while Apple Health is not directly web-native. |

## Data model

The platform will normalize all source data into user-owned metric tables so that dashboards, insights, chat, and summaries operate on a common schema instead of provider-specific payloads.

| Table | Purpose | Key fields |
| --- | --- | --- |
| `health_sources` | One row per configured provider connection per user. | provider, category, status, authType, accessToken, refreshToken, tokenExpiresAt, lastSyncAt, lastSyncStatus |
| `sync_jobs` | Tracks manual and background sync attempts. | sourceId, syncType, status, startedAt, finishedAt, recordCount, errorMessage |
| `glucose_readings` | Normalized glucose time series. | sourceId, readingAt, mgdl, trend, mealContext |
| `activity_samples` | Aggregated activity and workout data. | sourceId, sampleDate, steps, activeMinutes, caloriesBurned, workoutMinutes |
| `nutrition_logs` | Meal and macro summaries. | sourceId, loggedAt, mealName, calories, carbs, protein, fat, fiber |
| `sleep_sessions` | Sleep duration and quality records. | sourceId, sleepStartAt, sleepEndAt, durationMinutes, efficiency, score |
| `ai_insights` | Persisted generated correlations and recommendations. | userId, generatedAt, title, summary, severity, evidence, recommendation |
| `chat_threads` | Conversation containers for the health assistant. | userId, title, createdAt, updatedAt |
| `chat_messages` | User and assistant messages plus structured references. | threadId, role, content, citedMetricWindow |
| `weekly_summaries` | Generated weekly digests and delivery state. | userId, weekStartAt, weekEndAt, subject, summaryMarkdown, deliveryStatus, deliveredAt |

## Security and workflow model

All user-facing product routes beyond the landing page will require authentication. Source credentials will be stored server-side only. The application will expose protected procedures for reading the user's unified dashboard, syncing source placeholders, generating insight summaries, creating chat sessions, and listing weekly summaries. Frontend code will never directly access provider secrets or raw tokens.

## AI insight engine behavior

The insight engine will use normalized metric windows to compute interpretable relationships before invoking the language model. The server will aggregate seven-day and thirty-day windows across glucose, activity, sleep, and nutrition, then derive evidence such as post-meal spikes, reduced sleep before elevated fasting glucose, and workout-day recovery differences. The language model will receive structured summaries rather than raw tables, which keeps responses bounded, auditable, and more explainable.

Each generated insight should include a concise title, a natural-language explanation, explicit supporting evidence, and a practical recommendation. The recommendation layer will remain informational and coaching-oriented rather than diagnostic.

## Conversational assistant design

The assistant will operate over the same normalized user metric summaries used by the insight engine. Each answer should be context-aware, grounded in recent synced metrics, and framed as a health-pattern explanation rather than medical advice. The system prompt should instruct the model to cite the relevant date window, identify important correlations, acknowledge missing data when connectors are incomplete, and avoid clinical certainty.

## Weekly summary automation design

The first version will implement automated-summary **orchestration scaffolding** in the application data model and backend procedures. Because true production email dispatch requires verified email delivery credentials and a recurring job mechanism, the system will support summary generation, preview, scheduling metadata, and delivery status tracking. The implementation should be structured so a transactional email provider can be connected later without changing the user-facing summary experience.

## Frontend information architecture

| Route | Purpose | Access |
| --- | --- | --- |
| `/` | Blueprint-style landing page describing the product and secure sign-in entry. | Public |
| `/dashboard` | Unified health overview with charts, KPI cards, correlations, and date range filters. | Protected |
| `/history` | Deeper trend exploration and cross-metric comparisons over larger date windows. | Protected |
| `/sources` | Connected Sources hub for linking, unlinking, viewing readiness, and manual sync actions. | Protected |
| `/assistant` | Conversational AI health assistant with thread history. | Protected |
| `/summaries` | Weekly digest history, current preview, and delivery status. | Protected |

## Visual design system

The application will adopt a **blueprint / CAD interface aesthetic**. The global theme should use a deep royal blue canvas, high-contrast white typography, faint grid overlays, thin engineering-style borders, dimension-line accents, and rectangular framing around analytic modules. Charts should use restrained cyan, white, and pale steel-blue accents so data remains readable while preserving the technical interface identity.

## Delivery scope for this build

The implementation will focus on a strong first version with secure routing, connected-source management, normalized data models, interactive dashboarding, date filtering, persisted AI-generated insights, contextual chat, and weekly summary scaffolding. Real production OAuth exchange for every requested vendor will be modeled where possible but will remain subject to provider credentials, approvals, and platform constraints.
