import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, MEALS } from "../constants";
import { getLogsForDays } from "../db/data";
import { useTranslation } from "../i18n";
import { dayKey, lastNDays } from "../lib/date";
import { calculateTargets, emptyTotals, sumNutrients } from "../lib/goals";
import { formatNumber, round } from "../lib/utils";
import type { MealType, UserProfile } from "../types";

interface TrendScreenProps {
  profile: UserProfile;
  refreshKey: number;
}

type Period = "week" | "month";

export function TrendScreen({ profile, refreshKey }: TrendScreenProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("week");
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof getLogsForDays>>>([]);
  const [loading, setLoading] = useState(true);

  const days = period === "week" ? 7 : 30;

  useEffect(() => {
    let active = true;
    getLogsForDays(days)
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
  }, [days, refreshKey]);

  const targets = useMemo(() => calculateTargets(profile), [profile]);
  const buckets = useMemo(() => lastNDays(days), [days, refreshKey]);

  const totalsByDay = useMemo(() => {
    const map = new Map<string, ReturnType<typeof emptyTotals>>();
    for (const bucket of buckets) map.set(bucket.key, emptyTotals());
    for (const log of logs) {
      const day = map.get(dayKey(log.loggedAt));
      if (!day) continue;
      day.kcal += log.kcal;
      day.protein += log.protein;
      day.carbs += log.carbs;
      day.fat += log.fat;
      day.fiber += log.fiber;
      day.sugar += log.sugar;
      day.sodium += log.sodium;
      day.entries += 1;
    }
    return map;
  }, [buckets, logs]);

  const periodTotals = useMemo(() => sumNutrients(logs), [logs]);
  const loggedDays = useMemo(
    () => [...totalsByDay.values()].filter((day) => day.entries > 0).length,
    [totalsByDay],
  );
  const avg = loggedDays ? periodTotals.kcal / loggedDays : 0;
  const diff = targets.kcal - avg;
  const under = diff >= 0;

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">{t("trends.subtitle")}</p>
          <h1>{t("nav.trends")}</h1>
        </div>
      </header>

      <hr className="rule-heavy" />

      <div style={{ padding: "var(--s3) 0" }}>
        <div className="segment-flex" role="tablist" aria-label={t("nav.trends")}>
          <button
            type="button"
            role="tab"
            aria-selected={period === "week"}
            className={period === "week" ? "active" : ""}
            onClick={() => setPeriod("week")}
          >
            {t("trends.week")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={period === "month"}
            className={period === "month" ? "active" : ""}
            onClick={() => setPeriod("month")}
          >
            {t("trends.month")}
          </button>
        </div>
      </div>

      {loading ? null : logs.length === 0 ? (
        <p className="log-empty small">{t("history.noDataBody")}</p>
      ) : (
        <>
          <p className="chart-hint summary">
            {under
              ? t("trends.summaryUnder", {
                  avg: round(avg, 0),
                  diff: formatNumber(round(diff, 0)),
                })
              : t("trends.summaryOver", {
                  avg: round(avg, 0),
                  diff: formatNumber(round(Math.abs(diff), 0)),
                })}
          </p>

          {period === "week" ? (
            <WeekChart
              days={buckets}
              totalsByDay={totalsByDay}
              goal={targets.kcal}
            />
          ) : (
            <MonthGrid buckets={buckets} totalsByDay={totalsByDay} goal={targets.kcal} />
          )}

          <FoodTypes logs={logs} />
          <NutrientSplit
            protein={periodTotals.protein}
            carbs={periodTotals.carbs}
            fat={periodTotals.fat}
          />
          <div className="chart-block">
            <p className="chart-title">{t("trends.goalCheck")}</p>
            <p>
              {under
                ? t("trends.goalCheckUnder", {
                    goal: t(`goal.${profile.goal}`),
                    avg: formatNumber(round(avg, 0)),
                    target: targets.kcal,
                    diff: formatNumber(round(Math.abs(diff), 0)),
                  })
                : t("trends.goalCheckOver", {
                    goal: t(`goal.${profile.goal}`),
                    avg: formatNumber(round(avg, 0)),
                    target: targets.kcal,
                    diff: formatNumber(round(Math.abs(diff), 0)),
                  })}
            </p>
            <MealTiming logs={logs} />
          </div>
        </>
      )}
    </section>
  );
}

/* --------------------------------- week bars -------------------------------- */

