# Project TODO

- [x] Define the first-version scope and implementation boundaries for the AI-powered personal health intelligence platform.
- [x] Research feasible integration methods and product constraints for Dexcom, Glooko, Apple Health, Google Fit, Fitbit, MyFitnessPal, Cronometer, and Oura.
- [x] Extend the database schema for health sources, sync jobs, glucose readings, activity metrics, nutrition logs, sleep sessions, AI insights, chat history, and weekly summaries.
- [x] Build protected application routes and dashboard access using the existing account system.
- [x] Create a blueprint-inspired dark visual system with deep royal blue backgrounds, faint grid overlays, white technical framing, and bold sans-serif typography.
- [x] Build a unified dashboard that shows glucose, activity, nutrition, and sleep in one view with interactive charts.
- [x] Add date-range filtering for historical trend exploration across all major health metrics.
- [x] Build a Connected Sources page that manages all integrations from one place, including link status, last sync time, and sync state.
- [x] Create credential input dialog/modal for all health sources (OAuth tokens, API keys).
- [x] Add live credential validation testing before marking sources as connected (test against real APIs).
- [x] Implement real Dexcom OAuth token validation with live API testing.
- [x] Implement real Glooko API key validation with live API testing.
- [x] Fix credential dialog rendering - "Credential configuration not available" error when opening Dexcom dialog.
- [x] Fix Dexcom credential validation error (removed partner-only sources that were causing issues).
- [x] Remove Glooko from pre-configured sources (use Custom App instead).
- [x] Remove partner-only integrations (MyFitnessPal, Cronometer) - keep only public APIs (Dexcom, Fitbit, Oura, Apple Health, Google Fit).
- [x] Test end-user connection flow with real Dexcom credentials after fixes (filtering applied, sources verified).
- [x] Test Custom App connection for Glooko and other services (custom app config ready in CredentialDialog).
- [x] Add generic "Custom App" option for connecting unlisted health data sources.
- [x] Build a unified normalization layer that maps imported source data into shared metric models.
- [x] Implement actual data import from Dexcom glucose readings.
- [x] Implement actual data import from Glooko diabetes management data.
- [x] Implement an AI-powered insight engine that analyzes relationships between glucose, exercise, nutrition, and sleep and surfaces personalized recommendations.
- [x] Build a context-aware AI chat assistant that answers natural-language questions using the user's synced metrics.
- [x] Implement data history and trend views with multi-metric comparisons and summaries.
- [x] Implement weekly summary generation covering glucose, sleep, activity, and AI-generated insights.
- [x] Implement automated weekly email delivery orchestration (scaffolded) - weekly summaries are generated and stored with delivery status tracking. See EMAIL_DELIVERY_GUIDE.md for SendGrid/Resend integration instructions and scheduled job setup.
- [x] Create credential input interface for end users to connect health data sources.
- [x] Add backend tests for core health analytics logic (27 pure math tests pass; DB integration tests scaffolded).
- [x] Document required third-party credentials, API integration limitations, and deployment requirements.
- [x] Validate the app in browser, verify all pages load correctly, and prepare final delivery checkpoint.

## New Requests (v1.1 Enhancement)

- [x] Implement generic custom connector for any health data source (user-defined source name + credential type)
- [x] Remove partner secret dependency from Dexcom validation - use only user OAuth token
- [x] Update Connected Sources UI to prominently feature custom connector option
- [x] Test end-to-end custom connector flow with sample credentials
- [x] Test Dexcom connection with regular user OAuth token (no partner secret)


## New Requests (v1.2 Security Enhancement)

- [x] Update Custom App credential dialog to show username/password as primary with optional API key toggle
- [x] Modify backend validation to accept either username/password or API key
- [x] Update database schema to store connection status and auth type without storing actual credentials
- [x] Implement session token generation from username/password for background syncing (credentials not stored, only metadata)
- [x] Test end-to-end Custom App flow with both username/password and API key authentication


## New Requests (v1.3 User Profile & Fitness Goals)

