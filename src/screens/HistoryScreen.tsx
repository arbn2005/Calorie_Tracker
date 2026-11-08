import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ChartData } from "chart.js";
import { Chart, Doughnut } from "react-chartjs-2";
import {
  CATEGORIES,
  CATEGORY_COLORS,
  CUISINES,
  CUISINE_COLORS,
  MACRO_COLORS,
  MEALS,
  MEAL_EMOJI,
  NUTRIENT_META,
} from "../constants";
import { getLogsForDays } from "../db/data";
import { useTranslation } from "../i18n";
import { chartGrid, chartTooltip } from "../lib/charts";
import { dayKey, lastNDays } from "../lib/date";
import { emptyTotals, calculateTargets, sumNutrients } from "../lib/goals";
import { formatCompact, formatNumber, round } from "../lib/utils";
import type {
  Cuisine,
  FoodCategory,
  LogEntry,
  MealType,
  UserProfile,
} from "../types";

interface HistoryScreenProps {
  profile: UserProfile;
  refreshKey: number;
}

type Period = 7 | 30;
type HistoryTab = "calories" | "foods" | "nutrients";
type NutrientKey =
  | "kcal"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "sugar"
  | "sodium";

const TREND_KEYS: NutrientKey[] = [
  "kcal",
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "sodium",
];

const TARGET_KEYS: Exclude<NutrientKey, "kcal">[] = [
  "protein",
  "carbs",
  "fat",
  "fiber",
  "sugar",
  "sodium",
];

