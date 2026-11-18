import { useEffect, useState } from 'react';
import { useQuery } from 'convex/react';
import { ChevronDown, ChevronRight, FileText, Activity, ScanLine, Maximize2, X } from 'lucide-react';
import { api } from '@convex/api';
import {
  levelFromScreening,
  type LogbookDocument,
  type PatientId,
  type ScreeningId,
} from '../lib/clinical';

interface LongitudinalLogbookProps {
  patientId: PatientId;
  activeScreeningId: ScreeningId;
}

export function LongitudinalLogbook({ patientId, activeScreeningId }: LongitudinalLogbookProps) {
  const logbook = useQuery(api.triageLogbook.getPatientLogbook, { patientId });
  const [expandedVisitId, setExpandedVisitId] = useState<string | null>(activeScreeningId);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [modalDoc, setModalDoc] = useState<LogbookDocument | null>(null);

  useEffect(() => {
    if (!modalDoc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalDoc(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalDoc]);

  if (logbook === undefined) {
    return (
      <section className="border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/90 dark:bg-[#111827]/88 rounded-xl p-4 text-xs">
        Loading longitudinal logbook...
      </section>
    );
  }

  const { screenings, documents } = logbook;

  return (
    <section
      aria-label="Longitudinal Patient Logbook"
      className="border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/90 dark:bg-[#111827]/88 backdrop-blur-md rounded-xl p-4 space-y-5"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[#111315]/10 dark:border-white/12 pb-3">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC]">
            Longitudinal Patient Logbook
          </h3>
          <p className="text-xs text-[#111315]/60 dark:text-[#F1F5F9]/60">
            Screening history, clinical briefs, and attached documents
          </p>
        </div>
        <span className="font-mono text-xs tabular-nums text-[#111315]/65 dark:text-[#F1F5F9]/65">
          {screenings.length} visits · {documents.length} docs
        </span>
      </div>

      <div className="relative pl-5 space-y-3 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-[#111315]/15 dark:before:bg-white/16">
        {screenings.map((visit) => {
          const isOpen = expandedVisitId === visit._id;
          const level = levelFromScreening(visit.level1Status, visit.riskScore);
          const isCurrent = visit._id === activeScreeningId;
          return (
            <div key={visit._id} className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-5 top-2 w-3.5 h-3.5 rounded-full border-2 border-[#FFFFFF] dark:border-[#111827] ${
                  isCurrent
                    ? level === 'urgent'
                      ? 'bg-[#E63946]'
                      : level === 'normal'
                        ? 'bg-[#0D9488]'
                        : 'bg-[#111315] dark:bg-[#F8FAFC]'
                    : 'bg-[#111315]/35 dark:bg-[#94A3B8]'
                }`}
              />
              <div className="rounded-lg border border-[#111315]/12 dark:border-white/12 bg-[#FFFFFF] dark:bg-[#1E293B]/65">
                <button
                  type="button"
                  onClick={() => setExpandedVisitId(isOpen ? null : visit._id)}
                  aria-expanded={isOpen}
                  className="w-full px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-[#FAF9F6]/70 dark:hover:bg-[#1E293B] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="font-mono text-xs font-semibold tabular-nums">
                      {new Date(visit._creationTime).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className="text-xs text-[#111315]/70 dark:text-[#F1F5F9]/70 truncate">
                      {isCurrent ? 'Open case' : visit.reviewStatus ?? 'pending_review'}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums">Risk {visit.riskScore ?? '—'}</span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-[#111315]/8 dark:border-white/10 space-y-2 text-xs">
                    <p className="leading-relaxed text-[#111315]/85 dark:text-[#F1F5F9]/85">
                      {visit.aiClinicalBrief ?? 'No clinical brief stored for this visit.'}
                    </p>
                    {visit.specialistRemarks && (
                      <p className="text-[#111315]/75 dark:text-[#F1F5F9]/75">
                        Specialist: {visit.specialistRemarks}
                      </p>
                    )}
                    <p className="font-mono text-[11px] text-[#111315]/60 dark:text-[#F1F5F9]/60">
                      Cough audio {visit.coughAudioUrl ? 'available' : 'not stored'} · Speech audio{' '}
                      {visit.speechAudioUrl ? 'available' : 'not stored'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2.5 pt-2 border-t border-[#111315]/10 dark:border-white/12">
        <h4 className="text-xs font-semibold text-[#111315]/75 dark:text-[#F1F5F9]/75">
          Attached PHC Clinical Documents & Imaging
        </h4>
        {documents.length === 0 ? (
          <p className="text-xs text-[#111315]/60 dark:text-[#F1F5F9]/60">No documents attached.</p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const isDocOpen = expandedDocId === doc._id;
              return (
                <div
                  key={doc._id}
                  className="rounded-lg border border-[#111315]/12 dark:border-white/12 bg-[#FAF9F6]/60 dark:bg-[#0B0F17]/55 overflow-hidden"
                >
                  <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedDocId(isDocOpen ? null : doc._id)}
                      className="flex-1 flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                    >
                      <DocumentTypeIcon type={doc.docType} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate">{doc.fileName}</p>
                        <p className="text-[11px] font-mono text-[#111315]/60 dark:text-[#F1F5F9]/60 truncate">
                          {doc.docType} · {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalDoc(doc)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#111315]/15 dark:border-white/18 text-[11px] font-semibold cursor-pointer"
                    >
                      <Maximize2 className="w-3 h-3" aria-hidden="true" />
                      <span>Preview</span>
                    </button>
                  </div>
                  {isDocOpen && <DocumentPreview doc={doc} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalDoc && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setModalDoc(null)}
          className="fixed inset-0 z-50 bg-[#111315]/55 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-2xl border border-[#111315]/18 dark:border-white/18 bg-[#FFFFFF] dark:bg-[#111827] shadow-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-[#111315]/10 dark:border-white/12 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold">{modalDoc.fileName}</h4>
                <p className="text-xs font-mono text-[#111315]/60 dark:text-[#F1F5F9]/60">{modalDoc.docType}</p>
              </div>
              <button type="button" onClick={() => setModalDoc(null)} aria-label="Close document preview" className="p-1.5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5">
              <DocumentPreview doc={modalDoc} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DocumentTypeIcon({ type }: { type: LogbookDocument['docType'] }) {
  if (type === 'xray') {
    return <ScanLine className="w-4 h-4 text-[#E63946] dark:text-[#FF6B77] shrink-0" aria-hidden="true" />;
  }
  if (type === 'lab_report') {
    return <Activity className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" aria-hidden="true" />;
  }
  return <FileText className="w-4 h-4 text-[#111315]/70 dark:text-[#F1F5F9]/75 shrink-0" aria-hidden="true" />;
}

function DocumentPreview({ doc }: { doc: LogbookDocument }) {
  const isImage = doc.fileUrl ? /\.(png|jpe?g|gif|webp)(\?|$)/i.test(doc.fileUrl) || doc.docType === 'xray' : false;
  return (
    <div className="border-t border-[#111315]/10 dark:border-white/10 p-3.5 space-y-3">
      {doc.notes && <p className="text-xs leading-relaxed">{doc.notes}</p>}
      {doc.fileUrl ? (
        isImage ? (
          <img src={doc.fileUrl} alt={doc.fileName} className="max-h-80 w-full object-contain rounded-lg bg-[#111315]" />
        ) : (
          <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold underline">
            Open {doc.fileName}
          </a>
        )
      ) : (
        <p className="text-xs text-[#111315]/60 dark:text-[#F1F5F9]/60">File URL is not available.</p>
      )}
    </div>
  );
}