function WeekChart({
  days,
  totalsByDay,
  goal,
}: {
  days: ReturnType<typeof lastNDays>;
  totalsByDay: Map<string, ReturnType<typeof emptyTotals>>;
  goal: number;
}) {
  const { t } = useTranslation();
  const values = days.map((bucket) => round(totalsByDay.get(bucket.key)?.kcal ?? 0, 0));
  const top = Math.max(goal, ...values) * 1.08;
  const width = 350;
  const height = 170;
  const padX = 6;
  const barW = (width - padX * 2) / values.length;
  const goalY = height - (goal / top) * height;

  return (
    <div className="chart-block week-chart">
      <p className="chart-title">{t("trends.caloriesPerDay")}</p>
      <svg
        viewBox={`0 0 ${width} ${height + 24}`}
        role="img"
        aria-label={t("trends.caloriesPerDay")}
      >
        <defs>
          <pattern
            id="hatchPattern"
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="currentColor"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        <line
          x1="0"
          x2={width}
          y1={goalY}
          y2={goalY}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="6 5"
          opacity="0.55"
        />
        {values.map((value, index) => {
          const h = (value / top) * height;
          const x = padX + index * barW + barW * 0.2;
          const w = barW * 0.6;
          const over = goal > 0 && value > goal;
          return (
            <g key={days[index].ts}>
              <rect
                x={x}
                y={height - h}
                width={w}
                height={h}
                className={over ? "bar-hatch" : undefined}
                fill={over ? undefined : "var(--ink)"}
                opacity={value === 0 ? 0.12 : 1}
              />
              <title>{`${days[index].label}: ${formatNumber(value)} kcal`}</title>
              <text
                x={x + w / 2}
                y={height + 18}
                textAnchor="middle"
                fontSize="11"
                fill="var(--muted)"
                fontFamily="var(--font-mono)"
              >
                {days[index].label.slice(0, 2)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="chart-hint muted small">{t("trends.hatchLegend")}</p>
    </div>
  );
}

/* ------------------------------- month calendar ------------------------------ */

function MonthGrid({
  buckets,
  totalsByDay,
  goal,
}: {
  buckets: ReturnType<typeof lastNDays>;
  totalsByDay: Map<string, ReturnType<typeof emptyTotals>>;
  goal: number;
}) {
  const { t } = useTranslation();
  const dows = ["S", "M", "T", "W", "T", "F", "S"];
  const first = new Date(buckets[0].ts);
  const offset = first.getDay();
  const cells: (ReturnType<typeof lastNDays>[number] | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...buckets,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="chart-block">
      <p className="chart-title">{t("trends.month")}</p>
      <div className="cal-grid">
        {dows.map((dow, index) => (
          <span className="cal-dow" key={`${dow}-${index}`}>
            {dow}
          </span>
        ))}
        {cells.map((bucket, index) => {
          if (!bucket) return <span key={`empty-${index}`} />;
          const kcal = totalsByDay.get(bucket.key)?.kcal ?? 0;
          const pct = goal > 0 ? kcal / goal : 0;
          const shade = Math.min(1, Math.max(0.08, pct));
          return (
            <span
              className={`cal-cell ${pct > 1 ? "over" : ""} ${
                bucket.isToday ? "today" : ""
              }`}
              key={bucket.key}
              style={{ ["--shade" as string]: shade }}
              title={`${bucket.label}: ${formatNumber(round(kcal, 0))} kcal · ${Math.round(pct * 100)}%`}
              aria-label={`${bucket.label}: ${formatNumber(round(kcal, 0))} calories, ${Math.round(pct * 100)}% of goal${pct > 1 ? ", over goal" : ""}`}
            >
              <span className="shade" />
              <span className="num mono">
                {new Date(bucket.ts).getDate()}
              </span>
            </span>
          );
        })}
      </div>
      <p className="chart-hint muted small">{t("trends.hatchLegend")}</p>
    </div>
  );
}

/* ---------------------------------- food types ------------------------------- */

const SHADE_STEPS = [1, 0.85, 0.7, 0.57, 0.46, 0.36, 0.27, 0.19];

function FoodTypes({ logs }: { logs: Awaited<ReturnType<typeof getLogsForDays>> }) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const totals = CATEGORIES.map((category) => ({
      category,
      kcal: logs.reduce(
        (sum, log) => (log.category === category ? sum + log.kcal : sum),
        0,
      ),
    }))
      .filter((row) => row.kcal > 0)
      .sort((a, b) => b.kcal - a.kcal);
    const total = totals.reduce((sum, row) => sum + row.kcal, 0);
    return totals.map((row) => ({
      ...row,
      pct: total ? (row.kcal / total) * 100 : 0,
    }));
  }, [logs]);
  const total = rows.reduce((sum, row) => sum + row.kcal, 0);

  return (
    <div className="chart-block">
      <p className="chart-title">{t("trends.foodTypes")}</p>
      {total > 0 ? (
        <>
          <div className="stack-bar" role="img" aria-label={t("trends.foodTypes")}>
            {rows.map((row, index) => (
              <div
                key={row.category}
                className="stack-seg"
                style={{
                  width: `${(row.kcal / total) * 100}%`,
                  backgroundColor: "var(--ink)",
                  opacity: SHADE_STEPS[index % SHADE_STEPS.length],
                }}
                title={`${t(`categories.${row.category}`)}: ${formatNumber(round(row.kcal, 0))} kcal`}
              />
            ))}
          </div>
          <div className="legend-list">
            {rows.map((row) => (
              <div className="legend-row" key={row.category}>
                <span
                  className="legend-dot"
                  style={{
                    backgroundColor: "var(--ink)",
                    opacity: SHADE_STEPS[
                      rows.findIndex((other) => other.category === row.category) %
                        SHADE_STEPS.length
                    ],
                  }}
                />
                <span>{t(`categories.${row.category}`)}</span>
                <span className="mono">
                  {Math.round(row.pct)}% · {formatNumber(round(row.kcal, 0))} kcal
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="chart-hint muted small">{t("history.noDataShort")}</p>
      )}
    </div>
  );
}

/* ------------------------------ nutrient split ------------------------------- */

function NutrientSplit({
  protein,
  carbs,
  fat,
}: {
  protein: number;
  carbs: number;
  fat: number;
}) {
  const { t } = useTranslation();
  const pK = protein * 4;
  const cK = carbs * 4;
  const fK = fat * 9;
  const total = pK + cK + fK;
  const rows = [
    { label: t("nutrient.protein"), value: pK, color: "var(--protein)" },
    { label: t("nutrient.carbs"), value: cK, color: "var(--carbs)" },
    { label: t("nutrient.fat"), value: fK, color: "var(--fat)" },
  ];

  return (
    <div className="chart-block">
      <p className="chart-title">{t("trends.nutrientSplit")}</p>
      {total > 0 ? (
        <>
          <div className="segments" role="img" aria-label={t("trends.nutrientSplit")}>
            {rows.map((row) => (
              <div
                key={row.label}
                style={{
                  width: `${(row.value / total) * 100}%`,
                  background: row.color,
                }}
                title={`${row.label}: ${Math.round((row.value / total) * 100)}%`}
              />
            ))}
          </div>
          <div className="legend-list">
            {rows.map((row) => (
              <div className="legend-row" key={row.label}>
                <span className="legend-dot" style={{ background: row.color }} />
                <span>{row.label}</span>
                <span className="mono">
                  {Math.round((row.value / Math.max(1, total)) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="chart-hint muted small">{t("history.noDataShort")}</p>
      )}
    </div>
  );
}

/* ------------------------------- meal timing --------------------------------- */

const MEAL_SHADE: Record<MealType, string> = {
  breakfast: "1",
  lunch: "0.85",
  dinner: "0.7",
  snacks: "0.57",
};

function MealTiming({ logs }: { logs: Awaited<ReturnType<typeof getLogsForDays>> }) {
  const { t } = useTranslation();
  const totals = useMemo(() => {
    const map = new Map<MealType, number>();
    for (const meal of MEALS) map.set(meal, 0);
    for (const log of logs) {
      map.set(log.mealType, (map.get(log.mealType) ?? 0) + log.kcal);
    }
    return map;
  }, [logs]);
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return (
      <div>
        <p className="chart-title">{t("history.mealHint")}</p>
        <p className="chart-hint muted small">{t("history.noDataShort")}</p>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: "var(--s2)" }}>
      <p className="chart-title">{t("history.mealHint")}</p>
      <div className="stack-bar">
        {MEALS.map((meal) => (
          <div
            key={meal}
            className="stack-seg"
            style={{
              width: `${((totals.get(meal) ?? 0) / total) * 100}%`,
              backgroundColor: "var(--ink)",
              opacity: MEAL_SHADE[meal],
            }}
            title={`${t(`meals.${meal}`)}: ${Math.round(((totals.get(meal) ?? 0) / total) * 100)}%`}
          />
        ))}
      </div>
      <div className="legend-list">
        {MEALS.map((meal) => (
          <div className="legend-row" key={meal}>
            <span
              className="legend-dot"
              style={{
                backgroundColor: "var(--ink)",
                opacity: MEAL_SHADE[meal],
              }}
            />
            <span>{t(`meals.${meal}`)}</span>
            <span className="mono">
              {Math.round(((totals.get(meal) ?? 0) / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
