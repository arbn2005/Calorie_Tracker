import { useTranslation } from "../../i18n";

export type AddTab = "search" | "scan" | "manual" | "recipe";

interface AddTabsProps {
  tab: AddTab;
  onChange: (tab: AddTab) => void;
}

const TABS: { key: AddTab; labelKey: string; icon: string }[] = [
  { key: "search", labelKey: "add.searchTab", icon: "⌕" },
  { key: "scan", labelKey: "add.scanTab", icon: "▣" },
  { key: "manual", labelKey: "add.manualTab", icon: "✎" },
  { key: "recipe", labelKey: "add.recipeTab", icon: "◍" },
];

export function AddTabs({ tab, onChange }: AddTabsProps) {
  const { t } = useTranslation();
  return (
    <div className="tab-bar" role="tablist" aria-label={t("add.title")}>
      {TABS.map((item) => {
        const active = item.key === tab;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`tab-button ${active ? "active" : ""}`}
            onClick={() => onChange(item.key)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{t(item.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
