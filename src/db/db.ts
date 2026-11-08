import Dexie, { type Table } from "dexie";
import type {
  FoodAlias,
  FoodItem,
  LogEntry,
  ServingUnit,
  UserProfile,
} from "../types";

export class CalorieDatabase extends Dexie {
  profiles!: Table<UserProfile, number>;
  foods!: Table<FoodItem, string>;
  aliases!: Table<FoodAlias, number>;
  servings!: Table<ServingUnit, number>;
  logs!: Table<LogEntry, number>;

  constructor() {
    super("calorie-counter");
    this.version(1).stores({
      profiles: "++id",
      foods: "id, name, barcode, cuisine, category, source, createdAt",
      aliases: "++id, foodId, name, language",
      servings: "++id, foodId, unitName",
      logs: "++id, foodId, loggedAt, mealType, category, cuisine",
    });
  }
}

export const db = new CalorieDatabase();
