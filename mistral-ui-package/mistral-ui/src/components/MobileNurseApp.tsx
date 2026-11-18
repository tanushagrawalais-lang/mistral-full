import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Camera,
  LogOut,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Search,
  Send,
  Square,
  UserRound,
} from "lucide-react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";
import type { FunctionReturnType } from "convex/server";
import type { StaffProfile } from "../lib/clinical";
import nurseBg from "../assets/images/nurse_bg.jpg";
import {
  EdgeAudioRecorder,
  describeMicrophoneError,
  formatOpusKb,
  type CaptureResult,
} from "../utils/edgeAudioRecorder";
import {
  analyzeClinicalAcoustics,
  type ClinicalEngineResult,
} from "../utils/clinicalAcousticEngine";
import { locateNearestFacility } from "../utils/nearestFacilityLocator";

const glass = "bg-[#111315]/75 backdrop-blur-md border border-white/15 text-white";

type QueueRow = FunctionReturnType<typeof api.triageLogbook.getSpecialistTriageQueue>[number];
type IntakeMode = "new" | "existing";
type NurseStep = 1 | 2 | 3;
type NurseScreen = "home" | "triage" | "signoffs";
type Sex = "M" | "F" | "O";

interface MobileNurseAppProps {
  nurse: StaffProfile;
  onSignOut: () => void;
}

function detectPreferredLang(notes: string): "hi" | "en" | "mr" | "ta" | "te" | "bn" | "kn" {
  if (/[\u0C80-\u0CFF]/.test(notes)) return "kn";
  if (/[\u0900-\u097F]/.test(notes)) return /[\u0900-\u097F]/.test(notes) && /मराठी|आहे/.test(notes) ? "mr" : "hi";
  if (/[\u0B80-\u0BFF]/.test(notes)) return "ta";
  if (/[\u0C00-\u0C7F]/.test(notes)) return "te";
  if (/[\u0980-\u09FF]/.test(notes)) return "bn";
  return "en";
}

function isStoragePayload(value: unknown): value is { storageId: Id<"_storage"> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "storageId" in value &&
    typeof (value as { storageId?: unknown }).storageId === "string"
  );
}

