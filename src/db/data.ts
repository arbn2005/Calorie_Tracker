import { MAX_UNLOGGED_SCANNED, SEED_URL } from "../constants";
import { addDays, startOfDay } from "../lib/date";
import { detectLanguage, normalizeText, round } from "../lib/utils";
import type {
  FoodAlias,
  FoodCategory,
  FoodItem,
  FoodSource,
  FoodWithMeta,
  Language,
  LogEntry,
  MealType,
  Nutrients,
  SeedFile,
  SeedFood,
  ServingUnit,
  UserProfile,
} from "../types";
import { db } from "./db";

const SEED_VERSION_KEY = "calorie-counter.seed-version";
const SEARCH_LIMIT = 40;

interface CacheFood {
  food: FoodWithMeta;
  nameNorm: string;
  aliasNorm: string[];
  brandNorm: string;
}

let cache: CacheFood[] | null = null;
let initPromise: Promise<void> | null = null;

function defaultProfile(): UserProfile {
  const browserLanguage = navigator.language.toLowerCase();
  const language: Language = browserLanguage.startsWith("ta")
    ? "ta"
    : browserLanguage.startsWith("zh")
      ? "zh"
      : "en";
  const now = Date.now();
  return {
    age: 30,
    sex: "female",
    heightCm: 165,
    weightKg: 65,
    activityLevel: "moderate",
    goal: "maintain",
    dietType: "vegetarian",
    language,
    createdAt: now,
    updatedAt: now,
  };
}