export function HistoryScreen({ profile, refreshKey }: HistoryScreenProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>(7);
  const [tab, setTab] = useState<HistoryTab>("calories");
  const [trendKey, setTrendKey] = useState<NutrientKey>("protein");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getLogsForDays(period)
      .then((items) => {
        if (!active) return;
        setLogs(items);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [period, refreshKey]);

  const targets = useMemo(() => calculateTargets(profile), [profile]);
  const buckets = useMemo(() => lastNDays(period), [period]);

  const totalsByDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const bucket of buckets) map.set(bucket.key, emptyTotals());
    for (const log of logs) {
      const totals = map.get(dayKey(log.loggedAt));
      if (!totals) continue;
      totals.kcal += log.kcal;
      totals.protein += log.protein;
      totals.carbs += log.carbs;
      totals.fat += log.fat;
      totals.fiber += log.fiber;
      totals.sugar += log.sugar;
      totals.sodium += log.sodium;
      totals.entries += 1;
    }
    return map;
  }, [buckets, logs]);

  const periodTotals = useMemo(() => sumNutrients(logs), [logs]);
  const loggedDays = useMemo(
    () => [...totalsByDay.values()].filter((day) => day.entries > 0).length,
    [totalsByDay],
  );
  const divisor = loggedDays || 1;
  const average = {
    kcal: periodTotals.kcal / divisor,
    protein: periodTotals.protein / divisor,
    carbs: periodTotals.carbs / divisor,
    fat: periodTotals.fat / divisor,
    fiber: periodTotals.fiber / divisor,
    sugar: periodTotals.sugar / divisor,
    sodium: periodTotals.sodium / divisor,
  };

  const labels = useMemo(
    () =>
      buckets.map((bucket) =>
        period === 7
          ? bucket.label
          : String(new Date(bucket.ts).getDate()),
      ),
    [buckets, period],
  );

  const kcalValues = useMemo(
    () => buckets.map((bucket) => round(totalsByDay.get(bucket.key)?.kcal ?? 0, 0)),
    [buckets, totalsByDay],
  );

  const hasLogs = logs.length > 0;

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">{t("history.subtitle", { days: period })}</p>
          <h1>{t("history.title")}</h1>
        </div>
        <div className="segmented small-segment">
          <button
            type="button"
            className={period === 7 ? "active" : ""}
            onClick={() => setPeriod(7)}
          >
            {t("history.days7")}
          </button>
          <button
            type="button"
            className={period === 30 ? "active" : ""}
            onClick={() => setPeriod(30)}
          >
            {t("history.days30")}
          </button>
        </div>
      </header>

      <div className="stat-strip">
        <div className="stat">
          <span>{t("history.average")}</span>
          <strong>{formatNumber(round(average.kcal, 0))}</strong>
          <small>{t("common.kcal")}</small>
        </div>
        <div className="stat">
          <span>{t("history.total")}</span>
          <strong>{formatCompact(round(periodTotals.kcal, 0))}</strong>
          <small>{t("common.kcal")}</small>
        </div>
        <div className="stat">
          <span>{t("history.loggedDays")}</span>
          <strong>
            {loggedDays}
            <small className="inline-small">/{period}</small>
          </strong>
          <small>
            {t("history.daysLoggedOf", { logged: loggedDays, total: period })}
          </small>
        </div>
      </div>

      <div className="tab-bar inline" role="tablist" aria-label={t("history.title")}>
        {(
          [
            ["calories", "history.caloriesTab"],
            ["foods", "history.foodsTab"],
            ["nutrients", "history.nutrientsTab"],
          ] as const
        ).map(([key, labelKey]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`tab-button ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">{t("common.loading")}</p>
      ) : !hasLogs ? (
        <div className="card empty-card">
          <div className="empty-art" aria-hidden="true">
            ▥
          </div>
          <h2>{t("history.noData")}</h2>
          <p className="muted">{t("history.noDataBody")}</p>
        </div>
      ) : tab === "calories" ? (
        <CaloriesTab
          labels={labels}
          values={kcalValues}
          goal={targets.kcal}
          average={average.kcal}
          loggedDays={loggedDays}
          total={periodTotals.kcal}
        />
      ) : tab === "foods" ? (
        <FoodsTab logs={logs} />
      ) : (
        <NutrientsTab
          labels={labels}
          averages={average}
          targets={targets}
          trendKey={trendKey}
          onTrendKey={setTrendKey}
          totalsByDay={totalsByDay}
          buckets={buckets}
        />
      )}
    </section>
  );
}

interface CaloriesTabProps {
  labels: string[];
  values: number[];
  goal: number;
  average: number;
  loggedDays: number;
  total: number;
}

function CaloriesTab({
  labels,
  values,
  goal,
  average,
  loggedDays,
  total,
}: CaloriesTabProps) {
  const { t } = useTranslation();
  const data: ChartData = {
    labels,
    datasets: [
      {
        type: "bar",
        label: t("nutrient.kcal"),
        data: values,
        backgroundColor: values.map((value) =>
          value > goal ? "rgba(239, 68, 68, 0.75)" : "rgba(22, 163, 74, 0.75)",
        ),
        hoverBackgroundColor: "#16a34a",
        borderRadius: 6,
        maxBarThickness: 28,
      },
      {
        type: "line",
        label: t("history.goalLine"),
        data: labels.map(() => goal),
        borderColor: "#94a3b8",
        borderDash: [6, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{t("history.caloriesPerDay")}</h2>
          <p className="muted small">
            {t("history.daysLoggedOf", { logged: loggedDays, total: labels.length })}
          </p>
        </div>
        <div className="head-metric">
          <strong>{formatNumber(round(average, 0))}</strong>
          <span>{t("history.average")}</span>
        </div>
      </div>
      <div className="chart-box">
        <Chart
          type="bar"
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
              legend: {
                display: true,
                position: "bottom",
                labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 },
              },
              tooltip: {
                ...chartTooltip,
                displayColors: true,
                callbacks: {
                  label: (context) =>
                    `${context.dataset.label ?? ""}: ${formatNumber(
                      round(context.parsed.y ?? 0, 0),
                    )} ${t("common.kcal")}`,
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
              },
              y: {
                beginAtZero: true,
                grid: chartGrid,
                ticks: { callback: (value) => formatCompact(Number(value)) },
              },
            },
          }}
        />
      </div>
      <div className="metric-row">
        <div>
          <span className="muted small">{t("history.average")}</span>
          <strong>
            {formatNumber(round(average, 0))} {t("common.kcal")}
          </strong>
        </div>
        <div>
          <span className="muted small">{t("history.total")}</span>
          <strong>
            {formatNumber(round(total, 0))} {t("common.kcal")}
          </strong>
        </div>
        <div>
          <span className="muted small">{t("history.goalLine")}</span>
          <strong>
            {formatNumber(goal)} {t("common.kcal")}
          </strong>
        </div>
      </div>
    </div>
  );
}

function FoodsTab({ logs }: { logs: LogEntry[] }) {
  const { t } = useTranslation();

  const categoryData = useMemo(() => {
    const map = new Map<FoodCategory, number>();
    for (const category of CATEGORIES) map.set(category, 0);
    for (const log of logs) {
      map.set(log.category, (map.get(log.category) ?? 0) + log.kcal);
    }
    return map;
  }, [logs]);

  const cuisineData = useMemo(() => {
    const map = new Map<Cuisine, number>();
    for (const cuisine of CUISINES) map.set(cuisine, 0);
    for (const log of logs) {
      map.set(log.cuisine, (map.get(log.cuisine) ?? 0) + log.kcal);
    }
    return map;
  }, [logs]);

  const mealData = useMemo(() => {
    const map = new Map<MealType, number>();
    for (const meal of MEALS) map.set(meal, 0);
    for (const log of logs) {
      map.set(log.mealType, (map.get(log.mealType) ?? 0) + log.kcal);
    }
    return map;
  }, [logs]);

  const topFoods = useMemo(() => {
    const map = new Map<string, number>();
    for (const log of logs) {
      map.set(log.foodName, (map.get(log.foodName) ?? 0) + log.kcal);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [logs]);

  const typeColors = CATEGORIES.map((category) => CATEGORY_COLORS[category]);
  const typeValues = CATEGORIES.map(
    (category) => round(categoryData.get(category) ?? 0, 0),
  );

  const donutData: ChartData<"doughnut"> = {
    labels: CATEGORIES.map((category) => t(`categories.${category}`)),
    datasets: [
      {
        data: typeValues,
        backgroundColor: typeColors,
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };

  const cuisineDataChart: ChartData = {
    labels: CUISINES.map((cuisine) => t(`cuisines.${cuisine.toLowerCase()}`)),
    datasets: [
      {
        label: t("nutrient.kcal"),
        data: CUISINES.map((cuisine) => round(cuisineData.get(cuisine) ?? 0, 0)),
        backgroundColor: CUISINES.map((cuisine) => CUISINE_COLORS[cuisine]),
        borderRadius: 6,
        maxBarThickness: 36,
      },
    ],
  };

  const mealDataChart: ChartData = {
    labels: MEALS.map((meal) => `${MEAL_EMOJI[meal]} ${t(`meals.${meal}`)}`),
    datasets: [
      {
        label: t("nutrient.kcal"),
        data: MEALS.map((meal) => round(mealData.get(meal) ?? 0, 0)),
        backgroundColor: ["#f59e0b", "#16a34a", "#3b82f6", "#a855f7"],
        borderRadius: 6,
        maxBarThickness: 40,
      },
    ],
  };

  const topData: ChartData = {
    labels: topFoods.map(([name]) =>
      name.length > 22 ? `${name.slice(0, 20)}…` : name,
    ),
    datasets: [
      {
        label: t("nutrient.kcal"),
        data: topFoods.map(([, kcal]) => round(kcal, 0)),
        backgroundColor: "rgba(22, 163, 74, 0.7)",
        borderRadius: 5,
        maxBarThickness: 18,
      },
    ],
  };

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>{t("history.foodTypes")}</h2>
            <p className="muted small">{t("history.foodTypesHint")}</p>
          </div>
        </div>
        <div className="chart-box donut-box">
          <Doughnut
            data={donutData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: "62%",
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 },
                },
                tooltip: {
                  ...chartTooltip,
                  displayColors: true,
                  callbacks: {
                    label: (context) =>
                      `${context.label}: ${formatNumber(
                        round(context.parsed, 0),
                      )} ${t("common.kcal")}`,
                  },
                },
              },
            }}
          />
        </div>
      </div>

      <ChartCard title={t("history.cuisineMix")} hint={t("history.cuisineHint")}>
        <Chart
          type="bar"
          data={cuisineDataChart}
          options={simpleBarOptions(t("common.kcal"))}
        />
      </ChartCard>

      <ChartCard title={t("history.mealTiming")} hint={t("history.mealHint")}>
        <Chart
          type="bar"
          data={mealDataChart}
          options={simpleBarOptions(t("common.kcal"))}
        />
      </ChartCard>

      <ChartCard
        title={t("history.topFoods")}
        hint={t("history.topFoodsHint")}
        tall
      >
        <Chart
          type="bar"
          data={topData}
          options={{
            ...simpleBarOptions(t("common.kcal")),
            indexAxis: "y",
            scales: {
              x: {
                beginAtZero: true,
                grid: chartGrid,
                ticks: { callback: (value) => formatCompact(Number(value)) },
              },
              y: { grid: { display: false } },
            },
          }}
        />
      </ChartCard>
    </>
  );
}

interface NutrientsTabProps {
  labels: string[];
  averages: Record<NutrientKey, number>;
  targets: ReturnType<typeof calculateTargets>;
  trendKey: NutrientKey;
  onTrendKey: (key: NutrientKey) => void;
  totalsByDay: Map<string, ReturnType<typeof emptyTotals>>;
  buckets: ReturnType<typeof lastNDays>;
}

function NutrientsTab({
  labels,
  averages,
  targets,
  trendKey,
  onTrendKey,
  totalsByDay,
  buckets,
}: NutrientsTabProps) {
  const { t } = useTranslation();
  const targetFor = (key: NutrientKey): number =>
    key === "kcal" ? targets.kcal : targets[key];
  const trendColor =
    trendKey === "protein"
      ? MACRO_COLORS.protein
      : trendKey === "carbs"
        ? MACRO_COLORS.carbs
        : trendKey === "fat"
          ? MACRO_COLORS.fat
          : NUTRIENT_META[trendKey].color;
  const isLimit = trendKey === "sugar" || trendKey === "sodium";
  const trendValues = buckets.map((bucket) =>
    round(totalsByDay.get(bucket.key)?.[trendKey] ?? 0, 1),
  );

  const trendData: ChartData = {
    labels,
    datasets: [
      {
        type: "line",
        label: t(`nutrient.${trendKey}`),
        data: trendValues,
        borderColor: trendColor,
        backgroundColor: `${trendColor}22`,
        fill: true,
        tension: 0.35,
        pointRadius: 2.5,
        borderWidth: 2,
      },
      {
        type: "line",
        label: isLimit ? t("history.limit") : t("history.goalLine"),
        data: labels.map(() => targetFor(trendKey)),
        borderColor: "#94a3b8",
        borderDash: [6, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div>
            <h2>{t("history.nutrientTargets")}</h2>
            <p className="muted small">{t("history.nutrientTargetsHint")}</p>
          </div>
        </div>
        <div className="target-list">
          {TARGET_KEYS.map((key) => {
            const target = targets[key];
            const value = averages[key];
            const percent = target > 0 ? (value / target) * 100 : 0;
            const limit = key === "sugar" || key === "sodium";
            const over = percent > 100;
            const good = limit ? !over : percent >= 100;
            return (
              <div className="target-row" key={key}>
                <div className="target-head">
                  <span>{t(`nutrient.${key}`)}</span>
                  <span className={`target-percent ${good ? "good" : "warn"}`}>
                    {Math.round(percent)}%
                  </span>
                </div>
                <div className="target-track">
                  <div
                    className="target-fill"
                    style={{
                      width: `${Math.min(100, percent)}%`,
                      backgroundColor: good ? NUTRIENT_META[key].color : "#ef4444",
                    }}
                  />
                </div>
                <div className="target-meta muted small">
                  <span>
                    {round(value, key === "sodium" ? 0 : 1)} / {round(target, 0)}{" "}
                    {NUTRIENT_META[key].unit}
                  </span>
                  <span>
                    {t("history.percentTarget", { percent: Math.round(percent) })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{t("history.nutrientTrend")}</h2>
            <p className="muted small">{t("history.trendHint")}</p>
          </div>
          <label className="field compact-field">
            <span>{t("history.selectNutrient")}</span>
            <select
              value={trendKey}
              onChange={(event) => onTrendKey(event.target.value as NutrientKey)}
            >
              {TREND_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`nutrient.${key}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="chart-box">
          <Chart
            type="line"
            data={trendData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              plugins: {
                legend: {
                  position: "bottom",
                  labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8 },
                },
                tooltip: { ...chartTooltip, displayColors: true },
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                },
                y: {
                  beginAtZero: true,
                  grid: chartGrid,
                  ticks: { callback: (value) => formatCompact(Number(value)) },
                },
              },
            }}
          />
        </div>
      </div>
    </>
  );
}

function ChartCard({
  title,
  hint,
  tall,
  children,
}: {
  title: string;
  hint: string;
  tall?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <p className="muted small">{hint}</p>
        </div>
      </div>
      <div className={`chart-box ${tall ? "tall" : ""}`}>{children}</div>
    </div>
  );
}

function simpleBarOptions(unit: string) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...chartTooltip,
        displayColors: false,
        callbacks: {
          label: (context: { parsed: { y: number | null; x: number | null } }) =>
            `${formatNumber(round(context.parsed.y ?? context.parsed.x ?? 0, 0))} ${unit}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0 } },
      y: {
        beginAtZero: true,
        grid: chartGrid,
        ticks: { callback: (value: number | string) => formatCompact(Number(value)) },
      },
    },
  } as const;
}