export function MobileNurseApp({ nurse, onSignOut }: MobileNurseAppProps) {
  const nurseProfile = useQuery(api.triageLogbook.getMyStaffProfile, { role: "nurse" });
  const upsertStaffProfile = useMutation(api.triageLogbook.upsertStaffProfile);
  const generateAudioUploadUrl = useMutation(api.triageLogbook.generateAudioUploadUrl);
  const createPatient = useMutation(api.triageLogbook.createLogbookPatient);
  const submitScreening = useMutation(api.triageLogbook.submitTriageScreening);
  const attachDocument = useMutation(api.triageLogbook.attachPatientDocument);
  const nurseName = nurseProfile?.fullName || nurse.fullName;

  useEffect(() => {
    if (nurseProfile === undefined || nurseProfile !== null) return;
    void upsertStaffProfile({
      role: "nurse",
      fullName: nurse.fullName || "helena",
      facilityName: "Rural PHC Field Unit",
      district: "Satara",
    });
  }, [nurse.fullName, nurseProfile, upsertStaffProfile]);

  const [screen, setScreen] = useState<NurseScreen>("home");
  const [step, setStep] = useState<NurseStep>(1);
  const signoffs = useQuery(
    api.triageLogbook.getSpecialistTriageQueue,
    screen === "signoffs" ? {} : "skip",
  );
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("new");
  const [search, setSearch] = useState("");
  const patients = useQuery(api.triageLogbook.searchOrListPatients, intakeMode === "existing" ? { search } : "skip");

  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex>("F");
  const [village, setVillage] = useState("");
  const [spo2, setSpo2] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");
  const [temperatureC, setTemperatureC] = useState("");
  const [symptomNotes, setSymptomNotes] = useState("");
  const [existingPatientId, setExistingPatientId] = useState<Id<"patients"> | null>(null);

  const [cough, setCough] = useState<CaptureResult | null>(null);
  const [phonation, setPhonation] = useState<CaptureResult | null>(null);
  const [patientId, setPatientId] = useState<Id<"patients"> | null>(null);
  const [screeningId, setScreeningId] = useState<Id<"screenings"> | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachNotice, setAttachNotice] = useState<string | null>(null);
  const [report, setReport] = useState<ClinicalEngineResult | null>(null);
  const [selectedSignoffId, setSelectedSignoffId] = useState<Id<"screenings"> | null>(null);
  const selectedSignoff = signoffs?.find((row) => row.screening._id === selectedSignoffId) ?? null;

  const spo2Value = spo2.trim() ? Number(spo2) : null;
  const rrValue = respiratoryRate.trim() ? Number(respiratoryRate) : null;
  const tempValue = temperatureC.trim() ? Number(temperatureC) : null;

  const intakeReady =
    intakeMode === "existing"
      ? existingPatientId !== null
      : fullName.trim().length > 1 &&
        Number.isInteger(Number(age)) &&
        Number(age) >= 1 &&
        Number(age) <= 120 &&
        village.trim().length > 0;

  const resetAll = () => {
    setStep(1);
    setIntakeMode("new");
    setSearch("");
    setFullName("");
    setAge("");
    setSex("F");
    setVillage("");
    setSpo2("");
    setRespiratoryRate("");
    setTemperatureC("");
    setSymptomNotes("");
    setExistingPatientId(null);
    cough?.objectUrl && URL.revokeObjectURL(cough.objectUrl);
    phonation?.objectUrl && URL.revokeObjectURL(phonation.objectUrl);
    setCough(null);
    setPhonation(null);
    setPatientId(null);
    setScreeningId(null);
    setDispatching(false);
    setError(null);
    setAttachNotice(null);
    setReport(null);
    setScreen("home");
    setSelectedSignoffId(null);
  };

  const handleDispatch = async () => {
    if (!cough || !phonation) return;
    setError(null);
    setDispatching(true);
    try {
      let nextPatientId = existingPatientId;
      if (intakeMode === "new" || nextPatientId === null) {
        const notes = [
          symptomNotes.trim() || undefined,
          spo2Value !== null ? `SpO2 ${spo2Value}%` : undefined,
          rrValue !== null ? `RR ${rrValue}` : undefined,
          tempValue !== null ? `Temp ${tempValue}C` : undefined,
        ].filter((item): item is string => Boolean(item));
        nextPatientId = await createPatient({
          fullName: fullName.trim(),
          age: Number(age),
          sex,
          village: village.trim(),
          preferredLang: detectPreferredLang(symptomNotes),
          smokingHistory: false,
          ...(notes.length > 0 ? { chronicConditions: notes } : {}),
        });
      }
      const [coughId, speechId] = await Promise.all([
        uploadBlob(generateAudioUploadUrl, cough),
        uploadBlob(generateAudioUploadUrl, phonation),
      ]);
      const compressedAudioBytes = cough.compressedAudioBytes + phonation.compressedAudioBytes;
      const frequencyChartData = {
        fftBins: cough.frequencyChartData.fftBins,
        fundamentalFreqHz: phonation.frequencyChartData.fundamentalFreqHz,
        spectralCentroidHz: cough.frequencyChartData.spectralCentroidHz,
        zeroCrossingRate: cough.frequencyChartData.zeroCrossingRate,
        peakRmsEnergy: Math.max(
          cough.frequencyChartData.peakRmsEnergy,
          phonation.frequencyChartData.peakRmsEnergy,
        ),
      };
      const clinical = analyzeClinicalAcoustics({
        frequencyChartData,
        spO2: spo2Value,
        respiratoryRate: rrValue,
        temperatureC: tempValue,
        age: Number(age) || null,
        symptomNotes,
      });
      setReport(clinical);
      setStep(3);
      const notes = symptomNotes.trim();
      const id = await submitScreening({
        patientId: nextPatientId,
        coughAudioId: coughId,
        speechAudioId: speechId,
        compressedAudioBytes,
        rawAudioBytes: compressedAudioBytes,
        frequencyChartData,
        ...(notes ? { symptomNotes: notes, rawTranscript: notes } : {}),
        ...(spo2Value !== null ? { spo2Percent: spo2Value } : {}),
        ...(rrValue !== null ? { respiratoryRate: rrValue } : {}),
        ...(tempValue !== null ? { temperatureC: tempValue } : {}),
        provisionalMedication: clinical.protocol.lines.join(" "),
        aiClinicalBrief: clinical.brief.synthesis,
        translatedEnText: clinical.brief.translation,
        level1Status: clinical.level1,
        predictedConditions: (Object.keys(clinical.probabilities) as Array<keyof typeof clinical.probabilities>).map(
          (key) => ({
            label: clinical.labels[key],
            confidence: clinical.probabilities[key] / 100,
          }),
        ),
      });
      setPatientId(nextPatientId);
      setScreeningId(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "3G dispatch failed. Retry when the signal is stable.");
    } finally {
      setDispatching(false);
    }
  };

  const handleAttach = async (file: File) => {
    if (!patientId) return;
    setAttachNotice(null);
    try {
      const uploadUrl = await generateAudioUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!response.ok) throw new Error("Document upload failed.");
      const payload: unknown = await response.json();
      if (!isStoragePayload(payload)) throw new Error("Upload did not return a storage id.");
      const docType = /x-?ray|dicom|chest/i.test(file.name) || file.type.startsWith("image/")
        ? "xray"
        : "lab_report";
      await attachDocument({
        patientId,
        ...(screeningId ? { screeningId } : {}),
        fileId: payload.storageId,
        fileName: file.name,
        docType,
        notes: "PHC field capture",
      });
      setAttachNotice(`${file.name} attached to the logbook.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not attach this file.");
    }
  };

  return (
    <div
      className="min-h-dvh text-white bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url(${nurseBg})` }}
    >
      <div className="max-w-[430px] mx-auto min-h-dvh flex flex-col">
        <header className="sticky top-0 z-20 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 bg-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-serif text-2xl font-bold leading-none">Mistral</p>
              <p className="mt-1 text-[11px] font-medium truncate text-white/80">{nurseName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {screen !== "home" && (
                <button
                  type="button"
                  onClick={() => {
                    setScreen("home");
                    setSelectedSignoffId(null);
                  }}
                  className={`min-h-12 px-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 ${glass}`}
                >
                  Home
                </button>
              )}
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                className={`inline-flex items-center justify-center min-h-12 min-w-12 rounded-full transition-all duration-200 active:scale-95 ${glass}`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className={`flex-1 ${screen === "home" ? "flex flex-col" : "px-4 py-4 space-y-4 pb-28"}`}>
          {error && (
            <p role="alert" className={`mx-4 rounded-xl border border-[#E63946]/40 bg-[#E63946]/20 px-3 py-3 text-xs ${screen === "home" ? "mt-4" : ""}`}>
              {error}
            </p>
          )}

          {screen === "home" && (
            <section className="grid grid-cols-2 gap-4 my-auto px-4">
              <button
                type="button"
                onClick={() => {
                  setScreen("triage");
                  setStep(1);
                  setError(null);
                }}
                className={`${glass} aspect-square p-4 rounded-2xl flex flex-col justify-between text-left transition-all duration-200 active:scale-95 hover:border-white/30`}
              >
                <p className="text-base font-bold">New Triage</p>
                <p className="text-xs leading-relaxed text-white/70">Vitals & audio capture</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setScreen("signoffs");
                  setSelectedSignoffId(null);
                }}
                className={`${glass} aspect-square p-4 rounded-2xl flex flex-col justify-between text-left transition-all duration-200 active:scale-95 hover:border-white/30`}
              >
                <p className="text-base font-bold">Doctor Reviews</p>
                <p className="text-xs leading-relaxed text-white/70">Rx & specialist sign-offs</p>
              </button>
            </section>
          )}

          {screen === "signoffs" && (
            <section className="space-y-3">
              <h1 className="text-lg font-bold">Doctor Reviews</h1>
              {selectedSignoff ? (
                <SignOffDetail
                  row={selectedSignoff}
                  onBack={() => setSelectedSignoffId(null)}
                />
              ) : (
                <>
                  {(signoffs ?? []).map((row) => {
                    const status =
                      row.screening.physicalReferralFlag || row.screening.reviewStatus === "physical_referral"
                        ? "Urgent Hospital Referral"
                        : row.screening.medicationApproved
                          ? "Medication Approved by Specialist"
                          : "Pending Doctor Review";
                    return (
                      <button
                        key={row.screening._id}
                        type="button"
                        onClick={() => setSelectedSignoffId(row.screening._id)}
                        className={`w-full text-left rounded-2xl p-4 space-y-2 transition-all duration-200 active:scale-95 hover:border-white/30 ${glass}`}
                      >
                        <p className="text-sm font-bold">{row.patient.fullName ?? "Unnamed patient"}</p>
                        <p className="text-[11px] font-mono text-white/60">
                          {row.patient.patientCode ?? "—"} · {row.patient.village ?? "—"}
                        </p>
                        <p className="text-xs font-bold">{status}</p>
                      </button>
                    );
                  })}
                  {signoffs !== undefined && signoffs.length === 0 && (
                    <p className="text-xs text-white/70">No screened patients yet.</p>
                  )}
                </>
              )}
            </section>
          )}

          {screen === "triage" && step === 1 && (
            <section className="space-y-4">
              <h1 className="text-lg font-bold">Patient & Vitals Intake</h1>
              <div className="grid grid-cols-2 gap-2">
                {(["new", "existing"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setIntakeMode(mode);
                      setExistingPatientId(null);
                    }}
                    className={`min-h-12 rounded-xl border text-sm font-bold transition-all duration-200 ${
                      intakeMode === mode
                        ? "bg-white text-[#111315] border-white"
                        : `${glass} hover:border-white/30`
                    }`}
                  >
                    {mode === "new" ? "New Patient" : "Existing Patient"}
                  </button>
                ))}
              </div>

              {intakeMode === "existing" ? (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold">
                    Search roster
                    <div className="relative mt-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Name, code, or phone"
                        className={`w-full min-h-12 pl-10 pr-3 rounded-xl text-base ${glass} placeholder:text-white/40`}
                      />
                    </div>
                  </label>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {(patients ?? []).map((patient) => (
                      <button
                        key={patient._id}
                        type="button"
                        onClick={() => {
                          setExistingPatientId(patient._id);
                          setFullName(patient.fullName ?? "");
                          setAge(String(patient.age));
                          setSex(patient.sex);
                          setVillage(patient.village ?? "");
                        }}
                        className={`w-full min-h-12 rounded-xl px-3 py-3 text-left ${glass} ${
                          existingPatientId === patient._id ? "border-white/50" : "hover:border-white/30"
                        }`}
                      >
                        <p className="text-sm font-bold">{patient.fullName ?? "Unnamed"}</p>
                        <p className="text-[11px] font-mono text-white/60">
                          {patient.patientCode ?? "—"} · {patient.age}y {patient.sex} · {patient.village ?? "—"}
                        </p>
                      </button>
                    ))}
                    {patients !== undefined && patients.length === 0 && (
                      <p className="text-xs text-white/70">No matching patients in this PHC roster.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Patient name" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Age" value={age} onChange={setAge} placeholder="Years" inputMode="numeric" />
                    <div className="space-y-1">
                      <span className="block text-xs font-semibold">Sex</span>
                      <div className="grid grid-cols-3 gap-1">
                        {(["F", "M", "O"] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setSex(option)}
                            className={`min-h-12 rounded-xl border text-sm font-bold ${
                              sex === option ? "bg-white text-[#111315] border-white" : glass
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Field label="Village" value={village} onChange={setVillage} placeholder="Village / hamlet" />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Field label="SpO2 %" value={spo2} onChange={setSpo2} placeholder="98" inputMode="numeric" />
                <Field label="RR / min" value={respiratoryRate} onChange={setRespiratoryRate} placeholder="18" inputMode="numeric" />
                <Field label="Temp °C" value={temperatureC} onChange={setTemperatureC} placeholder="36.8" inputMode="decimal" />
              </div>
              <label className="block text-xs font-semibold">
                Symptom notes (Hindi / regional / English)
                <textarea
                  value={symptomNotes}
                  onChange={(event) => setSymptomNotes(event.target.value)}
                  rows={3}
                  placeholder="खाँसी, बुखार / cough, fever"
                  className={`mt-1 w-full min-h-24 rounded-xl px-3 py-3 text-base placeholder:text-white/40 ${glass}`}
                />
              </label>
            </section>
          )}

          {screen === "triage" && step === 2 && (
            <section className="space-y-4">
              <h1 className="text-lg font-bold">Guided 5-Second Acoustic Capture</h1>
              <CaptureCard
                title="Voluntary Cough"
                capture={cough}
                onCapture={(result) => {
                  cough?.objectUrl && URL.revokeObjectURL(cough.objectUrl);
                  setCough(result);
                }}
                onRetake={() => {
                  cough?.objectUrl && URL.revokeObjectURL(cough.objectUrl);
                  setCough(null);
                }}
                onError={(message) => setError(message || null)}
              />
              <CaptureCard
                title={'Sustained "Aaa" Phonation'}
                capture={phonation}
                onCapture={(result) => {
                  phonation?.objectUrl && URL.revokeObjectURL(phonation.objectUrl);
                  setPhonation(result);
                }}
                onRetake={() => {
                  phonation?.objectUrl && URL.revokeObjectURL(phonation.objectUrl);
                  setPhonation(null);
                }}
                onError={(message) => setError(message || null)}
              />
            </section>
          )}

          {screen === "triage" && step === 3 && report && (
            <section className="space-y-4">
              <h1 className="text-lg font-bold">Instant Clinical Triage Report</h1>
              {report.signalWarning && (
                <p className={`rounded-xl border border-[#E63946]/40 bg-[#E63946]/20 px-3 py-3 text-xs`}>{report.signalWarning}</p>
              )}
              <div className={`rounded-2xl p-4 space-y-3 ${glass}`}>
                <p className="text-[11px] font-mono uppercase tracking-widest">Top differential probabilities</p>
                {(Object.keys(report.probabilities) as Array<keyof typeof report.probabilities>).map((key) => (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between gap-2 text-xs font-semibold">
                      <span>{report.labels[key]}</span>
                      <span>{report.probabilities[key]}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/15">
                      <div className="h-2 rounded-full bg-white transition-all duration-300 ease-out" style={{ width: `${report.probabilities[key]}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className={`rounded-2xl p-4 text-xs leading-relaxed ${glass}`}>
                {report.brief.acoustic} {report.brief.vitals}
              </p>
              <div className={`rounded-2xl p-4 space-y-2 ${glass}`}>
                <p className="text-xs font-bold">{report.protocol.title}</p>
                <span className="inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold tracking-wide">
                  AWAITING CITY DOCTOR APPROVAL
                </span>
                {report.protocol.lines.map((line) => (
                  <p key={line} className="text-xs leading-relaxed">{line}</p>
                ))}
              </div>
              {attachNotice && <p className="text-xs font-medium text-[#0D9488]">{attachNotice}</p>}
              <label className={`flex items-center justify-center gap-2 min-h-12 rounded-xl text-sm font-bold ${glass}`}>
                <Camera className="w-4 h-4" />
                Attach X-ray / lab photo
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleAttach(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </section>
          )}
        </main>

        {screen === "triage" && (
        <div className="sticky bottom-0 z-20 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 bg-transparent">
          {screen === "triage" && step === 1 && (
            <button
              type="button"
              disabled={!intakeReady}
              onClick={() => {
                setError(null);
                setStep(2);
              }}
              className={`w-full min-h-12 rounded-xl text-sm font-bold disabled:opacity-40 ${glass}`}
            >
              Continue
            </button>
          )}
          {screen === "triage" && step === 2 && (
            <div className="grid grid-cols-[48px_1fr] gap-2 bg-transparent">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`min-h-12 rounded-xl font-bold ${glass}`}
              >
                ←
              </button>
              <button
                type="button"
                disabled={!cough || !phonation || dispatching}
                onClick={() => void handleDispatch()}
                className={`min-h-12 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40 ${glass}`}
              >
                <Send className="w-4 h-4" />
                {dispatching ? "Submitting…" : "Submit"}
              </button>
            </div>
          )}
          {screen === "triage" && step === 3 && (
            <button
              type="button"
              onClick={resetAll}
              className={`w-full min-h-12 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 ${glass}`}
            >
              <UserRound className="w-4 h-4" />
              New Patient Screening
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

function SignOffDetail({ row, onBack }: { row: QueueRow; onBack: () => void }) {
  const screening = row.screening as QueueRow["screening"] & {
    symptomNotes?: string;
    spo2Percent?: number;
    respiratoryRate?: number;
    temperatureC?: number;
    provisionalMedication?: string;
    approvedMedication?: string;
    medicationApproved?: boolean;
    reviewedByName?: string;
    reviewedByPhone?: string;
    reviewedByFacility?: string;
    reviewedByDistrict?: string;
  };
  const clinical = useMemo(
    () =>
      analyzeClinicalAcoustics({
        frequencyChartData: screening.frequencyChartData ?? null,
        spO2: screening.spo2Percent ?? null,
        respiratoryRate: screening.respiratoryRate ?? null,
        temperatureC: screening.temperatureC ?? null,
        age: row.patient.age,
        symptomNotes: screening.symptomNotes || screening.rawTranscript || "",
      }),
    [row.patient.age, screening],
  );
  const nearest = useMemo(
    () =>
      locateNearestFacility({
        village: row.patient.village,
        district: screening.reviewedByDistrict,
      }),
    [row.patient.village, screening.reviewedByDistrict],
  );
  const approved = screening.medicationApproved === true;
  const meds = screening.approvedMedication || screening.provisionalMedication || clinical.protocol.lines.join(" ");
  const doctorPhone = screening.reviewedByPhone;
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className={`min-h-10 px-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 ${glass}`}
      >
        ← Home
      </button>
      <article className={`rounded-2xl p-4 space-y-3 ${glass}`}>
        <p className="text-sm font-bold">{row.patient.fullName ?? "Unnamed patient"}</p>
        <p className="text-[11px] font-mono">{row.patient.patientCode ?? "—"} · {row.patient.village ?? "—"}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide">Differential Probability Matrix</p>
        {(Object.keys(clinical.probabilities) as Array<keyof typeof clinical.probabilities>).map((key) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between gap-2 text-xs font-semibold">
              <span>{clinical.labels[key]}</span>
              <span>{clinical.probabilities[key]}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/15">
              <div className="h-2 rounded-full bg-white transition-all duration-300 ease-out" style={{ width: `${clinical.probabilities[key]}%` }} />
            </div>
          </div>
        ))}
        <p className="text-[11px] font-semibold">Acoustic & Frequency Correlation</p>
        <p className="text-xs leading-relaxed">{clinical.brief.acoustic} {clinical.brief.vitals}</p>
        <div className="space-y-2">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide ${
              approved ? "bg-[#0D9488] text-white" : "bg-amber-500 text-[#111315]"
            }`}
          >
            {approved ? "APPROVED BY SPECIALIST" : "PROVISIONAL — PENDING DOCTOR SIGN-OFF"}
          </span>
          <p className="text-xs leading-relaxed">{meds}</p>
        </div>
      </article>
      <article className={`rounded-2xl p-4 space-y-2 ${glass}`}>
        <p className="text-xs font-bold">Reviewing Doctor & Hospital Routing</p>
        <p className="text-sm font-semibold">{screening.reviewedByName || "City specialist pending"}</p>
        <p className="text-xs">{screening.reviewedByFacility || "Hospital pending"}</p>
        {doctorPhone ? (
          <a href={`tel:${doctorPhone}`} className="text-xs font-bold text-[#0D9488] underline">
            {doctorPhone}
          </a>
        ) : (
          <p className="text-xs">Phone pending specialist sign-off</p>
        )}
        <p className="text-[11px] font-semibold">Specialist Remarks</p>
        <p className="text-xs leading-relaxed">{screening.specialistRemarks || "—"}</p>
      </article>
      <article className={`rounded-2xl p-4 space-y-2 ${glass}`}>
        <p className="text-xs font-bold">Nearest Referral Hospital & Specialist</p>
        <p className="text-sm font-semibold">{nearest.hospitalName}</p>
        <p className="text-xs">{nearest.specialistName}</p>
        <p className="text-xs font-mono">{nearest.distanceKm} km · {nearest.address}</p>
        <a href={`tel:${nearest.phone}`} className="text-xs font-bold text-[#0D9488] underline">
          {nearest.phone}
        </a>
        <a
          href={nearest.directionsUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-xs font-bold underline"
        >
          Open directions
        </a>
      </article>
    </div>
  );
}

async function uploadBlob(
  generateAudioUploadUrl: (args: Record<string, never>) => Promise<string>,
  capture: CaptureResult,
): Promise<Id<"_storage">> {
  const uploadUrl = await generateAudioUploadUrl({});
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": capture.mimeType || "audio/webm" },
    body: capture.blob,
  });
  if (!response.ok) throw new Error("Opus upload failed on the edge link.");
  const payload: unknown = await response.json();
  if (!isStoragePayload(payload)) throw new Error("Upload did not return a storage id.");
  return payload.storageId;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: "numeric" | "decimal" | "text";
}) {
  return (
    <label className="block text-xs font-semibold">
      {label}
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full min-h-12 px-3 rounded-xl text-base placeholder:text-white/40 ${glass}`}
      />
    </label>
  );
}

function CaptureCard({
  title,
  capture,
  onCapture,
  onRetake,
  onError,
}: {
  title: string;
  capture: CaptureResult | null;
  onCapture: (result: CaptureResult) => void;
  onRetake: () => void;
  onError: (message: string) => void;
}) {
  const recorderRef = useRef<EdgeAudioRecorder | null>(null);
  const timerRef = useRef<number>(0);
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [bars, setBars] = useState<number[]>(Array.from({ length: 32 }, () => 0.08));
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      window.clearInterval(timerRef.current);
      recorderRef.current?.cancel();
    };
  }, []);

  const start = async () => {
    onError("");
    const recorder = new EdgeAudioRecorder();
    recorderRef.current = recorder;
    try {
      await recorder.start(setBars);
      setRecording(true);
      setSecondsLeft(5);
      const started = Date.now();
      window.clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        const left = Math.max(0, 5 - Math.floor((Date.now() - started) / 1000));
        setSecondsLeft(left);
        if (left === 0) {
          window.clearInterval(timerRef.current);
          void finish();
        }
      }, 200);
    } catch (cause) {
      recorder.cancel();
      setRecording(false);
      onError(describeMicrophoneError(cause));
    }
  };

  const finish = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    try {
      const result = await recorder.stop();
      onCapture(result);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Recording failed.");
    } finally {
      window.clearInterval(timerRef.current);
      recorderRef.current = null;
      setRecording(false);
      setSecondsLeft(5);
    }
  };

  const live = capture ? capture.frequencyChartData.fftBins : bars;

  return (
    <article className={`rounded-2xl p-4 space-y-3 ${glass}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">{title}</h2>
        {capture && (
          <span className="font-mono text-[11px] font-semibold rounded-full border border-[#111315]/15 px-2 py-1">
            {formatOpusKb(capture.compressedAudioBytes)} Opus
          </span>
        )}
      </div>
      <div className="h-16 flex items-end gap-[3px] rounded-xl bg-white/10 px-2 py-2">
        {live.map((value, index) => (
          <span
            key={index}
            className="flex-1 rounded-sm bg-white"
            style={{ height: `${Math.max(8, Math.round(value * 100))}%` }}
          />
        ))}
      </div>
      {recording && (
        <p className="text-center font-mono text-sm font-bold tabular-nums">{secondsLeft}s auto-stop</p>
      )}
      {!capture ? (
        <button
          type="button"
          onClick={() => (recording ? void finish() : void start())}
            className={`mx-auto flex items-center justify-center w-24 h-24 rounded-full text-white transition-all duration-300 ease-out ${
            recording ? "bg-[#E63946] mic-pulse" : "bg-[#111315]"
          }`}
        >
          {recording ? <Square className="w-7 h-7" /> : <Mic className="w-8 h-8" />}
          <span className="sr-only">{recording ? "Stop" : "Hold or tap record"}</span>
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (!audioRef.current) audioRef.current = new Audio(capture.objectUrl);
              if (playing) {
                audioRef.current.pause();
                setPlaying(false);
              } else {
                audioRef.current.src = capture.objectUrl;
                void audioRef.current.play();
                audioRef.current.onended = () => setPlaying(false);
                setPlaying(true);
              }
            }}
            className="flex-1 min-h-12 rounded-xl border border-white/20 bg-white/10 font-bold inline-flex items-center justify-center gap-2"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            Preview
          </button>
          <button
            type="button"
            onClick={() => {
              audioRef.current?.pause();
              setPlaying(false);
              onRetake();
            }}
            className="min-h-12 min-w-12 rounded-xl border border-white/20 bg-white/10 inline-flex items-center justify-center"
            aria-label="Retake"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}
      <p className="text-center text-[11px] text-white/60">
        {recording ? "Recording 5-second clinical packet" : "Hold / tap the circle · auto-stops at 5s"}
      </p>
    </article>
  );
}
