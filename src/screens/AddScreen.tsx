import { useMemo, useState } from "react";
import { QuantitySheet } from "../components/QuantitySheet";
import { useTranslation } from "../i18n";
import { mealForTime } from "../lib/date";
import type { FoodWithMeta } from "../types";
import { AddTabs, type AddTab } from "./add/AddTabs";
import { ManualForm } from "./add/ManualForm";
import { RecipeForm } from "./add/RecipeForm";
import { ScanTab } from "./add/ScanTab";
import { SearchTab } from "./add/SearchTab";

interface AddScreenProps {
  onLogged: () => void;
}

export function AddScreen({ onLogged }: AddScreenProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AddTab>("search");
  const [manualSeed, setManualSeed] = useState<string | undefined>(undefined);
  const [manualKey, setManualKey] = useState(0);
  const [selected, setSelected] = useState<{
    food: FoodWithMeta;
    unitName?: string;
  } | null>(null);
  const initialMeal = useMemo(() => mealForTime().mealType, []);

  function select(food: FoodWithMeta, unitName?: string) {
    setSelected({ food, unitName });
  }

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">{t("app.name")}</p>
          <h1>{t("add.title")}</h1>
        </div>
      </header>

      <AddTabs
        tab={tab}
        onChange={(next) => {
          setTab(next);
          if (next === "manual") setManualSeed(undefined);
        }}
      />

      {tab === "search" ? <SearchTab onSelect={(food) => select(food)} /> : null}
      {tab === "scan" ? (
        <ScanTab
          onSelect={(food) => select(food)}
          onManual={(barcode) => {
            setManualSeed(barcode);
            setManualKey((value) => value + 1);
            setTab("manual");
          }}
        />
      ) : null}
      {tab === "manual" ? (
        <ManualForm
          key={`${manualSeed ?? "manual"}-${manualKey}`}
          initialBarcode={manualSeed}
          onSelect={(food) => select(food)}
        />
      ) : null}
      {tab === "recipe" ? <RecipeForm onSelect={select} /> : null}

      {selected ? (
        <QuantitySheet
          food={selected.food}
          initialMeal={initialMeal}
          initialUnitName={selected.unitName}
          onClose={() => setSelected(null)}
          onLogged={() => {
            setSelected(null);
            onLogged();
          }}
        />
      ) : null}
    </section>
  );
}
