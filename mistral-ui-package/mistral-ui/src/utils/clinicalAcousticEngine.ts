export type EngineFrequency = {
  fftBins: number[];
  fundamentalFreqHz: number;
  spectralCentroidHz: number;
  zeroCrossingRate: number;
  peakRmsEnergy?: number;
};

export type ClinicalEngineInput = {
  frequencyChartData: EngineFrequency | null;
  spO2: number | null;
  respiratoryRate: number | null;
  temperatureC: number | null;
  age: number | null;
  symptomNotes: string;
};

export type DifferentialKey = "bacterialPneumonia" | "bronchospasm" | "pulmonaryTb" | "urti";

export type ClinicalEngineResult = {
  signalQuality: "usable" | "silent" | "noisy";
  signalWarning: string | null;
  probabilities: Record<DifferentialKey, number>;
  labels: Record<DifferentialKey, string>;
  protocol: { title: string; lines: string[] };
  brief: {
    acoustic: string;
    vitals: string;
    originalNotes: string;
    translation: string;
    differentials: string;
    nextSteps: string;
    synthesis: string;
  };
  level1: "normal" | "monitor" | "urgent";
};

export const DIFFERENTIAL_LABELS: Record<DifferentialKey, string> = {
  bacterialPneumonia: "Bacterial Pneumonia / Alveolar Consolidation",
  bronchospasm: "Obstructive Airway / Bronchospasm (Asthma/COPD)",
  pulmonaryTb: "Pulmonary TB Suspect (Rule-Out Required)",
  urti: "Uncomplicated Upper Respiratory Tract Infection (URTI)",
};

