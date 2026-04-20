import { ENV } from "./_core/env";

const OPEN_FOOD_FACTS_PRODUCTION = "https://world.openfoodfacts.org";
const OPEN_FOOD_FACTS_STAGING = "https://world.openfoodfacts.net";

export interface OpenFoodFactsFoodResult {
  name: string;
  description: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  brand?: string;
  barcode?: string;
  servingSize?: string;
}

export interface OpenFoodFactsBarcodeResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  servingSize: string;
  servingUnit: string;
  barcode: string;
  brand?: string;
}

function getOpenFoodFactsConfig() {
  const environment = ENV.openFoodFactsEnvironment.toLowerCase();
  const configuredBase = ENV.openFoodFactsBaseUrl.trim();

  let baseUrl = configuredBase;
  if (!baseUrl) {
    baseUrl = environment === "staging" ? OPEN_FOOD_FACTS_STAGING : OPEN_FOOD_FACTS_PRODUCTION;
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `https://${baseUrl}`;
  }

  const isStaging = /openfoodfacts\.net/i.test(baseUrl) || environment === "staging";
  const userAgent =
    ENV.openFoodFactsUserAgent || "HumanAIze/1.0 (support@humanaize.life)";

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": userAgent,
  };

  if (isStaging) {
    const basicAuth = Buffer.from(
      `${ENV.openFoodFactsStagingUsername}:${ENV.openFoodFactsStagingPassword}`
    ).toString("base64");
    headers.Authorization = `Basic ${basicAuth}`;
  }

  return { baseUrl, headers };
}

