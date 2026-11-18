export type Level1Status = 'urgent' | 'monitor' | 'normal';

export type ReviewStatus = 'pending' | 'reviewed' | 'escalated';

export type QueueFilterTab = 'all' | 'pending' | 'red_flag';

export type AcousticChannelType = 'cough' | 'phonation';

export interface FrequencyChartData {
  fftBins: number[]; // Normalized 0.0 - 1.0 spectral magnitude across 64 frequency bins (0 - 8000 Hz)
  phonationFftBins: number[]; // Sustained vowel /a/ harmonic spectrum across 64 bins
  fundamentalFreqHz: number;
  spectralCentroidHz: number;
  zeroCrossingRate: number;
  formantsHz: [number, number, number]; // F1, F2, F3 vocal tract formants
  sampleRateHz: number;
}

export interface PatientDocument {
  id: string;
  title: string;
  type: 'xray' | 'spirometry' | 'phc_note' | 'lab_panel';
  date: string;
  facility: string;
  clinician: string;
  summary: string;
  findings: string[];
  metrics?: { label: string; value: string }[];
  radiographHighlights?: {
    zone: 'RUL' | 'RLL' | 'LUL' | 'LLL' | 'HILUM';
    label: string;
    severity: 'urgent' | 'monitor' | 'normal';
  }[];
  spirometryCurve?: { volumePct: number; flowLps: number }[];
}

export interface ScreeningVisit {
  visitId: string;
  date: string;
  facility: string;
  clinicianName: string;
  riskScore: number;
  level1Status: Level1Status;
  spo2Percent: number;
  respRateBpm: number;
  symptomDrift: string;
  notes: string;
}

export interface CoughAcousticProfile {
  durationSec: number;
  burstCount: number;
  peakAmplitudeDb: number;
  wetCracklesDetected: boolean;
  wheezeIndex: number; // 0 - 1
  seed: number;
}

export interface PhonationAcousticProfile {
  durationSec: number;
  jitterPercent: number;
  shimmerPercent: number;
  hnrDb: number; // Harmonics-to-noise ratio
  seed: number;
}

export interface TriagePatient {
  _id: string;
  patientCode: string;
  fullName: string;
  age: number;
  sex: 'F' | 'M' | 'O';
  village: string;
  district: string;
  phcCenter: string;
  recordedAt: string;
  level1Status: Level1Status;
  riskScore: number;
  compressedAudioBytes: number;
  rawWavBytes: number;
  spo2Percent: number;
  respRateBpm: number;
  tempCelsius: number;
  coughProfile: CoughAcousticProfile;
  phonationProfile: PhonationAcousticProfile;
  frequencyChartData: FrequencyChartData;
  aiClinicalBrief: string;
  rawTranscript: string;
  transcriptLanguage: string;
  translatedEnText: string;
  specialistRemarks: string;
  physicalReferralFlag: boolean;
  referralInstructions: string;
  reviewStatus: ReviewStatus;
  reviewedAt?: string;
  previousScreenings: ScreeningVisit[];
  patientDocuments: PatientDocument[];
}

export interface ClinicalSignOffPayload {
  patientId: string;
  specialistRemarks: string;
  physicalReferralFlag: boolean;
  referralInstructions: string;
}

/**
 * Generates deterministic 64-bin FFT spectral curves (0 - 8000 Hz, 125 Hz/bin)
 * grounded in respiratory acoustic physics (wet cough broadband energy vs dry cough
 * vs harmonic formant peaks in sustained /a/ phonation).
 */
function buildCoughFftBins(
  centroidHz: number,
  wetCrackles: boolean,
  wheezeIndex: number,
  seed: number
): number[] {
  const bins: number[] = [];
  for (let i = 0; i < 64; i++) {
    const freq = (i + 0.5) * 125;
    const lowChest = Math.exp(-Math.pow((freq - 380) / 340, 2)) * 0.82;
    const midTurbulence = Math.exp(-Math.pow((freq - centroidHz) / 920, 2)) * (wetCrackles ? 0.78 : 0.46);
    const crackleTail = wetCrackles
      ? Math.exp(-Math.pow((freq - 3600) / 1450, 2)) * 0.52
      : Math.exp(-Math.pow((freq - 2400) / 900, 2)) * 0.22;
    const wheezePeak =
      wheezeIndex > 0.2
        ? Math.exp(-Math.pow((freq - 680) / 130, 2)) * wheezeIndex * 0.58 +
          Math.exp(-Math.pow((freq - 1360) / 160, 2)) * wheezeIndex * 0.34
        : 0;
    const ripple = 0.04 * Math.sin(i * 1.37 + seed) + 0.025 * Math.cos(i * 2.91 + seed * 0.5);
    const value = Math.max(0.03, Math.min(0.99, lowChest + midTurbulence + crackleTail + wheezePeak + ripple));
    bins.push(Number(value.toFixed(3)));
  }
  return bins;
}

