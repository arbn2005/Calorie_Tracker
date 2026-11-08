import { useEffect, useState } from "react";
import { getRecentFoods, searchFoods } from "../../db/data";
import { useTranslation } from "../../i18n";
import { round } from "../../lib/utils";
import type { FoodWithMeta } from "../../types";

interface SearchTabProps {
  onSelect: (food: FoodWithMeta) => void;
}

export function SearchTab({ onSelect }: SearchTabProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodWithMeta[]>([]);
  const [recent, setRecent] = useState<FoodWithMeta[]>([]);
  const [searching, setSearching] = useState(true);

  useEffect(() => {
    let active = true;
    getRecentFoods(8)
      .then((items) => {
        if (active) setRecent(items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(
      () => {
        searchFoods(query)
          .then((items) => {
            if (!active) return;
            setResults(items);
            setSearching(false);
          })
          .catch(() => {
            if (active) setSearching(false);
          });
      },
      query ? 120 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const trimmed = query.trim();
  const showRecent = !trimmed && recent.length > 0;

  return (
    <div className="tab-panel">
      <label className="search-box">
        <span className="search-icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("add.searchPlaceholder")}
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            onClick={() => setQuery("")}
            aria-label={t("common.close")}
          >
            ×
          </button>
        ) : null}
      </label>

      {showRecent ? (
        <section className="result-section">
          <h3 className="section-title">{t("add.recent")}</h3>
          <div className="result-list">
            {recent.map((food) => (
              <FoodRow key={`recent-${food.id}`} food={food} onSelect={onSelect} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="result-section">
        <h3 className="section-title">{t("add.popular")}</h3>
        {searching && results.length === 0 ? (
          <p className="muted small">{t("common.loading")}</p>
        ) : results.length === 0 ? (
          <div className="empty-inline">
            <strong>{t("add.noResults")}</strong>
            <p className="muted small">{t("add.noResultsHint")}</p>
          </div>
        ) : (
          <div className="result-list">
            {results.map((food) => (
              <FoodRow key={food.id} food={food} onSelect={onSelect} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FoodRow({
  food,
  onSelect,
}: {
  food: FoodWithMeta;
  onSelect: (food: FoodWithMeta) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="result-row"
      onClick={() => onSelect(food)}
    >
      <span className={`food-dot cat-${food.category}`} aria-hidden="true" />
      <span className="result-main">
        <span className="result-name">
          {food.name}
          {food.brand ? <small> · {food.brand}</small> : null}
        </span>
        <span className="muted small">
          {t(`cuisines.${food.cuisine.toLowerCase()}`)} ·{" "}
          {t(`categories.${food.category}`)}
          {food.servings.length
            ? ` · ${food.servings.map((serving) => serving.unitName).slice(0, 2).join(", ")}`
            : ""}
        </span>
      </span>
      <span className="result-kcal">
        {round(food.kcal, 0)}
        <small> {t("common.kcal")}</small>
      </span>
    </button>
  );
}
