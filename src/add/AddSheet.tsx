import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarcodeScanner } from "../components/BarcodeScanner";
import {
  CATEGORIES,
  CUISINES,
  MEALS,
} from "../constants";
import {
  createFood,
  editLog,
  findFoodByBarcode,
  getRecentFoods,
  logFood,
  searchFoods,
  updateFoodNutrients,
} from "../db/data";import { useTranslation } from "../i18n";
import { mealForTime } from "../lib/date";
import { getLastQty, setLastQty } from "../lib/memory";
import { calculateTargets } from "../lib/goals";
import { parseNumber, round } from "../lib/utils";
import type {
  Cuisine,
  FoodCategory,
  FoodWithMeta,
  MealType,
  Nutrients,
  UserProfile,
} from "../types";

export type Flow =
  | { step: "browse"; meal?: MealType }
  | { step: "scan" }
  | { step: "quick" }
  | {
      step: "quantity";
      food: FoodWithMeta;
      meal: MealType;
      editId?: number;
      initial?: { amount: string; unitKey: string };
    }
  | { step: "manual"; barcode?: string }
  | { step: "recipe" };

/** nutrients the user may correct per 100 g when editing an entry */
const PER100_FIELDS: Array<{ key: keyof Nutrients; unit: string }> = [
  { key: "kcal", unit: "kcal" },
  { key: "protein", unit: "g" },
  { key: "carbs", unit: "g" },
  { key: "fat", unit: "g" },
  { key: "fiber", unit: "g" },
  { key: "sugar", unit: "g" },
  { key: "sodium", unit: "mg" },
];

const fmtPer100 = (value: number) => String(Number(round(value, 2)));

interface AddSheetProps {
  flow: Flow | null;
  profile: UserProfile;
  onClose: () => void;
  onPersist: () => void;
}

export function AddSheet({ flow, profile, onClose, onPersist }: AddSheetProps) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [step, setStep] = useState<Flow["step"]>(flow?.step ?? "browse");
  const [meal, setMeal] = useState<MealType>(
    flow?.step === "quantity" ? flow.meal : mealForTime().mealType,
  );
  const [quantity, setQuantity] = useState<{
    food: FoodWithMeta;
    editId?: number;
    initial?: { amount: string; unitKey: string };
  } | null>(null);
  const [barcodeSeed, setBarcodeSeed] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!flow) return;
    setStep(flow.step);
    if (flow.step === "quantity") {
      setMeal(flow.meal);
      setQuantity({
        food: flow.food,
        editId: flow.editId,
        initial: flow.initial,
      });
      setBarcodeSeed(undefined);
    } else if (flow.step === "manual") {
      setBarcodeSeed(flow.barcode);
      setQuantity(null);
    } else if (flow.step === "browse" && typeof flow.meal === "string") {
      setMeal(flow.meal);
    }
  }, [flow]);

  function openQuantity(
    food: FoodWithMeta,
    mealType?: MealType,
    editId?: number,
    initial?: { amount: string; unitKey: string },
  ) {
    setQuantity({ food, editId, initial });
    setMeal(mealType ?? meal);
    setStep("quantity");
  }

  function openManual(barcode?: string) {
    setBarcodeSeed(barcode);
    setQuantity(null);
    setStep("manual");
  }

  async function handlePersist() {
    onPersist();
  }

  const closeFromHandle = useDragDismiss(onClose);

  if (!flow) return null;

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("add.title")}
        ref={closeFromHandle.sheetRef}
        style={{ transform: closeFromHandle.offset }}
      >
        <div
          className={`sheet-handle-row ${closeFromHandle.dragging ? "dragging" : ""}`}
          onPointerDown={closeFromHandle.onPointerDown}
          onPointerMove={closeFromHandle.onPointerMove}
          onPointerUp={closeFromHandle.onPointerUp}
          onPointerCancel={closeFromHandle.onPointerCancel}
          aria-hidden="true"
        >
          <span className="sheet-handle" />
        </div>

        <div className="sheet-body">
          {step === "browse" ? (
            <BrowsePanel
              onPick={(food) => openQuantity(food)}
              onScan={() => setStep("scan")}
              onManual={() => openManual()}
              onQuick={() => setStep("quick")}
              onRecipe={() => setStep("recipe")}
            />
          ) : null}

          {step === "quick" ? (
            <QuickListPanel
              meal={meal}
              onMeal={setMeal}
              onPersist={() => void handlePersist()}
            />
          ) : null}

          {step === "scan" ? (
            <ScanPanel
              onFound={(food) => openQuantity(food)}
              onManual={openManual}
            />
          ) : null}

          {step === "quantity" && quantity ? (
            <QuantityPanel
              key={quantity.food.id + (quantity.editId ?? "new")}
              food={quantity.food}
              meal={meal}
              editId={quantity.editId}
              initial={quantity.initial}
              profile={profile}
              onMeal={setMeal}
              onPersist={() => void handlePersist()}
            />
          ) : null}

          {step === "manual" ? (
            <ManualPanel
              barcode={barcodeSeed}
              onSaved={(food) => openQuantity(food, meal)}
            />
          ) : null}

          {step === "recipe" ? (
            <RecipePanel
              onSaved={(food, unitName) =>
                openQuantity(food, meal, undefined, {
                  amount: "1",
                  unitKey: `s:${unitName}`,
                })
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function useDragDismiss(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number } | null>(null);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    start.current = { y: event.clientY };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!start.current) return;
    setOffset(Math.max(0, event.clientY - start.current.y));
  }, []);

  const onPointerUp = useCallback(() => {
    start.current = null;
    setDragging(false);
    setOffset((value) => {
      if (value > 80) {
        onClose();
        return 0;
      }
      return 0;
    });
  }, [onClose]);

  const onPointerCancel = useCallback(() => {
    start.current = null;
    setDragging(false);
    setOffset(0);
  }, []);

  return {
    sheetRef,
    offset: offset ? `translateY(${offset}px)` : undefined,
    dragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}

