import { useTranslation } from "../i18n";
import type { ScreenName } from "../types";

interface NavProps {
  screen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
  onAdd: () => void;
}

function TodayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function TrendsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 20L9 12l4 4 8-10" />
      <path d="M15 6h6v6" />
    </svg>
  );
}

export function Nav({ screen, onNavigate, onAdd }: NavProps) {
  const { t } = useTranslation();
  return (
    <nav className="bottom-nav" aria-label={t("nav.title")}>
      <div className="nav-inner">
        <button
          type="button"
          className={`nav-item press ${screen === "today" ? "active" : ""}`}
          onClick={() => onNavigate("today")}
          aria-current={screen === "today" ? "page" : undefined}
        >
          <TodayIcon />
          <span>{t("nav.today")}</span>
        </button>

        <button
          type="button"
          className="nav-add press"
          onClick={() => onAdd()}
          aria-label={t("add.title")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <button
          type="button"
          className={`nav-item press ${screen === "trends" ? "active" : ""}`}
          onClick={() => onNavigate("trends")}
          aria-current={screen === "trends" ? "page" : undefined}
        >
          <TrendsIcon />
          <span>{t("nav.trends")}</span>
        </button>
      </div>
    </nav>
  );
}
