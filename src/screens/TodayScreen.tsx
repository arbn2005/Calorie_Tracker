import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteLog, getLogsForDay } from "../db/data";
import { useTranslation } from "../i18n";
import { formatToday } from "../lib/date";
import { calculateTargets, sumNutrients } from "../lib/goals";
import { formatNumber, round, useCountUp } from "../lib/utils";
import type { LogEntry, MealType, UserProfile } from "../types";
import { MEALS } from "../constants";

interface TodayScreenProps {
  profile: UserProfile;
  refreshKey: number;
  online: boolean;
  onOpenSettings: () => void;
  onOpenAssistant: () => void;
  onOpenAdd: (meal?: MealType) => void;
  onOpenEdit: (entry: LogEntry) => void;
  onNotify: (
    message: string,
    onUndo: () => Promise<void> | void,
  ) => void;
}

export function TodayScreen({
  profile,
  refreshKey,
  online,
  onOpenSettings,
  onOpenAssistant,
  onOpenAdd,
  onOpenEdit,
  onNotify,
}: TodayScreenProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const load = useCallback(async () => {
    setLogs(await getLogsForDay());
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const totals = useMemo(() => sumNutrients(logs), [logs]);
  const targets = useMemo(() => calculateTargets(profile), [profile]);
  const remaining = targets.kcal - totals.kcal;
  const over = remaining < 0;
  const shown = useCountUp(totals.kcal);
  const barPct = targets.kcal > 0 ? Math.min(100, (totals.kcal / targets.kcal) * 100) : 0;

  const proteinShort = Math.round(targets.protein - totals.protein);
  const fiberShort = Math.round(targets.fiber - totals.fiber);
  const nudge =
    totals.kcal > 0 && proteinShort > 10 && proteinShort > targets.protein * 0.2
      ? { key: "protein", amount: proteinShort } as const
      : totals.kcal > 0 && fiberShort > 5
        ? ({ key: "fiber", amount: fiberShort } as const)
        : null;

  const grouped = useMemo(() => {
    const map = new Map<MealType, LogEntry[]>();
    for (const meal of MEALS) map.set(meal, []);
    for (const log of logs) (map.get(log.mealType) ?? map.get("snacks")!).push(log);
    for (const list of map.values()) list.sort((a, b) => a.loggedAt - b.loggedAt);
    return map;
  }, [logs]);

  async function removeEntry(entry: LogEntry) {
    if (entry.id == null) return;
    await deleteLog(entry.id);
    await load();
    onNotify(t("undo.removed"), async () => {
      const { restoreLog } = await import("../db/data");
      await restoreLog(entry);
      void load();
    });
  }

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">{formatToday()}</p>
        </div>
        <div className="head-actions">
          <button
            type="button"
            className="head-btn press"
            onClick={onOpenAssistant}
            aria-label={t("assistant.title")}
            title={t("assistant.headHint")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2.5" width="6" height="11.5" rx="1" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
              <path d="M12 18v3" />
              <path d="M8.5 21.5h7" />
            </svg>
          </button>
          <button
            type="button"
            className="head-btn press"
            onClick={onOpenSettings}
            aria-label={t("nav.settings")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </button>
        </div>
      </header>

      {!online ? (
        <p className="offline-banner">
          <span className="badge">{t("state.offline")}</span>
        </p>
      ) : null}

      <hr className="rule-heavy" />

      <div className="hero" aria-live="polite">
        <p className="label">{t("today.caloriesTitle")}</p>
        <div className="hero-row">
          <strong className="hero-num">{formatNumber(shown)}</strong>
          <span className="hero-sub">
            {t("today.ofGoal", { goal: formatNumber(targets.kcal) })}
          </span>
        </div>
        <p className="hero-note">
          {formatNumber(Math.abs(remaining))}{" "}
          {over ? t("today.overLabel") : t("today.leftLabel")}
        </p>
        <div
          className="bar"
          role="img"
          aria-label={t("today.ofGoal", { goal: targets.kcal })}
        >
          <div
            className={`bar-fill ${over ? "hatch" : ""}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
        {over ? (
          <p className="over-note">{t("today.overCopy")}</p>
        ) : null}
      </div>

      <figure className="bar-list" style={{ paddingBottom: "var(--s3)" }}>
        {(
          [
            ["protein", "protein", "g"],
            ["carbs", "carbs", "g"],
            ["fat", "fat", "g"],
          ] as const
        ).map(([key, fill, unit]) => {
          const eaten = totals[key];
          const target = targets[key];
          const pct = Math.min(100, (eaten / Math.max(1, target)) * 100);
          return (
            <div className="bar-row" key={key}>
              <span className="bar-name">{t(`nutrient.${key}`)}</span>
              <span className="bar-values mono">
                {round(eaten, 0)} / {target} {unit}
              </span>
              <div
                className="bar"
                role="img"
                aria-label={`${t(`nutrient.${key}`)} ${round(eaten, 0)} / ${target} ${unit}`}
              >
                <div className={`bar-fill ${fill}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </figure>

      {nudge ? (
        <div className="nudge">
          <p className="title">{t("today.hintTitle")}</p>
          <p>{t(`hint.${nudge.key}`, { amount: nudge.amount })}</p>
          <p className="muted">
            {t(
              nudge.key === "protein"
                ? profile.dietType === "vegetarian"
                  ? "hint.suggest.vegetarianProtein"
                  : profile.dietType === "vegan"
                    ? "hint.suggest.veganProtein"
                    : "hint.suggest.meatProtein"
                : "hint.suggest.fiber",
            )}
          </p>
        </div>
      ) : null}

      {logs.length === 0 ? (
        <p className="log-empty small">{t("state.emptyDay")}</p>
      ) : null}
      <div>
        {MEALS.map((meal) => {
            const entries = grouped.get(meal) ?? [];
            const mealKcal = entries.reduce((sum, entry) => sum + entry.kcal, 0);
            return (
              <section className="meal-block" key={meal}>
                <div className="meal-head">
                  <h2 className="section-label">{t(`meals.${meal}`)}</h2>
                  <span className="meal-kcal">{round(mealKcal, 0)}</span>
                  <button
                    type="button"
                    className="meal-add press"
                    onClick={() => onOpenAdd(meal)}
                    aria-label={t("today.quickAddAria", {
                      meal: t(`meals.${meal}`),
                    })}
                  >
                    +
                  </button>
                </div>
                {entries.length === 0 ? (
                  <p className="log-empty">{t("today.emptyMeal")}</p>
                ) : (
                  <ul className="log-list">
                    {entries.map((entry) => (
                      <li key={entry.id}>
                        <SwipeRow
                          entry={entry}
                          onEdit={() => onOpenEdit(entry)}
                          onDelete={() => void removeEntry(entry)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
      </div>
    </section>
  );
}

function SwipeRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: LogEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const rowRef = useRef<HTMLButtonElement>(null);
  const [dx, setDx] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const start = useRef<{ x: number; y: number; locked: boolean } | null>(null);

  return (
    <button
      type="button"
      ref={rowRef}
      className={`log-row ${swiping ? "swiping" : ""}`}
      style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        start.current = { x: event.clientX, y: event.clientY, locked: false };
      }}
      onPointerMove={(event) => {
        const point = start.current;
        if (!point || event.pointerType !== "touch") return;
        const ddx = event.clientX - point.x;
        if (!point.locked) {
          if (Math.abs(event.clientY - point.y) > Math.abs(ddx)) {
            start.current = null;
            return;
          }
          if (ddx < -8) {
            point.locked = true;
            setSwiping(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          return;
        }
        setDx(Math.max(-96, Math.min(0, ddx)));
      }}
      onPointerUp={(event) => {
        const point = start.current;
        start.current = null;
        if (dx > -60) {
          setDx(0);
          setSwiping(false);
          if (point == null) {
            if (event.pointerType !== "touch") onEdit();
            return;
          }
          if (Math.abs(event.clientX - point.x) < 8) onEdit();
          return;
        }
        setDx(0);
        setSwiping(false);
        onDelete();
      }}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
        setSwiping(false);
      }}
      onKeyUp={(event) => {
        if (event.key === " ") onEdit();
      }}
    >
      <span className="log-name">
        {entry.foodName}
        {entry.servingLabel ? (
          <small className="mono muted"> · {entry.servingLabel}</small>
        ) : (
          <small className="mono muted"> · {round(entry.quantityG, 0)} g</small>
        )}
      </span>
      <span className="log-kcal">{round(entry.kcal, 0)}</span>
    </button>
  );
}
