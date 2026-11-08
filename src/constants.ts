import type {
  ActivityLevel,
  Cuisine,
  DietType,
  FoodCategory,
  FoodSource,
  Goal,
  Language,
  MealType,
  Sex,
} from "./types";

export const CATEGORIES: FoodCategory[] = [
  "grains",
  "vegetables",
  "fruit",
  "protein",
  "dairy",
  "sweets",
  "drinks",
  "oils",
];

export const CATEGORY_COLORS: Record<FoodCategory, string> = {
  grains: "#f59e0b",
  vegetables: "#22c55e",
  fruit: "#ec4899",
  protein: "#ef4444",
  dairy: "#3b82f6",
  sweets: "#a855f7",
  drinks: "#06b6d4",
  oils: "#84cc16",
};

export const CUISINES: Cuisine[] = [
  "Indian",
  "Italian",
  "Western",
  "Chinese",
  "Other",
];

export const CUISINE_COLORS: Record<Cuisine, string> = {
  Indian: "#f97316",
  Italian: "#16a34a",
  Western: "#3b82f6",
  Chinese: "#ef4444",
  Other: "#a855f7",
};

export const MEALS: MealType[] = ["breakfast", "lunch", "dinner", "snacks"];

export const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: "☀️",
  lunch: "🍽️",
  dinner: "🌙",
  snacks: "🍎",
};

export const SOURCES: FoodSource[] = ["seed", "scanned", "custom"];

export const ACTIVITY_LEVELS: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "veryActive",
];

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.65,
  veryActive: 1.725,
};

export const GOALS: Goal[] = ["lose", "maintain", "gain"];
export const DIET_TYPES: DietType[] = [
  "vegetarian",
  "non-vegetarian",
  "vegan",
];
export const SEXES: Sex[] = ["female", "male"];
export const LANGUAGES: Language[] = ["en", "ta", "zh"];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  ta: "தமிழ்",
  zh: "中文",
};

export const MACRO_COLORS = {
  protein: "#3b82f6",
  carbs: "#f59e0b",
  fat: "#ef4444",
};

export const NUTRIENT_META = {
  kcal: { label: "calories", unit: "kcal", color: "#16a34a" },
  protein: { label: "protein", unit: "g", color: "#3b82f6" },
  carbs: { label: "carbs", unit: "g", color: "#f59e0b" },
  fat: { label: "fat", unit: "g", color: "#ef4444" },
  fiber: { label: "fiber", unit: "g", color: "#22c55e" },
  sugar: { label: "sugar", unit: "g", color: "#a855f7" },
  sodium: { label: "sodium", unit: "mg", color: "#06b6d4" },
} as const;

export const APP_VERSION = 1;
export const SEED_URL = `${import.meta.env.BASE_URL}seed/foods.json`;
export const MAX_UNLOGGED_SCANNED = 2000;
