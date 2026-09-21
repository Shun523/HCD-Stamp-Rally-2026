import type { Language } from "../data/content.js";

type Props = {
  language: Language;
  label: string;
  onChange: (language: Language) => void;
};

export function LanguageToggle({ language, label, onChange }: Props) {
  return (
    <button className="language-toggle" type="button" onClick={() => onChange(language === "ja" ? "en" : "ja")}>
      {label}
    </button>
  );
}
