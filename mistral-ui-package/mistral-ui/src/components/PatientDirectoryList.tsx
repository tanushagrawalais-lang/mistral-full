import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { ArrowLeft, ArrowRight, CheckCircle2, Search } from 'lucide-react';
import { api } from '@convex/api';
import {
  displayName,
  formatPacketKB,
  levelFromScreening,
  partitionQueue,
  type PatientId,
  type ScreeningId,
} from '../lib/clinical';
import type { DirectoryCategory } from './SpecialistHomeHub';

interface PatientDirectoryListProps {
  category: DirectoryCategory;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onBackHome: () => void;
  onSelectCase: (patientId: PatientId, screeningId: ScreeningId) => void;
  signOffNotice: string | null;
}

export const CATEGORY_LABELS: Record<DirectoryCategory, string> = {
  pending: 'Pending Patients',
  previous: 'Previous Patients',
  referrals: 'Physical Referrals',
};

export function PatientDirectoryList({
  category,
  searchQuery,
  onSearchChange,
  onBackHome,
  onSelectCase,
  signOffNotice,
}: PatientDirectoryListProps) {
  const queue = useQuery(api.triageLogbook.getSpecialistTriageQueue, {});
  const categoryTitle = CATEGORY_LABELS[category];
  const patients = useMemo(() => {
    if (!queue) return [];
    const buckets = partitionQueue(queue);
    const source =
      category === 'pending'
        ? buckets.pending
        : category === 'previous'
          ? buckets.reviewed
          : buckets.referrals;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return source;
    return source.filter((item) => {
      const code = item.patient.patientCode?.toLowerCase() ?? '';
      const name = item.patient.fullName?.toLowerCase() ?? '';
      const village = item.patient.village?.toLowerCase() ?? '';
      return code.includes(q) || name.includes(q) || village.includes(q);
    });
  }, [queue, category, searchQuery]);

  return (
    <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-6 lg:px-10 py-8 space-y-6">
      <div className="rounded-2xl border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/88 dark:bg-[#111827]/86 backdrop-blur-md p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#111315]/15 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#1E293B] hover:bg-[#111315] hover:text-[#FAF9F6] dark:hover:bg-[#F8FAFC] dark:hover:text-[#111315] text-xs font-semibold text-[#111315] dark:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315] dark:focus-visible:outline-[#F8FAFC]"
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Back to Home</span>
          </button>

          <div className="flex items-baseline gap-3">
            <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#111315] dark:text-[#F8FAFC]">
              {categoryTitle}
            </h1>
            <span className="font-mono text-xs tabular-nums text-[#111315]/60 dark:text-[#F1F5F9]/60">
              {queue === undefined
                ? 'Loading'
                : `${patients.length} ${patients.length === 1 ? 'patient' : 'patients'}`}
            </span>
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search
            className="w-4 h-4 text-[#111315]/45 dark:text-[#F1F5F9]/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter by code, name, or village..."
            aria-label="Filter patient directory"
            className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-[#111315]/15 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 text-[#111315] dark:text-[#F8FAFC] placeholder:text-[#111315]/45 dark:placeholder:text-[#F1F5F9]/45 focus:bg-[#FFFFFF] dark:focus:bg-[#0B0F17] focus:outline-none focus:border-[#111315] dark:focus:border-[#F8FAFC]"
          />
        </div>
      </div>

      {signOffNotice && (
        <div
          role="status"
          className="rounded-xl border border-[#0D9488]/35 dark:border-[#2DD4BF]/40 bg-[#FFFFFF]/92 dark:bg-[#111827]/92 px-4 py-3 text-xs font-medium text-[#111315] dark:text-[#F8FAFC] flex items-center gap-2.5"
        >
          <CheckCircle2
            className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0"
            aria-hidden="true"
          />
          <span>{signOffNotice}</span>
        </div>
      )}

      <div className="rounded-2xl border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/90 dark:bg-[#111827]/88 backdrop-blur-md overflow-hidden">
        {queue === undefined ? (
          <div className="p-12 text-center text-xs text-[#111315]/65 dark:text-[#F1F5F9]/65">
            Loading the specialist triage queue...
          </div>
        ) : patients.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-base font-bold text-[#111315] dark:text-[#F8FAFC]">
              No patients found in {categoryTitle}
            </p>
            <p className="text-xs text-[#111315]/65 dark:text-[#F1F5F9]/65">
              {searchQuery
                ? 'Try clearing or broadening your search term.'
                : 'No cases currently match this clinical queue.'}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-[#111315]/20 dark:border-white/20 text-[#111315] dark:text-[#F8FAFC] hover:bg-[#FAF9F6] dark:hover:bg-[#1E293B] cursor-pointer"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#111315]/10 dark:border-white/12 bg-[#FAF9F6]/80 dark:bg-[#0B0F17]/60 text-[11px] font-mono uppercase tracking-wider text-[#111315]/60 dark:text-[#F1F5F9]/60">
                  <th className="py-3.5 px-5 font-semibold">Code</th>
                  <th className="py-3.5 px-4 font-semibold">Patient</th>
                  <th className="py-3.5 px-4 font-semibold">Age / Sex</th>
                  <th className="py-3.5 px-4 font-semibold">Village</th>
                  <th className="py-3.5 px-4 font-semibold">Status</th>
                  <th className="py-3.5 px-4 font-semibold">Risk Score</th>
                  <th className="py-3.5 px-4 font-semibold">Packet</th>
                  <th className="py-3.5 px-5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#111315]/10 dark:divide-white/10 text-sm">
                {patients.map((item) => {
                  const level = levelFromScreening(
                    item.screening.level1Status,
                    item.screening.riskScore,
                  );
                  const isUrgent = level === 'urgent';
                  const isNormal = level === 'normal';
                  const statusLabel = isUrgent ? 'URGENT' : isNormal ? 'NORMAL' : 'MONITOR';
                  const statusClass = isUrgent
                    ? 'bg-[#E63946] text-white border-[#E63946]'
                    : isNormal
                      ? 'bg-[#0D9488] text-white border-[#0D9488]'
                      : 'bg-[#FAF9F6] dark:bg-[#1E293B] text-[#111315] dark:text-[#F8FAFC] border-[#111315]/30 dark:border-white/25';
                  const riskBarClass = isUrgent
                    ? 'bg-[#E63946]'
                    : isNormal
                      ? 'bg-[#0D9488]'
                      : 'bg-[#111315]/75 dark:bg-[#E2E8F0]';
                  const riskScore = item.screening.riskScore ?? 0;
                  const openCase = () => onSelectCase(item.patient._id, item.screening._id);

                  return (
                    <tr
                      key={item.screening._id}
                      onClick={openCase}
                      className="hover:bg-[#FAF9F6]/90 dark:hover:bg-[#1E293B]/65 transition-colors cursor-pointer group"
                    >
                      <td className="py-4 px-5 font-mono text-xs font-semibold tabular-nums text-[#111315] dark:text-[#F8FAFC] whitespace-nowrap">
                        {item.patient.patientCode ?? '—'}
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-bold text-[#111315] dark:text-[#F8FAFC] text-sm">
                          {displayName(item.patient.fullName, 'Unnamed patient')}
                        </div>
                        <div className="text-[11px] text-[#111315]/60 dark:text-[#F1F5F9]/60">
                          {item.screening.reviewStatus ?? 'pending_review'}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs tabular-nums text-[#111315]/80 dark:text-[#F1F5F9]/80 whitespace-nowrap">
                        {item.patient.age}y / {item.patient.sex}
                      </td>
                      <td className="py-4 px-4 text-xs text-[#111315]/85 dark:text-[#F1F5F9]/85 whitespace-nowrap">
                        {item.patient.village ?? '—'}
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 text-[10px] font-mono font-semibold tracking-wide rounded border ${statusClass}`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="py-4 px-4 min-w-[140px]">
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1 h-1.5 rounded-full bg-[#111315]/10 dark:bg-white/12 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${riskBarClass}`}
                              style={{ width: `${Math.max(0, Math.min(100, riskScore))}%` }}
                            />
                          </div>
                          <span
                            className={`font-mono text-xs font-semibold tabular-nums w-8 text-right ${
                              isUrgent
                                ? 'text-[#E63946] dark:text-[#FF6B77]'
                                : isNormal
                                  ? 'text-[#0D9488] dark:text-[#2DD4BF]'
                                  : 'text-[#111315] dark:text-[#F8FAFC]'
                            }`}
                          >
                            {item.screening.riskScore ?? '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-[#111315]/15 dark:border-white/15 bg-[#FAF9F6] dark:bg-[#1E293B] font-mono text-[11px] tabular-nums text-[#111315]/80 dark:text-[#F1F5F9]/80">
                          {formatPacketKB(item.screening.compressedAudioBytes)} Opus
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCase();
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FFFFFF] dark:bg-[#1E293B] group-hover:bg-[#111315] group-hover:text-[#FAF9F6] dark:group-hover:bg-[#F8FAFC] dark:group-hover:text-[#111315] text-xs font-semibold text-[#111315] dark:text-[#F8FAFC] transition-colors cursor-pointer"
                        >
                          <span>View Case</span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
