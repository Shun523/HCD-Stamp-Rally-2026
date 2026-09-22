import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./IconButton.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  label: string;
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton({ children, className, label, ...props }, ref) {
  return <button {...props} ref={ref} aria-label={label} className={[styles.button, className ?? ""].filter(Boolean).join(" ")}>{children}</button>;
});