function buildPhonationFftBins(
  f0Hz: number,
  formants: [number, number, number],
  hnrDb: number,
  seed: number
): number[] {
  const bins: number[] = [];
  const noiseFloor = Math.max(0.03, Math.min(0.28, (24 - hnrDb) * 0.013));
  for (let i = 0; i < 64; i++) {
    const freq = (i + 0.5) * 125;
    const f0Peak = Math.exp(-Math.pow((freq - Math.max(125, f0Hz)) / 120, 2)) * 0.92;
    const f1Peak = Math.exp(-Math.pow((freq - formants[0]) / 240, 2)) * 0.84;
    const f2Peak = Math.exp(-Math.pow((freq - formants[1]) / 310, 2)) * 0.64;
    const f3Peak = Math.exp(-Math.pow((freq - formants[2]) / 420, 2)) * 0.38;
    const rolloff = Math.exp(-freq / 4800);
    const harmonicComb = 0.07 * Math.abs(Math.sin((freq / Math.max(85, f0Hz)) * Math.PI));
    const ripple = 0.02 * Math.sin(i * 1.9 + seed);
    const value = Math.max(
      noiseFloor,
      Math.min(0.99, (f0Peak + f1Peak + f2Peak + f3Peak) * (0.65 + 0.35 * rolloff) + noiseFloor + harmonicComb + ripple)
    );
    bins.push(Number(value.toFixed(3)));
  }
  return bins;
}

