import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { ArrowLeft } from 'lucide-react';
import { api } from '@convex/api';
import {
  displayName,
  levelFromScreening,
  type AcousticChannelType,
  type Level1Status,
  type PatientId,
  type ScreeningId,
} from '../lib/clinical';
import type { DirectoryCategory } from './SpecialistHomeHub';
import { CATEGORY_LABELS } from './PatientDirectoryList';
import { AcousticSamplePlayer } from './AcousticSamplePlayer';
import { FftSpectrumChart } from './FftSpectrumChart';
import { LongitudinalLogbook } from './LongitudinalLogbook';
import { SpecialistSignOffPanel } from './SpecialistSignOffPanel';
import { analyzeClinicalAcoustics } from '../utils/clinicalAcousticEngine';

interface PatientDiagnosticWorkspaceProps {
  patientId: PatientId;
  screeningId: ScreeningId;
  theme: 'light' | 'dark';
  category: DirectoryCategory;
  activeChannel: AcousticChannelType;
  onChannelChange: (channel: AcousticChannelType) => void;
  playbackState: { isPlaying: boolean; progress: number };
  onPlaybackSync: (state: {
    isPlaying: boolean;
    progress: number;
    channel: AcousticChannelType;
  }) => void;
  onClinicalContext: (state: { riskScore: number | null; level1Status: Level1Status | null }) => void;
  onBackToList: () => void;
  onSignedOff: (notice: string) => void;
}

