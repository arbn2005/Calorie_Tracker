export type Sex = "male" | "female";
export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "veryActive";
export type Goal = "lose" | "maintain" | "gain";
export type DietType = "vegetarian" | "non-vegetarian" | "vegan";
export type Cuisine = "Indian" | "Italian" | "Western" | "Chinese" | "Other";
export type FoodCategory =
  | "grains"
  | "vegetables"
  | "fruit"
  | "protein"
  | "dairy"
  | "sweets"
  | "drinks"
  | "oils";
export type FoodSource = "seed" | "scanned" | "custom";
export type MealType = "breakfast" | "lunch" | "dinner" | "snacks";
export type Language = "en" | "ta" | "zh";

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
}

export interface UserProfile {
  id?: number;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  dietType: DietType;
  language: Language;
  createdAt: number;
  updatedAt: number;
}

export interface FoodItem extends Nutrients {
  id: string;
  name: string;
  barcode?: string | null;
  brand?: string | null;
  cuisine: Cuisine;
  category: FoodCategory;
  source: FoodSource;
  packetGrams?: number | null;
  createdAt: number;
}

export interface FoodAlias {
  id?: number;
  foodId: string;
  name: string;
  language: Language;
}

export interface ServingUnit {
  id?: number;
  foodId: string;
  unitName: string;
  grams: number;
}

export interface LogEntry extends Nutrients {
  id?: number;
  foodId: string;
  foodName: string;
  brand?: string | null;
  category: FoodCategory;
  cuisine: Cuisine;
  quantityG: number;
  servingLabel?: string;
  mealType: MealType;
  loggedAt: number;
}

export interface FoodWithMeta extends FoodItem {
  aliases: string[];
  servings: ServingUnit[];
}

export interface NutritionTargets extends Nutrients {
  bmr: number;
  tdee: number;
}

export type ScreenName = "today" | "trends" | "settings";

export interface SeedFood {
  id: string;
  name: string;
  aliases?: string[];
  cuisine: Cuisine;
  category: FoodCategory;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servings?: { unitName: string; grams: number }[];
}

export interface SeedFile {
  version: number;
  foods: SeedFood[];
}