export function initData(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await ensureProfile();
      await ensureSeed();
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

export async function ensureProfile(): Promise<UserProfile> {
  const existing = await db.profiles.orderBy("id").first();
  if (existing) return existing;
  const profile = defaultProfile();
  const id = await db.profiles.add(profile);
  return { ...profile, id };
}

export async function getProfile(): Promise<UserProfile> {
  return ensureProfile();
}

export async function saveProfile(
  changes: Partial<UserProfile>,
): Promise<UserProfile> {
  const existing = await ensureProfile();
  const updated: UserProfile = {
    ...existing,
    ...changes,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  await db.profiles.put(updated);
  return updated;
}

function seedFoodToItem(food: SeedFood, now: number): FoodItem {
  return {
    id: food.id,
    name: food.name,
    barcode: null,
    brand: null,
    cuisine: food.cuisine,
    category: food.category,
    source: "seed",
    packetGrams: null,
    createdAt: now,
    kcal: food.kcal,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber,
    sugar: food.sugar,
    sodium: food.sodium,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    output.push(items.slice(i, i + size));
  }
  return output;
}

async function deleteAliasesForFoods(ids: string[]): Promise<void> {
  for (const group of chunk(ids, 400)) {
    await db.aliases.where("foodId").anyOf(group).delete();
    await db.servings.where("foodId").anyOf(group).delete();
  }
}

async function ensureSeed(): Promise<void> {
  const existingSeedCount = await db.foods
    .where("source")
    .equals("seed")
    .count();
  const storedVersion = Number(localStorage.getItem(SEED_VERSION_KEY) ?? 0);

  let seed: SeedFile | null = null;
  try {
    const response = await fetch(SEED_URL);
    if (!response.ok) throw new Error("seed fetch failed");
    seed = (await response.json()) as SeedFile;
  } catch {
    if (existingSeedCount > 0) return;
    throw new Error("The food database could not be loaded.");
  }

  if (!seed || !Array.isArray(seed.foods)) {
    if (existingSeedCount > 0) return;
    throw new Error("The food database is invalid.");
  }

  if (existingSeedCount > 0 && storedVersion === seed.version) return;

  const now = Date.now();
  const foods = seed.foods.map((food) => seedFoodToItem(food, now));
  const ids = foods.map((food) => food.id);

  await db.transaction(
    "rw",
    [db.foods, db.aliases, db.servings],
    async () => {
      await db.foods.bulkPut(foods);
      await deleteAliasesForFoods(ids);

      const aliases: FoodAlias[] = [];
      const servings: ServingUnit[] = [];
      for (const food of seed.foods) {
        const names = new Set<string>([food.name, ...(food.aliases ?? [])]);
        for (const name of names) {
          if (!name.trim()) continue;
          aliases.push({
            foodId: food.id,
            name: name.trim(),
            language: detectLanguage(name),
          });
        }
        for (const serving of food.servings ?? []) {
          if (!serving.unitName || !(serving.grams > 0)) continue;
          servings.push({
            foodId: food.id,
            unitName: serving.unitName,
            grams: serving.grams,
          });
        }
      }
      await db.aliases.bulkAdd(aliases);
      await db.servings.bulkAdd(servings);
    },
  );

  localStorage.setItem(SEED_VERSION_KEY, String(seed.version));
  cache = null;
}

async function loadCache(): Promise<CacheFood[]> {
  if (cache) return cache;
  const [foods, aliases, servings] = await Promise.all([
    db.foods.toArray(),
    db.aliases.toArray(),
    db.servings.toArray(),
  ]);
  const aliasMap = new Map<string, string[]>();
  for (const alias of aliases) {
    const list = aliasMap.get(alias.foodId) ?? [];
    list.push(alias.name);
    aliasMap.set(alias.foodId, list);
  }
  const servingMap = new Map<string, ServingUnit[]>();
  for (const serving of servings) {
    const list = servingMap.get(serving.foodId) ?? [];
    list.push(serving);
    servingMap.set(serving.foodId, list);
  }
  cache = foods.map((food) => {
    const meta: FoodWithMeta = {
      ...food,
      aliases: aliasMap.get(food.id) ?? [],
      servings: servingMap.get(food.id) ?? [],
    };
    return {
      food: meta,
      nameNorm: normalizeText(`${food.name} ${food.brand ?? ""}`),
      aliasNorm: meta.aliases.map(normalizeText),
      brandNorm: normalizeText(food.brand ?? ""),
    };
  });
  return cache;
}

export async function getAllFoods(): Promise<FoodWithMeta[]> {
  return (await loadCache()).map((entry) => entry.food);
}

export async function getFood(id: string): Promise<FoodWithMeta | null> {
  const entry = (await loadCache()).find((item) => item.food.id === id);
  return entry?.food ?? null;
}

function scoreToken(
  token: string,
  entry: CacheFood,
): number {
  if (entry.nameNorm.startsWith(token)) return 0;
  if (entry.aliasNorm.some((name) => name.startsWith(token))) return 1;
  if (entry.brandNorm.startsWith(token)) return 1.5;
  if (entry.nameNorm.includes(token)) return 2;
  if (entry.aliasNorm.some((name) => name.includes(token))) return 3;
  return Number.POSITIVE_INFINITY;
}

export async function searchFoods(
  query: string,
  limit = SEARCH_LIMIT,
): Promise<FoodWithMeta[]> {
  const entries = await loadCache();
  const normalized = normalizeText(query);
  if (!normalized) {
    return entries
      .slice()
      .sort((a, b) => a.food.name.localeCompare(b.food.name))
      .slice(0, limit)
      .map((entry) => entry.food);
  }
  const tokens = normalized.split(" ").filter(Boolean);
  const matches: { entry: CacheFood; score: number }[] = [];
  for (const entry of entries) {
    let best = 0;
    let matched = true;
    for (const token of tokens) {
      const score = scoreToken(token, entry);
      if (!Number.isFinite(score)) {
        matched = false;
        break;
      }
      best = Math.max(best, score);
    }
    if (matched) matches.push({ entry, score: best });
  }
  matches.sort(
    (a, b) =>
      a.score - b.score || a.entry.food.name.localeCompare(b.entry.food.name),
  );
  return matches.slice(0, limit).map((match) => match.entry.food);
}

export async function getRecentFoods(limit = 12): Promise<FoodWithMeta[]> {
  const entries = await loadCache();
  const byId = new Map(entries.map((entry) => [entry.food.id, entry.food]));
  const logs = await db.logs.orderBy("loggedAt").reverse().limit(400).toArray();
  const seen = new Set<string>();
  const recent: FoodWithMeta[] = [];
  for (const log of logs) {
    if (seen.has(log.foodId)) continue;
    seen.add(log.foodId);
    const food = byId.get(log.foodId);
    if (food) recent.push(food);
    if (recent.length >= limit) break;
  }
  return recent;
}

export interface NewFoodInput {
  name: string;
  cuisine: FoodItem["cuisine"];
  category: FoodCategory;
  nutrients: Nutrients;
  barcode?: string | null;
  brand?: string | null;
  packetGrams?: number | null;
  aliases?: string[];
  servings?: { unitName: string; grams: number }[];
  source?: FoodSource;
  id?: string;
}

export async function createFood(input: NewFoodInput): Promise<FoodWithMeta> {
  const id =
    input.id ??
    `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const food: FoodItem = {
    id,
    name: input.name.trim(),
    barcode: input.barcode?.trim() || null,
    brand: input.brand?.trim() || null,
    cuisine: input.cuisine,
    category: input.category,
    source: input.source ?? "custom",
    packetGrams: input.packetGrams ?? null,
    createdAt: Date.now(),
    kcal: round(input.nutrients.kcal, 2),
    protein: round(input.nutrients.protein, 2),
    carbs: round(input.nutrients.carbs, 2),
    fat: round(input.nutrients.fat, 2),
    fiber: round(input.nutrients.fiber, 2),
    sugar: round(input.nutrients.sugar, 2),
    sodium: round(input.nutrients.sodium, 2),
  };

  const aliasNames = new Set<string>([food.name]);
  for (const alias of input.aliases ?? []) {
    if (alias.trim()) aliasNames.add(alias.trim());
  }
  if (food.brand) aliasNames.add(food.brand);

  await db.transaction("rw", [db.foods, db.aliases, db.servings], async () => {
    await db.foods.put(food);
    await db.aliases.where("foodId").equals(id).delete();
    await db.servings.where("foodId").equals(id).delete();
    await db.aliases.bulkAdd(
      [...aliasNames].map((name) => ({
        foodId: id,
        name,
        language: detectLanguage(name),
      })),
    );
    const servings = [...(input.servings ?? [])];
    if (food.packetGrams && food.packetGrams > 0) {
      servings.push({ unitName: "packet", grams: food.packetGrams });
    }
    const valid = servings.filter(
      (serving) => serving.unitName.trim() && serving.grams > 0,
    );
    if (valid.length) {
      await db.servings.bulkAdd(
        valid.map((serving) => ({
          foodId: id,
          unitName: serving.unitName.trim(),
          grams: serving.grams,
        })),
      );
    }
  });
  cache = null;
  const created = await getFood(id);
  if (!created) throw new Error("The food could not be saved.");
  return created;
}

export interface LogInput {
  food: Pick<
    FoodItem,
    | "id"
    | "name"
    | "brand"
    | "category"
    | "cuisine"
    | "kcal"
    | "protein"
    | "carbs"
    | "fat"
    | "fiber"
    | "sugar"
    | "sodium"
  >;
  quantityG: number;
  mealType: MealType;
  servingLabel?: string;
  loggedAt?: number;
}

export async function logFood(input: LogInput): Promise<LogEntry> {
  const factor = input.quantityG / 100;
  const entry: LogEntry = {
    foodId: input.food.id,
    foodName: input.food.name,
    brand: input.food.brand ?? null,
    category: input.food.category,
    cuisine: input.food.cuisine,
    quantityG: round(input.quantityG, 1),
    servingLabel: input.servingLabel,
    mealType: input.mealType,
    loggedAt: input.loggedAt ?? Date.now(),
    kcal: round(input.food.kcal * factor, 1),
    protein: round(input.food.protein * factor, 1),
    carbs: round(input.food.carbs * factor, 1),
    fat: round(input.food.fat * factor, 1),
    fiber: round(input.food.fiber * factor, 1),
    sugar: round(input.food.sugar * factor, 1),
    sodium: round(input.food.sodium * factor, 0),
  };
  const id = await db.logs.add(entry);
  return { ...entry, id };
}

export async function deleteLog(id: number): Promise<void> {
  await db.logs.delete(id);
}

export async function getLogsForDay(timestamp = Date.now()): Promise<LogEntry[]> {
  const start = startOfDay(timestamp);
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + 1);
  return db.logs
    .where("loggedAt")
    .between(start, endDate.getTime(), true, false)
    .toArray();
}

export async function getLogsForDays(days: number): Promise<LogEntry[]> {
  const today = startOfDay(Date.now());
  const start = startOfDay(addDays(today, -(days - 1)));
  const end = startOfDay(addDays(today, 1));
  return db.logs
    .where("loggedAt")
    .between(start, end, true, false)
    .toArray();
}

export async function getAllLogs(): Promise<LogEntry[]> {
  return db.logs.orderBy("loggedAt").toArray();
}

export async function findFoodByBarcode(
  barcode: string,
): Promise<FoodWithMeta | null> {
  const clean = barcode.trim();
  if (!clean) return null;
  const local = await db.foods.where("barcode").equals(clean).first();
  if (local) {
    cache = null;
    return getFood(local.id);
  }
  if (!navigator.onLine) return null;

  const food = await fetchOpenFoodFacts(clean);
  if (!food) return null;
  await db.transaction("rw", [db.foods, db.aliases, db.servings], async () => {
    await db.foods.put(food);
    await db.aliases.where("foodId").equals(food.id).delete();
    await db.servings.where("foodId").equals(food.id).delete();
    const aliases = new Set<string>([food.name]);
    if (food.brand) aliases.add(food.brand);
    await db.aliases.bulkAdd(
      [...aliases].map((name) => ({
        foodId: food.id,
        name,
        language: detectLanguage(name),
      })),
    );
    if (food.packetGrams && food.packetGrams > 0) {
      await db.servings.add({
        foodId: food.id,
        unitName: "packet",
        grams: food.packetGrams,
      });
    }
  });
  cache = null;
  await cleanupScannedFoods();
  return getFood(food.id);
}

interface OffProduct {
  product_name?: string;
  generic_name?: string;
  brands?: string;
  quantity?: string;
  product_quantity?: string | number;
  categories_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

function inferCategory(tags: string[]): FoodCategory {
  const joined = tags.join(" ").toLowerCase();
  if (/(beverage|drink|water|juice|soda|tea|coffee)/.test(joined)) {
    return "drinks";
  }
  if (/(dair|milk|cheese|yogurt|yoghurt)/.test(joined)) return "dairy";
  if (/(fruit)/.test(joined)) return "fruit";
  if (/(vegetable|legume|salad)/.test(joined)) return "vegetables";
  if (/(oil|fat|butter|margarine)/.test(joined)) return "oils";
  if (/(cereal|bread|pasta|rice|noodle|grain|flour)/.test(joined)) {
    return "grains";
  }
  if (/(meat|fish|seafood|egg|chicken|poultry|tofu|protein)/.test(joined)) {
    return "protein";
  }
  return "sweets";
}

function parsePacketGrams(product: OffProduct): number | null {
  const direct = Number(product.product_quantity);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  const match = (product.quantity ?? "").match(/([\d.,]+)\s*(g|kg|ml|l)\b/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  const unit = match[2].toLowerCase();
  const grams =
    unit === "kg" || unit === "l" ? amount * 1000 : amount;
  return grams > 0 ? Math.round(grams) : null;
}

function numberOrZero(
  nutriments: Record<string, number | string | undefined>,
  key: string,
): number {
  const value = nutriments[key];
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchOpenFoodFacts(barcode: string): Promise<FoodItem | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
        barcode,
      )}.json?fields=product_name,generic_name,brands,quantity,product_quantity,categories_tags,nutriments`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      status?: number;
      product?: OffProduct;
    };
    if (!data.product || data.status === 0) return null;
    const product = data.product;
    const nutriments = product.nutriments ?? {};
    let kcal = numberOrZero(nutriments, "energy-kcal_100g");
    if (!kcal) {
      const kj = numberOrZero(nutriments, "energy_100g");
      if (kj) kcal = kj / 4.184;
    }
    let sodiumMg = numberOrZero(nutriments, "sodium_100g") * 1000;
    if (!sodiumMg) {
      sodiumMg = numberOrZero(nutriments, "salt_100g") * 400;
    }
    const name =
      (product.product_name || product.generic_name || "").trim() ||
      `Barcode ${barcode}`;
    const brand = (product.brands ?? "").split(",")[0]?.trim() || null;
    const packetGrams = parsePacketGrams(product);
    const now = Date.now();
    return {
      id: `scan-${barcode}`,
      name,
      barcode,
      brand,
      cuisine: "Other",
      category: inferCategory(product.categories_tags ?? []),
      source: "scanned",
      packetGrams,
      createdAt: now,
      kcal: round(kcal, 1),
      protein: round(numberOrZero(nutriments, "proteins_100g"), 1),
      carbs: round(numberOrZero(nutriments, "carbohydrates_100g"), 1),
      fat: round(numberOrZero(nutriments, "fat_100g"), 1),
      fiber: round(numberOrZero(nutriments, "fiber_100g"), 1),
      sugar: round(numberOrZero(nutriments, "sugars_100g"), 1),
      sodium: round(sodiumMg, 0),
    };
  } catch {
    return null;
  }
}

