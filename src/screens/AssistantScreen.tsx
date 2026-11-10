import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getAssistantThread,
  getUsageSummary,
  logFood,
  createFood,
  saveAssistantMessage,
  updateAssistantMessage,
  type UsageSummary,
} from "../db/data";
import { calculateTargets } from "../lib/goals";
import { mealForTime } from "../lib/date";
import {
  assistantTurn,
  guessCategory,
  speechSupported,
  startListening,
  type AssistantFood,
  type ChatMessage,
  type RecognizerHandle,
} from "../lib/voice";
import { MEALS } from "../constants";
import { useTranslation } from "../i18n";
import { MicIcon } from "../components/Icons";
import { parseNumber, round } from "../lib/utils";
import type {
  AssistantMessage,
  FoodCategory,
  MealType,
  UserProfile,
} from "../types";

interface PendingRow {
  key: string;
  name: string;
  kcal100: string;
  grams: string;
  portionName?: string;
  portionGrams?: number;
  needs?: boolean;
  assumption?: string;
}

let rowSeq = 0;

function newRow(food: AssistantFood): PendingRow {
  rowSeq += 1;
  return {
    key: `a-${rowSeq}`,
    name: food.name,
    kcal100: String(Math.round(food.kcalPer100g)),
    grams: String(Math.round(food.grams)),
    portionName: food.portionName,
    portionGrams: food.portionGrams,
    needs: food.needsQuantity || food.grams <= 0,
    assumption: food.assumption,
  };
}

interface AssistantScreenProps {
  profile: UserProfile;
  /** Called after foods are logged so other screens refresh. */
  onLogged: () => void;
  /** Navigate to Trends, consuming history correctly. */
  onOpenTrends: () => void;
}

