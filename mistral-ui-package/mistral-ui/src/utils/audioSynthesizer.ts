import type { AcousticChannelType } from '../lib/clinical';

export interface SynthesisProfile {
  cough: {
    durationSec: number;
    burstCount: number;
    wetCracklesDetected: boolean;
    wheezeIndex: number;
    seed: number;
  };
  phonation: {
    durationSec: number;
    jitterPercent: number;
    shimmerPercent: number;
    hnrDb: number;
    seed: number;
    fundamentalFreqHz: number;
    formantsHz: [number, number, number];
  };
}

export function fallbackSynthesisProfile(seedKey: string): SynthesisProfile {
  let hash = 2166136261;
  for (let i = 0; i < seedKey.length; i++) {
    hash ^= seedKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const seed = Math.abs(hash % 997) + 1;
  return {
    cough: {
      durationSec: 3.6,
      burstCount: 3,
      wetCracklesDetected: false,
      wheezeIndex: 0.32,
      seed,
    },
    phonation: {
      durationSec: 4.2,
      jitterPercent: 1.6,
      shimmerPercent: 4.1,
      hnrDb: 14,
      seed: seed + 17,
      fundamentalFreqHz: 140,
      formantsHz: [730, 1100, 2500],
    },
  };
}

export function peaksFromChannelData(data: Float32Array, barCount = 72): number[] {
  const blockSize = Math.max(1, Math.floor(data.length / barCount));
  const waveformPeaks: number[] = [];
  let maxPeak = 0.001;
  for (let b = 0; b < barCount; b++) {
    const start = b * blockSize;
    const end = Math.min(data.length, start + blockSize);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(data[j] ?? 0);
      if (abs > peak) peak = abs;
    }
    waveformPeaks.push(peak);
    if (peak > maxPeak) maxPeak = peak;
  }
  return waveformPeaks.map((peak) => Number(Math.max(0.08, Math.min(1, peak / maxPeak)).toFixed(3)));
}

export function sampleFromAudioBuffer(buffer: AudioBuffer): SynthesizedSample {
  return {
    buffer,
    durationSec: buffer.duration,
    waveformPeaks: peaksFromChannelData(buffer.getChannelData(0)),
  };
}

// Deterministic PRNG for repeatable per-patient acoustic textures
function createPrng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export interface SynthesizedSample {
  buffer: AudioBuffer;
  durationSec: number;
  waveformPeaks: number[]; // Normalized 0..1 envelope bars for scrubbable player
}

/**
 * Generates an AudioBuffer + downsampled peak waveform for either
 * Voluntary Cough or Sustained "Aaa" Phonation using Web Audio API synthesis.
 */
