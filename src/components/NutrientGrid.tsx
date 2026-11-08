import { useTranslation } from "../i18n";
import type { Nutrients } from "../types";
import { round } from "../lib/utils";

interface NutrientGridProps {
  nutrients: Nutrients;
  compact?: boolean;
}

const ROWS = [
  { key: "protein", unit: "g", digits: 1 },
  { key: "carbs", unit: "g", digits: 1 },
  { key: "fat", unit: "g", digits: 1 },
  { key: "fiber", unit: "g", digits: 1 },
  { key: "sugar", unit: "g", digits: 1 },
  { key: "sodium", unit: "mg", digits: 0 },
] as const;

export function NutrientGrid({ nutrients, compact }: NutrientGridProps) {
  const { t } = useTranslation();
  return (
    <div className={`nutrient-grid ${compact ? "compact" : ""}`}>
      <div className="nutrient-cell">
        <span>{t("nutrient.kcal")}</span>
        <strong>{round(nutrients.kcal, 0)}</strong>
      </div>
      {ROWS.map((row) => (
        <div className="nutrient-cell" key={row.key}>
          <span>{t(`nutrient.${row.key}`)}</span>
          <strong>
            {round(nutrients[row.key], row.digits)}
            <small>{row.unit}</small>
          </strong>
        </div>
      ))}
    </div>
  );
}
