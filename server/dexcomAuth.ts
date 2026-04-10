/**
 * Dexcom Developer API authentication handler
 * Exchanges username/password for OAuth tokens using Resource Owner Password Credentials flow
 */

export interface DexcomTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

/**
 * Authenticate with Dexcom API using username and password
 * Returns access token and refresh token for API calls
 */
export async function authenticateDexcom(
  username: string,
  password: string
): Promise<DexcomTokenResponse> {
  const clientId = process.env.DEXCOM_CLIENT_ID;
  const clientSecret = process.env.DEXCOM_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Dexcom Client ID and Client Secret are not configured");
  }

  if (!username || !password) {
    throw new Error("Username and password are required");
  }

  try {
    console.log("Authenticating with Dexcom API...");

    // Use Resource Owner Password Credentials flow
    const tokenResponse = await fetch("https://api.dexcom.com/v2/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "password",
        username,
        password,
        scope: "offline_access",
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`Dexcom authentication failed: ${tokenResponse.status} ${errorText}`);
      throw new Error(`Dexcom authentication failed: ${tokenResponse.status}`);
    }

    const tokenData = (await tokenResponse.json()) as DexcomTokenResponse;

    if (!tokenData.access_token) {
      throw new Error("No access token received from Dexcom");
    }

    console.log("✓ Successfully authenticated with Dexcom");
    return tokenData;
  } catch (error) {
    console.error("Dexcom authentication error:", error);
    throw error;
  }
}

/**
 * Verify that an access token is valid by calling the Dexcom API
 */
export async function verifyDexcomToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.dexcom.com/v2/users/self", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    return response.ok;
  } catch (error) {
    console.error("Failed to verify Dexcom token:", error);
    return false;
  }
}
