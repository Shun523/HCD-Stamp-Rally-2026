import type { Ref } from "react";
import { useEffect, useState } from "react";
import type { Copy, Language } from "../data/content.js";
import { Chip } from "./ui/Chip.js";
import { HeaderTabs, type ParticipantTab } from "./ui/HeaderTabs.js";
import { IconButton } from "./ui/IconButton.js";
import styles from "./ParticipantHeader.module.css";

type Props = {
  active: ParticipantTab;
  copy: Copy;
  headerRef?: Ref<HTMLElement>;
  isQrActive?: boolean;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onTabChange: (tab: ParticipantTab) => void;
};

export function ParticipantHeader({ active, copy, headerRef, isQrActive = false, language, onLanguageChange, onTabChange }: Props) {
  const [hasScrolled, setHasScrolled] = useState(false);
  useEffect(() => {
    const update = () => setHasScrolled(window.scrollY > 4);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <header className={[styles.header, hasScrolled ? styles.scrolled : "", isQrActive ? styles.qrActive : ""].filter(Boolean).join(" ")} data-participant-header="true" ref={headerRef}>
      <div className={styles.topRow}>
        <Chip>{copy.eventChip}</Chip>
        <IconButton label={copy.switchLanguage} type="button" onClick={() => onLanguageChange(language === "ja" ? "en" : "ja")}><span className={styles.language}>{language === "ja" ? "EN" : "日本語"}</span></IconButton>
      </div>
      <HeaderTabs active={active} labels={{ book: copy.tabBook, map: copy.tabMap, about: copy.tabAbout }} onSelect={onTabChange} />
    </header>
  );
}