async function cleanupScannedFoods(): Promise<void> {
  const scanned = await db.foods.where("source").equals("scanned").toArray();
  if (scanned.length <= MAX_UNLOGGED_SCANNED) return;
  const logs = await db.logs.toArray();
  const loggedIds = new Set(logs.map((log) => log.foodId));
  const candidates = scanned
    .filter((food) => !loggedIds.has(food.id))
    .sort((a, b) => a.createdAt - b.createdAt);
  const excess = scanned.length - MAX_UNLOGGED_SCANNED;
  if (excess <= 0) return;
  const removeIds = candidates.slice(0, excess).map((food) => food.id);
  if (!removeIds.length) return;
  await db.transaction("rw", [db.foods, db.aliases, db.servings], async () => {
    await db.foods.bulkDelete(removeIds);
    await deleteAliasesForFoods(removeIds);
  });
  cache = null;
}

export interface BackupFile {
  app: "calorie-counter";
  version: number;
  exportedAt: number;
  profile: UserProfile | null;
  foods: FoodItem[];
  aliases: FoodAlias[];
  servings: ServingUnit[];
  logs: LogEntry[];
}

export async function createBackup(): Promise<BackupFile> {
  const [profile, foods, aliases, servings, logs] = await Promise.all([
    db.profiles.orderBy("id").first(),
    db.foods.toArray(),
    db.aliases.toArray(),
    db.servings.toArray(),
    db.logs.toArray(),
  ]);
  return {
    app: "calorie-counter",
    version: 1,
    exportedAt: Date.now(),
    profile: profile ?? null,
    foods,
    aliases,
    servings,
    logs,
  };
}