const HI_EN: Array<[RegExp, string]> = [
  [/बुखार/g, "fever"],
  [/खा[ंँ]?सी/g, "cough"],
  [/खून/g, "blood"],
  [/दर्द/g, "pain"],
  [/सांस/g, "breathlessness"],
  [/घबराहट|घरघराहट/g, "wheeze"],
  [/रात/g, "night"],
  [/पसीना/g, "sweats"],
  [/वजन/g, "weight loss"],
  [/कमजोरी/g, "weakness"],
  [/सीने/g, "chest"],
  [/हफ्त/g, "weeks"],
];

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function bandEnergy(bins: number[], startHz: number, endHz: number): number {
  if (bins.length === 0) return 0;
  const nyquist = 8000;
  const start = Math.max(0, Math.floor((startHz / nyquist) * bins.length));
  const end = Math.min(bins.length, Math.ceil((endHz / nyquist) * bins.length));
  let sum = 0;
  let count = 0;
  for (let i = start; i < end; i++) {
    sum += bins[i] ?? 0;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function hasAny(text: string, words: string[]): boolean {
  const hay = text.toLowerCase();
  return words.some((word) => hay.includes(word.toLowerCase()));
}

export function translateSymptomNotes(notes: string): string {
  const trimmed = notes.trim();
  if (!trimmed) return "No nurse symptom notes were entered on this screening.";
  let english = trimmed;
  for (const [pattern, replacement] of HI_EN) {
    english = english.replace(pattern, replacement);
  }
  const stillIndic = /[\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F]/.test(english);
  if (stillIndic) {
    return `${english} (regional terms retained; mapped clinical words: fever, cough, blood, pain, wheeze, night sweats, weight loss where present).`;
  }
  return english;
}

function signalCheck(chart: EngineFrequency | null): {
  quality: ClinicalEngineResult["signalQuality"];
  warning: string | null;
} {
  const bins = chart?.fftBins ?? [];
  if (!chart || bins.length === 0) {
    return {
      quality: "silent",
      warning: "No frequency bins were captured. Repeat the 5-second sample before trusting a reading.",
    };
  }
  const mean = bins.reduce((sum, value) => sum + value, 0) / bins.length;
  const variance = bins.reduce((sum, value) => sum + (value - mean) ** 2, 0) / bins.length;
  if (mean < 0.045 && (chart.peakRmsEnergy ?? 0) < 0.02) {
    return {
      quality: "silent",
      warning: "Signal quality check: recording is near-silent. Hold the handset 15 cm from the mouth and retake.",
    };
  }
  if (mean > 0.82 && variance < 0.004) {
    return {
      quality: "noisy",
      warning: "Signal quality check: broadband noise is saturating the FFT. Move away from wind or a running fan and retake.",
    };
  }
  return { quality: "usable", warning: null };
}

export function analyzeClinicalAcoustics(input: ClinicalEngineInput): ClinicalEngineResult {
  const chart = input.frequencyChartData;
  const bins = chart?.fftBins ?? [];
  const centroid = chart?.spectralCentroidHz ?? 0;
  const zcr = chart?.zeroCrossingRate ?? 0;
  const f0 = chart?.fundamentalFreqHz ?? 0;
  const notes = input.symptomNotes ?? "";
  const english = translateSymptomNotes(notes);
  const { quality, warning } = signalCheck(chart);
  const crackles = bandEnergy(bins, 1500, 3000);
  const wheezeBand = bandEnergy(bins, 400, 1000);
  const lowCough = bandEnergy(bins, 80, 400);
  const upperResonance = bandEnergy(bins, 2000, 4000);
  const fever = input.temperatureC !== null && input.temperatureC >= 38;
  const tachypnea = input.respiratoryRate !== null && input.respiratoryRate > 22;
  const lowSpo2 = input.spO2 !== null && input.spO2 < 94;
  const spo2Border = input.spO2 !== null && input.spO2 < 95;
  const feverWords = hasAny(notes, ["fever", "bukhar", "बुखार", "temperature"]);
  const bloodWords = hasAny(notes, ["blood", "hemoptysis", "खून", "रक्त"]);
  const painWords = hasAny(notes, ["pain", "दर्द", "chest pain"]);
  const wheezeWords = hasAny(notes, ["wheeze", "breathless", "सांस", "घरघराहट", "asthma", "copd"]);
  const tbWords = hasAny(notes, [
    "week",
    "weeks",
    "हफ्त",
    "night sweat",
    "पसीना",
    "weight",
    "वजन",
    "hemoptysis",
    "खून",
    "2 week",
    "दो हफ्ते",
  ]);

  let pneumonia = 8;
  if (centroid > 1800) pneumonia += 22;
  if (zcr > 0.14) pneumonia += 14;
  if (crackles > 0.22) pneumonia += 18;
  if (fever) pneumonia += 12;
  if (tachypnea) pneumonia += 10;
  if (lowSpo2) pneumonia += 14;
  if (feverWords) pneumonia += 8;
  if (bloodWords || painWords) pneumonia += 8;

  let bronchospasm = 8;
  if (wheezeBand > 0.28) bronchospasm += 24;
  if (f0 > 0 && f0 < 180 && zcr > 0.08 && zcr < 0.2) bronchospasm += 10;
  if (spo2Border) bronchospasm += 10;
  if (wheezeWords) bronchospasm += 18;
  if (input.age !== null && input.age >= 40 && wheezeWords) bronchospasm += 8;

  let tb = 6;
  if (upperResonance > 0.2 && centroid > 1600) tb += 14;
  if (tbWords) tb += 28;
  if (bloodWords) tb += 12;
  if (input.age !== null && input.age >= 15) tb += 4;

  const vitalsNormal =
    (input.spO2 === null || input.spO2 >= 95) &&
    (input.respiratoryRate === null || input.respiratoryRate <= 22) &&
    (input.temperatureC === null || input.temperatureC < 38);
  let urti = vitalsNormal ? 28 : 8;
  if (lowCough > 0.2 && centroid < 1600 && zcr < 0.14) urti += 26;
  if (!fever && !lowSpo2 && !tachypnea) urti += 12;
  if (quality !== "usable") {
    pneumonia = Math.min(pneumonia, 20);
    bronchospasm = Math.min(bronchospasm, 20);
    tb = Math.min(tb, 15);
    urti = Math.min(urti, 20);
  }

  const probabilities = {
    bacterialPneumonia: clamp(pneumonia),
    bronchospasm: clamp(bronchospasm),
    pulmonaryTb: clamp(tb),
    urti: clamp(urti),
  };

  const top = (Object.keys(probabilities) as DifferentialKey[]).sort(
    (a, b) => probabilities[b] - probabilities[a],
  )[0];

  const protocol = protocolFor(top, probabilities, {
    fever: fever || feverWords,
    wheeze: wheezeWords || wheezeBand > 0.28,
    tb: tbWords || probabilities.pulmonaryTb >= 40,
  });

  const acoustic = `Acoustic biomarker findings: fundamental frequency ${f0 || "—"} Hz, spectral centroid ${centroid || "—"} Hz, zero-crossing rate ${zcr.toFixed(3)}. Crackle-band energy (1.5–3 kHz) ${crackles.toFixed(2)}; wheeze-band energy (400–1000 Hz) ${wheezeBand.toFixed(2)}. ${
    centroid > 1800
      ? "Centroid above 1800 Hz favors fine crackles and alveolar opening clicks."
      : "Centroid remains in a lower cough register."
  } ${zcr > 0.14 ? "Elevated ZCR supports turbulent, wet airflow." : "ZCR is not in the wet-crackle range."}`;

  const vitals = `Vitals correlation: SpO2 ${input.spO2 ?? "not entered"}%, respiratory rate ${input.respiratoryRate ?? "not entered"}/min, temperature ${input.temperatureC ?? "not entered"}°C${
    input.age !== null ? `, age ${input.age}` : ""
  }. ${lowSpo2 ? "Hypoxaemia below 94% raises the consolidation weight." : spo2Border ? "Saturation is under 95%, compatible with airway obstruction." : "Oxygen saturation does not independently force an urgent acoustic call."} ${
    fever ? "Fever at or above 38.0°C supports a bacterial lower-airway process." : "No high fever was recorded."
  } ${tachypnea ? "Tachypnea above 22/min is present." : "Respiratory rate is not markedly raised."}`;

  const differentials = (Object.keys(probabilities) as DifferentialKey[])
    .map((key) => `${DIFFERENTIAL_LABELS[key]} ${probabilities[key]}%`)
    .join("; ");

  const nextSteps =
    top === "pulmonaryTb"
      ? "Collect two sputum samples for CBNAAT, do not start a fluoroquinolone, and keep the patient on the TB rule-out list."
      : top === "bacterialPneumonia"
        ? "Hold oral Amoxicillin until the city specialist approves. Repeat SpO2 after the 5-second cough. Chest X-ray if saturation stays under 94%."
        : top === "bronchospasm"
          ? "Give supervised salbutamol nebulization now and recheck SpO2 in 15 minutes. Steroid only after specialist approval."
          : "Supportive PHC care. Re-screen in 48 hours if fever or breathlessness appears.";

  const synthesis = [
    warning,
    acoustic,
    vitals,
    `Nurse notes: ${notes.trim() || "none"}. English: ${english}`,
    `Differential probabilities: ${differentials}.`,
    `Next steps: ${nextSteps}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join(" ");

  const urgent =
    lowSpo2 ||
    (input.respiratoryRate !== null && input.respiratoryRate >= 28) ||
    (input.temperatureC !== null && input.temperatureC >= 38.5) ||
    probabilities.bacterialPneumonia >= 70 ||
    probabilities.pulmonaryTb >= 60;
  const monitor =
    spo2Border ||
    tachypnea ||
    fever ||
    probabilities.bacterialPneumonia >= 40 ||
    probabilities.bronchospasm >= 40;

  return {
    signalQuality: quality,
    signalWarning: warning,
    probabilities,
    labels: DIFFERENTIAL_LABELS,
    protocol,
    brief: {
      acoustic,
      vitals,
      originalNotes: notes.trim() || "No nurse symptom notes were entered.",
      translation: english,
      differentials,
      nextSteps,
      synthesis,
    },
    level1: urgent ? "urgent" : monitor ? "monitor" : "normal",
  };
}

function protocolFor(
  top: DifferentialKey,
  probabilities: Record<DifferentialKey, number>,
  flags: { fever: boolean; wheeze: boolean; tb: boolean },
): { title: string; lines: string[] } {
  const lines: string[] = [];
  if (flags.fever || probabilities.bacterialPneumonia >= 30) {
    lines.push("Paracetamol 500 mg STAT, then 500 mg TDS if fever persists (adult PHC pack).");
  }
  if (flags.wheeze || probabilities.bronchospasm >= 35) {
    lines.push("Salbutamol nebulization 2.5 mg in 2.5 mL saline now; recheck SpO2 after 15 minutes.");
  }
  if (probabilities.bacterialPneumonia >= 40 && !flags.tb) {
    lines.push("Hold Amoxicillin 500 mg TDS for 5 days — do not dispense until city doctor approval.");
  }
  if (flags.tb || probabilities.pulmonaryTb >= 40) {
    lines.push("Do not start antibiotics. Sputum CBNAAT and isolation advice while TB is ruled out.");
  }
  if (lines.length === 0) {
    lines.push("Supportive care: fluids, rest, Paracetamol 500 mg if pain or low-grade fever.");
  }
  return {
    title:
      top === "urti"
        ? "Supportive PHC pack"
        : "Provisional PHC medication and stabilization",
    lines,
  };
}
