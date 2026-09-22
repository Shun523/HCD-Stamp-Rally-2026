import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "./Button.js";
import { IconButton } from "./IconButton.js";
import styles from "./Popup.module.css";

type Props = {
  children: React.ReactNode;
  closeLabel: string;
  isOpen: boolean;
  onClose: () => void;
  title: string;
};

export function Popup({ children, closeLabel, isOpen, onClose, title }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const onCancel = (event: Event) => { event.preventDefault(); onClose(); };
    const onNativeClose = () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onNativeClose);
    if (isOpen && !dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    }
    if (!isOpen && dialog.open) dialog.close();
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onNativeClose);
    };
  }, [isOpen, onClose]);

  return (
    <dialog
      aria-labelledby="popup-title"
      className={styles.dialog}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      ref={dialogRef}
    >
      <div className={styles.panel}>
        <header className={styles.header}>
          <h2 id="popup-title">{title}</h2>
          <IconButton label={closeLabel} type="button" onClick={onClose}><X aria-hidden="true" size={24} strokeWidth={2.25} /></IconButton>
        </header>
        <div className={styles.body}>{children}</div>
        <Button type="button" variant="secondary" fullWidth onClick={onClose}>{closeLabel}</Button>
      </div>
    </dialog>
  );
}