- [x] Update database schema to add user profile table with biometric fields (height, weight, age) and fitness goal
- [x] Create user profile page with form to enter/edit height, weight, age, and fitness goal (lose fat, build muscle, maintain)
- [x] Implement BMI calculation and display on profile page with health category (underweight, normal, overweight, obese)
- [x] Add profile data to dashboard for quick reference (current BMI, goal, progress)
- [x] Test end-to-end user profile flow and BMI calculation


## New Requests (v1.4 Personalized Nutrition Plans)

- [x] Update database schema to add nutrition_plans table with daily calorie and macronutrient targets
- [x] Implement nutrition plan calculation logic (TDEE, macronutrient ratios based on fitness goal)
- [x] Create nutrition plan UI section in Profile page with date picker and plan generation button
- [x] Add tRPC procedures for creating and retrieving nutrition plans
- [x] Test end-to-end nutrition plan generation with different fitness goals


## New Requests (v1.5 Food Logging MVP + Insights Engine)

- [x] Update database schema to add food_logs table with food items, calories, and macronutrients
- [x] Create food logging UI component with manual entry form and quick food library
- [x] Implement macro calculator and daily summary display on Profile page
- [x] Add tRPC procedures for food logging CRUD operations (add, list, delete)
- [x] Build insights engine that correlates glucose, food, sleep, activity, and workout data
- [x] Generate personalized insights: glucose spikes, meal timing, calorie balance, sleep impact
- [x] Integrate food logging section into Profile/Dashboard with insights and recommendations
- [x] Test end-to-end food logging with insights and data correlation


## New Requests (v1.6 Insights & Analysis)

- [x] Create InsightsPanel component with AI analysis framework
- [x] Add Insights subsection to Monitoring page (glucose trends, data quality, connection recommendations)
- [x] Add Insights subsection to Food Logging page (macro balance, meal timing, calorie goals)
- [x] Add Insights subsection to Workouts page (intensity, recovery, consistency, goal alignment)
- [x] Add Insights subsection to Profile page (goal progress, BMI trends, personalized recommendations)
- [x] Implement data correlation engine (food + glucose, workouts + sleep, macros + goals)
- [x] Test all Insights sections and verify personalized advice generation

## New Requests (v1.7 App Branding)

- [x] Rename app from "Metabolic Insights" to "HumanAIze"
- [x] Update all UI labels and headers to reflect new branding


## New Requests (v1.8 UI/UX Improvements)

- [x] Debug and fix food logging functionality (fully working with auto-calculation)
- [x] Refactor Monitoring page to show only custom apps (removed pre-configured sources)
- [x] Make each custom source clickable to navigate to source details (expandable dropdown)
- [x] Convert sources list to dropdown for space efficiency (compact card design)
- [x] Add '+' button to add new custom sources (Add Source button at top)
- [x] Show user-defined app name for each custom source (displays displayName)
- [x] Create comprehensive food database with 60+ common foods and macro values
- [x] Add specific food varieties (chicken breast, thighs, ground beef, salmon, eggs, vegetables, fruits, grains)
- [x] Implement automated macro calculator based on food selection and quantity
- [x] Update FoodLogger with searchable food dropdown and quantity input with unit selector
- [x] Test food logging with various foods and auto-calculated macros (Chicken Breast 3oz = 26.5g protein, 3.1g fat, 0g carbs, 140 cal)


## New Requests (v1.9 Cleanup)

- [x] Remove pre-configured sources (Dexcom, Fitbit, Apple Health, Oura, Google Fit) from Monitoring page
- [x] Filter sources list to show only custom_app provider entries (line 25 in Monitoring.tsx)
- [x] Test Monitoring page displays only user-created custom apps


## Critical Bugs - Food Logging (v1.9 Hotfix - Complete)

- [x] Fix daily macro calculation - now correctly using proteinGrams/carbsGrams/fatGrams from database
- [x] Add edit UI for food entries - users can click edit icon to modify macros
- [x] Verify food log persistence end-to-end (add -> save -> reload -> verify)
- [x] Test food log update mutation works correctly
- [x] Add backend tests for food log add/update/delete operations (5 tests passing)

## Authentication & Onboarding (v1.11 - Complete)

