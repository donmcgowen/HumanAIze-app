# Metabolic Insights - Integration Guide

## Overview

Metabolic Insights is an AI-powered personal health intelligence platform that unifies glucose, activity, nutrition, and sleep data into a single dashboard with actionable insights and a conversational health assistant.

This document outlines the integration architecture, current implementation status, and requirements for connecting third-party health data sources.

---

## Architecture Overview

### Core Components

**Frontend:**
- React 19 + Tailwind CSS 4 with blueprint-style design system
- Protected dashboard with Manus OAuth authentication
- Interactive charts with date-range filtering
- AI chat assistant interface
- Connected sources management page

**Backend:**
- Express 4 + tRPC 11 with MySQL database
- Drizzle ORM for type-safe database operations
- LLM integration for AI insights and chat responses
- Demo data seeding for immediate user experience

**Database Schema:**
- `users` - User accounts with OAuth identity
- `healthSources` - Connected data source configurations
- `syncJobs` - Sync history and status tracking
- `glucoseReadings` - CGM glucose data
- `activitySamples` - Steps, workouts, and activity metrics
- `nutritionLogs` - Meals, calories, and macronutrient data
- `sleepSessions` - Sleep duration and quality metrics
- `aiInsights` - Generated health insights and recommendations
- `chatThreads` & `chatMessages` - Chat history and conversations
- `weeklySummaries` - Automated digest emails

---

## Integration Status

### Fully Implemented (Demo Mode)

✅ **Dashboard & Analytics**
- Unified health metrics display (glucose, activity, nutrition, sleep)
- Interactive charts with 7-30 day date range filtering
- Cross-metric correlation analysis
- AI-powered insight generation
- Weekly summary generation

✅ **AI Features**
- Context-aware health assistant with natural language chat
- Insight generation based on health data patterns
- Weekly summary generation covering all metric categories

✅ **Connected Sources Management**
- Link/unlink interface for all data sources
- Sync status tracking and last sync timestamps
- Source categorization (glucose, activity, nutrition, sleep)

### Scaffolding (Ready for Implementation)

The following integrations have placeholder scaffolding and are ready for implementation with real API credentials:

#### Glucose Sources

**Dexcom CGM**
- Status: `connected` (scaffolding ready)
- Auth Type: OAuth 2.0
- Implementation Stage: Direct OAuth flow
- Supported Metrics: Glucose readings, trend arrows
- API Docs: https://developer.dexcom.com/docs/dexcom/authentication/
- Requirements:
  - Dexcom Developer Account
  - OAuth Client ID and Secret
  - Redirect URI: `{app-url}/api/oauth/dexcom/callback`

**Glooko**
- Status: `attention` (partner required)
- Auth Type: Partner Integration
- Implementation Stage: Partner-oriented flow
- Supported Metrics: Glucose logs, device data, therapy data
- API Docs: https://developers.glooko.com/docs/directintegrations
- Requirements:
  - Glooko Partner Agreement
  - Partner API credentials
  - Data sharing authorization

#### Activity Sources

**Fitbit**
- Status: `connected` (scaffolding ready)
- Auth Type: OAuth 2.0
- Implementation Stage: Direct OAuth flow
- Supported Metrics: Steps, workouts, sleep, heart rate
- API Docs: https://dev.fitbit.com/build/reference/web-api/
- Requirements:
  - Fitbit Developer Account
  - OAuth Client ID and Secret
  - Redirect URI: `{app-url}/api/oauth/fitbit/callback`

**Apple Health**
- Status: `planned` (native bridge)
- Auth Type: Native HealthKit bridge
- Implementation Stage: Native iOS/macOS integration
- Supported Metrics: Activity, sleep, nutrition, workouts
- API Docs: https://developer.apple.com/documentation/healthkit/
- Requirements:
  - Apple Developer Account
  - HealthKit entitlements
  - iOS/macOS app wrapper for HealthKit access

**Google Fit**
- Status: `planned` (legacy)
- Auth Type: OAuth 2.0 (deprecated for new integrations)
- Implementation Stage: Legacy placeholder
- Note: Google has deprecated new Google Fit integrations; recommend Fitbit or Apple Health instead
- API Docs: https://developers.google.com/fit