export const INITIAL_TRIAGE_PATIENTS: TriagePatient[] = [
  {
    _id: 'patients:sv_1042',
    patientCode: 'SV-1042',
    fullName: 'Rameshwar Kulkarni',
    age: 62,
    sex: 'M',
    village: 'Bhorwadi',
    district: 'Satara',
    phcCenter: 'PHC Wai Sector II',
    recordedAt: '2026-11-14T20:42:00+05:30',
    level1Status: 'urgent',
    riskScore: 91,
    compressedAudioBytes: 18840,
    rawWavBytes: 1720320,
    spo2Percent: 89,
    respRateBpm: 28,
    tempCelsius: 38.4,
    coughProfile: {
      durationSec: 3.8,
      burstCount: 4,
      peakAmplitudeDb: -3.4,
      wetCracklesDetected: true,
      wheezeIndex: 0.74,
      seed: 11,
    },
    phonationProfile: {
      durationSec: 4.6,
      jitterPercent: 2.84,
      shimmerPercent: 6.12,
      hnrDb: 9.4,
      seed: 19,
    },
    frequencyChartData: {
      fftBins: buildCoughFftBins(1840, true, 0.74, 11),
      phonationFftBins: buildPhonationFftBins(118, [710, 1120, 2480], 9.4, 19),
      fundamentalFreqHz: 118,
      spectralCentroidHz: 1842,
      zeroCrossingRate: 0.164,
      formantsHz: [710, 1120, 2480],
      sampleRateHz: 16000,
    },
    aiClinicalBrief:
      'High-probability acute lower respiratory tract consolidation / COPD exacerbation. Coarse inspiratory crackles detected between 2.8–4.6 kHz with elevated zero-crossing turbulence (0.164) and degraded phonation HNR (9.4 dB). SpO2 dropped 5% from baseline over 18 days.',
    rawTranscript:
      'तीन आठवड्यांपासून रात्री खूप खोकला येतोय आणि छातीत घरघर होतेय. दोन दिवसांपासून चालताना दम लागतोय आणि थोडा ताप पण आहे.',
    transcriptLanguage: 'Marathi (Devanagari)',
    translatedEnText:
      'Severe nocturnal cough and chest wheezing for three weeks. Experiencing dyspnea on mild exertion for the past two days accompanied by low-grade fever.',
    specialistRemarks: '',
    physicalReferralFlag: true,
    referralInstructions: 'Urgent District Hospital referral: Chest PA X-ray, Sputum CBNAAT, nebulized bronchodilator & O2 assessment.',
    reviewStatus: 'pending',
    previousScreenings: [
      {
        visitId: 'VST-9021',
        date: '2026-10-27',
        facility: 'PHC Wai Sector II',
        clinicianName: 'Dr. A. Deshmukh',
        riskScore: 68,
        level1Status: 'monitor',
        spo2Percent: 94,
        respRateBpm: 22,
        symptomDrift: '+23 risk pts · SpO2 -5%',
        notes: 'Initiated oral bronchodilator and 7-day doxycycline course; advised 2-week acoustic re-screen.',
      },
      {
        visitId: 'VST-8144',
        date: '2026-08-19',
        facility: 'Sub-Center Bhorwadi',
        clinicianName: 'ANM S. Pawar',
        riskScore: 41,
        level1Status: 'normal',
        spo2Percent: 96,
        respRateBpm: 18,
        symptomDrift: 'Baseline post-monsoon',
        notes: 'Chronic biomass smoke exposure noted; dry morning cough only.',
      },
    ],
    patientDocuments: [
      {
        id: 'DOC-401',
        title: 'Chest Radiograph PA View (PHC Mobile Unit)',
        type: 'xray',
        date: '2026-10-28',
        facility: 'PHC Wai Mobile X-Ray',
        clinician: 'Dr. R. Joshi (Radiology)',
        summary: 'Hyperinflated lung fields with patchy right lower zone opacity; prominent bronchovascular markings.',
        findings: [
          'Right lower lobe patchy alveolar infiltrate',
          'Flattened hemidiaphragms consistent with air trapping',
          'No pleural effusion or pneumothorax identified',
        ],
        metrics: [
          { label: 'Cardiothoracic Ratio', value: '0.49' },
          { label: 'Zone Alert', value: 'RLL Opacity' },
        ],
        radiographHighlights: [
          { zone: 'RLL', label: 'Patchy RLL Infiltrate', severity: 'urgent' },
          { zone: 'HILUM', label: 'Prominent Hilar Markings', severity: 'monitor' },
        ],
      },
      {
        id: 'DOC-402',
        title: 'Handheld Spirometry Flow-Volume Report',
        type: 'spirometry',
        date: '2026-10-27',
        facility: 'PHC Wai Sector II',
        clinician: 'Dr. A. Deshmukh',
        summary: 'Moderate-to-severe obstructive ventilatory defect with concave expiratory scooping.',
        findings: [
          'FEV1/FVC ratio reduced at 56% predicted',
          'Post-bronchodilator reversibility 9% (incomplete)',
        ],
        metrics: [
          { label: 'FEV1', value: '1.42 L (51%)' },
          { label: 'FVC', value: '2.54 L (76%)' },
          { label: 'FEV1/FVC', value: '0.56' },
        ],
        spirometryCurve: [
          { volumePct: 0, flowLps: 0 },
          { volumePct: 12, flowLps: 4.1 },
          { volumePct: 28, flowLps: 2.3 },
          { volumePct: 50, flowLps: 1.1 },
          { volumePct: 75, flowLps: 0.48 },
          { volumePct: 100, flowLps: 0 },
        ],
      },
    ],
  },
  {
    _id: 'patients:sv_1048',
    patientCode: 'SV-1048',
    fullName: 'Meenakshi Devi',
    age: 34,
    sex: 'F',
    village: 'Kishanpur',
    district: 'Barabanki',
    phcCenter: 'CHC Dewa Block',
    recordedAt: '2026-11-14T20:18:00+05:30',
    level1Status: 'urgent',
    riskScore: 86,
    compressedAudioBytes: 17920,
    rawWavBytes: 1638400,
    spo2Percent: 91,
    respRateBpm: 26,
    tempCelsius: 38.9,
    coughProfile: {
      durationSec: 3.4,
      burstCount: 5,
      peakAmplitudeDb: -4.1,
      wetCracklesDetected: true,
      wheezeIndex: 0.32,
      seed: 23,
    },
    phonationProfile: {
      durationSec: 4.1,
      jitterPercent: 2.15,
      shimmerPercent: 5.4,
      hnrDb: 11.2,
      seed: 31,
    },
    frequencyChartData: {
      fftBins: buildCoughFftBins(2180, true, 0.32, 23),
      phonationFftBins: buildPhonationFftBins(214, [820, 1290, 2760], 11.2, 31),
      fundamentalFreqHz: 214,
      spectralCentroidHz: 2185,
      zeroCrossingRate: 0.191,
      formantsHz: [820, 1290, 2760],
      sampleRateHz: 16000,
    },
    aiClinicalBrief:
      'Persistent productive cough >3 weeks with nocturnal fever and high-frequency crackle transients (ZCR 0.191, spectral centroid 2185 Hz). Acoustic signature closely matches upper-lobe cavitary/infectious screening cluster; immediate TB rule-out recommended.',
    rawTranscript:
      'पिछले एक महीने से शाम को हल्का बुखार रहता है और खांसी में कभी-कभी खून के धब्बे आते हैं। भूख भी कम हो गई है।',
    transcriptLanguage: 'Hindi (Devanagari)',
    translatedEnText:
      'Evening low-grade fever for the past month with occasional blood-streaked sputum during coughing episodes. Progressive loss of appetite noted.',
    specialistRemarks: '',
    physicalReferralFlag: false,
    referralInstructions: '',
    reviewStatus: 'pending',
    previousScreenings: [
      {
        visitId: 'VST-8970',
        date: '2026-10-21',
        facility: 'CHC Dewa Block',
        clinicianName: 'Dr. P. Verma',
        riskScore: 61,
        level1Status: 'monitor',
        spo2Percent: 95,
        respRateBpm: 21,
        symptomDrift: '+25 risk pts · Fever persistent',
        notes: 'Initial symptomatic cough syrup prescribed; advised sputum microscopy if cough persists >14 days.',
      },
    ],
    patientDocuments: [
      {
        id: 'DOC-410',
        title: 'PHC Fever & CBC Hematology Panel',
        type: 'lab_panel',
        date: '2026-11-12',
        facility: 'CHC Dewa Lab',
        clinician: 'LT M. Siddiqui',
        summary: 'Elevated ESR (64 mm/hr) and mild microcytic anemia; AFB smear pending.',
        findings: [
          'ESR markedly elevated at 64 mm/1st hr',
          'Hemoglobin 9.8 g/dL, WBC 11,400 /mm3 with lymphocytic predominance',
          'Malaria RDT & Dengue NS1 negative',
        ],
        metrics: [
          { label: 'ESR', value: '64 mm/hr' },
          { label: 'Hb', value: '9.8 g/dL' },
          { label: 'WBC', value: '11.4 K/uL' },
        ],
      },
    ],
  },
  {
    _id: 'patients:sv_1039',
    patientCode: 'SV-1039',
    fullName: 'Selvakumar Natarajan',
    age: 49,
    sex: 'M',
    village: 'Periyapalayam',
    district: 'Tiruvallur',
    phcCenter: 'PHC Uthukottai',
    recordedAt: '2026-11-14T19:54:00+05:30',
    level1Status: 'monitor',
    riskScore: 64,
    compressedAudioBytes: 18160,
    rawWavBytes: 1658880,
    spo2Percent: 95,
    respRateBpm: 21,
    tempCelsius: 37.1,
    coughProfile: {
      durationSec: 3.2,
      burstCount: 3,
      peakAmplitudeDb: -6.2,
      wetCracklesDetected: false,
      wheezeIndex: 0.68,
      seed: 41,
    },
    phonationProfile: {
      durationSec: 4.8,
      jitterPercent: 1.48,
      shimmerPercent: 3.9,
      hnrDb: 14.9,
      seed: 47,
    },
    frequencyChartData: {
      fftBins: buildCoughFftBins(1310, false, 0.68, 41),
      phonationFftBins: buildPhonationFftBins(134, [695, 1140, 2510], 14.9, 47),
      fundamentalFreqHz: 134,
      spectralCentroidHz: 1312,
      zeroCrossingRate: 0.118,
      formantsHz: [695, 1140, 2510],
      sampleRateHz: 16000,
    },
    aiClinicalBrief:
      'Polyphonic expiratory wheeze peak near 680 Hz & 1360 Hz with dry cough bursts. No wet crackle transients. Pattern consistent with occupational dust-induced reactive airway bronchospasm.',
    rawTranscript:
      'நெல் அரைக்கும் ஆலையில் வேலை செய்த பிறகு மூச்சு இழுத்து விடுவதில் சிரமம் உள்ளது. சளி இல்லை, ஆனால் இரவில் விசில் சத்தம் போல் மூச்சு வருகிறது.',
    transcriptLanguage: 'Tamil',
    translatedEnText:
      'Difficulty breathing after shifts at the rice mill. Dry cough without phlegm, with audible whistling breath sounds at night.',
    specialistRemarks: '',
    physicalReferralFlag: false,
    referralInstructions: '',
    reviewStatus: 'pending',
    previousScreenings: [
      {
        visitId: 'VST-8742',
        date: '2026-09-30',
        facility: 'PHC Uthukottai',
        clinicianName: 'Dr. K. Subramanian',
        riskScore: 52,
        level1Status: 'monitor',
        spo2Percent: 96,
        respRateBpm: 19,
        symptomDrift: '+12 risk pts · Night wheeze increased',
        notes: 'Started metered-dose budesonide/formoterol inhaler; peak flow diary issued.',
      },
    ],
    patientDocuments: [
      {
        id: 'DOC-421',
        title: 'Peak Flow & Spirometry Baseline',
        type: 'spirometry',
        date: '2026-09-30',
        facility: 'PHC Uthukottai',
        clinician: 'Dr. K. Subramanian',
        summary: 'Mild reversible airflow obstruction; 16% FEV1 improvement post-salbutamol.',
        findings: [
          'FEV1 74% predicted pre-BD, 86% post-BD (+16% reversibility)',
          'PEFR variability 19% between morning and post-mill evening',
        ],
        metrics: [
          { label: 'FEV1 Pre', value: '2.31 L (74%)' },
          { label: 'Post-BD', value: '+16% Rev' },
          { label: 'PEFR', value: '380 L/min' },
        ],
        spirometryCurve: [
          { volumePct: 0, flowLps: 0 },
          { volumePct: 14, flowLps: 6.2 },
          { volumePct: 32, flowLps: 4.1 },
          { volumePct: 55, flowLps: 2.3 },
          { volumePct: 78, flowLps: 1.05 },
          { volumePct: 100, flowLps: 0 },
        ],
      },
    ],
  },
  {
    _id: 'patients:sv_1051',
    patientCode: 'SV-1051',
    fullName: 'Ananya Chatterjee',
    age: 27,
    sex: 'F',
    village: 'Singur North',
    district: 'Hooghly',
    phcCenter: 'BPHC Singur',
    recordedAt: '2026-11-14T19:20:00+05:30',
    level1Status: 'monitor',
    riskScore: 55,
    compressedAudioBytes: 18520,
    rawWavBytes: 1699840,
    spo2Percent: 96,
    respRateBpm: 20,
    tempCelsius: 37.3,
    coughProfile: {
      durationSec: 2.9,
      burstCount: 3,
      peakAmplitudeDb: -7.8,
      wetCracklesDetected: false,
      wheezeIndex: 0.41,
      seed: 53,
    },
    phonationProfile: {
      durationSec: 4.5,
      jitterPercent: 1.19,
      shimmerPercent: 3.1,
      hnrDb: 16.4,
      seed: 59,
    },
    frequencyChartData: {
      fftBins: buildCoughFftBins(1490, false, 0.41, 53),
      phonationFftBins: buildPhonationFftBins(228, [810, 1260, 2820], 16.4, 59),
      fundamentalFreqHz: 228,
      spectralCentroidHz: 1495,
      zeroCrossingRate: 0.132,
      formantsHz: [810, 1260, 2820],
      sampleRateHz: 16000,
    },
    aiClinicalBrief:
      'Post-viral bronchial hyperreactivity with mild laryngeal edema signature (F0 slightly elevated at 228 Hz, HNR 16.4 dB). No parenchymal crackles detected; continue airway hydration and reassess in 7 days.',
    rawTranscript:
      'গত সপ্তাহে জ্বর সেরে যাওয়ার পর থেকে শুকনো কাশিটা আর যাচ্ছে না। কথা বললে গলা ভেঙে যাচ্ছে।',
    transcriptLanguage: 'Bengali',
    translatedEnText:
      'Fever resolved last week, but a persistent dry cough remains. Voice becomes hoarse after prolonged speaking.',
    specialistRemarks: '',
    physicalReferralFlag: false,
    referralInstructions: '',
    reviewStatus: 'pending',
    previousScreenings: [
      {
        visitId: 'VST-9102',
        date: '2026-11-06',
        facility: 'BPHC Singur',
        clinicianName: 'Dr. S. Mukherjee',
        riskScore: 58,
        level1Status: 'monitor',
        spo2Percent: 96,
        respRateBpm: 20,
        symptomDrift: '-3 risk pts · Fever resolved',
        notes: 'Upper respiratory viral prodrome; negative rapid antigen screen.',
      },
    ],
    patientDocuments: [
      {
        id: 'DOC-430',
        title: 'PHC Acute Respiratory Triage Note',
        type: 'phc_note',
        date: '2026-11-06',
        facility: 'BPHC Singur',
        clinician: 'Dr. S. Mukherjee',
        summary: 'Clear bilateral vesicular breath sounds on auscultation; mild pharyngeal erythema.',
        findings: [
          'Temp 37.9°C at initial visit, normalized by Day 4',
          'Bilateral air entry equal, no crepitations',
        ],
        metrics: [
          { label: 'SpO2', value: '96%' },
          { label: 'Pulse', value: '84 bpm' },
        ],
      },
    ],
  },
  {
    _id: 'patients:sv_1033',
    patientCode: 'SV-1033',
    fullName: 'Gopalakrishna Gowda',
    age: 56,
    sex: 'M',
    village: 'Nanjangud Rural',
    district: 'Mysuru',
    phcCenter: 'PHC Hullahalli',
    recordedAt: '2026-11-14T18:45:00+05:30',
    level1Status: 'urgent',
    riskScore: 83,
    compressedAudioBytes: 19120,
    rawWavBytes: 1740800,
    spo2Percent: 90,
    respRateBpm: 25,
    tempCelsius: 37.8,
    coughProfile: {
      durationSec: 4.1,
      burstCount: 5,
      peakAmplitudeDb: -3.9,
      wetCracklesDetected: true,
      wheezeIndex: 0.52,
      seed: 67,
    },
    phonationProfile: {
      durationSec: 3.9,
      jitterPercent: 2.41,
      shimmerPercent: 5.8,
      hnrDb: 10.6,
      seed: 71,
    },
    frequencyChartData: {
      fftBins: buildCoughFftBins(1980, true, 0.52, 67),
      phonationFftBins: buildPhonationFftBins(112, [680, 1080, 2390], 10.6, 71),
      fundamentalFreqHz: 112,
      spectralCentroidHz: 1978,
      zeroCrossingRate: 0.175,
      formantsHz: [680, 1080, 2390],
      sampleRateHz: 16000,
    },
    aiClinicalBrief:
      'Escalated prior review: bibasilar coarse crackle acoustic cluster with shortened phonation sustain (3.9s) and low HNR (10.6 dB). Resting SpO2 90% warrants immediate district hospital workup.',
    rawTranscript:
      'ಕಳೆದ ಹತ್ತು ದಿನಗಳಿಂದ ಉಸಿರಾಟಕ್ಕೆ ತುಂಬಾ ತೊಂದರೆಯಾಗುತ್ತಿದೆ, ರಾತ್ರಿ ಮಲಗಿದಾಗ ಕೆಮ್ಮು ಜಾಸ್ತಿಯಾಗುತ್ತದೆ.',
    transcriptLanguage: 'Kannada',
    translatedEnText:
      'Increasing shortness of breath over the past ten days; coughing worsens noticeably when lying flat at night.',
    specialistRemarks:
      'Acoustic orthopnea pattern + SpO2 90% suggests pulmonary congestion or acute basal pneumonia. Escalated for urgent hospital evaluation.',
    physicalReferralFlag: true,
    referralInstructions: 'Mandatory District Hospital Emergency referral today: CXR, ECG, BNP & pulse oximetry stabilization.',
    reviewStatus: 'escalated',
    reviewedAt: '2026-11-14T19:02:00+05:30',
    previousScreenings: [
      {
        visitId: 'VST-8610',
        date: '2026-10-14',
        facility: 'PHC Hullahalli',
        clinicianName: 'Dr. M. Hegde',
        riskScore: 48,
        level1Status: 'monitor',
        spo2Percent: 95,
        respRateBpm: 19,
        symptomDrift: '+35 risk pts · Orthopnea onset',
        notes: 'Routine hypertension & mild exertional dyspnea follow-up.',
      },
    ],
    patientDocuments: [
      {
        id: 'DOC-440',
        title: 'Chest PA Radiograph (Baseline Oct)',
        type: 'xray',
        date: '2026-10-15',
        facility: 'Taluk Hospital Nanjangud',
        clinician: 'Dr. V. Rao',
        summary: 'Mild cardiomegaly with early blunting of right costophrenic angle.',
        findings: [
          'Cardiothoracic ratio borderline at 0.53',
          'Minimal right basal blunting',
        ],
        metrics: [
          { label: 'CTR', value: '0.53' },
          { label: 'Zone Alert', value: 'RLL Base' },
        ],
        radiographHighlights: [
          { zone: 'RLL', label: 'Costophrenic Blunting', severity: 'monitor' },
          { zone: 'LLL', label: 'Basal Vascular Congestion', severity: 'urgent' },
        ],
      },
    ],
  },
  {
    _id: 'patients:sv_1044',
    patientCode: 'SV-1044',
    fullName: 'kavita_sharma',
    age: 41,
    sex: 'F',
    village: 'Dholpur East',
    district: 'Dholpur',
    phcCenter: 'PHC Mania',
    recordedAt: '2026-11-14T18:10:00+05:30',
    level1Status: 'normal',
    riskScore: 19,
    compressedAudioBytes: 17640,
    rawWavBytes: 1617920,
    spo2Percent: 98,
    respRateBpm: 16,
    tempCelsius: 36.7,
    coughProfile: {
      durationSec: 2.4,
      burstCount: 2,
      peakAmplitudeDb: -11.2,
      wetCracklesDetected: false,
      wheezeIndex: 0.08,
      seed: 83,
    },
    phonationProfile: {
      durationSec: 5.4,
      jitterPercent: 0.62,
      shimmerPercent: 1.9,
      hnrDb: 21.8,
      seed: 89,
    },
    frequencyChartData: {
      fftBins: buildCoughFftBins(940, false, 0.08, 83),
      phonationFftBins: buildPhonationFftBins(206, [760, 1210, 2690], 21.8, 89),
      fundamentalFreqHz: 206,
      spectralCentroidHz: 942,
      zeroCrossingRate: 0.068,
      formantsHz: [760, 1210, 2690],
      sampleRateHz: 16000,
    },
    aiClinicalBrief:
      'Normal acoustic respiratory clearance. Clean glottal harmonic structure (HNR 21.8 dB, jitter 0.62%), low zero-crossing turbulence (0.068), and SpO2 98%. Post-antibiotic bronchitis recovery confirmed.',
    rawTranscript:
      'अब खांसी बिल्कुल ठीक हो गई है और सांस लेने में कोई दिक्कत नहीं है। दवा का पूरा कोर्स खत्म कर लिया है।',
    transcriptLanguage: 'Hindi (Devanagari)',
    translatedEnText:
      'Cough has completely resolved and breathing feels comfortable. Completed the full prescribed medication course.',
    specialistRemarks: 'Acoustic markers normalized post-therapy. Cleared for routine 90-day community check.',
    physicalReferralFlag: false,
    referralInstructions: '',
    reviewStatus: 'reviewed',
    reviewedAt: '2026-11-14T18:35:00+05:30',
    previousScreenings: [
      {
        visitId: 'VST-8890',
        date: '2026-10-30',
        facility: 'PHC Mania',
        clinicianName: 'Dr. N. Saxena',
        riskScore: 49,
        level1Status: 'monitor',
        spo2Percent: 96,
        respRateBpm: 20,
        symptomDrift: '-30 risk pts · Full recovery',
        notes: 'Acute bronchitis; 5-day amoxicillin-clavulanate initiated.',
      },
    ],
    patientDocuments: [
      {
        id: 'DOC-452',
        title: 'Recovery Spirometry Check',
        type: 'spirometry',
        date: '2026-11-14',
        facility: 'PHC Mania',
        clinician: 'Dr. N. Saxena',
        summary: 'Normal ventilatory parameters with smooth expiratory decay.',
        findings: [
          'FEV1 96% predicted, FVC 98% predicted',
          'FEV1/FVC ratio 0.81 within normal limits',
        ],
        metrics: [
          { label: 'FEV1', value: '2.78 L (96%)' },
          { label: 'FVC', value: '3.43 L (98%)' },
          { label: 'FEV1/FVC', value: '0.81' },
        ],
        spirometryCurve: [
          { volumePct: 0, flowLps: 0 },
          { volumePct: 14, flowLps: 7.4 },
          { volumePct: 35, flowLps: 5.5 },
          { volumePct: 60, flowLps: 3.4 },
          { volumePct: 82, flowLps: 1.6 },
          { volumePct: 100, flowLps: 0 },
        ],
      },
    ],
  },
  {
    _id: 'patients:sv_1055',
    patientCode: 'SV-1055',
    fullName: 'Harpreet Singh Gill',
    age: 38,
    sex: 'M',
    village: 'Jagraon',
    district: 'Ludhiana',
    phcCenter: 'CHC Jagraon',
    recordedAt: '2026-11-14T17:52:00+05:30',
    level1Status: 'normal',
    riskScore: 24,
    compressedAudioBytes: 18310,
    rawWavBytes: 1679360,
    spo2Percent: 98,
    respRateBpm: 15,
    tempCelsius: 36.6,
    coughProfile: {
      durationSec: 2.6,
      burstCount: 2,
      peakAmplitudeDb: -9.5,
      wetCracklesDetected: false,
      wheezeIndex: 0.12,
      seed: 97,
    },
    phonationProfile: {
      durationSec: 5.2,
      jitterPercent: 0.74,
      shimmerPercent: 2.1,
      hnrDb: 20.4,
      seed: 101,
    },
    frequencyChartData: {
      fftBins: buildCoughFftBins(1020, false, 0.12, 97),
      phonationFftBins: buildPhonationFftBins(126, [705, 1105, 2460], 20.4, 101),
      fundamentalFreqHz: 126,
      spectralCentroidHz: 1024,
      zeroCrossingRate: 0.079,
      formantsHz: [705, 1105, 2460],
      sampleRateHz: 16000,
    },
    aiClinicalBrief:
      'Stable annual agricultural smoke screening. Clear cough transient profile with zero crackle signatures and robust vocal harmonic stability (HNR 20.4 dB).',
    rawTranscript:
      'पराली के धुएं के मौसम के बाद जांच करवाने आया हूं। अभी कोई खांसी या सांस की तकलीफ नहीं है।',
    transcriptLanguage: 'Hindi (Devanagari)',
    translatedEnText:
      'Came in for routine post-harvest smoke season screening. Currently no cough or breathing difficulty.',
    specialistRemarks: '',
    physicalReferralFlag: false,
    referralInstructions: '',
    reviewStatus: 'pending',
    previousScreenings: [
      {
        visitId: 'VST-7990',
        date: '2025-11-18',
        facility: 'CHC Jagraon',
        clinicianName: 'Dr. G. Sandhu',
        riskScore: 26,
        level1Status: 'normal',
        spo2Percent: 98,
        respRateBpm: 16,
        symptomDrift: '-2 risk pts · Stable YoY',
        notes: 'Annual respiratory surveillance baseline normal.',
      },
    ],
    patientDocuments: [
      {
        id: 'DOC-460',
        title: 'Annual Surveillance PHC Summary',
        type: 'phc_note',
        date: '2025-11-18',
        facility: 'CHC Jagraon',
        clinician: 'Dr. G. Sandhu',
        summary: 'Asymptomatic rural air-quality cohort participant; normal vitals and auscultation.',
        findings: [
          'Bilateral clear lung fields',
          'Advised N95 particulate mask use during harvest residue burning',
        ],
        metrics: [
          { label: 'SpO2', value: '98%' },
          { label: 'PEFR', value: '510 L/min' },
        ],
      },
    ],
  },
];

// Clean up any lowercase typo in patient name before export
INITIAL_TRIAGE_PATIENTS[5].fullName = 'Kavita Sharma';

export const URGENCY_RANK: Record<Level1Status, number> = {
  urgent: 0,
  monitor: 1,
  normal: 2,
};

export function sortPatientsByUrgency(patients: TriagePatient[]): TriagePatient[] {
  return [...patients].sort((a, b) => {
    const rankDiff = URGENCY_RANK[a.level1Status] - URGENCY_RANK[b.level1Status];
    if (rankDiff !== 0) return rankDiff;
    return b.riskScore - a.riskScore;
  });
}

export function formatPacketKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