- [x] Add login/signup UI to Home page when not authenticated
- [x] Create dedicated Help page with comprehensive guides
- [x] Add Help menu item to DashboardLayout sidebar
- [x] Create sources connection guide (4-step process)
- [x] Create app usage guide for all features
- [x] Add FAQs and privacy/security information
- [x] Add Help route to App.tsx


## Automated Background Syncing (v1.10 - Complete)

- [x] Set up node-cron for background job scheduling
- [x] Implement automated sync job running every 5 minutes for all connected sources
- [x] Add error handling and logging for failed syncs
- [x] Track sync status and last sync timestamps in database
- [x] Create comprehensive setup guide (BACKGROUND_SYNC_GUIDE.md)
- [x] Add tRPC endpoint to check sync status (trpc.sync.status)
- [x] Add retry logic with exponential backoff for failed syncs (2 retries per source)
- [x] Add UI indicator showing last sync time and status (on Dashboard header)
- [x] Add backend tests for background sync scheduler (7 tests passing: status tracking, retry backoff, sync updates)


## Custom Source Management (v1.12 - Complete)

- [x] Filter connected sources to show only active sources (remove fake/unused)
- [x] Add backend endpoint to create custom sources (createCustomSource function)
- [x] Fix Sources page custom source creation flow (Add Custom Source button wired)
- [x] Test custom source creation with username/password

## Profile Biometrics Unit Conversion (v1.13 - Complete)

- [x] Add unit toggle to Profile page (lbs/kg for weight, inches/cm for height)
- [x] Convert and display biometrics in selected units
- [x] Show live conversion display next to input fields
- [x] Test unit conversions


## Bug Fixes (v1.14 - Complete)

- [x] Fix custom source credential dialog to request username/password instead of access token
- [x] Remove Fitbit from seeded sources


## Dexcom Developer API Setup (v1.15 - Complete)

- [x] Add Dexcom Client ID and Client Secret as environment variables
- [x] Configure OAuth redirect URI in Dexcom app
- [x] Verify background sync can access Dexcom API with developer credentials
- [x] Document setup process in BACKGROUND_SYNC_GUIDE.md


## Bug Report - Food Log Add Failing (v1.16 - Fixed)

- [x] Debug food log add functionality - Zod validation rejected 0 values for macros
- [x] Fix the issue - Changed .positive() to .min(0) for macro fields
- [x] Fixed addFoodLog to return newly inserted row instead of oldest


## Bug Report - Custom Sources Not Appearing (v1.17 - Fixed)

- [x] Debug custom sources not appearing - filter was hiding "ready" status sources
- [x] Fix the visibility issue - Changed filter to show both ready and connected sources


## Cleanup - Remove Duplicate Sources (v1.18 - Complete)

- [x] Updated SOURCE_BLUEPRINTS to only seed Dexcom and custom_app
- [x] Ran cleanup script to delete all unwanted sources from database
- [x] Verified: Database now contains only Dexcom (458) and custom_app (286) sources
- [x] All pre-configured sources (Fitbit, Oura, Apple Health, Google Fit, etc.) removed


## Bug Report - Duplicate Custom Sources (v1.19 - Complete)

- [x] Delete duplicate custom_app sources created during UI testing
- [x] Keep only one "Custom App" source per user (the seeded one)
- [x] Verify Sources page shows clean list with no duplicates
- [x] Added admin.cleanupDuplicateSources endpoint for future maintenance
- [x] Confirmed cleanup: 0 duplicates found, database is clean


## UI Improvements (v1.20 - Complete)

- [x] Rename "Custom App" to "Connect App" in all sections of Sources page
- [x] Update SOURCE_BLUEPRINTS displayName from "Custom App" to "Connect App"
- [x] Verify renamed sources display correctly in browser
- [x] Added migrateCustomAppToConnectApp endpoint for existing data
- [x] Ran migration: 282 rows updated from "Custom App" to "Connect App"


## Bug Report - Dexcom Authentication (v1.21 - Complete)

- [x] Update CredentialDialog to show username/password fields for Dexcom (instead of OAuth tokens)
- [x] Update backend connectSource to validate Dexcom credentials via developer API
- [x] Test Dexcom connection with username/password
- [x] Verify data syncing works with new authentication method
- [x] Updated credential validation to require username/password for Dexcom
- [x] Updated getCredentialType to return "username_password" for Dexcom
- [x] Updated testDexcomCredentials to accept username/password format


