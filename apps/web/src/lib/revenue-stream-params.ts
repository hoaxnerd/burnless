/**
 * Maps revenue stream form values to the parameter shape expected by
 * `@burnless/engine` (`computeRevenueStream`).
 *
 * Input uses UI-facing field names (monthlyHours, monthlyUnits, unitPrice,
 * expectedUnits, monthlyChurnRate-as-percent); output uses engine field
 * names (hoursPerMonth, unitsPerMonth, pricePerUnit, activeUsers +
 * avgUsagePerUser, monthlyChurnRate-as-decimal).
 *
 * For usage_based the UI has a single "Expected Units/Mo" input; we map
 * that to activeUsers with avgUsagePerUser=1 so the engine's
 * `users × usage × price` reduces to `expectedUnits × price`.
 */

export type RevenueStreamType =
  | "subscription"
  | "one_time"
  | "usage_based"
  | "services";

export interface RevenueStreamFormValues {
  // subscription
  monthlyPrice?: string;
  startingCustomers?: string;
  newCustomersPerMonth?: string;
  monthlyChurnRate?: string;
  // services
  hourlyRate?: string;
  monthlyHours?: string;
  // one_time
  unitPrice?: string;
  monthlyUnits?: string;
  // usage_based
  pricePerUnit?: string;
  expectedUnits?: string;
}

export function buildRevenueStreamParams(
  type: RevenueStreamType,
  values: RevenueStreamFormValues,
): Record<string, number> {
  switch (type) {
    case "subscription":
      return {
        monthlyPrice: Number(values.monthlyPrice ?? 0),
        startingCustomers: Number(values.startingCustomers ?? 0),
        newCustomersPerMonth: Number(values.newCustomersPerMonth ?? 0),
        monthlyChurnRate: Number(values.monthlyChurnRate ?? 0) / 100,
      };
    case "services":
      return {
        hourlyRate: Number(values.hourlyRate ?? 0),
        hoursPerMonth: Number(values.monthlyHours ?? 0),
      };
    case "one_time":
      return {
        pricePerUnit: Number(values.unitPrice ?? 0),
        unitsPerMonth: Number(values.monthlyUnits ?? 0),
      };
    case "usage_based":
      return {
        pricePerUnit: Number(values.pricePerUnit ?? 0),
        activeUsers: Number(values.expectedUnits ?? 0),
        avgUsagePerUser: 1,
      };
  }
}
