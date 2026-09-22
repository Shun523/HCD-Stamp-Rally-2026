import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./IconButton.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  label: string;
};

export function IconButton({ children, className, label, ...props }: Props) {
  return <button {...props} aria-label={label} className={[styles.button, className ?? ""].filter(Boolean).join(" ")}>{children}</button>;
}
