import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/api";
import type { Id } from "@convex/dataModel";

export type Level1Status = "normal" | "monitor" | "urgent";
export type ReviewStatus = "pending_review" | "reviewed" | "physical_referral";
export type AcousticChannelType = "cough" | "phonation";

export type TriageQueueItem = FunctionReturnType<
  typeof api.triageLogbook.getSpecialistTriageQueue
>[number];

export type PatientLogbook = FunctionReturnType<
  typeof api.triageLogbook.getPatientLogbook
>;

export type LogbookScreening = PatientLogbook["screenings"][number];
export type LogbookDocument = PatientLogbook["documents"][number];
export type StaffProfile = NonNullable<
  FunctionReturnType<typeof api.triageLogbook.getMyStaffProfile>
>;

export type PatientId = Id<"patients">;
export type ScreeningId = Id<"screenings">;

export function formatPacketKB(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  const kb = bytes / 1024;
  return `${kb >= 10 ? kb.toFixed(1) : kb.toFixed(2)} KB`;
}

export function levelFromScreening(
  level: Level1Status | undefined,
  riskScore: number | undefined,
): Level1Status {
  if (level) return level;
  if (riskScore == null) return "monitor";
  if (riskScore >= 70) return "urgent";
  if (riskScore < 40) return "normal";
  return "monitor";
}

export function partitionQueue(items: TriageQueueItem[]) {
  const pending: TriageQueueItem[] = [];
  const reviewed: TriageQueueItem[] = [];
  const referrals: TriageQueueItem[] = [];
  for (const item of items) {
    const status = item.screening.reviewStatus ?? "pending_review";
    if (status === "physical_referral") referrals.push(item);
    else if (status === "reviewed") reviewed.push(item);
    else pending.push(item);
  }
  return { pending, reviewed, referrals };
}

export function displayName(name: string | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}
