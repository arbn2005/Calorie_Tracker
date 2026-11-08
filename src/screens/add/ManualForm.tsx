import { useState } from "react";
import { CATEGORIES, CUISINES } from "../../constants";
import { createFood } from "../../db/data";
import { useTranslation } from "../../i18n";
import { parseNumber } from "../../lib/utils";
import type { Cuisine, FoodCategory, FoodWithMeta } from "../../types";

interface ManualFormProps {
  initialBarcode?: string;
  onSelect: (food: FoodWithMeta) => void;
}

interface ManualState {
  name: string;
  brand: string;
  barcode: string;
  cuisine: Cuisine;
  category: FoodCategory;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sugar: string;
  sodium: string;
  packetGrams: string;
  servingName: string;
  servingGrams: string;
  aliases: string;
}

const NUTRIENT_FIELDS = [
  { key: "kcal", unit: "kcal" },
  { key: "protein", unit: "g" },
  { key: "carbs", unit: "g" },
  { key: "fat", unit: "g" },
  { key: "fiber", unit: "g" },
  { key: "sugar", unit: "g" },
  { key: "sodium", unit: "mg" },
] as const;

function initialState(barcode?: string): ManualState {
  return {
    name: "",
    brand: "",
    barcode: barcode ?? "",
    cuisine: "Indian",
    category: "grains",
    kcal: "",
    protein: "",
    carbs: "",
    fat: "",
    fiber: "",
    sugar: "",
    sodium: "",
    packetGrams: "",
    servingName: "",
    servingGrams: "",
    aliases: "",
  };
}

export function ManualForm({ initialBarcode, onSelect }: ManualFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ManualState>(() => initialState(initialBarcode));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function update<K extends keyof ManualState>(key: K, value: ManualState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus(null);
  }

  async function save(logAfterSave: boolean) {
    setError(null);
    setStatus(null);
    if (!form.name.trim() || form.kcal.trim() === "") {
      setError(t("add.required"));
      return;
    }
    setSaving(true);
    try {
      const food = await createFood({
        name: form.name,
        brand: form.brand || null,
        barcode: form.barcode || null,
        cuisine: form.cuisine,
        category: form.category,
        packetGrams: parseNumber(form.packetGrams, 0) || null,
        aliases: form.aliases
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
        servings:
          form.servingName.trim() && parseNumber(form.servingGrams, 0) > 0
            ? [
                {
                  unitName: form.servingName,
                  grams: parseNumber(form.servingGrams, 0),
                },
              ]
            : [],
        nutrients: {
          kcal: parseNumber(form.kcal),
          protein: parseNumber(form.protein),
          carbs: parseNumber(form.carbs),
          fat: parseNumber(form.fat),
          fiber: parseNumber(form.fiber),
          sugar: parseNumber(form.sugar),
          sodium: parseNumber(form.sodium),
        },
      });
      if (logAfterSave) {
        onSelect(food);
      } else {
        setStatus(t("add.saved"));
        setForm((current) => ({
          ...current,
          name: "",
          brand: "",
          kcal: "",
          protein: "",
          carbs: "",
          fat: "",
          fiber: "",
          sugar: "",
          sodium: "",
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tab-panel">
      <div className="card">
        <div className="card-head">
          <h2>{t("add.manualTitle")}</h2>
        </div>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            void save(true);
          }}
        >
          <label className="field span-2">
            <span>{t("common.name")}</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              placeholder={t("add.namePlaceholder")}
              required
            />
          </label>

          <label className="field">
            <span>{t("add.brand")}</span>
            <input
              type="text"
              value={form.brand}
              onChange={(event) => update("brand", event.target.value)}
            />
          </label>

          <label className="field">
            <span>{t("add.barcode")}</span>
            <input
              type="text"
              inputMode="numeric"
              value={form.barcode}
              onChange={(event) => update("barcode", event.target.value)}
            />
          </label>

          <label className="field">
            <span>{t("common.cuisine")}</span>
            <select
              value={form.cuisine}
              onChange={(event) => update("cuisine", event.target.value as Cuisine)}
            >
              {CUISINES.map((cuisine) => (
                <option key={cuisine} value={cuisine}>
                  {t(`cuisines.${cuisine.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>{t("common.category")}</span>
            <select
              value={form.category}
              onChange={(event) =>
                update("category", event.target.value as FoodCategory)
              }
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(`categories.${category}`)}
                </option>
              ))}
            </select>
          </label>

          <div className="form-section span-2">
            <h3>{t("add.per100Title")}</h3>
            <div className="nutrient-form-grid">
              {NUTRIENT_FIELDS.map((field) => (
                <label className="field" key={field.key}>
                  <span>
                    {t(`nutrient.${field.key}`)} ({field.unit})
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    value={form[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="form-section span-2">
            <h3>{t("add.servingTitle")}</h3>
            <div className="two-col">
              <label className="field">
                <span>{t("add.servingName")}</span>
                <input
                  type="text"
                  value={form.servingName}
                  onChange={(event) => update("servingName", event.target.value)}
                  placeholder={t("add.servingNamePlaceholder")}
                />
              </label>
              <label className="field">
                <span>{t("add.servingGrams")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={form.servingGrams}
                  onChange={(event) => update("servingGrams", event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>{t("add.packetWeight")}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={form.packetGrams}
                onChange={(event) => update("packetGrams", event.target.value)}
              />
            </label>
          </div>

          <label className="field span-2">
            <span>{t("add.aliases")}</span>
            <input
              type="text"
              value={form.aliases}
              onChange={(event) => update("aliases", event.target.value)}
              placeholder={t("add.aliasesPlaceholder")}
            />
          </label>

          {error ? <p className="error-text span-2">{error}</p> : null}
          {status ? <p className="success-text span-2">{status}</p> : null}

          <div className="button-row span-2">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t("common.saving") : t("add.saveAndLog")}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving}
              onClick={() => void save(false)}
            >
              {t("add.saveOnly")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
