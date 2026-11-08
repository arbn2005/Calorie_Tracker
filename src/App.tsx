import { useCallback, useEffect, useState } from "react";
import { Nav } from "./components/Nav";
import { getProfile, initData } from "./db/data";
import { setLanguage, useTranslation } from "./i18n";
import { AddScreen } from "./screens/AddScreen";
import { HistoryScreen } from "./screens/HistoryScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { TodayScreen } from "./screens/TodayScreen";
import type { ScreenName, UserProfile } from "./types";

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<ScreenName>("today");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [version, setVersion] = useState(0);

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

  const bump = useCallback(() => setVersion((value) => value + 1), []);

  const reload = useCallback(async () => {
    await loadProfile();
    bump();
  }, [bump, loadProfile]);

  if (error) {
    return (
      <div className="app-shell">
        <main className="app-main boot">
          <div className="boot-card">
            <h1>{t("error.loadTitle")}</h1>
            <p className="muted">{t("error.loadBody")}</p>
            <p className="error-text small">{error}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {t("common.retry")}
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="app-shell">
        <main className="app-main boot">
          <div className="boot-card">
            <span className="boot-mark" aria-hidden="true" />
            <p className="muted">{t("common.loading")}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        {screen === "today" ? (
          <TodayScreen
            profile={profile}
            refreshKey={version}
            onAdd={() => setScreen("add")}
            onChanged={bump}
          />
        ) : null}
        {screen === "add" ? (
          <AddScreen
            onLogged={() => {
              bump();
              setScreen("today");
            }}
          />
        ) : null}
        {screen === "history" ? (
          <HistoryScreen profile={profile} refreshKey={version} />
        ) : null}
        {screen === "profile" ? (
          <ProfileScreen
            profile={profile}
            onProfileChange={setProfile}
            onDataReplaced={reload}
          />
        ) : null}
      </main>
      <Nav screen={screen} onNavigate={setScreen} />
    </div>
  );
}
