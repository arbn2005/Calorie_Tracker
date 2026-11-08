import { Doughnut } from "react-chartjs-2";
import { MACRO_COLORS } from "../constants";
import { useTranslation } from "../i18n";
import type { Nutrients } from "../types";
import { round } from "../lib/utils";

interface MacroDonutProps {
  totals: Nutrients;
}

export function MacroDonut({ totals }: MacroDonutProps) {
  const { t } = useTranslation();
  const proteinKcal = totals.protein * 4;
  const carbsKcal = totals.carbs * 4;
  const fatKcal = totals.fat * 9;
  const total = proteinKcal + carbsKcal + fatKcal;
  const hasData = total > 0;

  const data = {
    labels: [t("nutrient.protein"), t("nutrient.carbs"), t("nutrient.fat")],
    datasets: [
      {
        data: hasData
          ? [proteinKcal, carbsKcal, fatKcal]
          : [1, 0, 0],
        backgroundColor: hasData
          ? [
              MACRO_COLORS.protein,
              MACRO_COLORS.carbs,
              MACRO_COLORS.fat,
            ]
          : ["rgba(148, 163, 184, 0.22)", "transparent", "transparent"],
        borderWidth: 0,
        hoverOffset: 0,
      },
    ],
  };

  const rows = [
    {
      key: "protein",
      label: t("nutrient.protein"),
      grams: totals.protein,
      kcal: proteinKcal,
      color: MACRO_COLORS.protein,
    },
    {
      key: "carbs",
      label: t("nutrient.carbs"),
      grams: totals.carbs,
      kcal: carbsKcal,
      color: MACRO_COLORS.carbs,
    },
    {
      key: "fat",
      label: t("nutrient.fat"),
      grams: totals.fat,
      kcal: fatKcal,
      color: MACRO_COLORS.fat,
    },
  ];

  return (
    <div className="macro-card">
      <div className="macro-chart">
        <Doughnut
          data={data}
          options={{
            cutout: "68%",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false },
            },
          }}
        />
      </div>
      <div className="macro-legend">
        {rows.map((row) => (
          <div className="macro-row" key={row.key}>
            <span
              className="legend-dot"
              style={{ backgroundColor: row.color }}
            />
            <span className="macro-name">{row.label}</span>
            <span className="macro-value">{round(row.grams, 0)} g</span>
            <span className="macro-percent">
              {hasData ? `${Math.round((row.kcal / total) * 100)}%` : "0%"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
