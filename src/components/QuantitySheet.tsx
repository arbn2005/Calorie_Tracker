import { useEffect, useMemo, useState } from "react";
import { logFood } from "../db/data";
import { useTranslation } from "../i18n";
import type { FoodWithMeta, MealType } from "../types";
import { parseNumber, round } from "../lib/utils";
import { MEALS } from "../constants";
import { NutrientGrid } from "./NutrientGrid";

interface QuantitySheetProps {
  food: FoodWithMeta;
  initialMeal: MealType;
  initialUnitName?: string;
  onClose: () => void;
  onLogged: () => void;
}

interface UnitOption {
  key: string;
  label: string;
  grams: number | null;
}

export function QuantitySheet({
  food,
  initialMeal,
  initialUnitName,
  onClose,
  onLogged,
}: QuantitySheetProps) {
  const { t } = useTranslation();
  const units = useMemo<UnitOption[]>(() => {
    const list: UnitOption[] = [
      { key: "g", label: t("units.grams"), grams: null },
    ];
    for (const serving of food.servings) {
      list.push({
        key: `s:${serving.unitName}`,
        label: `${serving.unitName} · ${round(serving.grams, 0)} g`,
        grams: serving.grams,
      });
    }
    if (
      food.packetGrams &&
      food.packetGrams > 0 &&
      !food.servings.some((serving) => serving.unitName === "packet")
    ) {
      list.push({
        key: "packet",
        label: t("units.wholePacket", { grams: round(food.packetGrams, 0) }),
        grams: food.packetGrams,
      });
    }
    return list;
  }, [food, t]);

  const initialUnit = useMemo(
    () =>
      initialUnitName
        ? units.find((item) => item.key === `s:${initialUnitName}`)
        : undefined,
    [initialUnitName, units],
  );

  const [unitKey, setUnitKey] = useState(initialUnit?.key ?? "g");
  const [amount, setAmount] = useState(initialUnit ? "1" : "100");
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const unit = units.find((item) => item.key === unitKey) ?? units[0];
  const amountValue = parseNumber(amount, 0);
  const grams = unit.grams ? amountValue * unit.grams : amountValue;
  const factor = grams / 100;
  const totals = {
    kcal: food.kcal * factor,
    protein: food.protein * factor,
    carbs: food.carbs * factor,
    fat: food.fat * factor,
    fiber: food.fiber * factor,
    sugar: food.sugar * factor,
    sodium: food.sodium * factor,
  };

  function changeUnit(key: string) {
    setUnitKey(key);
    const next = units.find((item) => item.key === key);
    setAmount(next?.grams ? "1" : "100");
  }

  async function handleLog() {
    if (!(grams > 0)) {
      setError(t("add.required"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await logFood({
        food,
        quantityG: grams,
        mealType: meal,
        servingLabel:
          unit.key === "g"
            ? undefined
            : `${round(amountValue, 2)} × ${unit.label}`,
      });
      onLogged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("add.quantityTitle")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div>
            <h2>{food.name}</h2>
            <p className="muted">
              {food.brand ? `${food.brand} · ` : ""}
              {t(`cuisines.${food.cuisine.toLowerCase()}`)} ·{" "}
              {t(`categories.${food.category}`)}
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </div>

        <div className="sheet-body">
          <div className="field-row">
            <label className="field">
              <span>{t("add.quantity")}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t("add.unit")}</span>
              <select
                value={unitKey}
                onChange={(event) => changeUnit(event.target.value)}
              >
                {units.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted small">
            {round(grams, 1)} {t("common.g")} ·{" "}
            {t("today.entryKcal", { kcal: Math.round(totals.kcal) })}
          </p>

          <label className="field">
            <span>{t("add.meal")}</span>
            <div className="segmented">
              {MEALS.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={meal === item ? "active" : ""}
                  onClick={() => setMeal(item)}
                >
                  {t(`meals.${item}`)}
                </button>
              ))}
            </div>
          </label>

          <section className="sub-card">
            <h3>{t("add.estimated")}</h3>
            <NutrientGrid nutrients={totals} />
          </section>

          <section className="sub-card">
            <h3>{t("add.per100")}</h3>
            <NutrientGrid nutrients={food} compact />
          </section>

          {food.packetGrams ? (
            <p className="muted small">
              {t("add.packetValues", {
                grams: round(food.packetGrams, 0),
                kcal: Math.round((food.kcal * food.packetGrams) / 100),
              })}
            </p>
          ) : null}

          <p className="muted small">
            {t("add.source", { source: t(`source.${food.source}`) })}
          </p>

          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="sheet-actions">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleLog}
            disabled={saving}
          >
            {saving ? t("add.logging") : t("add.logFood")}
          </button>
        </div>
      </div>
    </div>
  );
}
