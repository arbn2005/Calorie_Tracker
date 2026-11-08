import { ACTIVITY_FACTORS } from "../constants";
import type {
  DietType,
  Nutrients,
  NutritionTargets,
  UserProfile,
} from "../types";
import { round } from "./utils";

export interface GoalBreakdown {
  bmr: number;
  tdee: number;
  target: number;
  adjustment: number;
  floored: boolean;
}

export function calculateGoals(
  profile: Pick<
    UserProfile,
    "age" | "sex" | "heightCm" | "weightKg" | "activityLevel" | "goal"
  >,
): GoalBreakdown {
  const bmr =
    10 * profile.weightKg +
    6.25 * profile.heightCm -
    5 * profile.age +
    (profile.sex === "male" ? 5 : -161);
  const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel];
  const adjustment =
    profile.goal === "lose" ? -400 : profile.goal === "gain" ? 300 : 0;
  const floor = profile.sex === "male" ? 1500 : 1200;
  const rawTarget = tdee + adjustment;
  const target = Math.max(floor, rawTarget);
  return {
    bmr: round(bmr, 0),
    tdee: round(tdee, 0),
    target: round(target, 0),
    adjustment,
    floored: rawTarget < floor,
  };
}

export function calculateTargets(
  profile: Pick<
    UserProfile,
    "age" | "sex" | "heightCm" | "weightKg" | "activityLevel" | "goal"
  >,
): NutritionTargets {
  const { bmr, tdee, target } = calculateGoals(profile);
  const proteinPerKg =
    profile.goal === "maintain" ? 0.9 : profile.goal === "lose" ? 2 : 1.8;
  const protein = round(profile.weightKg * proteinPerKg, 0);
  const fat = round((target * 0.275) / 9, 0);
  const carbs = round(
    Math.max(0, (target - protein * 4 - fat * 9) / 4),
    0,
  );
  return {
    kcal: target,
    protein,
    carbs,
    fat,
    fiber: round((14 * target) / 1000, 0),
    sugar: round((0.1 * target) / 4, 0),
    sodium: 2300,
    bmr,
    tdee,
  };
}

export interface DailyTotals extends Nutrients {
  entries: number;
}

export function emptyTotals(): DailyTotals {
  return {
    kcal: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    sodium: 0,
    entries: 0,
  };
}

export function sumNutrients(items: Nutrients[]): DailyTotals {
  return items.reduce<DailyTotals>((totals, item) => {
    totals.kcal += item.kcal;
    totals.protein += item.protein;
    totals.carbs += item.carbs;
    totals.fat += item.fat;
    totals.fiber += item.fiber;
    totals.sugar += item.sugar;
    totals.sodium += item.sodium;
    totals.entries += 1;
    return totals;
  }, emptyTotals());
}

export type HintKey =
  | "empty"
  | "caloriesOver"
  | "protein"
  | "fiber"
  | "sugar"
  | "sodium"
  | "balanced";

export interface Hint {
  key: HintKey;
  amount: number;
  suggestionKey: string;
}

const DIET_PROTEIN_HINT: Record<DietType, string> = {
  vegetarian: "hint.suggest.vegetarianProtein",
  vegan: "hint.suggest.veganProtein",
  "non-vegetarian": "hint.suggest.meatProtein",
};

export function getHint(
  totals: Nutrients,
  targets: NutritionTargets,
  dietType: DietType,
): Hint {
  if (totals.kcal <= 0) {
    return {
      key: "empty",
      amount: 0,
      suggestionKey: "hint.suggest.start",
    };
  }

  const overBy = totals.kcal - targets.kcal;
  if (overBy > targets.kcal * 0.1) {
    return {
      key: "caloriesOver",
      amount: Math.round(overBy),
      suggestionKey: "hint.suggest.balance",
    };
  }

  if (totals.sugar > targets.sugar) {
    return {
      key: "sugar",
      amount: Math.round(totals.sugar - targets.sugar),
      suggestionKey: "hint.suggest.sugar",
    };
  }

  if (totals.sodium > targets.sodium) {
    return {
      key: "sodium",
      amount: Math.round(totals.sodium - targets.sodium),
      suggestionKey: "hint.suggest.sodium",
    };
  }

  const proteinShort = targets.protein - totals.protein;
  if (proteinShort > 8 && proteinShort > targets.protein * 0.2) {
    return {
      key: "protein",
      amount: Math.round(proteinShort),
      suggestionKey: DIET_PROTEIN_HINT[dietType],
    };
  }

  const fiberShort = targets.fiber - totals.fiber;
  if (fiberShort > 5) {
    return {
      key: "fiber",
      amount: Math.round(fiberShort),
      suggestionKey: "hint.suggest.fiber",
    };
  }

  return {
    key: "balanced",
    amount: 0,
    suggestionKey: "hint.suggest.wellDone",
  };
}
