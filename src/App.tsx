import { useCallback, useEffect, useRef, useState } from "react";
import { Nav } from "./components/Nav";
import type { Flow } from "./add/AddSheet";
import { AddSheet } from "./add/AddSheet";
import { getFood, getProfile, initData } from "./db/data";
import { setLanguage, useTranslation } from "./i18n";
import { tick } from "./lib/utils";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { TrendScreen } from "./screens/TrendScreen";
import type { LogEntry, MealType, ScreenName, UserProfile } from "./types";

const UNDO_MS = 5000;

interface ToastState {
  message: string;
  onUndo?: () => Promise<void> | void;
}

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<ScreenName>("today");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [version, setVersion] = useState(0);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const toastTimer = useRef<number | null>(null);

  const loadProfile = useCallback(async () => {
    const next = await getProfile();
    setLanguage(next.language);
    setProfile(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    setError(null);
    initData()
      .then(loadProfile)
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      active = false;
    };
  }, [loadProfile, attempt]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const reload = useCallback(async () => {
    await loadProfile();
    bump();
  }, [bump, loadProfile]);

  const showToastState = useCallback(
    (message: string, onUndo?: () => Promise<void> | void) => {
      showToast({ message, onUndo });
    },
    [],
  );

  function showToast(toastState: ToastState) {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast(toastState);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, UNDO_MS);
  }

  function dismissToast() {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    setToast(null);
  }

  const openAdd = useCallback(
    (meal?: MealType) => {
      setFlow({ step: "browse", meal });
    },
    [],
  );

  const openEdit = useCallback(
    async (entry: LogEntry) => {
      if (entry.id == null) return;
      const food = await getFood(entry.foodId);
      if (!food) {
        showToast({ message: t("edit.unavailable") });
        return;
      }
      setFlow({
        step: "quantity",
        food,
        meal: entry.mealType,
        editId: entry.id,
        initial: { amount: String(Math.round(entry.quantityG)), unitKey: "g" },
      });
    },
    [t],
  );

  function handlePersist() {
    tick();
    setFlow(null);
    bump();
    dismissToast();
  }

  if (error) {
    return (
      <div className="boot boot-rules">
        <p className="boot-title">{t("app.name")}</p>
        <hr className="rule-heavy" />
        <div className="boot-error">
          <h2>{t("error.loadTitle")}</h2>
          <p className="chart-hint">{t("error.loadBody")}</p>
          <p className="mono muted small">{error}</p>
          <button
            type="button"
            className="btn btn-primary press"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="boot boot-rules" aria-busy="true">
        <p className="boot-title">{t("app.name")}</p>
        <hr className="rule-heavy" />
        <p className="chart-hint muted">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="app-main">
        {screen === "today" ? (
          <TodayScreen
            profile={profile}
            refreshKey={version}
            online={online}
            onOpenSettings={() => setScreen("settings")}
            onOpenAdd={openAdd}
            onOpenEdit={(entry) => void openEdit(entry)}
            onNotify={showToastState}
          />
        ) : null}
        {screen === "trends" ? (
          <TrendScreen profile={profile} refreshKey={version} />
        ) : null}
        {screen === "settings" ? (
          <SettingsScreen
            profile={profile}
            onProfileChange={setProfile}
            onDataReplaced={reload}
          />
        ) : null}
      </div>

      <AddSheet
        flow={flow}
        profile={profile}
        onClose={() => setFlow(null)}
        onPersist={handlePersist}
      />

      {toast && !flow ? (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.message}</span>
          {toast.onUndo ? (
            <button
              type="button"
              onClick={() => {
                void toast.onUndo?.();
                dismissToast();
              }}
            >
              {t("undo.action")}
            </button>
          ) : null}
        </div>
      ) : null}

      <Nav screen={screen} onNavigate={setScreen} onAdd={openAdd} />
    </>
  );
}
