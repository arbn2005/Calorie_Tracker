import Dexie, { type Table } from "dexie";
import type {
  AssistantMessage,
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
  assistant!: Table<AssistantMessage, number>;

  constructor() {
    super("calorie-counter");
    this.version(1).stores({
      profiles: "++id",
      foods: "id, name, barcode, cuisine, category, source, createdAt",
      aliases: "++id, foodId, name, language",
      servings: "++id, foodId, unitName",
      logs: "++id, foodId, loggedAt, mealType, category, cuisine",
    });
    /* v2: assistant-page transcript store (additive, no data rewrite) */
    this.version(2).stores({
      assistant: "++id, kind, createdAt",
    });
  }
}

export const db = new CalorieDatabase();