export async function backupToJson(): Promise<string> {
  return JSON.stringify(await createBackup(), null, 2);
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function backupToCsv(): Promise<string> {
  const logs = await getAllLogs();
  const headers = [
    "loggedAt",
    "foodName",
    "brand",
    "mealType",
    "quantityG",
    "kcal",
    "protein_g",
    "carbs_g",
    "fat_g",
    "fiber_g",
    "sugar_g",
    "sodium_mg",
    "category",
    "cuisine",
  ];
  const rows = logs.map((log) =>
    [
      new Date(log.loggedAt).toISOString(),
      log.foodName,
      log.brand ?? "",
      log.mealType,
      log.quantityG,
      log.kcal,
      log.protein,
      log.carbs,
      log.fat,
      log.fiber,
      log.sugar,
      log.sodium,
      log.category,
      log.cuisine,
    ]
      .map(csvCell)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}

export async function importBackup(json: string): Promise<{
  foods: number;
  logs: number;
}> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const backup = data as Partial<BackupFile>;
  if (
    !backup ||
    backup.app !== "calorie-counter" ||
    !Array.isArray(backup.foods) ||
    !Array.isArray(backup.logs)
  ) {
    throw new Error("This does not look like a Calorie Tracker backup.");
  }
  const aliases = Array.isArray(backup.aliases) ? backup.aliases : [];
  const servings = Array.isArray(backup.servings) ? backup.servings : [];

  await db.transaction(
    "rw",
    [db.profiles, db.foods, db.aliases, db.servings, db.logs],
    async () => {
      await Promise.all([
        db.profiles.clear(),
        db.foods.clear(),
        db.aliases.clear(),
        db.servings.clear(),
        db.logs.clear(),
      ]);
      if (backup.profile) {
        const profile = { ...backup.profile };
        delete profile.id;
        await db.profiles.add(profile);
      }
      await db.foods.bulkPut(backup.foods as FoodItem[]);
      const aliasRows = aliases.map((alias) => ({
        foodId: alias.foodId,
        name: alias.name,
        language: alias.language ?? detectLanguage(alias.name),
      }));
      if (aliasRows.length) await db.aliases.bulkAdd(aliasRows);
      const servingRows = servings.map((serving) => ({
        foodId: serving.foodId,
        unitName: serving.unitName,
        grams: serving.grams,
      }));
      if (servingRows.length) await db.servings.bulkAdd(servingRows);
      const logs = (backup.logs as LogEntry[]).map((log) => {
        const copy = { ...log };
        delete copy.id;
        return copy;
      });
      if (logs.length) await db.logs.bulkAdd(logs);
    },
  );
  cache = null;
  if (!backup.profile) {
    await ensureProfile();
  }
  return {
    foods: (backup.foods as FoodItem[]).length,
    logs: (backup.logs as LogEntry[]).length,
  };
}

export interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean;
  supported: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (!navigator.storage?.estimate) {
    return { usage: 0, quota: 0, persisted: false, supported: false };
  }
  const estimate = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted
    ? await navigator.storage.persisted()
    : false;
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
    persisted,
    supported: true,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function resetAllData(): Promise<void> {
  await db.delete();
  localStorage.removeItem(SEED_VERSION_KEY);
  cache = null;
  initPromise = null;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  return `${round(bytes / 1024 ** index, index === 0 ? 0 : 1)} ${units[index]}`;
}
