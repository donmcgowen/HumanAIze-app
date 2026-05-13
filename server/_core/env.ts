export const ENV = {
  // Azure AD (Entra ID)
  azureAdTenant: process.env.AZURE_AD_TENANT ?? "",           // e.g. "themcgowengroup.onmicrosoft.com"
  azureAdClientId: process.env.AZURE_AD_CLIENT_ID ?? "",      // app registration client ID
  azureAdClientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "", // client secret value

  // App
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? (() => {
    // CRITICAL: Generate a fallback JWT_SECRET if not set
    // This allows login to work, but sessions won't persist across restarts.
    // Production must set JWT_SECRET env var for persistence.
    const fallback = require('crypto').randomBytes(32).toString('hex');
    console.warn('[env] JWT_SECRET not set. Using temporary secret. Session persistence disabled until JWT_SECRET is configured.');
    return fallback;
  })(),
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // LLM
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",

  // Dexcom Share (non-developer API path)
  dexcomShareBridgeUrl: process.env.DEXCOM_SHARE_BRIDGE_URL ?? "",
  dexcomShareBridgeApiKey: process.env.DEXCOM_SHARE_BRIDGE_API_KEY ?? "",

  // Neon PostgreSQL
  neonDatabaseUrl: process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  azureStorageAccountName: process.env.AZURE_STORAGE_ACCOUNT_NAME ?? "",
  azureStorageContainerName: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "",
  azureStorageAccountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY ?? "",

  // Open Food Facts
  openFoodFactsEnvironment: process.env.OPENFOODFACTS_ENVIRONMENT ?? "production", // production | staging
  openFoodFactsBaseUrl: process.env.OPENFOODFACTS_BASE_URL ?? "",
  openFoodFactsUserAgent:
    process.env.OPENFOODFACTS_USER_AGENT ?? "HumanAIze/1.0 (support@humanaize.life)",
  openFoodFactsStagingUsername: process.env.OPENFOODFACTS_STAGING_USERNAME ?? "off",
  openFoodFactsStagingPassword: process.env.OPENFOODFACTS_STAGING_PASSWORD ?? "off",

  // Email (Resend)
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  registrationTrackingEmail:
    process.env.REGISTRATION_TRACKING_EMAIL ?? "registrations@humanaize.life",
  appBaseUrl: process.env.APP_BASE_URL ?? "https://app.humanaize.life",
};

