import { Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  formatPacketKB,
  levelFromScreening,
  type PatientId,
  type ScreeningId,
  type TriageQueueItem,
} from '../lib/clinical';

interface TriageQueueColumnProps {
  items: TriageQueueItem[];
  selectedScreeningId: ScreeningId | null;
  onSelectCase: (patientId: PatientId, screeningId: ScreeningId) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function TriageQueueColumn({
  items,
  selectedScreeningId,
  onSelectCase,
  searchQuery,
  onSearchChange,
}: TriageQueueColumnProps) {
  return (
    <aside className="flex flex-col border border-[#111315]/12 bg-[#FFFFFF]/90 rounded-xl overflow-hidden lg:h-[calc(100vh-88px)]">
      <div className="p-4 border-b border-[#111315]/10 bg-[#FAF9F6]/70 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-tight text-[#111315]">District Triage Queue</h2>
          <span className="font-mono text-xs tabular-nums text-[#111315]/60">
            {items.length} {items.length === 1 ? 'case' : 'cases'}
          </span>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#111315]/45 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search code, name, village..."
            aria-label="Search triage queue"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#111315]/15 bg-[#FFFFFF] focus:outline-none focus:border-[#111315]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-[#111315]/8">
        {items.length === 0 ? (
          <div className="p-6 text-center space-y-2">
            <p className="text-xs text-[#111315]/60">No matching cases in this queue.</p>
            {searchQuery && (
              <button type="button" onClick={() => onSearchChange('')} className="mt-2 px-3 py-1.5 text-xs font-semibold border border-[#111315]/20 rounded-md cursor-pointer">
                Clear Search
              </button>
            )}
          </div>
        ) : (
          items.map((item) => {
            const level = levelFromScreening(item.screening.level1Status, item.screening.riskScore);
            const isSelected = item.screening._id === selectedScreeningId;
            const isUrgent = level === 'urgent';
            const isNormal = level === 'normal';
            const statusLabel = isUrgent ? 'URGENT' : level === 'monitor' ? 'MONITOR' : 'NORMAL';
            const riskScore = item.screening.riskScore ?? 0;
            return (
              <button
                key={item.screening._id}
                type="button"
                onClick={() => onSelectCase(item.patient._id, item.screening._id)}
                className={`w-full text-left p-4 transition-colors cursor-pointer ${isSelected ? 'bg-[#FAF9F6] ring-1 ring-inset ring-[#111315]/25' : 'bg-[#FFFFFF] hover:bg-[#FAF9F6]/80'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-semibold tabular-nums text-[#111315]">{item.patient.patientCode ?? '—'}</span>
                    <span className="font-mono text-[11px] tabular-nums px-2 py-0.5 rounded-full border border-[#111315]/15 bg-[#FAF9F6] text-[#111315]/75">
                      {formatPacketKB(item.screening.compressedAudioBytes)} Opus
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wide rounded border ${isUrgent ? 'bg-[#E63946] text-white border-[#E63946]' : isNormal ? 'bg-[#0D9488] text-white border-[#0D9488]' : 'bg-[#FAF9F6] text-[#111315] border-[#111315]/35'}`}>
                    {statusLabel}
                  </span>
                </div>
                <p className="text-sm font-bold text-[#111315] truncate">{item.patient.fullName ?? 'Unnamed patient'}</p>
                <p className="text-xs text-[#111315]/65 truncate">
                  {item.patient.age}y · {item.patient.sex} · {item.patient.village ?? '—'}
                </p>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#111315]/60 font-medium">Acoustic Risk Score</span>
                    <span className="font-mono font-semibold tabular-nums">{riskScore} / 100</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#111315]/10 overflow-hidden">
                    <div className={`h-full rounded-full ${isUrgent ? 'bg-[#E63946]' : isNormal ? 'bg-[#0D9488]' : 'bg-[#111315]/75'}`} style={{ width: `${Math.max(0, Math.min(100, riskScore))}%` }} />
                  </div>
                </div>
                {(item.screening.reviewStatus === 'physical_referral' || item.screening.reviewStatus === 'reviewed') && (
                  <div className="mt-2.5 pt-2 border-t border-[#111315]/8 flex items-center justify-between text-[11px]">
                    {item.screening.reviewStatus === 'physical_referral' ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-[#E63946]">
                        <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>Physical Referral Flagged</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-[#0D9488]">
                        <CheckCircle2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>Specialist Signed Off</span>
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-[#111315]/50 uppercase">{item.screening.reviewStatus}</span>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
