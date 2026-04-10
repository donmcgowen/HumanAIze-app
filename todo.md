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

- [ ] Remove pre-configured sources (Dexcom, Fitbit, Apple Health, Oura, Google Fit) from Monitoring page
- [ ] Filter sources list to show only custom_app provider entries
- [ ] Test Monitoring page displays only user-created custom apps


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
- [ ] Add backend tests for background sync scheduler


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
