import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { ArrowRight, Clock, FileCheck2, AlertTriangle } from 'lucide-react';
import { api } from '@convex/api';
import { partitionQueue } from '../lib/clinical';

export type DirectoryCategory = 'pending' | 'previous' | 'referrals';

interface SpecialistHomeHubProps {
  doctorName: string;
  onSelectCategory: (category: DirectoryCategory) => void;
}

export function SpecialistHomeHub({
  doctorName,
  onSelectCategory,
}: SpecialistHomeHubProps) {
  const specialistProfile = useQuery(api.triageLogbook.getMyStaffProfile, {
    role: "city_specialist",
  });
  const greetingName = specialistProfile?.fullName || doctorName;
  const queue = useQuery(api.triageLogbook.getSpecialistTriageQueue, {});
  const counts = useMemo(() => {
    if (!queue) return { pending: null, reviewed: null, referrals: null };
    const buckets = partitionQueue(queue);
    return {
      pending: buckets.pending.length,
      reviewed: buckets.reviewed.length,
      referrals: buckets.referrals.length,
    };
  }, [queue]);
  const pendingCount = counts.pending;
  const reviewedCount = counts.reviewed;
  const referralCount = counts.referrals;

  return (
    <main className="relative z-10 flex-1 flex items-center justify-center px-6 lg:px-10 py-12">
      <div className="max-w-6xl w-full mx-auto space-y-10">
        {/* Calm Editorial Hub Intro */}
        <div className="max-w-2xl space-y-2.5">
          <p className="text-xs font-mono text-[#0D9488] dark:text-[#2DD4BF] font-semibold">
            Welcome, {greetingName}
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight text-[#111315] dark:text-[#F8FAFC] text-balance">
            Specialist Triage Workspace
          </h1>
          <p className="text-sm sm:text-base text-[#111315]/75 dark:text-[#F1F5F9]/75 leading-relaxed">
            Select a patient queue below to inspect compressed acoustic recordings, FFT
            frequency biomarkers, and longitudinal PHC logbooks.
          </p>
        </div>

        {/* 3 Minimalist Pop-Out Interactive Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {/* Card 1: Pending Patients -> Crisp Medium-Deep Blue on Hover */}
          <button
            type="button"
            onClick={() => onSelectCategory('pending')}
            className="group text-left rounded-2xl border border-[#111315]/14 dark:border-white/14 bg-[#FFFFFF]/95 dark:bg-[#111827]/84 backdrop-blur-md p-7 flex flex-col justify-between gap-10 transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:bg-[#1F5588] hover:border-[#1F5588] dark:hover:bg-[#1F5588] dark:hover:border-[#1F5588] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F5588]"
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#111315]/12 dark:border-white/15 bg-[#FAF9F6] dark:bg-[#1E293B] text-[#111315] dark:text-[#F8FAFC] transition-colors duration-200 group-hover:bg-white/12 group-hover:border-white/25 group-hover:text-[#FAF9F6]">
                  <Clock className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#1E293B] font-mono text-xs font-semibold tabular-nums text-[#111315] dark:text-[#F8FAFC] transition-colors duration-200 group-hover:bg-white/12 group-hover:border-white/25 group-hover:text-[#FAF9F6]">
                  {pendingCount === null
                    ? '—'
                    : `${pendingCount} ${pendingCount === 1 ? 'case' : 'cases'}`}
                </span>
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC] transition-colors duration-200 group-hover:text-[#FAF9F6]">
                  Pending Patients
                </h2>
                <p className="text-xs leading-relaxed text-[#111315]/68 dark:text-[#F1F5F9]/70 transition-colors duration-200 group-hover:text-[#FAF9F6]/80">
                  Unreviewed rural PHC acoustic screenings sorted by clinical urgency and
                  risk score.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-[#111315]/10 dark:border-white/12 transition-colors duration-200 group-hover:border-white/18 flex items-center justify-end">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#111315] dark:text-[#F8FAFC] transition-all duration-200 group-hover:text-[#FAF9F6] group-hover:translate-x-1">
                <span>Open Queue</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </div>
          </button>

          {/* Card 2: Previous Patients -> Warm Ivory on Hover */}
          <button
            type="button"
            onClick={() => onSelectCategory('previous')}
            className="group text-left rounded-2xl border border-[#111315]/14 dark:border-white/14 bg-[#FFFFFF]/95 dark:bg-[#111827]/84 backdrop-blur-md p-7 flex flex-col justify-between gap-10 transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:bg-[#F3EFE4] hover:border-[#111315]/35 dark:hover:bg-[#F3EFE4] dark:hover:border-[#F3EFE4] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315]"
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#0D9488]/25 dark:border-[#2DD4BF]/30 bg-[#0D9488]/[0.08] dark:bg-[#0D9488]/18 text-[#0D9488] dark:text-[#2DD4BF] transition-colors duration-200 group-hover:bg-[#111315]/8 group-hover:border-[#111315]/20 group-hover:text-[#111315] dark:group-hover:bg-[#111315]/10 dark:group-hover:border-[#111315]/22 dark:group-hover:text-[#111315]">
                  <FileCheck2 className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full border border-[#0D9488]/25 dark:border-[#2DD4BF]/30 bg-[#0D9488]/[0.08] dark:bg-[#0D9488]/18 font-mono text-xs font-semibold tabular-nums text-[#0D9488] dark:text-[#2DD4BF] transition-colors duration-200 group-hover:bg-[#111315]/8 group-hover:border-[#111315]/20 group-hover:text-[#111315] dark:group-hover:bg-[#111315]/10 dark:group-hover:border-[#111315]/22 dark:group-hover:text-[#111315]">
                  {reviewedCount === null ? '—' : `${reviewedCount} reviewed`}
                </span>
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC] transition-colors duration-200 group-hover:text-[#111315] dark:group-hover:text-[#111315]">
                  Previous Patients
                </h2>
                <p className="text-xs leading-relaxed text-[#111315]/68 dark:text-[#F1F5F9]/70 transition-colors duration-200 group-hover:text-[#111315]/82 dark:group-hover:text-[#111315]/82">
                  Completed specialist sign-offs, longitudinal follow-ups, and archived
                  clinical remarks.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-[#111315]/10 dark:border-white/12 transition-colors duration-200 group-hover:border-[#111315]/18 dark:group-hover:border-[#111315]/18 flex items-center justify-end">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#111315] dark:text-[#F8FAFC] transition-all duration-200 group-hover:text-[#111315] dark:group-hover:text-[#111315] group-hover:translate-x-1">
                <span>View History</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </div>
          </button>

          {/* Card 3: Physical Referrals -> French Flag Deep Red on Hover */}
          <button
            type="button"
            onClick={() => onSelectCategory('referrals')}
            className="group text-left rounded-2xl border border-[#CE1126]/28 dark:border-[#CE1126]/45 bg-[#FFFFFF]/95 dark:bg-[#111827]/84 backdrop-blur-md p-7 flex flex-col justify-between gap-10 transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-xl hover:bg-[#CE1126] hover:border-[#CE1126] dark:hover:bg-[#CE1126] dark:hover:border-[#CE1126] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CE1126]"
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#E63946]/25 dark:border-[#E63946]/35 bg-[#E63946]/[0.08] dark:bg-[#E63946]/16 text-[#E63946] dark:text-[#FF6B77] transition-colors duration-200 group-hover:bg-white/15 group-hover:border-white/30 group-hover:text-white">
                  <AlertTriangle className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#E63946] font-mono text-xs font-semibold tabular-nums text-white transition-colors duration-200 group-hover:bg-white/20 group-hover:text-white">
                  {referralCount === null ? '—' : `${referralCount} urgent`}
                </span>
              </div>

              <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC] transition-colors duration-200 group-hover:text-white">
                  Physical Referrals
                </h2>
                <p className="text-xs leading-relaxed text-[#111315]/68 dark:text-[#F1F5F9]/70 transition-colors duration-200 group-hover:text-white/85">
                  Mandatory hospital referral escalations requiring chest imaging,
                  sputum CBNAAT, or oxygen stabilization.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-[#111315]/10 dark:border-white/12 transition-colors duration-200 group-hover:border-white/20 flex items-center justify-end">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E63946] dark:text-[#FF6B77] transition-all duration-200 group-hover:text-white group-hover:translate-x-1">
                <span>Inspect Referrals</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </div>
          </button>
        </div>
      </div>
    </main>
  );
}