export function AssistantScreen({
  profile,
  onLogged,
  onOpenTrends,
}: AssistantScreenProps) {
  const { t, language } = useTranslation();
  const targets = useMemo(() => calculateTargets(profile), [profile]);
  const supported = useMemo(() => speechSupported(), []);

  const [thread, setThread] = useState<AssistantMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [rows, setRows] = useState<PendingRow[] | null>(null);
  const [meal, setMeal] = useState<MealType>(mealForTime().mealType);
  const [mealOpen, setMealOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const micRef = useRef<RecognizerHandle | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getAssistantThread()
      .then((items) => {
        if (active) setThread(items);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread, busy, rows, summary]);

  const runCommand = useCallback(
    async (text: string, existingId?: number) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setError(null);
      setRows(null);
      setSummary(null);
      setMealOpen(false);
      setSaveError(null);
      try {
        if (existingId != null && existingId >= 0) {
          await updateAssistantMessage(existingId, trimmed);
        } else {
          await saveAssistantMessage("user", trimmed);
        }
        const historyItems = await getAssistantThread();
        setThread(historyItems);

        const history: ChatMessage[] = historyItems
          .filter((item) => item.kind === "user")
          .slice(-8)
          .map((item) => ({ role: "user" as const, text: item.text }));
        const result = await assistantTurn(history, { mealType: meal, language });

        await saveAssistantMessage("assistant", result.reply, result.action);
        setThread(await getAssistantThread());

        if (result.action === "add") {
          if (result.foods.length) {
            setRows(result.foods.map(newRow));
            if (result.meal) setMeal(result.meal);
            setMealOpen(result.meal == null);
          } else {
            setError(t("assistant.noFoods"));
          }
        } else if (result.action === "query") {
          const period = result.period ?? { days: 7, startOffset: 0 };
          setSummary(await getUsageSummary(period.days, period.startOffset));
        }
      } catch {
        setError(t("assistant.failed"));
      } finally {
        setBusy(false);
      }
    },
    [busy, meal, language, t],
  );

  function toggleMic() {
    if (recording) {
      micRef.current?.stop();
      micRef.current = null;
      return;
    }
    setError(null);
    const handle = startListening({
      language: language === "ta" ? "ta-IN" : language === "zh" ? "zh-CN" : "en-IN",
      onText: (finalText, interimText) => {
        setDraft(finalText);
        setInterim(interimText);
      },
      onDone: (finalText) => {
        setRecording(false);
        setInterim("");
        if (finalText) void runCommand(finalText);
      },
      onError: () => {
        setRecording(false);
        setInterim("");
        setError(t("assistant.micError"));
      },
    });
    if (!handle) {
      setError(t("assistant.unsupported"));
      return;
    }
    micRef.current = handle;
    setRecording(true);
  }

  function patch(key: string, changes: Partial<PendingRow>) {
    setRows(
      (current) =>
        current?.map((row) => (row.key === key ? { ...row, ...changes } : row)) ??
        null,
    );
  }

  function stepPortion(key: string, delta: number, row: PendingRow) {
    if (!row.portionGrams) return;
    const grams = Math.max(0, parseNumber(row.grams, 0) + delta * row.portionGrams);
    patch(key, { grams: String(Math.round(grams)), needs: grams <= 0 });
  }

  async function saveRows() {
    if (!rows || saving) return;
    const invalid = rows.some(
      (row) =>
        !row.name.trim() ||
        !(parseNumber(row.kcal100, 0) > 0) ||
        !(parseNumber(row.grams, 0) > 0),
    );
    if (invalid) {
      setSaveError(t("assistant.incomplete"));
      return;
    }
    setSaving(true);
    try {
      for (const row of rows) {
        const created = await createFood({
          name: row.name.trim(),
          cuisine: "Other",
          category: guessCategory(row.name) as FoodCategory,
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
          food: created,
          quantityG: parseNumber(row.grams, 0),
          mealType: meal,
        });
      }
      setRows(null);
      setSaving(false);
      onLogged();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  const totalKcal =
    rows?.reduce(
      (sum, row) =>
        sum + (parseNumber(row.kcal100, 0) * parseNumber(row.grams, 0)) / 100,
      0,
    ) ?? 0;
  const needsAmount = rows?.some((row) => parseNumber(row.grams, 0) <= 0) ?? false;

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <h1>{t("assistant.title")}</h1>
          <p className="sheet-caption">{t("assistant.headHint")}</p>
        </div>
      </header>

      {supported ? (
        <button
          type="button"
          className="btn btn-primary btn-block press"
          onClick={toggleMic}
          disabled={busy}
        >
          <span className="btn-lead icon-inline">
            <MicIcon size={18} />
          </span>
          {busy
            ? t("assistant.processing")
            : recording
              ? t("assistant.stop")
              : t("assistant.listen")}
        </button>
      ) : null}

      {recording || interim ? (
        <div className="voice-live live">
          {recording ? <span className="voice-state">{t("add.voiceState")}</span> : null}
          <p>
            {draft}
            {interim ? <span className="muted"> {interim}</span> : null}
          </p>
        </div>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}

      <div className="chat-log" ref={logRef}>
        {thread.length === 0 && !busy ? (
          <p className="sheet-caption">{t("assistant.empty")}</p>
        ) : null}
        {thread.map((message) =>
          message.kind === "user" ? (
            <div className="chat-msg chat-user" key={message.id}>
              <span className="chat-who">
                {t("add.chatYou")}
                {message.edited ? <em> · {t("assistant.edited")}</em> : null}
              </span>
              {editId === message.id ? (
                <div className="cmd-edit">
                  <textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    rows={2}
                    aria-label={t("assistant.editAria")}
                  />
                  <div className="button-row">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setEditId(null);
                        setEditText("");
                      }}
                    >
                      {t("assistant.cancel")}
                    </button>
                    <button
                      type="button"
                      className="link-btn"
                      disabled={busy || !editText.trim()}
                      onClick={() => {
                        const id = message.id;
                        setEditId(null);
                        setEditText("");
                        if (id != null) void runCommand(editText, id);
                      }}
                    >
                      {t("assistant.rerun")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="cmd-text">{message.text}</span>
                  {message.id != null ? (
                    <button
                      type="button"
                      className="link-btn chat-edit press"
                      onClick={() => {
                        setEditId(message.id!);
                        setEditText(message.text);
                      }}
                      aria-label={t("assistant.editAria")}
                    >
                      {t("assistant.edit")}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <p className="chat-msg chat-ai" key={message.id}>
              <span className="chat-who">
                {t("add.chatAi")}
                {message.action ? (
                  <span className="chat-action">{t(`assistant.action.${message.action}`)}</span>
                ) : null}
              </span>
              <span className="cmd-text">{message.text}</span>
            </p>
          ),
        )}
        {busy ? (
          <p className="chat-msg chat-ai">
            <span className="chat-who">{t("add.chatAi")}</span>
            {t("add.chatThinking")}
          </p>
        ) : null}
      </div>

      {/* typed input */}
      <div className="chat-input">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const text = draft;
              setDraft("");
              void runCommand(text);
            }
          }}
          placeholder={t("assistant.placeholder")}
          aria-label={t("assistant.placeholder")}
          autoComplete="off"
        />
        <button
          type="button"
          className="btn btn-primary press chat-send"
          disabled={busy || !draft.trim()}
          onClick={() => {
            const text = draft;
            setDraft("");
            void runCommand(text);
          }}
        >
          {t("add.chatSend")}
        </button>
      </div>

      {/* query result */}
      {summary ? (
        <div className="cmd-summary">
          <h2 className="cmd-title">{t("assistant.queryCaption", { days: summary.days })}</h2>
          <div className="cmd-stat">
            <span>{t("assistant.daysLogged")}</span>
            <strong className="mono">{summary.daysLogged}</strong>
          </div>
          <div className="cmd-stat">
            <span>{t("assistant.avgKcal")}</span>
            <strong className="mono">
              {round(summary.avgKcal, 0)} {t("common.kcal")}
            </strong>
          </div>
          <div className="cmd-stat">
            <span>{t("assistant.totalKcal")}</span>
            <strong className="mono">
              {round(summary.kcalTotal, 0)} {t("common.kcal")}
            </strong>
          </div>
          {targetKcalLine(summary.avgKcal, targets.kcal, t("assistant.vsTarget"))}
          {summary.topFoods.length ? (
            <>
              <p className="sheet-caption">{t("assistant.topFoods")}</p>
              {summary.topFoods.map((food) => (
                <div className="cmd-stat" key={food.name}>
                  <span>{food.name}</span>
                  <strong className="mono">
                    {round(food.kcal, 0)} {t("common.kcal")}
                  </strong>
                </div>
              ))}
            </>
          ) : null}
          <button
            type="button"
            className="link-btn press"
            onClick={onOpenTrends}
          >
            {t("assistant.openTrends")}
          </button>
        </div>
      ) : null}

      {/* add result */}
      {rows && rows.length ? (
        <div className="cmd-list">
          {rows.map((row) => (
            <div
              className={`cmd-row ${parseNumber(row.grams, 0) <= 0 ? "cmd-await" : ""}`}
              key={row.key}
            >
              <div className="cmd-row-line">
                <input
                  type="text"
                  value={row.name}
                  onChange={(event) => patch(row.key, { name: event.target.value })}
                  aria-label={`${t("common.name")}`}
                  autoComplete="off"
                />
                {row.portionGrams ? (
                  <div className="cmd-portion">
                    <button
                      type="button"
                      className="icon-btn press"
                      aria-label={`${t("assistant.lessPortion")} ${row.portionName ?? ""}`}
                      onClick={() => stepPortion(row.key, -1, row)}
                    >
                      −
                    </button>
                    <span className="mono small">{portionCountLabel(row, t)}</span>
                    <button
                      type="button"
                      className="icon-btn press"
                      aria-label={`${t("assistant.morePortion")} ${row.portionName ?? ""}`}
                      onClick={() => stepPortion(row.key, 1, row)}
                    >
                      +
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="cmd-row-line">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={row.kcal100}
                  onChange={(event) => patch(row.key, { kcal100: event.target.value })}
                  aria-label={`${t("nutrient.kcal")} ${t("common.per100gShort")}`}
                  placeholder={t("common.per100gShort")}
                  className="mono"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  value={row.grams}
                  onChange={(event) =>
                    patch(row.key, {
                      grams: event.target.value,
                      needs: parseNumber(event.target.value, 0) <= 0,
                    })
                  }
                  aria-label={`${t("common.quantity")} · ${t("common.g")}`}
                  placeholder={t("common.g")}
                  className="mono"
                />
              </div>
              {parseNumber(row.grams, 0) <= 0 ? (
                <p className="cmd-await-caption">{t("assistant.setQuantity")}</p>
              ) : null}
              {row.assumption ? (
                <p className="cmd-assumption">
                  {t("assistant.assumed")}: {row.assumption}
                </p>
              ) : null}
            </div>
          ))}

          <div className="chip-row">
            {MEALS.map((item) => (
              <button
                type="button"
                key={item}
                className={`chip ${meal === item ? "active" : ""}`}
                onClick={() => setMeal(item)}
              >
                {t(`meals.${item}`)}
              </button>
            ))}
          </div>

          {mealOpen ? <p className="sheet-caption">{t("assistant.confirmMeal")}</p> : null}

          <p className="sheet-caption">
            {rows.length === 1
              ? t("add.quickTotalOne", { kcal: round(totalKcal, 0) })
              : t("add.quickTotal", {
                  count: rows.length,
                  kcal: round(totalKcal, 0),
                })}
          </p>

          {saveError ? <p className="error-text">{saveError}</p> : null}

          <button
            type="button"
            className="btn btn-primary btn-block press"
            onClick={() => void saveRows()}
            disabled={saving || needsAmount}
          >
            {saving
              ? t("common.saving")
              : t("add.logAllTo", {
                  count: rows.length,
                  meal: t(`meals.${meal}`),
                })}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function portionCountLabel(
  row: PendingRow,
  t: (key: string) => string,
): string {
  if (!row.portionGrams) return "";
  const count = parseNumber(row.grams, 0) / row.portionGrams;
  if (count <= 0) return row.portionName ?? "";
  const whole = count.toFixed(Math.abs(count % 1) > 0.05 ? 1 : 0);
  return `${whole} × ${row.portionName ?? t("common.quantity")}`;
}

function targetKcalLine(
  avgKcal: number,
  targetKcal: number,
  label: string,
) {
  if (avgKcal <= 0 || targetKcal <= 0) return null;
  const pct = Math.round((avgKcal / targetKcal) * 100);
  return (
    <div className="cmd-stat">
      <span>{label}</span>
      <strong className="mono">{pct}%</strong>
    </div>
  );
}