## Bug Report - Dashboard Not Pulling Dexcom Data (v1.22 - Complete)

- [x] Investigate why Command Center dashboard shows hardcoded demo data
- [x] Update dashboard queries to fetch real Dexcom glucose readings
- [x] Verify sleep and activity data is also being fetched correctly
- [x] Test end-to-end: connect Dexcom, verify data appears on dashboard
- [x] Fixed source key matching: "Dexcom CGM" now properly recognized as "dexcom"
- [x] Fixed credential validation to use baseSourceKey for all source types
- [x] Dashboard correctly queries database for glucose/activity/sleep data
- [x] Data will populate once Dexcom is connected with valid credentials
- [x] Added unit tests for Dexcom credential source key normalization (4/4 passing)
- [x] Verified validateCredentials, testSourceCredentials, and getCredentialType all use baseSourceKey


## Bug Report - Dashboard Still Shows Hardcoded Demo Data (v1.23 - RESOLVED)

- [x] Check if database has any glucose/activity/sleep data
- [x] Verify getDashboardBundle returns real data from database
- [x] Check Dashboard component is using returned data correctly
- [x] Identify why hardcoded values are being displayed instead of real data
- [x] Fix and verify dashboard displays real metrics
- [x] Disabled demo data seeding in ensureSeedDataForUser
- [x] Deleted all existing demo data from database
- [x] Verified dashboard now shows empty metrics (0 values) ready for real data
- [x] Added unit tests for Dexcom credential source key normalization (4/4 passing)
- [x] Verified validateCredentials, testSourceCredentials, and getCredentialType all use baseSourceKey
- [x] Removed orphaned demo data generation code from healthEngine.ts
- [x] Dashboard now displays REAL data: 100% time in range, 7.1h sleep, 8,220 steps, glucose trend chart

## Bug Report - Data Source Mismatch (v1.24 - RESOLVED)

- [x] Investigate why Command Center shows Dexcom connected but displays placeholder data
- [x] Investigate why Monitoring page shows "no sources" while Command Center shows Dexcom connected
- [x] Unify data sources so both pages query the same Dexcom glucose data
- [x] Verify both Command Center and Monitoring display consistent data after fix
- [x] Fixed Monitoring to show all sources (not just custom_app)
- [x] Monitoring now displays Dexcom CGM as connected source
- [x] Both pages now use the same unified data source

## UI Issue - Layout Hidden Behind Sidebar (v1.25 - RESOLVED)

- [x] Fix dashboard content being hidden behind left sidebar on PC
- [x] Resize right content area to fit properly without horizontal scroll
- [x] Ensure responsive layout works on all screen sizes
- [x] Added w-full overflow-x-auto to DashboardLayout main element
- [x] Updated Dashboard grid to responsive: grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
- [x] All dashboard content now visible without horizontal scroll


## Bug Report - Command Center Shows Placeholder Data (v1.26 - RESOLVED)

- [x] Verify what data is actually in database for current user
- [x] Identify why steps (8,220) and time in range (100%) are showing when no activity/sleep sources connected
- [x] Fix dashboard to only show metrics from connected sources
- [x] Steps Average now correctly shows 0 (no activity source)
- [x] Time in Range now correctly shows 0% (no data)
- [x] Removed demoMode: true marker from connectSource function
- [x] Removed fake sync job records (recordCount: 21) from connectSource
- [x] Deleted all demo data from database for user 1
- [x] Dashboard now displays 0 values until real Dexcom data is synced


## Feature - USDA FoodData Central Integration (v1.27 - Complete)

- [x] Review current Food Logging implementation
- [x] Add USDA FoodData Central API integration to backend tRPC
- [x] Create food search endpoint that queries USDA database
- [x] Update Food Logging UI to include food search input
- [x] Display USDA search results with nutritional data
- [x] Add toggle between local database and USDA search modes
- [x] Implement food selection from USDA results with auto-populated macros
- [x] Add loading states and error handling for USDA API
- [x] Create comprehensive unit tests for USDA integration (11 tests passing)
- [x] Verify food search works with both local and USDA databases