export function synthesizePatientAudio(
  ctx: BaseAudioContext,
  profile: SynthesisProfile,
  channel: AcousticChannelType
): SynthesizedSample {
  const sampleRate = ctx.sampleRate;
  const durationSec =
    channel === 'cough' ? profile.cough.durationSec : profile.phonation.durationSec;
  const totalSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  const data = buffer.getChannelData(0);

  if (channel === 'cough') {
    const { burstCount, wetCracklesDetected, wheezeIndex, seed } = profile.cough;
    const rand = createPrng(seed * 131 + 17);

    // Space cough bursts naturally across the recording window
    const burstSpacing = durationSec / (burstCount + 0.65);
    const burstStarts: number[] = [];
    for (let b = 0; b < burstCount; b++) {
      burstStarts.push(0.24 + b * burstSpacing * 0.92);
    }

    // Simple 2-pole resonant filter state for chest cavity & bronchial turbulence
    let lp1 = 0;
    let lp2 = 0;
    let bp1 = 0;
    let bp2 = 0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;

      // Ambient clinic room floor
      sample += (rand() * 2 - 1) * 0.008;

      for (let b = 0; b < burstStarts.length; b++) {
        const dt = t - burstStarts[b];
        if (dt >= 0 && dt < 0.44) {
          // 1. Explosive glottal opening transient (0 - 35ms)
          const attack = Math.min(1, dt / 0.012);
          const expDecay = Math.exp(-dt * 9.5);
          const burstWeight = 1 - b * 0.11;
          const white = rand() * 2 - 1;

          // Chest resonance thump (~210 Hz decaying)
          const chestThump =
            Math.sin(2 * Math.PI * (225 - dt * 180) * dt) * Math.exp(-dt * 18) * 0.55;

          // Filtered turbulent airflow
          lp1 = lp1 * 0.72 + white * 0.28;
          lp2 = lp2 * 0.85 + lp1 * 0.15;
          const turbulence = (lp1 - lp2 * 0.65) * 1.45;

          // Expiratory wheeze oscillation if wheezeIndex > 0.2
          const wheezeTone =
            wheezeIndex > 0.2 && dt > 0.05
              ? Math.sin(2 * Math.PI * (640 + Math.sin(dt * 18) * 24) * dt) *
                wheezeIndex *
                0.28 *
                Math.exp(-(dt - 0.05) * 5.2)
              : 0;

          // Fine/coarse wet crackle impulses in mid-to-late burst phase
          let crackle = 0;
          if (wetCracklesDetected && dt > 0.04 && dt < 0.36 && rand() > 0.9945) {
            crackle = (rand() > 0.5 ? 1 : -1) * (0.45 + rand() * 0.45);
          }

          bp1 = bp1 * 0.6 + crackle * 0.4;
          bp2 = bp2 * 0.5 + bp1 * 0.5;

          sample += (chestThump + turbulence + wheezeTone + bp2 * 1.2) * attack * expDecay * burstWeight;
        }
      }

      // Soft clinical limiter
      data[i] = Math.tanh(sample * 0.85) * 0.82;
    }
  } else {
    // Sustained "Aaa" Phonation synthesis with F0 + Formants + Jitter/Shimmer/HNR
    const { jitterPercent, shimmerPercent, hnrDb, seed, fundamentalFreqHz, formantsHz } = profile.phonation;
    const f0 = fundamentalFreqHz;
    const [f1, f2, f3] = formantsHz;
    const rand = createPrng(seed * 257 + 31);

    const noiseAmplitude = Math.max(0.015, Math.min(0.28, Math.pow(10, -hnrDb / 22) * 0.65));
    let phase = 0;
    let breathLp = 0;

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;

      // Smooth fade in / fade out envelope
      const fadeIn = Math.min(1, t / 0.14);
      const fadeOut = Math.min(1, Math.max(0, (durationSec - t) / 0.18));
      const env = fadeIn * fadeOut;

      // Subtle physiological vibrato + jitter perturbation
      const vibrato = Math.sin(2 * Math.PI * 5.2 * t) * 1.4;
      const jitterMod = 1 + (rand() * 2 - 1) * (jitterPercent * 0.008);
      const instF0 = Math.max(75, (f0 + vibrato) * jitterMod);

      phase += (2 * Math.PI * instF0) / sampleRate;

      // Glottal harmonic series shaped near /a/ formants
      let glottal = 0;
      const maxHarmonic = Math.min(18, Math.floor(3400 / instF0));
      for (let h = 1; h <= maxHarmonic; h++) {
        const harmFreq = h * instF0;
        // Gaussian formant weighting
        const g1 = Math.exp(-Math.pow((harmFreq - f1) / 140, 2));
        const g2 = Math.exp(-Math.pow((harmFreq - f2) / 190, 2)) * 0.72;
        const g3 = Math.exp(-Math.pow((harmFreq - f3) / 260, 2)) * 0.34;
        const baseSlope = 1 / Math.pow(h, 0.92);
        const amp = baseSlope * (0.25 + g1 + g2 + g3);
        glottal += Math.sin(h * phase) * amp;
      }

      // Shimmer amplitude modulation
      const shimmerMod = 1 + Math.sin(2 * Math.PI * 19 * t) * (shimmerPercent * 0.018);

      // Breathiness / glottal aspiration noise
      const white = rand() * 2 - 1;
      breathLp = breathLp * 0.65 + white * 0.35;

      const raw = (glottal * 0.24 * shimmerMod + breathLp * noiseAmplitude) * env;
      data[i] = Math.tanh(raw) * 0.72;
    }
  }

  return {
    buffer,
    durationSec,
    waveformPeaks: peaksFromChannelData(data),
  };
}
