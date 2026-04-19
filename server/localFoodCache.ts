import { promises as fs } from "fs";
import path from "path";

const CACHE_FILE = path.join(process.cwd(), ".food-cache.json");
// Branded/OFF results cached for 30 days; generic/SR Legacy cached for 7 days
const BRANDED_CACHE_TTL_DAYS = 30;
const GENERIC_CACHE_TTL_DAYS = 7;

export interface CachedFoodEntry {
  name: string;
  description: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  servingSize?: string;
}

interface CacheRecord {
  query: string;
  results: CachedFoodEntry[];
  cachedAt: number; // unix ms
  expiresAt: number; // unix ms
  source?: string; // "branded", "open_food_facts", "gemini", "usda_generic"
}

type CacheStore = Record<string, CacheRecord>;

async function readCache(): Promise<CacheStore> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

async function writeCache(store: CacheStore): Promise<void> {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("[LocalFoodCache] Failed to write cache:", err);
  }
}

/**
 * Returns true if the query looks like a branded product search
 * (contains brand names, product names, or multiple words that suggest a specific product)
 */
function looksLikeBrandedQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  // Multi-word queries with brand-like terms are likely branded searches
  const words = q.split(/\s+/);
  if (words.length >= 2) return true;
  // Single words that are clearly brand names (capitalized in original)
  if (/^[A-Z]/.test(query.trim())) return true;
  return false;
}

export async function getLocalCachedFood(query: string): Promise<CachedFoodEntry[] | null> {
  const store = await readCache();
  const key = query.toLowerCase().trim();
  const record = store[key];
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    // Expired — remove it
    delete store[key];
    await writeCache(store);
    return null;
  }

  // If this looks like a branded query but the cached results are from generic USDA,
  // skip the cache so we can search branded sources
  if (looksLikeBrandedQuery(query) && record.source === "usda_generic") {
    console.log(`[LocalFoodCache] Bypassing generic cache for branded query: "${query}"`);
    delete store[key];
    await writeCache(store);
    return null;
  }

  console.log(`[LocalFoodCache] Cache hit for "${query}" (${record.results.length} results, source: ${record.source || "unknown"})`);
  return record.results;
}

export async function saveLocalCachedFood(
  query: string,
  results: CachedFoodEntry[],
  source: "branded" | "open_food_facts" | "gemini" | "usda_generic" = "usda_generic"
): Promise<void> {
  const store = await readCache();
  const key = query.toLowerCase().trim();
  const now = Date.now();
  const ttlDays = source === "usda_generic" ? GENERIC_CACHE_TTL_DAYS : BRANDED_CACHE_TTL_DAYS;
  store[key] = {
    query: key,
    results,
    cachedAt: now,
    expiresAt: now + ttlDays * 24 * 60 * 60 * 1000,
    source,
  };
  await writeCache(store);
  console.log(`[LocalFoodCache] Saved ${results.length} results for "${query}" (source: ${source}, TTL: ${ttlDays}d)`);
}

export async function clearLocalCachedFood(query: string): Promise<void> {
  const store = await readCache();
  delete store[query.toLowerCase().trim()];
  await writeCache(store);
}

/**
 * Clear all cached entries that came from generic USDA sources.
 * Call this to force re-search of branded products.
 */
export async function clearGenericCacheEntries(): Promise<number> {
  const store = await readCache();
  let cleared = 0;
  for (const key of Object.keys(store)) {
    if (!store[key].source || store[key].source === "usda_generic") {
      delete store[key];
      cleared++;
    }
  }
  await writeCache(store);
  console.log(`[LocalFoodCache] Cleared ${cleared} generic cache entries`);
  return cleared;
}

/**
 * Clear ALL cached food entries (both branded and generic).
 * Use this when the macro normalization logic has changed and all cached values are stale.
 */
export async function clearAllCacheEntries(): Promise<number> {
  const store = await readCache();
  const count = Object.keys(store).length;
  await writeCache({});
  console.log(`[LocalFoodCache] Cleared ALL ${count} food cache entries (schema migration)`);
  return count;
}
