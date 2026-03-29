import { useEffect, useState } from "react";
import api from "../api";

// Currency utility functions
export const getCurrencySymbol = (currencyCode: string): string => {
  const symbols: Record<string, string> = {
    USD: "$",
    BDT: "৳",
    EUR: "€",
    GBP: "£",
    INR: "₹",
    JPY: "¥",
    CNY: "¥",
  };
  return symbols[currencyCode.toUpperCase()] || currencyCode;
};

export const formatCurrency = (
  amount: number,
  currencyCode: string,
): string => {
  const symbol = getCurrencySymbol(currencyCode);
  return `${symbol}${amount.toLocaleString()}`;
};

const PAYROLL_CURRENCY_STORAGE_KEY = "payroll_currency_code";

export const getCachedPayrollCurrencyCode = (): string | null => {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(PAYROLL_CURRENCY_STORAGE_KEY);
  const code = String(v || "")
    .trim()
    .toUpperCase();
  if (!code) return null;
  return code;
};

export const setCachedPayrollCurrencyCode = (currencyCode: string): void => {
  if (typeof window === "undefined") return;
  const code = String(currencyCode || "")
    .trim()
    .toUpperCase();
  if (!code) return;
  localStorage.setItem(PAYROLL_CURRENCY_STORAGE_KEY, code);
};

export const usePayrollCurrencyCode = (fallback = "USD"): string => {
  const [currencyCode, setCurrencyCode] = useState<string>(() => {
    return getCachedPayrollCurrencyCode() || fallback;
  });

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const res = await api.get("/api/payroll/settings", {
          headers: { "X-Toast-Skip": "1" },
        });
        const next = String(res.data?.settings?.currency_code || "")
          .trim()
          .toUpperCase();
        if (!next) return;
        setCachedPayrollCurrencyCode(next);
        if (mounted) setCurrencyCode(next);
      } catch (err) {
        void err;
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return currencyCode;
};

export const PERMISSION_LABELS: Record<string, string> = {
  // Payroll permissions
  "payroll.read": "View Payroll",
  "payroll.approve": "Approve Payrolls",
  "payroll.manage": "Manage Payroll",
  "payroll.settings": "Payroll Settings",
  "payroll.run": "Process Payroll",
  "payroll.write": "Edit Payroll",

  // Employee permissions
  "employees.read": "View Employees",
  "employees.write": "Edit Employees",
  "employees.manage": "Manage Employees",

  // Attendance permissions
  "attendance.read": "View Attendance",
  "attendance.write": "Edit Attendance",
  "attendance.approve": "Approve Attendance",

  // Leave permissions
  "leaves.read": "View Leaves",
  "leaves.write": "Apply Leaves",
  "leaves.approve": "Approve Leaves",

  // Settings permissions
  "settings.read": "View Settings",
  "settings.write": "Edit Settings",
};

export const getPermissionLabel = (permission: string): string => {
  if (PERMISSION_LABELS[permission]) {
    return PERMISSION_LABELS[permission];
  }

  // Fallback: Convert snake_case to Title Case
  return permission
    .replace(/^[a-z]+\./, "") // Remove prefix like "payroll."
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
