import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

export function safeParseFloat(value: string | number | undefined): number {
  const num = parseFloat(String(value ?? ""));
  return Number.isFinite(num) ? num : 0;
}
