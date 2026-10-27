import { Languages, X } from "lucide-react";
import { useState } from "react";
import { aboutItems } from "../data/about.js";
import { content } from "../data/content.js";
import { AboutCard } from "./ui/AboutCard.js";
import { Button } from "./ui/Button.js";
import { Band, BoardCard, Card } from "./ui/Card.js";
import { Chip } from "./ui/Chip.js";
import { CropMarks, Sparkle, SpeechBubble } from "./ui/Decorations.js";
import { HeaderTabs } from "./ui/HeaderTabs.js";
import { IconButton } from "./ui/IconButton.js";
import { InfoTile } from "./ui/InfoTile.js";
import { NumberBadge } from "./ui/NumberBadge.js";
import { Popup } from "./ui/Popup.js";
import { CardStampSlot } from "./ui/CardStampSlot.js";
import { PrizeStub } from "./ui/PrizeStub.js";
import { StampCard } from "./ui/StampCard.js";
import { ProgressBadge, SpotMarker, StampImage, StampSlot } from "./ui/StampParts.js";
import { Tag } from "./ui/Tag.js";
import styles from "./DevGallery.module.css";

const gallerySpots = [1, 2, 3, 4, 5].map((number) => ({
  id: `spot-${String(number).padStart(2, "0")}`,
  name_ja: `スポット${number}（サンプル）`,
  name_en: `Spot ${number} (Sample)`,
  display_order: number,
  lat: 34.685 + number / 10_000,
  lng: 133.92 + number / 10_000,
  description_ja: "",
  description_en: "",
  location_note_ja: null,
  location_note_en: null,
  is_sample: true,
}));

// デザイン6章: 開発時だけの部品一覧。通常・押下・フォーカス・無効と各種状態を確認できる。
export function DevGallery() {
  const [popupOpen, setPopupOpen] = useState(false);
  return (
    <main className={styles.page}>
      <header><Chip>DEV ONLY</Chip><h1>Component gallery</h1><p>390px幅を中心に、全状態の見た目を確認します。</p></header>
      <GallerySection title="HeaderTabs"><HeaderTabs active="book" labels={{ book: "スタンプ帳", map: "マップ", about: "紹介" }} onSelect={() => undefined} /></GallerySection>
      <GallerySection title="Buttons"><div className={styles.row}><Button type="button">Primary</Button><Button type="button" variant="secondary">Secondary</Button><Button className={styles.pressed} type="button">Pressed</Button><Button autoFocus type="button" variant="secondary">Focus</Button><Button disabled type="button">Disabled</Button></div></GallerySection>
      <GallerySection title="IconButton / Chip / Tag"><div className={styles.row}><IconButton label="Language" type="button"><Languages aria-hidden="true" size={24} strokeWidth={2.25} /></IconButton><IconButton className={styles.pressed} label="Close" type="button"><X aria-hidden="true" size={24} strokeWidth={2.25} /></IconButton><Chip>CHIP</Chip><Tag>ここでやること</Tag></div></GallerySection>
      <GallerySection title="Cards"><div className={styles.stack}><Card className={styles.padded}>Card</Card><BoardCard className={styles.padded}>BoardCard</BoardCard><Band className={styles.padded}>Band</Band></div></GallerySection>
      <GallerySection title="InfoTile / NumberBadge"><div className={styles.infoRow}><InfoTile kind="how" label="遊び方" onClick={() => setPopupOpen(true)} /><InfoTile kind="recovery" label="スタンプが消えた方へ" onClick={() => setPopupOpen(true)} /></div><div className={styles.row}><NumberBadge number={1} /><NumberBadge number={2} /><NumberBadge number={3} /></div></GallerySection>
      <GallerySection title="Stamp parts"><div className={styles.stampRow}><div className={styles.stampCell}><SpotMarker label="未押印" number={1} onClick={() => undefined} /></div><div className={styles.stampCell}><StampSlot label="押印済み" spotId="spot-01" /></div><div className={styles.stampCell}><StampImage spotId="missing-stamp" /></div><ProgressBadge count={2} /><CardStampSlot emptyLabel="未押印" number={1} onOpenQr={() => undefined} stampHere={content.copy.ja.stampHere} stamped={false} stampedLabel="押印済み" spotId="spot-01" spotName="スポット1" /><CardStampSlot emptyLabel="未押印" number={1} onOpenQr={() => undefined} stampHere={content.copy.ja.stampHere} stamped stampedLabel="押印済み" spotId="spot-01" spotName="スポット1" /></div></GallerySection>
      <GallerySection title="PrizeStub"><div className={styles.stubPreview}><PrizeStub complete={false} copy={content.copy.ja} remaining={3} /><PrizeStub complete copy={content.copy.ja} remaining={0} /></div></GallerySection>
      <GallerySection title="StampCard"><div className={styles.cardPreview}><StampCard copy={content.copy.ja} language="ja" onFocusReturnHandled={() => undefined} onQr={() => undefined} spots={gallerySpots} stampedSpotIds={new Set(["spot-01", "spot-03"])} /></div></GallerySection>
      <GallerySection title="AboutCard"><div className={styles.aboutGrid}><AboutCard item={aboutItems[0]!} language="ja" /><AboutCard item={{ ...aboutItems[2]!, url: undefined }} language="ja" /></div></GallerySection>
      <GallerySection title="Decorations"><div className={styles.decoration}><Sparkle /><Sparkle tone="coral" /><Sparkle tone="purple" /><SpeechBubble>ここ!</SpeechBubble><div className={styles.cropPreview}><CropMarks /></div></div></GallerySection>
      <GallerySection title="Popup"><Button type="button" variant="secondary" onClick={() => setPopupOpen(true)}>ポップアップを開く</Button></GallerySection>
      <Popup closeLabel={content.copy.ja.close} isOpen={popupOpen} onClose={() => setPopupOpen(false)} title="ポップアップ"><p>Esc、背景、閉じるボタンで閉じ、開いたボタンへフォーカスを戻します。</p></Popup>
    </main>
  );
}

function GallerySection({ children, title }: { children: React.ReactNode; title: string }) { return <section className={styles.section}><h2>{title}</h2>{children}</section>; }
