import { useCallback, useEffect, useMemo, useState } from "react";
import { CalorieRing } from "../components/CalorieRing";
import { MacroDonut } from "../components/MacroDonut";
import { deleteLog, getLogsForDay } from "../db/data";
import { useTranslation } from "../i18n";
import { formatToday, formatTime } from "../lib/date";
import { getHint, calculateTargets, sumNutrients } from "../lib/goals";
import { formatNumber, round } from "../lib/utils";
import type { LogEntry, MealType, UserProfile } from "../types";
import { MEALS, MEAL_EMOJI } from "../constants";

interface TodayScreenProps {
  profile: UserProfile;
  refreshKey: number;
  onAdd: () => void;
  onChanged: () => void;
}

export function TodayScreen({
  profile,
  refreshKey,
  onAdd,
  onChanged,
}: TodayScreenProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const next = await getLogsForDay();
    setLogs(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const totals = useMemo(() => sumNutrients(logs), [logs]);
  const targets = useMemo(() => calculateTargets(profile), [profile]);
  const hint = useMemo(
    () => getHint(totals, targets, profile.dietType),
    [totals, targets, profile.dietType],
  );
  const remaining = targets.kcal - totals.kcal;

  const grouped = useMemo(() => {
    const map = new Map<MealType, LogEntry[]>();
    for (const meal of MEALS) map.set(meal, []);
    for (const log of logs) {
      const list = map.get(log.mealType);
      if (list) list.push(log);
      else map.get("snacks")?.push(log);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.loggedAt - b.loggedAt);
    }
    return map;
  }, [logs]);

  async function handleDelete(log: LogEntry) {
    if (log.id == null) return;
    if (!window.confirm(`${t("today.deleteEntry")}?`)) return;
    await deleteLog(log.id);
    await load();
    onChanged();
  }

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">{formatToday()}</p>
          <h1>{t("today.title")}</h1>
        </div>
        <button type="button" className="btn btn-primary btn-small" onClick={onAdd}>
          + {t("nav.add")}
        </button>
      </header>

      {loading ? (
        <p className="muted">{t("common.loading")}</p>
      ) : logs.length === 0 ? (
        <div className="card empty-card">
          <div className="empty-art" aria-hidden="true">
            🍽️
          </div>
          <h2>{t("today.noLogsTitle")}</h2>
          <p className="muted">{t("today.noLogsBody")}</p>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            {t("today.addFirst")}
          </button>
        </div>
      ) : (
        <>
          <div className="card summary-card">
            <div className="summary-ring">
              <CalorieRing eaten={totals.kcal} goal={targets.kcal} />
            </div>
            <div className="summary-stats">
              <div className="stat">
                <span>{t("today.eaten")}</span>
                <strong>{formatNumber(round(totals.kcal, 0))}</strong>
                <small>{t("common.kcal")}</small>
              </div>
              <div className="stat">
                <span>{t("today.goal")}</span>
                <strong>{formatNumber(targets.kcal)}</strong>
                <small>{t("common.kcal")}</small>
              </div>
              <div className="stat">
                <span>{remaining >= 0 ? t("today.remaining") : t("today.over")}</span>
                <strong className={remaining < 0 ? "text-over" : ""}>
                  {formatNumber(Math.abs(round(remaining, 0)))}
                </strong>
                <small>{t("common.kcal")}</small>
              </div>
            </div>
          </div>

          <div className="card hint-card">
            <div className="card-head">
              <h2>{t("today.hintTitle")}</h2>
            </div>
            <p className="hint-main">{t(`hint.${hint.key}`, { amount: hint.amount })}</p>
            <p className="muted small">{t(hint.suggestionKey)}</p>
          </div>

          <div className="card">
            <div className="card-head">
              <div>
                <h2>{t("today.macroSplit")}</h2>
                <p className="muted small">{t("today.macroHint")}</p>
              </div>
            </div>
            <MacroDonut totals={totals} />
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{t("today.mealsTitle")}</h2>
            </div>
            <div className="meal-list">
              {MEALS.map((meal) => {
                const entries = grouped.get(meal) ?? [];
                const mealKcal = entries.reduce((sum, entry) => sum + entry.kcal, 0);
                return (
                  <section className="meal-block" key={meal}>
                    <div className="meal-head">
                      <span className="meal-emoji" aria-hidden="true">
                        {MEAL_EMOJI[meal]}
                      </span>
                      <h3>{t(`meals.${meal}`)}</h3>
                      <span className="meal-kcal">
                        {formatNumber(round(mealKcal, 0))} {t("common.kcal")}
                      </span>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={onAdd}
                        aria-label={`${t("today.addToMeal")} ${t(`meals.${meal}`)}`}
                      >
                        {t("today.addToMeal")}
                      </button>
                    </div>
                    {entries.length === 0 ? (
                      <p className="muted small meal-empty">{t("today.emptyMeal")}</p>
                    ) : (
                      <ul className="log-list">
                        {entries.map((entry) => (
                          <li className="log-row" key={entry.id}>
                            <div className="log-main">
                              <span className="log-name">
                                {entry.foodName}
                                {entry.brand ? (
                                  <small className="log-brand"> · {entry.brand}</small>
                                ) : null}
                              </span>
                              <span className="muted small">
                                {entry.servingLabel
                                  ? entry.servingLabel
                                  : t("today.quantityLabel", {
                                      qty: round(entry.quantityG, 0),
                                    })}
                                {" · "}
                                {formatTime(entry.loggedAt)}
                              </span>
                            </div>
                            <span className="log-kcal">
                              {formatNumber(round(entry.kcal, 0))}
                              <small> {t("common.kcal")}</small>
                            </span>
                            <button
                              type="button"
                              className="icon-btn danger"
                              onClick={() => void handleDelete(entry)}
                              aria-label={t("today.deleteEntry")}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
