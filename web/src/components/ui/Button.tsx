import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
};

export function Button({ children, className, fullWidth = false, variant = "primary", ...props }: Props) {
  return <button {...props} className={[styles.button, styles[variant], fullWidth ? styles.fullWidth : "", className ?? ""].filter(Boolean).join(" ")}>{children}</button>;
}