export function PatientDiagnosticWorkspace({
  patientId,
  screeningId,
  theme,
  category,
  activeChannel,
  onChannelChange,
  playbackState,
  onPlaybackSync,
  onClinicalContext,
  onBackToList,
  onSignedOff,
}: PatientDiagnosticWorkspaceProps) {
  const logbook = useQuery(api.triageLogbook.getPatientLogbook, { patientId });
  const categoryLabel = CATEGORY_LABELS[category];
  const screening =
    logbook?.screenings.find((row) => row._id === screeningId) ?? logbook?.screenings[0] ?? null;
  const level = screening
    ? levelFromScreening(screening.level1Status, screening.riskScore)
    : null;

  useEffect(() => {
    onClinicalContext({
      riskScore: screening?.riskScore ?? null,
      level1Status: level,
    });
  }, [level, onClinicalContext, screening?.riskScore]);

  if (logbook === undefined) {
    return (
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-16 text-xs text-[#111315]/70 dark:text-[#F1F5F9]/70">
        Loading patient logbook...
      </div>
    );
  }

  if (!screening) {
    return (
      <div className="relative z-10 flex-1 flex items-center justify-center px-6 py-16">
        <button type="button" onClick={onBackToList} className="text-xs font-semibold underline">
          No screening found. Back to {categoryLabel}
        </button>
      </div>
    );
  }

  const patient = logbook.patient;
  const isUrgent = level === 'urgent';
  const isNormal = level === 'normal';
  const statusLabel = isUrgent ? 'URGENT' : isNormal ? 'NORMAL' : 'MONITOR';
  const statusClass = isUrgent
    ? 'bg-[#E63946] text-white border-[#E63946]'
    : isNormal
      ? 'bg-[#0D9488] text-white border-[#0D9488]'
      : 'bg-[#FAF9F6] dark:bg-[#1E293B] text-[#111315] dark:text-[#F8FAFC] border-[#111315]/35 dark:border-white/25';

  const stored = screening as typeof screening & {
    symptomNotes?: string;
    spo2Percent?: number;
    respiratoryRate?: number;
    temperatureC?: number;
  };
  const clinical = analyzeClinicalAcoustics({
    frequencyChartData: screening.frequencyChartData ?? null,
    spO2: stored.spo2Percent ?? null,
    respiratoryRate: stored.respiratoryRate ?? null,
    temperatureC: stored.temperatureC ?? null,
    age: patient.age,
    symptomNotes: stored.symptomNotes || screening.rawTranscript || '',
  });

  return (
    <div className="relative z-10 flex-1 flex flex-col">
      <div className="sticky top-0 z-20 border-b border-[#111315]/12 dark:border-white/12 bg-[#FAF9F6]/90 dark:bg-[#0B0F17]/88 backdrop-blur-md px-6 lg:px-10 py-3.5 transition-colors">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={onBackToList}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#111315]/15 dark:border-white/18 bg-[#FFFFFF] dark:bg-[#1E293B] hover:bg-[#111315] hover:text-[#FAF9F6] dark:hover:bg-[#F8FAFC] dark:hover:text-[#111315] text-xs font-semibold text-[#111315] dark:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Back to {categoryLabel} List</span>
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold tabular-nums text-[#111315]/75 dark:text-[#F1F5F9]/75">
                  {patient.patientCode ?? '—'}
                </span>
                <span className="text-[#111315]/30 dark:text-white/30" aria-hidden="true">
                  ·
                </span>
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC] truncate">
                  {displayName(patient.fullName, 'Unnamed patient')}
                </h1>
                <span className={`px-2.5 py-0.5 text-[10px] font-mono font-semibold tracking-wide rounded border whitespace-nowrap ${statusClass}`}>
                  {statusLabel}
                </span>
              </div>
              <p className="text-xs text-[#111315]/65 dark:text-[#F1F5F9]/65 truncate">
                {patient.age}y · {patient.sex} · {patient.village ?? 'Village not recorded'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 font-mono tabular-nums text-xs border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/90 dark:bg-[#111827]/90 rounded-lg px-3.5 py-2 shrink-0">
            <div>
              <span className="block text-[10px] text-[#111315]/55 dark:text-[#F1F5F9]/55">Risk</span>
              <span className={`font-semibold ${isUrgent ? 'text-[#E63946] dark:text-[#FF6B77]' : isNormal ? 'text-[#0D9488] dark:text-[#2DD4BF]' : 'text-[#111315] dark:text-[#F8FAFC]'}`}>
                {screening.riskScore ?? '—'}/100
              </span>
            </div>
            <span className="h-6 w-px bg-[#111315]/10 dark:bg-white/12" aria-hidden="true" />
            <div>
              <span className="block text-[10px] text-[#111315]/55 dark:text-[#F1F5F9]/55">Review</span>
              <span className="font-semibold text-[#111315] dark:text-[#F8FAFC]">
                {screening.reviewStatus ?? 'pending_review'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 lg:px-10 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          <section className="border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/90 dark:bg-[#111827]/88 rounded-xl p-4 space-y-2">
            <h2 className="text-sm font-bold text-[#111315] dark:text-[#F8FAFC]">Differential Probability Matrix</h2>
            {(['bacterialPneumonia', 'bronchospasm', 'pulmonaryTb', 'urti'] as const).map((key) => (
              <div key={key}>
                <div className="flex justify-between text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]">
                  <span>{clinical.labels[key]}</span>
                  <span>{clinical.probabilities[key]}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#111315]/10 dark:bg-white/10">
                  <div className="h-1.5 rounded-full bg-[#111315] dark:bg-[#F8FAFC]" style={{ width: `${clinical.probabilities[key]}%` }} />
                </div>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-[#111315]/80 dark:text-[#F1F5F9]/80">{clinical.brief.translation}</p>
          </section>
          <AcousticSamplePlayer
            playbackKey={screening._id}
            coughAudioUrl={screening.coughAudioUrl}
            speechAudioUrl={screening.speechAudioUrl}
            level1Status={level}
            theme={theme}
            activeChannel={activeChannel}
            onChannelChange={onChannelChange}
            onPlaybackSync={onPlaybackSync}
          />
          <FftSpectrumChart
            frequencyChartData={screening.frequencyChartData ?? null}
            level1Status={level}
            theme={theme}
            activeChannel={activeChannel}
            isPlaying={playbackState.isPlaying}
            playbackProgress={playbackState.progress}
          />
          <LongitudinalLogbook patientId={patientId} activeScreeningId={screening._id} />
        </div>
        <div className="lg:col-span-5">
          <SpecialistSignOffPanel
            key={screening._id}
            patient={patient}
            screening={screening}
            onSignedOff={onSignedOff}
          />
        </div>
      </main>
    </div>
  );
}
