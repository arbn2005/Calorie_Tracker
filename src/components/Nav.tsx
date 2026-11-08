import type { ReactElement } from "react";
import { useTranslation } from "../i18n";
import type { ScreenName } from "../types";

interface NavProps {
  screen: ScreenName;
  onNavigate: (screen: ScreenName) => void;
}

function TodayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function AddIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

const ITEMS: {
  screen: ScreenName;
  labelKey: string;
  icon: () => ReactElement;
}[] = [
  { screen: "today", labelKey: "nav.today", icon: TodayIcon },
  { screen: "add", labelKey: "nav.add", icon: AddIcon },
  { screen: "history", labelKey: "nav.history", icon: HistoryIcon },
  { screen: "profile", labelKey: "nav.profile", icon: ProfileIcon },
];

export function Nav({ screen, onNavigate }: NavProps) {
  const { t } = useTranslation();
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = screen === item.screen;
        return (
          <button
            key={item.screen}
            type="button"
            className={`nav-item ${active ? "active" : ""} ${
              item.screen === "add" ? "nav-add" : ""
            }`}
            onClick={() => onNavigate(item.screen)}
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-icon">
              <Icon />
            </span>
            <span className="nav-label">{t(item.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
