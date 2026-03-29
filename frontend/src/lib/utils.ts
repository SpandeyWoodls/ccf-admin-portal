import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function maskLicenseKey(key: string): string {
  if (key.length < 8) return key;
  const parts = key.split("-");
  if (parts.length >= 4) {
    return `${parts[0]}-${parts[1].substring(0, 2)}**-${"*".repeat(4)}-${"*".repeat(4)}`;
  }
  return key.substring(0, 6) + "*".repeat(key.length - 6);
}
