import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@convex/api';
import {
  displayName,
  levelFromScreening,
  type LogbookScreening,
  type PatientLogbook,
} from '../lib/clinical';
import { analyzeClinicalAcoustics } from '../utils/clinicalAcousticEngine';
import { locateNearestFacility } from '../utils/nearestFacilityLocator';

interface SpecialistSignOffPanelProps {
  patient: PatientLogbook['patient'];
  screening: LogbookScreening;
  onSignedOff: (notice: string) => void;
}

type StoredClinical = LogbookScreening & {
  symptomNotes?: string;
  spo2Percent?: number;
  respiratoryRate?: number;
  temperatureC?: number;
  provisionalMedication?: string;
  medicationApproved?: boolean;
  approvedMedication?: string;
  reviewedByName?: string;
  reviewedByPhone?: string;
  reviewedByFacility?: string;
  reviewedByDistrict?: string;
};

export function SpecialistSignOffPanel({
  patient,
  screening,
  onSignedOff,
}: SpecialistSignOffPanelProps) {
  const stored = screening as StoredClinical;
  const clinical = useMemo(
    () =>
      analyzeClinicalAcoustics({
        frequencyChartData: screening.frequencyChartData ?? null,
        spO2: stored.spo2Percent ?? null,
        respiratoryRate: stored.respiratoryRate ?? null,
        temperatureC: stored.temperatureC ?? null,
        age: patient.age,
        symptomNotes: stored.symptomNotes || screening.rawTranscript || '',
      }),
    [patient.age, screening, stored.respiratoryRate, stored.spo2Percent, stored.symptomNotes, stored.temperatureC],
  );
  const specialist = useQuery(api.triageLogbook.getMyStaffProfile, { role: 'city_specialist' });
  const submitReview = useMutation(api.triageLogbook.submitSpecialistReview);
  const nearest = useMemo(
    () =>
      locateNearestFacility({
        village: patient.village,
        district: stored.reviewedByDistrict || specialist?.district,
      }),
    [patient.village, specialist?.district, stored.reviewedByDistrict],
  );
  const [remarks, setRemarks] = useState(screening.specialistRemarks ?? '');
  const [physicalReferralFlag, setPhysicalReferralFlag] = useState(
    screening.physicalReferralFlag === true,
  );
  const [referralInstructions, setReferralInstructions] = useState(
    screening.referralInstructions ?? '',
  );
  const [prescription, setPrescription] = useState(
    stored.provisionalMedication || clinical.protocol.lines.join('\n'),
  );
  const [approveMedication, setApproveMedication] = useState(stored.medicationApproved === true);
  const [contactPhone, setContactPhone] = useState(
    stored.reviewedByPhone || specialist?.phoneNumber || '',
  );
  const [hospitalName, setHospitalName] = useState(
    stored.reviewedByFacility || specialist?.facilityName || '',
  );
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const level = levelFromScreening(screening.level1Status, screening.riskScore);
  const patientCode = patient.patientCode ?? 'SV';
  const keys = ['bacterialPneumonia', 'bronchospasm', 'pulmonaryTb', 'urti'] as const;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    const instructions = referralInstructions.trim();
    const medication = prescription.trim();
    try {
      await submitReview({
        screeningId: screening._id,
        specialistRemarks: remarks.trim(),
        physicalReferralFlag,
        ...(instructions ? { referralInstructions: instructions } : {}),
        ...(medication ? { provisionalMedication: medication, approvedMedication: medication } : {}),
        medicationApproved: approveMedication,
        ...(specialist?.fullName ? { reviewedByName: specialist.fullName } : {}),
        ...(contactPhone.trim() ? { reviewedByPhone: contactPhone.trim() } : {}),
        ...(hospitalName.trim() ? { reviewedByFacility: hospitalName.trim() } : {}),
        ...(specialist?.district ? { reviewedByDistrict: specialist.district } : {}),
      });
      const timestamp = new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const notice = `Clinical sign-off saved for ${patientCode} (${displayName(patient.fullName, 'patient')})${
        physicalReferralFlag ? ' — flagged for mandatory physical referral.' : approveMedication ? ' — provisional PHC medication approved.' : '.'
      }`;
      setSubmittedNotice(`Signed off at ${timestamp}`);
      onSignedOff(notice);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Sign-off could not be saved.');
      setIsSubmitting(false);
    }
  };

  return (
    <aside className="flex flex-col gap-5">
      <section
        aria-label="AI Clinical Assistant"
        className="border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/90 dark:bg-[#111827]/88 backdrop-blur-md rounded-xl p-4 space-y-4"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[#111315]/10 dark:border-white/12 pb-2.5">
          <h2 className="text-sm font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC]">
            AI Clinical Assistant
          </h2>
          <span className="font-mono text-[11px] font-semibold tabular-nums text-[#111315] dark:text-[#F8FAFC]">
            Risk {screening.riskScore ?? '—'}/100 · {level}
          </span>
        </div>
        {clinical.signalWarning && (
          <p className="text-xs text-[#E63946] dark:text-[#FF6B77]">{clinical.signalWarning}</p>
        )}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#111315]/60 dark:text-[#F1F5F9]/60">
            Differential Probability Matrix
          </p>
          {keys.map((key) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between gap-2 text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]">
                <span>{clinical.labels[key]}</span>
                <span>{clinical.probabilities[key]}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#111315]/10 dark:bg-white/10">
                <div className="h-1.5 rounded-full bg-[#111315] dark:bg-[#F8FAFC] transition-all duration-300 ease-out" style={{ width: `${clinical.probabilities[key]}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-[#111315]/70 dark:text-[#F1F5F9]/70">Acoustic & Frequency Correlation</p>
          <p className="text-xs leading-relaxed text-[#111315] dark:text-[#F8FAFC]">
            {clinical.brief.acoustic}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-[#111315]/70 dark:text-[#F1F5F9]/70">Vitals Correlation</p>
          <p className="text-xs leading-relaxed text-[#111315] dark:text-[#F8FAFC]">
            {clinical.brief.vitals}
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-[#111315]/70 dark:text-[#F1F5F9]/70">Nurse Field Notes</p>
          <p className="rounded-lg bg-[#FAF9F6] dark:bg-[#0B0F17]/75 border border-[#111315]/10 dark:border-white/12 p-3 text-xs leading-relaxed">
            {clinical.brief.originalNotes}
          </p>
          <p className="text-[11px] font-semibold text-[#111315]/70 dark:text-[#F1F5F9]/70">English Translation</p>
          <p className="rounded-lg bg-[#FAF9F6] dark:bg-[#0B0F17]/75 border border-[#111315]/10 dark:border-white/12 p-3 text-xs leading-relaxed">
            {clinical.brief.translation}
          </p>
        </div>
        <p className="text-xs leading-relaxed text-[#111315]/85 dark:text-[#F1F5F9]/85">
          {clinical.brief.nextSteps}
        </p>
        <p className="text-[11px] font-semibold text-[#111315]/70">Nearest Referral Hospital & Specialist</p>
        <p className="text-xs leading-relaxed">
          {nearest.hospitalName} · {nearest.distanceKm} km · {nearest.specialistName} · {nearest.phone}
        </p>
      </section>

      <section
        aria-label="Specialist Triage Sign-Off"
        className="border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/90 dark:bg-[#111827]/88 backdrop-blur-md rounded-xl p-4"
      >
        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-[#111315]/10 dark:border-white/12 pb-2.5">
            <h2 className="text-sm font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC]">
              Specialist Triage & Sign-Off
            </h2>
            <span className="font-mono text-[11px] text-[#111315]/55 dark:text-[#F1F5F9]/55">
              {patientCode}
            </span>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="specialist-remarks"
              className="block text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]"
            >
              Specialist Remarks
            </label>
            <textarea
              id="specialist-remarks"
              rows={3}
              value={remarks}
              onChange={(e) => {
                setRemarks(e.target.value);
                setSubmittedNotice(null);
              }}
              placeholder="Document auscultation impression, acoustic correlation, and differential diagnosis..."
              className="w-full rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 px-3 py-2 text-xs text-[#111315] dark:text-[#F8FAFC] placeholder:text-[#111315]/40 dark:placeholder:text-[#F1F5F9]/40 focus:bg-[#FFFFFF] dark:focus:bg-[#0B0F17] focus:outline-none focus:border-[#111315] dark:focus:border-[#F8FAFC]"
            />
          </div>

          <div
            className={`rounded-lg border p-3 transition-colors ${
              physicalReferralFlag
                ? 'border-[#E63946] bg-[#E63946]/[0.06] dark:bg-[#E63946]/[0.14]'
                : 'border-[#111315]/15 dark:border-white/15 bg-[#FAF9F6] dark:bg-[#0B0F17]/75'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <label
                  htmlFor="physical-referral-toggle"
                  className={`block text-xs font-bold cursor-pointer ${
                    physicalReferralFlag
                      ? 'text-[#E63946] dark:text-[#FF6B77]'
                      : 'text-[#111315] dark:text-[#F8FAFC]'
                  }`}
                >
                  Flag for Mandatory Physical Hospital Referral
                </label>
                <p className="text-[11px] text-[#111315]/65 dark:text-[#F1F5F9]/65 mt-0.5">
                  Escalates patient to District Hospital red-flag dispatch queue
                </p>
              </div>
              <button
                id="physical-referral-toggle"
                type="button"
                role="switch"
                aria-checked={physicalReferralFlag}
                onClick={() => {
                  setPhysicalReferralFlag((prev) => !prev);
                  setSubmittedNotice(null);
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315] dark:focus-visible:outline-[#F8FAFC] ${
                  physicalReferralFlag ? 'bg-[#E63946]' : 'bg-[#111315]/25 dark:bg-white/25'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[#FFFFFF] shadow-sm transition-transform duration-150 ${
                    physicalReferralFlag ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {physicalReferralFlag && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#E63946] dark:text-[#FF6B77]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Red-Flag Escalation Active — PHC ANM will receive immediate SMS alert</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="phc-rx" className="block text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]">
                Approved Medication Protocol
              </label>
              <button
                type="button"
                onClick={() => {
                  setApproveMedication((prev) => !prev);
                  setSubmittedNotice(null);
                }}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                  approveMedication ? 'bg-[#0D9488] text-white' : 'bg-[#111315] text-[#FAF9F6]'
                }`}
              >
                {approveMedication ? 'Medication approved' : 'Approve Provisional PHC Medication'}
              </button>
            </div>
            <textarea
              id="phc-rx"
              rows={3}
              value={prescription}
              onChange={(e) => {
                setPrescription(e.target.value);
                setSubmittedNotice(null);
              }}
              className="w-full rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 px-3 py-2 text-xs text-[#111315] dark:text-[#F8FAFC] focus:outline-none focus:border-[#111315] dark:focus:border-[#F8FAFC]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="doc-phone" className="block text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]">
                Direct Contact Phone Number
              </label>
              <input
                id="doc-phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => {
                  setContactPhone(e.target.value);
                  setSubmittedNotice(null);
                }}
                placeholder="+91…"
                className="w-full rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 px-3 py-2 text-xs text-[#111315] dark:text-[#F8FAFC] focus:outline-none focus:border-[#111315]"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="doc-hospital" className="block text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]">
                Hospital / Clinic Name
              </label>
              <input
                id="doc-hospital"
                type="text"
                value={hospitalName}
                onChange={(e) => {
                  setHospitalName(e.target.value);
                  setSubmittedNotice(null);
                }}
                placeholder="District Hospital Satara"
                className="w-full rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 px-3 py-2 text-xs text-[#111315] dark:text-[#F8FAFC] focus:outline-none focus:border-[#111315]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="referral-instructions"
              className="block text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]"
            >
              Referral Instructions
            </label>
            <input
              id="referral-instructions"
              type="text"
              value={referralInstructions}
              onChange={(e) => {
                setReferralInstructions(e.target.value);
                setSubmittedNotice(null);
              }}
              placeholder={
                physicalReferralFlag
                  ? 'e.g., Immediate Chest PA X-ray + Sputum CBNAAT at District Hospital'
                  : 'e.g., Continue inhaled bronchodilator; re-screen in 14 days'
              }
              className="w-full rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 px-3 py-2 text-xs text-[#111315] dark:text-[#F8FAFC] placeholder:text-[#111315]/40 dark:placeholder:text-[#F1F5F9]/40 focus:bg-[#FFFFFF] dark:focus:bg-[#0B0F17] focus:outline-none focus:border-[#111315] dark:focus:border-[#F8FAFC]"
            />
          </div>

          <div className="space-y-2 pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold tracking-tight transition-colors cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315] dark:focus-visible:outline-[#F8FAFC] ${
                physicalReferralFlag
                  ? 'bg-[#E63946] text-white hover:bg-[#d32f3c]'
                  : 'bg-[#111315] dark:bg-[#F8FAFC] text-[#FAF9F6] dark:text-[#111315] hover:bg-[#111315]/88 dark:hover:bg-[#E2E8F0]'
              }`}
            >
              {isSubmitting ? 'Saving sign-off…' : 'Submit Clinical Sign-Off'}
            </button>

            {errorMessage && (
              <p role="alert" className="text-[11px] text-[#E63946] dark:text-[#FF6B77]">
                {errorMessage}
              </p>
            )}

            {(submittedNotice || screening.reviewStatus === 'reviewed' || screening.reviewStatus === 'physical_referral') && (
              <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#0D9488] dark:text-[#2DD4BF] pt-1">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{submittedNotice ?? 'Specialist review on file'}</span>
                </span>
                <span className="uppercase">{screening.reviewStatus ?? 'pending_review'}</span>
              </div>
            )}
          </div>
        </form>
      </section>
    </aside>
  );
}
