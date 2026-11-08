import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, CUISINES } from "../../constants";
import { createFood, searchFoods } from "../../db/data";
import { useTranslation } from "../../i18n";
import { emptyTotals } from "../../lib/goals";
import { parseNumber, round } from "../../lib/utils";
import type { Cuisine, FoodCategory, FoodWithMeta } from "../../types";

interface RecipeFormProps {
  onSelect: (food: FoodWithMeta, unitName?: string) => void;
}

interface Ingredient {
  key: string;
  food: FoodWithMeta;
  grams: string;
}

export function RecipeForm({ onSelect }: RecipeFormProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodWithMeta[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("2");
  const [cuisine, setCuisine] = useState<Cuisine>("Indian");
  const [category, setCategory] = useState<FoodCategory>("grains");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchFoods(trimmed, 8)
        .then((items) => {
          if (active) setResults(items);
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const totals = useMemo(() => {
    return ingredients.reduce((sum, item) => {
      const factor = parseNumber(item.grams, 0) / 100;
      sum.kcal += item.food.kcal * factor;
      sum.protein += item.food.protein * factor;
      sum.carbs += item.food.carbs * factor;
      sum.fat += item.food.fat * factor;
      sum.fiber += item.food.fiber * factor;
      sum.sugar += item.food.sugar * factor;
      sum.sodium += item.food.sodium * factor;
      return sum;
    }, emptyTotals());
  }, [ingredients]);

  const totalGrams = useMemo(
    () =>
      ingredients.reduce((sum, item) => sum + parseNumber(item.grams, 0), 0),
    [ingredients],
  );

  const servingCount = Math.max(1, parseNumber(servings, 1));
  const perServingGrams = totalGrams / servingCount;
  const perServing = {
    kcal: totals.kcal / servingCount,
    protein: totals.protein / servingCount,
    carbs: totals.carbs / servingCount,
    fat: totals.fat / servingCount,
    fiber: totals.fiber / servingCount,
    sugar: totals.sugar / servingCount,
    sodium: totals.sodium / servingCount,
  };
  const existing = new Set(ingredients.map((item) => item.food.id));

  function addIngredient(food: FoodWithMeta) {
    setIngredients((current) => [
      ...current,
      {
        key: `${food.id}-${Date.now().toString(36)}`,
        food,
        grams: "100",
      },
    ]);
    setQuery("");
    setResults([]);
  }

  async function save() {
    setError(null);
    if (!ingredients.length) {
      setError(t("add.recipeEmpty"));
      return;
    }
    if (!name.trim()) {
      setError(t("add.recipeEmpty"));
      return;
    }
    if (!(parseNumber(servings, 0) > 0)) {
      setError(t("add.noServings"));
      return;
    }
    setSaving(true);
    try {
      const unitName = t("add.recipeServingUnit");
      const food = await createFood({
        name,
        cuisine,
        category,
        source: "custom",
        nutrients: perServing,
        servings: [
          { unitName, grams: Math.max(1, round(perServingGrams, 0)) },
        ],
        aliases: ingredients.map((item) => item.food.name),
      });
      onSelect(food, unitName);
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
          <div>
            <h2>{t("add.recipeTitle")}</h2>
            <p className="muted small">{t("add.recipeHint")}</p>
          </div>
        </div>

        <label className="search-box">
          <span className="search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("add.ingredientSearch")}
            autoComplete="off"
          />
        </label>

        {results.length ? (
          <div className="result-list ingredient-results">
            {results.map((food) => (
              <button
                type="button"
                className="result-row"
                key={food.id}
                onClick={() => addIngredient(food)}
                disabled={existing.has(food.id)}
              >
                <span className={`food-dot cat-${food.category}`} aria-hidden="true" />
                <span className="result-main">
                  <span className="result-name">{food.name}</span>
                  <span className="muted small">
                    {t(`categories.${food.category}`)} ·{" "}
                    {round(food.kcal, 0)} {t("common.kcal")}
                  </span>
                </span>
                <span className="add-mark">+</span>
              </button>
            ))}
          </div>
        ) : null}

        <section className="recipe-ingredients">
          <h3 className="section-title">{t("add.ingredients")}</h3>
          {ingredients.length === 0 ? (
            <p className="muted small">{t("add.recipeEmpty")}</p>
          ) : (
            <ul className="ingredient-list">
              {ingredients.map((item) => (
                <li className="ingredient-row" key={item.key}>
                  <span className="ingredient-name">{item.food.name}</span>
                  <label className="grams-field">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={item.grams}
                      onChange={(event) =>
                        setIngredients((current) =>
                          current.map((entry) =>
                            entry.key === item.key
                              ? { ...entry, grams: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      aria-label={`${item.food.name} ${t("add.ingredientGrams")}`}
                    />
                    <span>{t("common.g")}</span>
                  </label>
                  <span className="ingredient-kcal">
                    {round(
                      (item.food.kcal * parseNumber(item.grams, 0)) / 100,
                      0,
                    )}{" "}
                    {t("common.kcal")}
                  </span>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() =>
                      setIngredients((current) =>
                        current.filter((entry) => entry.key !== item.key),
                      )
                    }
                    aria-label={`${t("add.remove")} ${item.food.name}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="two-col recipe-meta">
          <label className="field">
            <span>{t("add.recipeName")}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("add.recipeNamePlaceholder")}
              maxLength={80}
            />
          </label>
          <label className="field">
            <span>{t("add.recipeServings")}</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={servings}
              onChange={(event) => setServings(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{t("common.cuisine")}</span>
            <select
              value={cuisine}
              onChange={(event) => setCuisine(event.target.value as Cuisine)}
            >
              {CUISINES.map((value) => (
                <option key={value} value={value}>
                  {t(`cuisines.${value.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("common.category")}</span>
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as FoodCategory)
              }
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`categories.${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="recipe-totals">
          <div>
            <span className="muted small">{t("add.recipeTotal")}</span>
            <strong>
              {round(totalGrams, 0)} {t("common.g")} · {round(totals.kcal, 0)}{" "}
              {t("common.kcal")}
            </strong>
          </div>
          <div>
            <span className="muted small">{t("add.perServing")}</span>
            <strong>
              {round(perServingGrams, 0)} {t("common.g")} ·{" "}
              {round(perServing.kcal, 0)} {t("common.kcal")}
            </strong>
          </div>
          <div className="recipe-macros muted small">
            {t("nutrient.protein")} {round(perServing.protein, 1)} {t("common.g")}{" "}
            · {t("nutrient.carbs")} {round(perServing.carbs, 1)}{" "}
            {t("common.g")} · {t("nutrient.fat")} {round(perServing.fat, 1)}{" "}
            {t("common.g")}
          </div>
        </div>

        {error ? <p className="error-text">{error}</p> : null}

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={saving || !ingredients.length}
          onClick={() => void save()}
        >
          {saving ? t("common.saving") : t("add.saveRecipe")}
        </button>
      </div>
    </div>
  );
}