function getNutriment(nutriments: Record<string, unknown>, key: string): number {
  const value = nutriments[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getPer100gValue(nutriments: Record<string, unknown>, key: string): number {
  return getNutriment(nutriments, `${key}_100g`) || getNutriment(nutriments, key);
}

function toRounded1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeProduct(product: any): OpenFoodFactsFoodResult | null {
  if (!product || typeof product !== "object") return null;

  const nutriments = (product.nutriments || {}) as Record<string, unknown>;

  const caloriesFromKcal = getPer100gValue(nutriments, "energy-kcal");
  const caloriesFromKj = getPer100gValue(nutriments, "energy");
  const calories = caloriesFromKcal || (caloriesFromKj ? caloriesFromKj / 4.184 : 0);

  const protein = getPer100gValue(nutriments, "proteins");
  const carbs = getPer100gValue(nutriments, "carbohydrates");
  const fat = getPer100gValue(nutriments, "fat");

  const productName =
    product.product_name_en ||
    product.product_name ||
    product.generic_name_en ||
    product.generic_name ||
    "";

  if (!productName) return null;

  const brand = typeof product.brands === "string" ? product.brands : undefined;
  const quantity = typeof product.quantity === "string" ? product.quantity : undefined;

  const descriptionParts = [brand, quantity].filter(Boolean);

  return {
    name: String(productName).trim(),
    description: descriptionParts.join(" - "),
    caloriesPer100g: Math.max(0, Math.round(calories)),
    proteinPer100g: Math.max(0, toRounded1(protein)),
    carbsPer100g: Math.max(0, toRounded1(carbs)),
    fatPer100g: Math.max(0, toRounded1(fat)),
    brand,
    barcode: typeof product.code === "string" ? product.code : undefined,
    servingSize: typeof product.serving_size === "string" ? product.serving_size : undefined,
  };
}

export async function searchOpenFoodFactsByName(
  query: string,
  limit = 10
): Promise<OpenFoodFactsFoodResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const { baseUrl, headers } = getOpenFoodFactsConfig();

  const searchUrl = `${baseUrl}/cgi/search.pl?search_terms=${encodeURIComponent(
    normalizedQuery
  )}&search_simple=1&action=process&json=1&page_size=${Math.max(1, Math.min(limit, 10))}&fields=code,product_name,product_name_en,generic_name,generic_name_en,brands,quantity,serving_size,nutriments`;

  try {
    const response = await fetch(searchUrl, { method: "GET", headers });
    if (!response.ok) {
      console.warn(`[OpenFoodFacts] search failed: ${response.status}`);
      return [];
    }

    const data = (await response.json()) as { products?: any[] };
    const products = Array.isArray(data.products) ? data.products : [];

    const mapped = products
      .map(normalizeProduct)
      .filter((item): item is OpenFoodFactsFoodResult => item !== null)
      .slice(0, limit);

    return mapped;
  } catch (error) {
    console.warn("[OpenFoodFacts] search request failed", error);
    return [];
  }
}

export async function lookupOpenFoodFactsByBarcode(
  barcode: string
): Promise<OpenFoodFactsBarcodeResult | null> {
  const normalizedBarcode = barcode.trim();
  if (!/^\d{8,14}$/.test(normalizedBarcode)) {
    return null;
  }

  const { baseUrl, headers } = getOpenFoodFactsConfig();

  const primaryUrl = `${baseUrl}/api/v2/product/${normalizedBarcode}.json?fields=code,product_name,product_name_en,brands,quantity,serving_size,serving_quantity,serving_quantity_unit,nutriments`;

  const fallbackBase = /openfoodfacts\.net/i.test(baseUrl)
    ? OPEN_FOOD_FACTS_STAGING
    : OPEN_FOOD_FACTS_PRODUCTION;
  const fallbackUrl = `${fallbackBase}/api/v0/product/${normalizedBarcode}.json`;

  const readProduct = async (url: string) => {
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.product ?? null;
  };

  try {
    let product = await readProduct(primaryUrl);
    if (!product && fallbackUrl !== primaryUrl) {
      product = await readProduct(fallbackUrl);
    }
    if (!product) return null;

    const nutriments = (product.nutriments || {}) as Record<string, unknown>;
    const caloriesFromKcal = getPer100gValue(nutriments, "energy-kcal");
    const caloriesFromKj = getPer100gValue(nutriments, "energy");

    let servingSize = "100";
    let servingUnit = "g";

    if (product.serving_quantity) {
      servingSize = String(product.serving_quantity);
      servingUnit = typeof product.serving_quantity_unit === "string" ? product.serving_quantity_unit : "g";
    } else if (typeof product.serving_size === "string") {
      const sizeMatch = product.serving_size.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z%]*)/i);
      if (sizeMatch) {
        servingSize = sizeMatch[1];
        servingUnit = sizeMatch[2] || "g";
      }
    }

    // Try to get per-serving values directly from OFF (more accurate than computing from per-100g)
    const getServingValue = (key: string): number => {
      const servingKey = `${key}_serving`;
      const v = nutriments[servingKey];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
      if (typeof v === "string") {
        const p = Number(v);
        if (Number.isFinite(p) && p > 0) return p;
      }
      return 0;
    };

    // Prefer per-serving values; fall back to computing from per-100g × serving size
    const servingSizeNum = parseFloat(servingSize) || 100;
    const servingInMlOrG = servingUnit.toLowerCase() === "oz"
      ? servingSizeNum * 29.5735   // fl oz → ml
      : servingSizeNum;
    const scaleFactor = servingInMlOrG / 100;

    const cal100g = caloriesFromKcal || (caloriesFromKj ? caloriesFromKj / 4.184 : 0);
    const pro100g = getPer100gValue(nutriments, "proteins");
    const carb100g = getPer100gValue(nutriments, "carbohydrates");
    const fat100g = getPer100gValue(nutriments, "fat");
    const sugar100g = getPer100gValue(nutriments, "sugars");

    // Per-serving: use OFF's _serving fields if available, otherwise scale from per-100g
    const calServing  = getServingValue("energy-kcal") || (scaleFactor > 0 ? cal100g * scaleFactor : cal100g);
    const proServing  = getServingValue("proteins")    || (scaleFactor > 0 ? pro100g * scaleFactor : pro100g);
    const carbServing = getServingValue("carbohydrates")|| (scaleFactor > 0 ? carb100g * scaleFactor : carb100g);
    const fatServing  = getServingValue("fat")          || (scaleFactor > 0 ? fat100g * scaleFactor : fat100g);
    const sugarServing= getServingValue("sugars")       || (scaleFactor > 0 ? sugar100g * scaleFactor : sugar100g);

    return {
      name: String(product.product_name_en || product.product_name || "Unknown Product"),
      calories: Math.max(0, Math.round(calServing)),
      protein:  Math.max(0, toRounded1(proServing)),
      carbs:    Math.max(0, toRounded1(carbServing)),
      fat:      Math.max(0, toRounded1(fatServing)),
      sugar:    Math.max(0, toRounded1(sugarServing)),
      servingSize,
      servingUnit,
      barcode: normalizedBarcode,
      brand: typeof product.brands === "string" ? product.brands : undefined,
    };
  } catch (error) {
    console.warn("[OpenFoodFacts] barcode lookup failed", error);
    return null;
  }
}
