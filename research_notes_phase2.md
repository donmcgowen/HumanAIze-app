# Integration Research Notes

## Dexcom

The official Dexcom API uses an OAuth 2.0 authorization code flow. Users authenticate with Dexcom directly, authorize access, and the partner application exchanges the short-lived authorization code for access and refresh tokens. Dexcom states that partner applications must store tokens on their servers rather than on client devices. The documented scope for the core flow is `offline_access`, and refresh tokens are used to renew access tokens. The redirect URI must exactly match the URI registered in the Dexcom app configuration. Sandbox and production use different base URLs.

## Glooko

Glooko documents direct API integrations as a commercial-access model rather than an open self-serve consumer integration. The documentation states that direct API integrations are available to Glooko commercial customers in the US, Canada, and EU, and that individual user API access is not available. Glooko's process involves working with an integration manager, receiving an API account and key for development/testing, authenticating to obtain a JWT access token, and then accessing only the APIs assigned to the customer.

## Initial product implication

A realistic first release can support a true Dexcom OAuth connection flow if app credentials are provided, while Glooko should be implemented with an enterprise-ready connection architecture and admin-configurable credential support because production access appears to require business onboarding rather than simple end-user self-service.

## Fitbit

Fitbit provides an official Web API with authorization endpoints for onboarding users and issuing access and refresh tokens. The official explorer describes access to user activity and sleep data, which makes Fitbit one of the more feasible consumer integrations for the first web-based version of this product.

## Google Fit

Google's official documentation states that the Google Fit APIs, including the REST API, will be deprecated in 2026 and that new developers have not been able to sign up since May 1, 2024. For a new product, Google Fit should therefore be treated as a legacy or sunset integration, with product language and architecture prepared for an eventual replacement path rather than relying on it as a primary long-term connector.

## Updated product implication

The first release should treat Dexcom and Fitbit as the most realistic direct end-user connections among the requested sources. Google Fit support should be represented in the connected-sources architecture and user experience, but implementation should acknowledge its deprecation status and likely require a fallback strategy or future replacement.

## Apple Health

Apple's official HealthKit documentation shows that access is requested through HealthKit APIs inside an app environment that can call `HKHealthStore` and request authorization for specific data types. This indicates that Apple Health access is app-platform mediated rather than a simple web OAuth connection. For a web-first product, Apple Health should therefore be represented as a future mobile companion or native bridge integration rather than a direct browser-only connector.

## Oura

Oura's official API supports industry-standard OAuth2 and offers granular scopes covering sleep, activity, readiness, heart rate, workouts, and other user data. Oura documents a server-side authorization code flow with refresh tokens, making it a strong candidate for direct third-party integration in the first version of a web-based health intelligence platform.

## Updated product implication

For the requested sleep and activity sources, Oura is a realistic direct integration for the first web release, while Apple Health should be included in the product architecture and connected-sources UX as a planned native-bridge integration rather than a fully direct web implementation.

## MyFitnessPal

MyFitnessPal surfaces a developer portal in search results, but the official page was blocked during direct access from the browser. This means the availability of self-serve developer access could not be confirmed from the live site during this session. For first-version planning, MyFitnessPal should be treated as uncertain and credential-dependent rather than assumed to be open for immediate implementation.

## Cronometer

The most visible Cronometer sources available during research did not show an official public developer API for third-party user data access. Community references suggest that a general public API is unlikely or unavailable. For a first release, Cronometer should therefore be treated as unsupported for direct self-serve integration unless enterprise or partner access is separately negotiated.

## Updated product implication

Nutrition connectivity is materially less straightforward than Dexcom, Fitbit, and Oura. The first release should architect nutrition ingestion behind a source abstraction layer and present MyFitnessPal and Cronometer as managed connectors whose production enablement depends on provider approval or partner access.
