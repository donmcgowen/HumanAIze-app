# Automated Background Syncing Guide

This guide explains how to set up automated background syncing for health data sources like Dexcom, Fitbit, and Glooko.

## Overview

The app now includes an automated background sync scheduler that:

- **Runs every 5 minutes** to sync all connected health sources
- **Stores all data locally** in the database for fast analytics and correlation
- **Tracks sync status** with timestamps and error messages
- **Works across all users** - syncs all connected sources for all users simultaneously
- **Handles failures gracefully** - logs errors and continues with next source

## Architecture

### Data Flow

```
User connects Dexcom → Credentials stored → Background sync (every 5 min)
                                                ↓
                                        Fetch last 1 day of data
                                                ↓
                                        Store in local database
                                                ↓
                                        Update sync status & timestamp
```

### Storage Strategy

All glucose readings, activity data, and nutrition logs are **stored in your database**:

- **Glucose readings**: `glucose_readings` table (value, trend, timestamp)
- **Activity data**: `activity_samples` table (steps, calories, distance)
- **Sync jobs**: `sync_jobs` table (status, record count, errors)
- **Source metadata**: `health_sources` table (last sync time, status)

**Benefits:**
- Fast queries (no external API calls needed)
- Historical analysis and trend detection
- Correlation across multiple data types
- Works offline
- No dependency on external API availability

## Setting Up Dexcom Developer Account

### Step 1: Create Dexcom Developer Account

1. Go to [Dexcom Developer Portal](https://developer.dexcom.com)
2. Sign up for a developer account
3. Create a new application
4. Get your **Client ID** and **Client Secret**

### Step 2: Configure OAuth Redirect URI

In your Dexcom developer app settings:

1. Set redirect URI to: `https://your-app-domain.com/api/oauth/callback`
2. For local development: `http://localhost:3000/api/oauth/callback`

### Step 3: User OAuth Flow

When a user connects Dexcom:

1. User clicks "Connect" on Dexcom source
2. Redirected to Dexcom OAuth login
3. User authorizes the app
4. OAuth token is stored securely in the database
5. Background sync automatically starts pulling data

### Step 4: Verify Sync is Running

Check the server logs for sync messages:

```
[BackgroundSync] Started scheduler - syncing every 5 minutes
[BackgroundSync] Starting sync for X sources
[BackgroundSync] ✓ Dexcom CGM (user: 123): 45 records
[BackgroundSync] Global sync cycle completed
```

## Monitoring Sync Status

### Via tRPC Endpoint

```typescript
// Get current sync status
const status = await trpc.sync.status.query();

// Returns:
{
  isRunning: true,           // Scheduler is active
  isSyncing: false,          // Not currently syncing
  lastCheck: 1712764800000   // Last check timestamp
}
```

### Via Database Queries

Check recent sync jobs:

```sql
SELECT * FROM sync_jobs 
WHERE userId = ? 
ORDER BY finishedAt DESC 
LIMIT 10;
```

Check source sync status:

```sql
SELECT displayName, lastSyncAt, lastSyncStatus, lastError 
FROM health_sources 
WHERE userId = ? AND status = 'connected';
```

## Configurable Sync Interval

The default sync interval is **5 minutes**. To change it:

### In `server/_core/index.ts`:

```typescript
// Change the interval (in minutes)
await startBackgroundSync(10); // Sync every 10 minutes
```

**Recommended intervals:**
- **5 minutes**: Most frequent, best for real-time glucose monitoring
- **15 minutes**: Balance between freshness and API rate limits
- **30 minutes**: Lower frequency, good for activity data

## Handling Dexcom API Rate Limits

Dexcom API has rate limits. The app handles this by:

1. **Syncing only last 1 day** during background sync (not full 30 days)
2. **Deduplicating records** to avoid unnecessary updates
3. **Tracking errors** in sync_jobs table
4. **Continuing on failure** - if one source fails, others still sync

If you hit rate limits:

1. Increase sync interval to 15-30 minutes
2. Check `sync_jobs` table for error patterns
3. Verify Dexcom API credentials are correct

## Data Retention

By default, the app stores:

- **Glucose readings**: All historical data (no limit)
- **Activity data**: All historical data
- **Sync jobs**: Last 100 sync attempts per source

To customize retention, modify `dataImport.ts`:

```typescript
// Currently syncs last 1 day
const daysBack = 1; // Change this value
```

## Troubleshooting

### Sync not running

1. Check server logs for `[BackgroundSync]` messages
2. Verify database connection is working
3. Ensure at least one source is marked as "connected"

### Sync failing with errors

1. Check `sync_jobs` table for error messages
2. Verify Dexcom OAuth token is still valid
3. Check Dexcom API status page
4. Verify API rate limits haven't been exceeded

### No data appearing

1. Verify sync is running (check logs)
2. Check `sync_jobs` table shows successful syncs
3. Query `glucose_readings` table directly
4. Verify source is marked as "connected"

## Security Notes

- **Credentials are never logged** - only stored in database metadata
- **OAuth tokens are encrypted** - stored securely in source metadata
- **Sync runs server-side** - no API calls from client
- **User data is isolated** - each user only syncs their own sources

## Next Steps

1. **Set up Dexcom developer account** (see Step 1-2 above)
2. **Connect Dexcom source** via the UI
3. **Monitor sync status** in server logs
4. **Verify data** in database tables
5. **Build analytics** on top of stored data

## API Reference

### Background Sync Functions

```typescript
// Start scheduler (called automatically on server startup)
await startBackgroundSync(intervalMinutes: number): Promise<void>

// Stop scheduler (for graceful shutdown)
await stopBackgroundSync(): Promise<void>

// Get current status
getSyncStatus(): { isRunning: boolean; isSyncing: boolean; lastCheck: number }
```

### Import Functions

```typescript
// Import Dexcom glucose data
await importDexcomGlucose(
  userId: number,
  sourceId: number,
  credentials: { accessToken: string },
  daysBack?: number
): Promise<ImportResult>

// Import Fitbit activity data
await importFitbitActivity(
  userId: number,
  sourceId: number,
  credentials: { accessToken: string; fitbitUserId: string },
  daysBack?: number
): Promise<ImportResult>

// Import Glooko data
await importGlookoData(
  userId: number,
  sourceId: number,
  credentials: { apiKey: string; apiSecret: string },
  daysBack?: number
): Promise<ImportResult>
```

## Questions?

For issues with:

- **Dexcom API**: Check [Dexcom Developer Docs](https://developer.dexcom.com/docs)
- **App sync**: Check server logs and `sync_jobs` table
- **Database**: Verify MySQL connection and schema migrations