#### Nutrition Sources

**MyFitnessPal**
- Status: `attention` (partner required)
- Auth Type: Partner Integration
- Implementation Stage: Partner-oriented flow
- Supported Metrics: Meals, calories, macronutrients
- Requirements:
  - MyFitnessPal Partner Agreement
  - Partner API credentials
  - Note: MyFitnessPal does not offer public API; partner access required

**Cronometer**
- Status: `ready` (manual import)
- Auth Type: Manual export/import
- Implementation Stage: CSV/JSON import flow
- Supported Metrics: Meals, calories, micronutrients, supplements
- API Docs: https://cronometer.com/
- Requirements:
  - User exports data from Cronometer
  - CSV/JSON file upload to platform

#### Sleep Sources

**Oura Ring**
- Status: `ready` (scaffolding ready)
- Auth Type: OAuth 2.0
- Implementation Stage: Direct OAuth flow
- Supported Metrics: Sleep duration, quality, recovery, readiness
- API Docs: https://cloud.ouraring.com/docs/authentication
- Requirements:
  - Oura Developer Account
  - OAuth Client ID and Secret
  - Redirect URI: `{app-url}/api/oauth/oura/callback`

**Fitbit Sleep**
- Status: `connected` (via Fitbit integration)
- Included in Fitbit OAuth flow
- Supported Metrics: Sleep duration, stages, efficiency

---

## Data Normalization

All imported health data is normalized into a unified schema:

```typescript
// Glucose (mg/dL)
glucoseReadings: {
  timestamp: number,
  value: number,
  trend?: 'up' | 'down' | 'stable',
  source: string
}

// Activity (daily)
activitySamples: {
  date: string,
  steps: number,
  calories: number,
  activeMinutes: number,
  workouts: Workout[],
  source: string
}

// Nutrition (daily)
nutritionLogs: {
  date: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  meals: Meal[],
  source: string
}

// Sleep (nightly)
sleepSessions: {
  date: string,
  durationHours: number,
  quality: number,
  stages?: { light: number, deep: number, rem: number },
  source: string
}
```

---

## Sync Architecture

### Sync Jobs

Each connected source has a `syncJob` record tracking:
- Last sync timestamp
- Sync status (`idle`, `syncing`, `success`, `error`)
- Last error message (if applicable)
- Sync frequency (configurable per source)

### Sync Triggers

1. **Manual Sync** - User clicks "Sync Now" on Connected Sources page
2. **Scheduled Sync** - Background job runs every 4 hours (configurable)
3. **On-Demand** - Triggered when user views dashboard (if last sync > 2 hours old)

### Sync Flow

```
1. Check source credentials are valid
2. Call third-party API with auth token
3. Fetch new data since last sync timestamp
4. Normalize data to unified schema
5. Store in database
6. Update sync job status
7. Trigger insight regeneration
8. Update dashboard cache
```

---

## API Integration Patterns

### OAuth 2.0 Flow (Dexcom, Fitbit, Oura)

```typescript
// 1. Redirect user to provider authorization
GET /api/oauth/{provider}/authorize
  → Redirects to provider OAuth consent screen

// 2. Provider redirects back with authorization code
GET /api/oauth/{provider}/callback?code=...&state=...
  → Exchange code for access token
  → Store token in healthSources table
  → Redirect to dashboard

// 3. Periodic token refresh
POST /api/oauth/{provider}/refresh
  → Use refresh token to get new access token
  → Update stored token
```

### Partner Integration Flow (Glooko, MyFitnessPal)

```typescript
// 1. Establish partner connection
POST /api/integrations/{provider}/connect
  → Validate partner credentials
  → Store partner API key
  → Request initial data sync

// 2. Receive webhook notifications
POST /api/webhooks/{provider}
  → Provider sends data update notifications
  → Trigger sync job
  → Fetch updated data
```

### Manual Import Flow (Cronometer)

```typescript
// 1. User exports data from source
// 2. User uploads CSV/JSON file
POST /api/integrations/{provider}/import
  → Parse file
  → Normalize data
  → Store in database

// 3. Trigger insight regeneration
```

---

## Environment Variables Required

### OAuth Credentials