/* ---------------------------------- browse --------------------------------- */

function BrowsePanel({
  onPick,
  onScan,
  onManual,
  onQuick,
  onRecipe,
}: {
  onPick: (food: FoodWithMeta) => void;
  onScan: () => void;
  onManual: () => void;
  onQuick: () => void;
  onRecipe: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodWithMeta[]>([]);
  const [recent, setRecent] = useState<FoodWithMeta[]>([]);
  const [cuisine, setCuisine] = useState<Cuisine | "all">("all");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getRecentFoods(6)
      .then((items) => {
        if (active) {
          setRecent(items);
          setReady(true);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const trimmed = query.trim();
    const timer = window.setTimeout(
      () => {
        searchFoods(trimmed)
          .then((items) => {
            if (active) setResults(items);
          })
          .catch(() => undefined);
      },
      trimmed ? 120 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const trimmed = query.trim();
  const filtered = useMemo(
    () =>
      cuisine === "all"
        ? results
        : results.filter((food) => food.cuisine === cuisine),
    [results, cuisine],
  );
  const showRecent = !trimmed && recent.length > 0;
  const list = showRecent ? recent : filtered;

  return (
    <>
      <div className="sheet-head">
        <div>
          <h2>{t("add.title")}</h2>
          <p className="sheet-caption">{t("add.sheetHint")}</p>
        </div>
      </div>

      <div className="meal-cta">
        <button
          type="button"
          className="btn btn-primary btn-block press"
          onClick={onQuick}
        >
          {t("add.mealCta")}
        </button>
        <p className="chart-hint muted small">{t("add.mealCtaHint")}</p>

      </div>

      <label className="search-box">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("add.searchPlaceholder")}
          autoComplete="off"
          aria-label={t("add.searchPlaceholder")}
        />
        <span className="search-actions">
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label={t("common.close")}>
              ×
            </button>
          ) : null}
          <button type="button" onClick={onScan} aria-label={t("add.scanTab")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
          </button>
        </span>
      </label>

      <div className="chip-row">
        <button
          type="button"
          className={`chip ${cuisine === "all" ? "active" : ""}`}
          onClick={() => setCuisine("all")}
        >
          {t("add.chipAll")}
        </button>
        {CUISINES.filter((value) => value !== "Other").map((value) => (
          <button
            type="button"
            key={value}
            className={`chip ${cuisine === value ? "active" : ""}`}
            onClick={() => setCuisine(value)}
          >
            {t(`cuisines.${value.toLowerCase()}`)}
          </button>
        ))}
      </div>

      {showRecent ? (
        <p className="section-label muted">{t("add.recent")}</p>
      ) : null}

      {!ready && !trimmed ? null : list.length === 0 ? (
        <p className="muted small">{t("add.noResults")}</p>
      ) : (
        <div className="result-list">
          {list.map((food) => (
            <button
              type="button"
              className="result-row"
              key={food.id}
              onClick={() => onPick(food)}
            >
              <span className="result-main">
                <span className="result-name">
                  {food.name}
                  {food.brand ? <small> · {food.brand}</small> : null}
                </span>
                <span className="muted small">
                  {t(`cuisines.${food.cuisine.toLowerCase()}`)}
                  {food.servings.length
                    ? ` · ${food.servings[0].unitName}`
                    : ""}
                </span>
              </span>
              <span className="result-kcal">{round(food.kcal, 0)}</span>
              <span className="add-mark">+</span>
            </button>
          ))}
        </div>
      )}

      <div className="button-row">
        <button type="button" className="link-btn" onClick={onManual}>
          {t("add.manualOpen")}
        </button>
        <button type="button" className="link-btn" onClick={onRecipe}>
          {t("add.recipeTab")}
        </button>
      </div>
    </>
  );
}

/* --------------------------------- quantity -------------------------------- */

interface QuantityPanelProps {
  food: FoodWithMeta;
  meal: MealType;
  editId?: number;
  initial?: { amount: string; unitKey: string };
  profile: UserProfile;
  onMeal: (meal: MealType) => void;
  onPersist: () => void;
}

export function QuantityPanel({
  food,
  meal,
  editId,
  initial,
  profile,
  onMeal,
  onPersist,
}: QuantityPanelProps) {
  const { t } = useTranslation();
  const targets = useMemo(() => calculateTargets(profile), [profile]);

  const units = useMemo(
    () => [
      { key: "g", label: t("units.gLabel"), grams: null },
      ...food.servings.map((serving) => ({
        key: `s:${serving.unitName}`,
        label: serving.unitName,
        grams: serving.grams,
      })),
      ...(food.packetGrams && food.packetGrams > 0
        ? [
            {
              key: "packet",
              label: t("units.wholePacketShort"),
              grams: food.packetGrams,
            },
          ]
        : []),
    ],
    [food, t],
  );

  const memory = editId
    ? (initial ?? { amount: "100", unitKey: "g" })
    : (initial ?? getLastQty(food.id));
  const defaultUnit =
    memory?.unitKey && units.some((unit) => unit.key === memory.unitKey)
      ? memory.unitKey
      : units.length > 1
        ? units[1].key
        : "g";
  const [unitKey, setUnitKey] = useState(defaultUnit);
  const [amount, setAmount] = useState(() =>
    editId
      ? (initial?.amount ?? "100")
      : memory?.amount ?? (defaultUnit === "g" ? "100" : "1"),
  );
  const [mode, setMode] = useState<"serving" | "packet">("serving");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** edit mode: user-corrected per-100 g values, layered over the food */
  const [per100, setPer100] = useState<Record<string, string> | null>(null);

  const unit = units.find((item) => item.key === unitKey) ?? units[0];
  const amountValue = parseNumber(amount, 0);
  const grams = unit.grams ? amountValue * unit.grams : amountValue;
  const factor = grams / 100;
  /* what the entry will actually be computed from */
  const effective = useMemo(() => {
    if (!per100) return food;
    const merged: FoodWithMeta = { ...food };
    for (const field of PER100_FIELDS) {
      const raw = per100[field.key];
      if (raw != null) merged[field.key] = parseNumber(raw, food[field.key] ?? 0);
    }
    return merged;
  }, [food, per100]);
  const kcal = effective.kcal * factor;
  const macros = {
    protein: effective.protein * factor,
    carbs: effective.carbs * factor,
    fat: effective.fat * factor,
    fiber: effective.fiber * factor,
    sugar: effective.sugar * factor,
    sodium: effective.sodium * factor,
  };
  const packetPct =
    targets.kcal > 0
      ? Math.round(((effective.kcal * (food.packetGrams ?? 0)) / targets.kcal) * 100)
      : 0;
  const nutrientsTouched =
    editId != null &&
    per100 != null &&
    PER100_FIELDS.some((field) => {
      const raw = per100[field.key];
      return raw != null && parseNumber(raw, food[field.key] ?? 0) !== food[field.key];
    });

  function changeUnit(key: string) {
    setUnitKey(key);
    const next = units.find((item) => item.key === key);
    const nextAmount = next?.grams ? "1" : String(memory?.amount ?? 100);
    setAmount(nextAmount);
    if (next?.key === "packet") setMode("packet");
    else setMode("serving");
  }

  function stepAmount(direction: 1 | -1) {
    const delta =
      unit.key === "g" ? (unit.grams === null ? 10 : 10) : 0.5;
    const next = Math.max(0, amountValue + direction * delta);
    setAmount(unit.grams ? String(next) : String(Math.round(next)));
  }

  async function save() {
    if (!(grams > 0)) {
      setError(t("add.required"));
      return;
    }
    setSaving(true);
    try {
      const servingLabel =
        unit.key === "g"
          ? undefined
          : `${round(amountValue, 2)} × ${unit.label}`;
      if (editId != null) {
        /* corrected per-100 g values are saved to the food as well, so the
           next logs start from the fixed numbers */
        if (nutrientsTouched && per100) {
          const merged = { ...food } as FoodWithMeta;
          for (const field of PER100_FIELDS) {
            const raw = per100[field.key];
            merged[field.key] =
              raw != null ? Math.max(0, parseNumber(raw, food[field.key] ?? 0)) : food[field.key];
          }
          await updateFoodNutrients(food.id, {
            kcal: merged.kcal,
            protein: merged.protein,
            carbs: merged.carbs,
            fat: merged.fat,
            fiber: merged.fiber,
            sugar: merged.sugar,
            sodium: merged.sodium,
          });
          await editLog(editId, {
            quantityG: grams,
            mealType: meal,
            servingLabel,
            nutrientsPer100g: {
              kcal: merged.kcal,
              protein: merged.protein,
              carbs: merged.carbs,
              fat: merged.fat,
              fiber: merged.fiber,
              sugar: merged.sugar,
              sodium: merged.sodium,
            },
          });
        } else {
          await editLog(editId, { quantityG: grams, mealType: meal, servingLabel });
        }
      } else {
        await logFood({ food, quantityG: grams, mealType: meal, servingLabel });
        setLastQty(food.id, { amount, unitKey });
      }
      onPersist();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <>
      <div className="sheet-head">
        <div>
          <h2>{food.name}</h2>
          <p className="sheet-caption">
            {food.brand ? `${food.brand} · ` : ""}
            {t(`cuisines.${food.cuisine.toLowerCase()}`)} ·{" "}
            {t(`categories.${food.category}`)} ·{" "}
            {round(food.kcal, 0)} {t("common.per100gShort")}
          </p>
        </div>
      </div>

      {food.packetGrams && food.packetGrams > 0 ? (
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${mode === "serving" ? "active" : ""}`}
            onClick={() => {
              setMode("serving");
              setUnitKey(food.servings[0] ? `s:${food.servings[0].unitName}` : "g");
              setAmount(food.servings[0] || !food.servings.length ? "1" : "100");
            }}
          >
            {t("add.perServingChip")}
          </button>
          <button
            type="button"
            className={`chip ${mode === "packet" ? "active" : ""}`}
            onClick={() => {
              setMode("packet");
              changeUnit("packet");
            }}
          >
            {t("units.wholePacketShort")}
          </button>
        </div>
      ) : null}

      <div className="qty-hero" aria-live="polite">
        <strong>{round(kcal, 0)}</strong>
        <span>
          {t("common.kcal")} ·{" "}
          {targets.kcal > 0
            ? `${Math.round((kcal / targets.kcal) * 100)}% ${t("common.ofDay")}`
            : ""}
        </span>
      </div>

      <div className="qty-row">
        <div className="stepper">
          <button
            type="button"
            onClick={() => stepAmount(-1)}
            aria-label={t("common.decrease")}
          >
            −
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label={t("common.quantity")}
            className="stepper-input"
          />
          <button
            type="button"
            onClick={() => stepAmount(1)}
            aria-label={t("common.increase")}
          >
            +
          </button>
        </div>
      </div>

      <div className="chip-row">
        {units.map((item) => (
          <button
            type="button"
            key={item.key}
            className={`chip ${unitKey === item.key ? "active" : ""}`}
            onClick={() => changeUnit(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="chip-row">
        {MEALS.map((item) => (
          <button
            type="button"
            key={item}
            className={`chip ${meal === item ? "active" : ""}`}
            onClick={() => onMeal(item)}
          >
            {t(`meals.${item}`)}
          </button>
        ))}
      </div>

      {editId != null ? (
        <div className="sub-card per100-edit">
          <h3>{t("add.per100Title")}</h3>
          <p className="sheet-caption">{t("add.per100Hint")}</p>
          <div className="per100-rows">
            {PER100_FIELDS.map((field) => (
              <div className="per100-row" key={field.key}>
                <label htmlFor={`per100-${field.key}`}>
                  {t(`nutrient.${field.key}`)}
                </label>
                <input
                  id={`per100-${field.key}`}
                  type="text"
                  inputMode="decimal"
                  value={
                    per100 && per100[field.key] != null
                      ? per100[field.key]
                      : fmtPer100(food[field.key] ?? 0)
                  }
                  onChange={(event) =>
                    setPer100({
                      ...per100,
                      [field.key]: event.target.value,
                    })
                  }
                  aria-label={`${t(`nutrient.${field.key}`)} · ${field.unit} ${t("common.per100gShort")}`}
                  className="mono"
                  autoComplete="off"
                />
                <span className="quantity-units">{field.unit}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sub-card">
        <h3>{t("add.estimated")}</h3>
        <div className="nutrient-grid">
          <div className="nutrient-cell">
            <span>{t("nutrient.protein")}</span>
            <strong>{round(macros.protein, 1)} g</strong>
          </div>
          <div className="nutrient-cell">
            <span>{t("nutrient.carbs")}</span>
            <strong>{round(macros.carbs, 1)} g</strong>
          </div>
          <div className="nutrient-cell">
            <span>{t("nutrient.fat")}</span>
            <strong>{round(macros.fat, 1)} g</strong>
          </div>
        </div>
        {mode === "packet" ? (
          <p className="sheet-caption">
            {t("add.packetConsequence", {
              kcal: Math.round((food.kcal * food.packetGrams!) / 100),
              percent: packetPct,
            })}
          </p>
        ) : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving ? t("common.saving") : editId ? t("add.updateEntry") : t("common.add")}
      </button>
    </>
  );
}

/* ----------------------------------- scan ---------------------------------- */

function ScanPanel({
  onFound,
  onManual,
}: {
  onFound: (food: FoodWithMeta) => void;
  onManual: (barcode?: string) => void;
}) {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(true);
  const [cameraError, setCameraError] = useState(false);
  const [looking, setLooking] = useState(false);
  const [notFound, setNotFound] = useState(false);

  async function lookup(value: string) {
    const clean = value.trim();
    if (!clean || looking) return;
    setLooking(true);
    setNotFound(false);
    try {
      const food = await findFoodByBarcode(clean);
      if (food) onFound(food);
      else setNotFound(true);
    } finally {
      setLooking(false);
    }
  }

  return (
    <>
      <div className="sheet-head">
        <div>
          <h2>{t("add.scanTitle")}</h2>
          <p className="sheet-caption">{t("add.scanHint")}</p>
        </div>
      </div>

      {scanning ? (
        <BarcodeScanner
          onDetected={(value) => void lookup(value)}
          onCameraError={() => {
            setScanning(false);
            setCameraError(true);
          }}
        />
      ) : null}

      {cameraError ? (
        <button
          type="button"
          className="btn btn-block press"
          onClick={() => {
            setCameraError(false);
            setScanning(true);
          }}
        >
          {t("add.startCamera")}
        </button>
      ) : null}

      <form
        className="two-col"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void lookup(String(form.get("barcode") ?? ""));
        }}
      >
        <input
          name="barcode"
          type="text"
          inputMode="numeric"
          placeholder={t("add.barcode")}
          aria-label={t("add.barcode")}
          style={{
            minHeight: 44,
            border: "var(--rule-thin) solid var(--rule-soft)",
            borderRadius: "var(--radius)",
            background: "var(--surface)",
            padding: "0 var(--s2)",
            fontFamily: "var(--font-mono)",
          }}
        />
        <button type="submit" className="btn press" disabled={looking}>
          {looking ? t("add.lookingUp") : t("add.lookup")}
        </button>
      </form>

      {notFound ? (
        <div className="nudge">
          <p className="title">{t("add.notFound")}</p>
          <p className="muted small">{t("add.notFoundHint")}</p>
          <div className="button-row" style={{ paddingTop: "var(--s2)" }}>
            <button
              type="button"
              className="link-btn"
              onClick={() => onManual()}
            >
              {t("add.manualOpen")}
            </button>
          </div>
        </div>
      ) : null}

      {!navigator.onLine ? <p className="muted small">{t("add.offline")}</p> : null}
    </>
  );
}

/* ---------------------------------- manual --------------------------------- */

function ManualPanel({
  barcode,
  onSaved,
}: {
  barcode?: string;
  onSaved: (food: FoodWithMeta) => void;
}) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(data: FormData, logAfter: boolean) {
    setError(null);
    const name = String(data.get("name") ?? "").trim();
    const kcal = parseNumber(String(data.get("kcal") ?? ""), NaN);
    if (!name || !Number.isFinite(kcal)) {
      setError(t("add.required"));
      return;
    }
    setSaving(true);
    try {
      const food = await createFood({
        name,
        brand: (String(data.get("brand") ?? "") || "").trim() || null,
        barcode: barcode || String(data.get("barcode") ?? "").trim() || null,
        cuisine: (String(data.get("cuisine") ?? "Indian") as Cuisine),
        category: (String(data.get("category") ?? "grains") as FoodCategory),
        nutrients: {
          kcal,
          protein: parseNumber(String(data.get("protein") ?? "")),
          carbs: parseNumber(String(data.get("carbs") ?? "")),
          fat: parseNumber(String(data.get("fat") ?? "")),
          fiber: parseNumber(String(data.get("fiber") ?? "")),
          sugar: parseNumber(String(data.get("sugar") ?? "")),
          sodium: parseNumber(String(data.get("sodium") ?? "")),
        },
        packetGrams: parseNumber(String(data.get("packet") ?? "")) || null,
        servings:
          String(data.get("servingName") ?? "").trim() &&
          parseNumber(String(data.get("servingGrams") ?? "")) > 0
            ? [
                {
                  unitName: String(data.get("servingName")),
                  grams: parseNumber(String(data.get("servingGrams") ?? "")),
                },
              ]
            : [],
        aliases: String(data.get("aliases") ?? "")
          .split(",")
          .map((alias) => alias.trim())
          .filter(Boolean),
      });
      if (logAfter) onSaved(food);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(new FormData(event.currentTarget), true);
      }}
    >
      <div className="sheet-head">
        <div>
          <h2>{t("add.manualTitle")}</h2>
          <p className="sheet-caption">{t("add.required")}</p>
        </div>
      </div>

      <div className="field-row">
        <label className="field">
          <span>{t("common.name")}</span>
          <input name="name" type="text" required placeholder={t("add.namePlaceholder")} />
        </label>
        <label className="field">
          <span>{t("nutrient.kcal")} ({t("common.per100gShort")})</span>
          <input name="kcal" type="number" inputMode="decimal" min="0" step="any" required />
        </label>
      </div>

      <div className="field-row two">
        <label className="field">
          <span>{t("nutrient.protein")}</span>
          <input name="protein" type="number" inputMode="decimal" min="0" step="any" />
        </label>
        <label className="field">
          <span>{t("nutrient.carbs")}</span>
          <input name="carbs" type="number" inputMode="decimal" min="0" step="any" />
        </label>
        <label className="field">
          <span>{t("nutrient.fat")}</span>
          <input name="fat" type="number" inputMode="decimal" min="0" step="any" />
        </label>
      </div>

      <details className="manual-more">
        <summary className="link-btn">{t("add.moreFields")}</summary>
        <div className="field-row">
          <label className="field">
            <span>{t("add.brand")}</span>
            <input name="brand" type="text" />
          </label>
          <label className="field">
            <span>{t("add.barcode")}</span>
            <input name="barcode" type="text" inputMode="numeric" defaultValue={barcode ?? ""} />
          </label>
          <label className="field">
            <span>{t("nutrient.fiber")}</span>
            <input name="fiber" type="number" inputMode="decimal" min="0" step="any" />
          </label>
          <label className="field">
            <span>{t("nutrient.sugar")}</span>
            <input name="sugar" type="number" inputMode="decimal" min="0" step="any" />
          </label>
          <label className="field">
            <span>{t("nutrient.sodium")}</span>
            <input name="sodium" type="number" inputMode="decimal" min="0" step="any" />
          </label>
          <label className="field">
            <span>{t("add.packetWeight")}</span>
            <input name="packet" type="number" inputMode="decimal" min="0" step="any" />
          </label>
          <label className="field">
            <span>{t("add.servingName")}</span>
            <input name="servingName" type="text" placeholder={t("add.servingNamePlaceholder")} />
          </label>
          <label className="field">
            <span>{t("add.servingGrams")}</span>
            <input name="servingGrams" type="number" inputMode="decimal" min="0" step="any" />
          </label>
          <label className="field">
            <span>{t("common.cuisine")}</span>
            <select name="cuisine" defaultValue="Indian">
              {CUISINES.map((value) => (
                <option key={value} value={value}>
                  {t(`cuisines.${value.toLowerCase()}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("common.category")}</span>
            <select name="category" defaultValue="grains">
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {t(`categories.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("add.aliases")}</span>
            <input name="aliases" type="text" placeholder={t("add.aliasesPlaceholder")} />
          </label>
        </div>
      </details>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="button-row">
        <button type="submit" className="btn btn-primary btn-block press" disabled={saving}>
          {saving ? t("common.saving") : t("add.saveAndLog")}
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------- recipe --------------------------------- */

function RecipePanel({
  onSaved,
}: {
  onSaved: (food: FoodWithMeta, unitName: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodWithMeta[]>([]);
  const [ingredients, setIngredients] = useState<
    { key: string; food: FoodWithMeta; grams: string }[]
  >([]);
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
      return undefined;
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
    return ingredients.reduce(
      (sum, item) => {
        const factor = parseNumber(item.grams, 0) / 100;
        sum.kcal += item.food.kcal * factor;
        sum.protein += item.food.protein * factor;
        sum.carbs += item.food.carbs * factor;
        sum.fat += item.food.fat * factor;
        sum.fiber += item.food.fiber * factor;
        sum.sugar += item.food.sugar * factor;
        sum.sodium += item.food.sodium * factor;
        return sum;
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 },
    );
  }, [ingredients]);

  const totalGrams = useMemo(
    () => ingredients.reduce((sum, item) => sum + parseNumber(item.grams, 0), 0),
    [ingredients],
  );
  const servingCount = Math.max(1, parseNumber(servings, 1));

  async function save() {
    setError(null);
    if (!ingredients.length || !name.trim()) {
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
        nutrients: {
          kcal: totals.kcal / servingCount,
          protein: totals.protein / servingCount,
          carbs: totals.carbs / servingCount,
          fat: totals.fat / servingCount,
          fiber: totals.fiber / servingCount,
          sugar: totals.sugar / servingCount,
          sodium: totals.sodium / servingCount,
        },
        servings: [
          {
            unitName,
            grams: Math.max(1, round(totalGrams / servingCount, 0)),
          },
        ],
      });
      onSaved(food, unitName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const existing = new Set(ingredients.map((item) => item.food.id));

  return (
    <>
      <div className="sheet-head">
        <div>
          <h2>{t("add.recipeTitle")}</h2>
          <p className="sheet-caption">{t("add.recipeHint")}</p>
        </div>
      </div>

      <label className="search-box">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("add.ingredientSearch")}
          autoComplete="off"
        />
      </label>

      {results.length ? (
        <div className="result-list" style={{ maxHeight: 160 }}>
          {results.map((food) => (
            <button
              type="button"
              className="result-row"
              key={food.id}
              onClick={() => {
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
              }}
              disabled={existing.has(food.id)}
            >
              <span className="result-main">
                <span className="result-name">{food.name}</span>
                <span className="mono muted">
                  {round(food.kcal, 0)} / 100 g
                </span>
              </span>
              <span className="add-mark">+</span>
            </button>
          ))}
        </div>
      ) : null}

      {ingredients.map((item) => (
        <div className="log-row" key={item.key} style={{ transform: "none" }}>
          <span className="log-name">{item.food.name}</span>
          <label className="field-inline mono">
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
              style={{
                width: 72,
                minHeight: 36,
                border: "var(--rule-thin) solid var(--rule-soft)",
                borderRadius: "var(--radius)",
                background: "var(--surface)",
                textAlign: "right",
                padding: "2px 6px",
                fontFamily: "var(--font-mono)",
              }}
            />
            {t("common.g")}
          </label>
          <span className="log-kcal">
            {round((item.food.kcal * parseNumber(item.grams, 0)) / 100, 0)}
          </span>
          <button
            type="button"
            className="icon-btn press"
            onClick={() =>
              setIngredients((current) =>
                current.filter((entry) => entry.key !== item.key),
              )
            }
            aria-label={`${t("add.remove")} ${item.food.name}`}
          >
            ×
          </button>
        </div>
      ))}

      <div className="two-col">
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
      </div>

      <div className="chip-row">
        {CUISINES.map((value) => (
          <button
            type="button"
            key={value}
            className={`chip ${cuisine === value ? "active" : ""}`}
            onClick={() => setCuisine(value)}
          >
            {t(`cuisines.${value.toLowerCase()}`)}
          </button>
        ))}
      </div>
      <div className="chip-row">
        {CATEGORIES.map((value) => (
          <button
            type="button"
            key={value}
            className={`chip ${category === value ? "active" : ""}`}
            onClick={() => setCategory(value)}
          >
            {t(`categories.${value}`)}
          </button>
        ))}
      </div>

      <p className="sheet-caption">
        {t("add.recipeTotal")}: {round(totalGrams, 0)} {t("common.g")} ·{" "}
        {round(totals.kcal, 0)} {t("common.kcal")} · {t("add.perServing")}:{" "}
        {round(totals.kcal / servingCount, 0)} {t("common.kcal")}
      </p>

      {error ? <p className="error-text">{error}</p> : null}

      <button
        type="button"
        className="btn btn-primary btn-block press"
        onClick={() => void save()}
        disabled={saving || !ingredients.length}
      >
        {saving ? t("common.saving") : t("add.saveRecipe")}
      </button>
    </>
  );
}

/* -------------------------------- meal list -------------------------------- */

type QuickUnit = "g" | "kg" | "oz";

const QUICK_UNIT_GRAMS: Record<QuickUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.35,
};

const QUICK_UNITS: QuickUnit[] = ["g", "kg", "oz"];

interface QuickRow {
  key: string;
  name: string;
  kcal100: string;
  amount: string;
  unit: QuickUnit;
  category: FoodCategory;
}

let quickRowSeq = 0;

function newQuickRow(): QuickRow {
  quickRowSeq += 1;
  return {
    key: `q-${quickRowSeq}`,
    name: "",
    kcal100: "",
    amount: "100",
    unit: "g",
    category: "grains",
  };
}

function QuickListPanel({
  meal,
  onMeal,
  onPersist,
}: {
  meal: MealType;
  onMeal: (meal: MealType) => void;
  onPersist: () => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<QuickRow[]>(() => [newQuickRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(key: string, changes: Partial<QuickRow>) {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...changes } : row)),
    );
  }

  function rowGrams(row: QuickRow): number {
    return parseNumber(row.amount, 0) * QUICK_UNIT_GRAMS[row.unit];
  }

  function rowKcal(row: QuickRow): number {
    return (parseNumber(row.kcal100, 0) * rowGrams(row)) / 100;
  }

  async function save() {
    const invalid = rows.some(
      (row) =>
        !row.name.trim() ||
        !(parseNumber(row.kcal100, 0) > 0) ||
        !(rowGrams(row) > 0),
    );
    if (invalid) {
      setError(t("add.quickIncomplete"));
      return;
    }
    setSaving(true);
    try {
      for (const row of rows) {
        const food = await createFood({
          name: row.name.trim(),
          cuisine: "Other",
          category: row.category,
          source: "custom",
          nutrients: {
            kcal: parseNumber(row.kcal100, 0),
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
            sugar: 0,
            sodium: 0,
          },
          servings: [],
        });
        await logFood({
          food,
          quantityG: rowGrams(row),
          mealType: meal,
        });
      }
      onPersist();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const totalKcal = rows.reduce((sum, row) => sum + rowKcal(row), 0);

  return (
    <>
      <div className="sheet-head">
        <div>
          <h2>{t("add.quickTitle")}</h2>
          <p className="sheet-caption">{t("add.quickHint")}</p>
        </div>
      </div>

      <div className="quick-list">
        {rows.map((row, index) => (
          <div className="quick-row" key={row.key}>
            <div className="quick-row-head">
              <input
                type="text"
                value={row.name}
                onChange={(event) =>
                  patch(row.key, { name: event.target.value })
                }
                placeholder={t("add.namePlaceholder")}
                aria-label={`${t("common.name")} ${index + 1}`}
                autoComplete="off"
              />
              {rows.length > 1 ? (
                <button
                  type="button"
                  className="icon-btn press"
                  aria-label={`${t("add.remove")} ${index + 1}`}
                  onClick={() =>
                    setRows((current) =>
                      current.filter((entry) => entry.key !== row.key),
                    )
                  }
                >
                  ×
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>
            <div className="quick-cols">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={row.kcal100}
                onChange={(event) =>
                  patch(row.key, { kcal100: event.target.value })
                }
                placeholder={t("common.per100gShort")}
                aria-label={`${t("nutrient.kcal")} ${t("common.per100gShort")} ${index + 1}`}
                className="mono"
              />
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={row.amount}
                onChange={(event) =>
                  patch(row.key, { amount: event.target.value })
                }
                aria-label={`${t("common.quantity")} ${index + 1}`}
                className="mono"
              />
              <select
                value={row.unit}
                onChange={(event) =>
                  patch(row.key, { unit: event.target.value as QuickUnit })
                }
                aria-label={`${t("units.title")} ${index + 1}`}              >
                {QUICK_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {t(`units.${unit}Label`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="quick-meta">
              <select
                value={row.category}
                onChange={(event) =>
                  patch(row.key, {
                    category: event.target.value as FoodCategory,
                  })
                }
                aria-label={`${t("common.category")} ${index + 1}`}
                className="quick-cat"
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`categories.${category}`)}
                  </option>
                ))}
              </select>
              <span className="mono muted">
                {rowKcal(row) > 0
                  ? `${round(rowKcal(row), 0)} ${t("common.kcal")}`
                  : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="button-row">
        <button
          type="button"
          className="link-btn"
          onClick={() => setRows((current) => [...current, newQuickRow()])}
        >
          {t("add.addRow")}
        </button>
      </div>

      <div className="chip-row">
        {MEALS.map((item) => (
          <button
            type="button"
            key={item}
            className={`chip ${meal === item ? "active" : ""}`}
            onClick={() => onMeal(item)}
          >
            {t(`meals.${item}`)}
          </button>
        ))}
      </div>

      <p className="sheet-caption">
        {rows.length === 1
          ? t("add.quickTotalOne", { kcal: round(totalKcal, 0) })
          : t("add.quickTotal", {
              count: rows.length,
              kcal: round(totalKcal, 0),
            })}
      </p>

      {error ? <p className="error-text">{error}</p> : null}

      <button
        type="button"
        className="btn btn-primary btn-block press"
        onClick={() => void save()}
        disabled={saving}
      >
        {saving
          ? t("common.saving")
          : rows.length === 1
            ? t("add.logAllOne", {
                meal: t(`meals.${meal}`),
              })
            : t("add.logAllTo", {
                count: rows.length,
                meal: t(`meals.${meal}`),
              })}
      </button>
    </>
  );
}
