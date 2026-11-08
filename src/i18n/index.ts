import { useCallback, useSyncExternalStore } from "react";
import type { Language } from "../types";
import en from "./locales/en.json";
import ta from "./locales/ta.json";
import zh from "./locales/zh.json";

type Dictionary = Record<string, string>;
type Vars = Record<string, string | number>;

const fallback = en as Dictionary;
const bundles: Record<Language, Dictionary> = {
  en: en as Dictionary,
  ta: { ...fallback, ...(ta as Dictionary) },
  zh: { ...fallback, ...(zh as Dictionary) },
};

let currentLanguage: Language = "en";
const listeners = new Set<() => void>();

function browserLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const language = navigator.language.toLowerCase();
  if (language.startsWith("ta")) return "ta";
  if (language.startsWith("zh")) return "zh";
  return "en";
}

currentLanguage = browserLanguage();

export function getLanguage(): Language {
  return currentLanguage;
}

export function setLanguage(language: Language): void {
  if (language === currentLanguage) return;
  currentLanguage = language;
  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function translate(
  key: string,
  vars?: Vars,
  language: Language = currentLanguage,
): string {
  const template = bundles[language][key] ?? fallback[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{{${name}}}`,
  );
}

export function useTranslation(): {
  t: (key: string, vars?: Vars) => string;
  language: Language;
} {
  const language = useSyncExternalStore(
    subscribe,
    getLanguage,
    getLanguage,
  );
  const t = useCallback(
    (key: string, vars?: Vars) => translate(key, vars, language),
    [language],
  );
  return { t, language };
}

export function cuisineKey(cuisine: string): string {
  return `cuisines.${cuisine.toLowerCase()}`;
}

export function categoryKey(category: string): string {
  return `categories.${category}`;
}

export function dietKey(dietType: string): string {
  if (dietType === "non-vegetarian") return "diet.nonVegetarian";
  return `diet.${dietType}`;
}