```env
# Dexcom
DEXCOM_OAUTH_CLIENT_ID=...
DEXCOM_OAUTH_CLIENT_SECRET=...
DEXCOM_OAUTH_REDIRECT_URI=...

# Fitbit
FITBIT_OAUTH_CLIENT_ID=...
FITBIT_OAUTH_CLIENT_SECRET=...
FITBIT_OAUTH_REDIRECT_URI=...

# Oura
OURA_OAUTH_CLIENT_ID=...
OURA_OAUTH_CLIENT_SECRET=...
OURA_OAUTH_REDIRECT_URI=...

# Glooko (Partner)
GLOOKO_PARTNER_API_KEY=...
GLOOKO_PARTNER_SECRET=...

# MyFitnessPal (Partner)
MFP_PARTNER_API_KEY=...
MFP_PARTNER_SECRET=...
```

### Manus Built-in Services

```env
# Automatically injected by Manus platform
DATABASE_URL=mysql://...
JWT_SECRET=...
VITE_APP_ID=...
OAUTH_SERVER_URL=...
BUILT_IN_FORGE_API_URL=...
BUILT_IN_FORGE_API_KEY=...
```

---

## Deployment Considerations

### Performance

- **Sync Concurrency**: Limit concurrent syncs to 3 sources to avoid rate limiting
- **Cache Strategy**: Cache dashboard data for 5 minutes
- **Database Indexes**: Add indexes on `userId`, `date`, `timestamp` for query performance

### Security

- **Token Storage**: Store OAuth tokens encrypted in database
- **Scope Minimization**: Request only necessary OAuth scopes
- **Rate Limiting**: Implement rate limiting on sync endpoints (10 syncs/hour per user)
- **Data Isolation**: Ensure users can only access their own data

### Compliance

- **HIPAA** (if handling PHI): Implement audit logging, encryption at rest/transit
- **GDPR** (if serving EU users): Implement data export/deletion workflows
- **Terms of Service**: Comply with each provider's ToS (data retention, usage)

---

## Testing

### Unit Tests

```bash
pnpm test
```

Runs vitest suite covering:
- Health analytics engine
- Data aggregation and normalization
- Insight generation logic
- Chat assistant context building
- Weekly summary generation

### Integration Testing

Manual testing checklist:
- [ ] Dashboard loads with demo data
- [ ] Date range filtering works correctly
- [ ] Connected Sources page displays all sources
- [ ] AI chat responds to health questions
- [ ] Weekly summary generates correctly
- [ ] All navigation links work

### Load Testing

Recommended tools:
- k6 for load testing sync endpoints
- Artillery for stress testing dashboard queries

---

## Common Issues & Troubleshooting

### Issue: "Cannot add or update a child row" (Foreign Key Error)

**Cause**: Test user creation without proper database setup
**Solution**: Ensure database migrations have run and users table exists

### Issue: OAuth redirect URI mismatch

**Cause**: Redirect URI in provider dashboard doesn't match app configuration
**Solution**: Update OAuth app settings to match `{app-url}/api/oauth/{provider}/callback`

### Issue: Sync jobs stuck in "syncing" state

**Cause**: Previous sync crashed without updating status
**Solution**: Implement sync job timeout (30 minutes) to auto-reset stuck jobs

### Issue: Glucose readings not appearing on dashboard

**Cause**: Data normalization failed or source not connected
**Solution**: Check sync job status and error logs; verify data format

---

## Future Enhancements

1. **Real-time Sync**: WebSocket-based sync notifications instead of polling
2. **Advanced Analytics**: Machine learning models for predictive glucose trends
3. **Wearable Integration**: Direct device connections (Oura Ring, Apple Watch)
4. **Social Features**: Share insights with healthcare providers
5. **Mobile App**: Native iOS/Android apps with HealthKit/Google Fit integration
6. **Automated Interventions**: Smart alerts and recommendations based on patterns
7. **Export Capabilities**: Generate PDF reports for medical appointments

---

## Support & Contact

For questions or issues with integrations:
1. Check this guide and troubleshooting section
2. Review provider API documentation
3. Check application logs in `.manus-logs/` directory
4. Contact Manus support at https://help.manus.im

---

## Version History

- **v1.0.0** (2026-04-10): Initial release with demo data and scaffolding for all integrations
