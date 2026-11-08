import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVITY_LEVELS,
  APP_VERSION,
  DIET_TYPES,
  GOALS,
  LANGUAGES,
  LANGUAGE_NAMES,
  SEXES,
} from "../constants";
import {
  backupToCsv,
  backupToJson,
  formatBytes,
  getStorageInfo,
  importBackup,
  initData,
  requestPersistentStorage,
  resetAllData,
  saveProfile,
  type StorageInfo,
} from "../db/data";
import { setLanguage, useTranslation } from "../i18n";
import { dateStamp, downloadFile, parseNumber, round } from "../lib/utils";
import { calculateGoals, calculateTargets } from "../lib/goals";
import type { UserProfile } from "../types";

interface SettingsScreenProps {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  onDataReplaced: () => Promise<void>;
}

type Draft = Pick<
  UserProfile,
  | "age"
  | "sex"
  | "heightCm"
  | "weightKg"
  | "activityLevel"
  | "goal"
  | "dietType"
  | "language"
>;

function toDraft(profile: UserProfile): Draft {
  return {
    age: profile.age,
    sex: profile.sex,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    dietType: profile.dietType,
    language: profile.language,
  };
}

export function SettingsScreen({
  profile,
  onProfileChange,
  onDataReplaced,
}: SettingsScreenProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState(false);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(toDraft(profile));
  }, [profile]);

  const refreshStorage = useCallback(async () => {
    try {
      setStorage(await getStorageInfo());
    } catch {
      setStorage(null);
    }
  }, []);

  useEffect(() => {
    void refreshStorage();
  }, [refreshStorage]);

  const targets = calculateTargets(draft);
  const goals = calculateGoals(draft);

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice(null);
  }

  function showNotice(message: string, isError = false) {
    setNotice(message);
    setNoticeError(isError);
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await saveProfile({
        ...draft,
        age: Math.max(1, draft.age),
        heightCm: Math.max(1, draft.heightCm),
        weightKg: Math.max(1, draft.weightKg),
      });
      setLanguage(updated.language);
      onProfileChange(updated);
      showNotice(t("profile.saved"));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : String(err), true);
    } finally {
      setSaving(false);
    }
  }

  async function exportJson() {
    try {
      const content = await backupToJson();
      downloadFile(`calorie-backup-${dateStamp()}.json`, content, "application/json");
      showNotice(t("profile.exported"));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function exportCsv() {
    try {
      const content = await backupToCsv();
      downloadFile(`calorie-log-${dateStamp()}.csv`, content, "text/csv");
      showNotice(t("profile.exported"));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function handleImport(file: File) {
    if (!window.confirm(t("profile.importConfirm"))) return;
    try {
      const result = await importBackup(await file.text());
      await onDataReplaced();
      await refreshStorage();
      showNotice(
        t("profile.importDone", { foods: result.foods, logs: result.logs }),
      );
    } catch (err) {
      showNotice(
        t("profile.importFailed", {
          message: err instanceof Error ? err.message : String(err),
        }),
        true,
      );
    }
  }

  async function handleReset() {
    if (!window.confirm(t("profile.resetConfirm"))) return;
    try {
      await resetAllData();
      await initData();
      await onDataReplaced();
      await refreshStorage();
      showNotice(t("profile.resetDone"));
    } catch (err) {
      showNotice(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function persist() {
    const granted = await requestPersistentStorage();
    await refreshStorage();
    showNotice(
      granted ? t("profile.persistenceGranted") : t("profile.persistenceDenied"),
      !granted,
    );
  }

  const storagePercent =
    storage && storage.quota > 0
      ? Math.min(100, (storage.usage / storage.quota) * 100)
      : 0;

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <p className="eyebrow">{t("app.tagline")}</p>
          <h1>{t("nav.settings")}</h1>
        </div>
        <button
          type="button"
          className="btn btn-small press"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </header>

      <hr className="rule-heavy" />

      <p className="screen-note">{t("profile.subtitle")}</p>

      {notice ? (
        <p className={noticeError ? "error-text" : "success-text"}>{notice}</p>
      ) : null}

      <div className="label-list">
        <div className="settings-block">
          <h2 className="settings-title">{t("profile.bodyTitle")}</h2>
          <div className="field-row two">
            <label className="field">
              <span>{t("profile.age")}</span>
              <input
                type="number"
                min="1"
                max="120"
                value={draft.age}
                onChange={(event) => patch("age", parseNumber(event.target.value))}
              />
            </label>
            <label className="field">
              <span>{t("profile.sex")}</span>
              <select
                value={draft.sex}
                onChange={(event) => patch("sex", event.target.value as Draft["sex"])}
              >
                {SEXES.map((sex) => (
                  <option key={sex} value={sex}>
                    {t(`sex.${sex}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-row two">
            <label className="field">
              <span>{t("profile.height")}</span>
              <input
                type="number"
                min="1"
                max="260"
                value={draft.heightCm}
                onChange={(event) =>
                  patch("heightCm", parseNumber(event.target.value))
                }
              />
            </label>
            <label className="field">
              <span>{t("profile.weight")}</span>
              <input
                type="number"
                min="1"
                max="400"
                step="0.1"
                value={draft.weightKg}
                onChange={(event) =>
                  patch("weightKg", parseNumber(event.target.value))
                }
              />
            </label>
          </div>
          <label className="field">
            <span>{t("profile.activity")}</span>
            <select
              value={draft.activityLevel}
              onChange={(event) =>
                patch("activityLevel", event.target.value as Draft["activityLevel"])
              }
            >
              {ACTIVITY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {t(`activity.${level}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="settings-block">
          <h2 className="settings-title">{t("profile.goalTitle")}</h2>
          <div className="segmented" role="group" aria-label={t("profile.goalTitle")}>
            {GOALS.map((goal) => (
              <button
                type="button"
                key={goal}
                className={draft.goal === goal ? "active" : ""}
                onClick={() => patch("goal", goal)}
              >
                {t(`goal.${goal}`)}
              </button>
            ))}
          </div>
          <h2 className="settings-title" style={{ marginTop: "var(--s2)" }}>
            {t("profile.dietTitle")}
          </h2>
          <div className="segmented" role="group" aria-label={t("profile.dietTitle")}>
            {DIET_TYPES.map((diet) => (
              <button
                type="button"
                key={diet}
                className={draft.dietType === diet ? "active" : ""}
                onClick={() => patch("dietType", diet)}
              >
                {t(
                  diet === "non-vegetarian"
                    ? "diet.nonVegetarian"
                    : `diet.${diet}`,
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-block">
          <h2 className="settings-title">{t("profile.targetTitle")}</h2>
          <p className="mono muted small">
            {t("profile.bmr")} {goals.bmr} · {t("profile.tdee")} {goals.tdee}
          </p>
          <div className="nutrient-grid">
            <div className="nutrient-cell">
              <span>{t("common.kcal")}</span>
              <strong>{targets.kcal}</strong>
            </div>
            <div className="nutrient-cell">
              <span>{t("nutrient.protein")}</span>
              <strong>{targets.protein} g</strong>
            </div>
            <div className="nutrient-cell">
              <span>{t("nutrient.carbs")}</span>
              <strong>{targets.carbs} g</strong>
            </div>
            <div className="nutrient-cell">
              <span>{t("nutrient.fat")}</span>
              <strong>{targets.fat} g</strong>
            </div>
            <div className="nutrient-cell">
              <span>{t("nutrient.fiber")}</span>
              <strong>{targets.fiber} g</strong>
            </div>
            <div className="nutrient-cell">
              <span>{t("profile.sugarLimit")}</span>
              <strong>{round(targets.sugar, 0)} g</strong>
            </div>
            <div className="nutrient-cell">
              <span>{t("profile.sodiumLimit")}</span>
              <strong>{targets.sodium} mg</strong>
            </div>
          </div>
          {goals.floored ? (
            <p className="chart-hint muted small">{t("profile.floorNote")}</p>
          ) : null}
        </div>

        <div className="settings-block">
          <h2 className="settings-title">{t("profile.languageTitle")}</h2>
          <div
            className="segmented"
            role="group"
            aria-label={t("profile.languageTitle")}
          >
            {LANGUAGES.map((language) => (
              <button
                type="button"
                key={language}
                className={draft.language === language ? "active" : ""}
                onClick={() => patch("language", language)}
              >
                {LANGUAGE_NAMES[language]}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-block">
          <h2 className="settings-title">{t("profile.storageTitle")}</h2>
          {storage && storage.supported ? (
            <>
              <div className="settings-row">
                <span>{t("profile.storageUsed")}</span>
                <span className="mono">
                  {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
                </span>
              </div>
              <div className="target-track">
                <div
                  className="target-fill"
                  style={{ width: `${Math.max(1, storagePercent)}%` }}
                />
              </div>
              <p className="chart-hint muted small">
                {t("profile.storagePercent", { percent: storagePercent.toFixed(1) })}
              </p>
              <p className="chart-hint muted small">
                {storage.persisted
                  ? t("profile.persisted")
                  : t("profile.notPersisted")}
              </p>
              {!storage.persisted ? (
                <button
                  type="button"
                  className="btn press"
                  onClick={() => void persist()}
                >
                  {t("profile.requestPersistence")}
                </button>
              ) : null}
            </>
          ) : (
            <p className="chart-hint muted small">{t("profile.storageUnavailable")}</p>
          )}
        </div>

        <div className="settings-block">
          <h2 className="settings-title">{t("profile.backupTitle")}</h2>
          <p className="chart-hint muted small">{t("profile.backupHint")}</p>
          <div className="button-row">
            <button
              type="button"
              className="btn press"
              onClick={() => void exportJson()}
            >
              {t("profile.exportJson")}
            </button>
            <button
              type="button"
              className="btn press"
              onClick={() => void exportCsv()}
            >
              {t("profile.exportCsv")}
            </button>
            <button
              type="button"
              className="btn press"
              onClick={() => fileRef.current?.click()}
            >
              {t("profile.importJson")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void handleImport(file);
              }}
            />
          </div>
        </div>

        <div className="settings-block">
          <h2 className="settings-title">{t("profile.dangerTitle")}</h2>
          <button
            type="button"
            className="btn press"
            onClick={() => void handleReset()}
          >
            {t("profile.reset")}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-block press"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? t("common.saving") : t("profile.save")}
          </button>
          <p className="chart-hint muted small">{t("profile.disclaimer")}</p>
          <p className="chart-hint muted small">
            {t("profile.about")} · {t("profile.version", { version: APP_VERSION })}
          </p>
        </div>
      </div>
    </section>
  );
}
