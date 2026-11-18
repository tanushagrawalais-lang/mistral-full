export type FrequencyChartData = {
  fftBins: number[];
  fundamentalFreqHz: number;
  spectralCentroidHz: number;
  zeroCrossingRate: number;
  peakRmsEnergy: number;
};

export type CaptureResult = {
  blob: Blob;
  mimeType: string;
  compressedAudioBytes: number;
  frequencyChartData: FrequencyChartData;
  objectUrl: string;
};

const TARGET_SAMPLE_RATE = 16000;
const RECORD_BITS_PER_SECOND = 16000;
const ANALYSER_FFT_SIZE = 256;
const BIN_COUNT = 32;

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function describeMicrophoneError(error: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
    return "Microphone access needs HTTPS (or localhost). Open this PHC field unit over a secure connection.";
  }
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: string }).name)
      : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone permission was denied. Allow the mic in the browser settings and try again.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No microphone was found on this handset.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "The microphone is already in use by another app.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not open the microphone.";
}

async function openMicrophone(): Promise<MediaStream> {
  if (typeof window !== "undefined" && !window.isSecureContext && window.location.hostname !== "localhost") {
    throw new Error(
      "Microphone access needs HTTPS (or localhost). Open this PHC field unit over a secure connection.",
    );
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser cannot record audio.");
  }
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: TARGET_SAMPLE_RATE,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
}

function downsampleSpectrum(magnitudes: Uint8Array<ArrayBufferLike>): number[] {
  const usable = Math.floor(magnitudes.length / 2);
  const group = Math.max(1, Math.floor(usable / BIN_COUNT));
  const bins: number[] = [];
  for (let i = 0; i < BIN_COUNT; i++) {
    let sum = 0;
    const start = i * group;
    const end = Math.min(usable, start + group);
    for (let j = start; j < end; j++) sum += magnitudes[j] ?? 0;
    const count = Math.max(1, end - start);
    bins.push(Number(Math.min(1, sum / count / 255).toFixed(3)));
  }
  return bins;
}

function biomarkersFromCapture(
  frequencyAccum: Float32Array,
  frames: number,
  timeSamples: Float32Array,
  sampleRate: number,
): FrequencyChartData {
  const fftBins = Array.from(frequencyAccum, (value) =>
    Number(Math.min(1, value / Math.max(1, frames)).toFixed(3)),
  );
  let peakIndex = 0;
  let peak = 0;
  let magSum = 0;
  let weighted = 0;
  const nyquist = sampleRate / 2;
  for (let i = 0; i < fftBins.length; i++) {
    const mag = fftBins[i] ?? 0;
    const freq = ((i + 0.5) / BIN_COUNT) * nyquist;
    magSum += mag;
    weighted += mag * freq;
    if (mag > peak) {
      peak = mag;
      peakIndex = i;
    }
  }
  let crossings = 0;
  let peakAbs = 0;
  let energy = 0;
  for (let i = 0; i < timeSamples.length; i++) {
    const sample = timeSamples[i] ?? 0;
    const abs = Math.abs(sample);
    if (abs > peakAbs) peakAbs = abs;
    energy += sample * sample;
    if (i > 0) {
      const prev = timeSamples[i - 1] ?? 0;
      if ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0)) crossings += 1;
    }
  }
  const rms = timeSamples.length > 0 ? Math.sqrt(energy / timeSamples.length) : 0;
  return {
    fftBins,
    fundamentalFreqHz: Math.round(((peakIndex + 0.5) / BIN_COUNT) * nyquist),
    spectralCentroidHz: Math.round(magSum > 0 ? weighted / magSum : 0),
    zeroCrossingRate: Number(
      Math.max(0, Math.min(1, timeSamples.length > 1 ? crossings / (timeSamples.length - 1) : 0)).toFixed(3),
    ),
    peakRmsEnergy: Number(Math.max(peakAbs, rms).toFixed(4)),
  };
}

export class EdgeAudioRecorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private rafId = 0;
  private frequencyAccum = new Float32Array(BIN_COUNT);
  private frames = 0;
  private timeSamples: number[] = [];
  private onBars: ((bars: number[]) => void) | null = null;

  async start(onBars: (bars: number[]) => void): Promise<void> {
    this.resetAnalysis();
    this.onBars = onBars;
    this.stream = await openMicrophone();
    const mimeType = pickRecorderMimeType();
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType, audioBitsPerSecond: RECORD_BITS_PER_SECOND })
      : new MediaRecorder(this.stream, { audioBitsPerSecond: RECORD_BITS_PER_SECOND });
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new Ctx();
    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = ANALYSER_FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.65;
    this.sourceNode.connect(this.analyser);
    this.tick();
    this.mediaRecorder.start(100);
  }

  async stop(): Promise<CaptureResult> {
    const recorder = this.mediaRecorder;
    const mimeType = recorder?.mimeType || pickRecorderMimeType() || "audio/webm";
    const blob = await new Promise<Blob>((resolve, reject) => {
      if (!recorder || recorder.state === "inactive") {
        resolve(new Blob(this.chunks, { type: mimeType }));
        return;
      }
      recorder.onerror = () => reject(new Error("Recording failed."));
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: mimeType }));
      recorder.stop();
    });
    const sampleRate = this.audioContext?.sampleRate ?? TARGET_SAMPLE_RATE;
    const frequencyChartData = biomarkersFromCapture(
      this.frequencyAccum,
      this.frames,
      Float32Array.from(this.timeSamples),
      sampleRate,
    );
    this.teardown();
    return {
      blob,
      mimeType: blob.type || mimeType,
      compressedAudioBytes: blob.size,
      frequencyChartData,
      objectUrl: URL.createObjectURL(blob),
    };
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignore an already-stopped recorder.
      }
    }
    this.teardown();
  }

  private tick = () => {
    if (!this.analyser) return;
    const frequency = new Uint8Array(this.analyser.frequencyBinCount);
    const waveform = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteFrequencyData(frequency);
    this.analyser.getByteTimeDomainData(waveform);
    const bins = downsampleSpectrum(frequency);
    for (let i = 0; i < BIN_COUNT; i++) {
      this.frequencyAccum[i] = (this.frequencyAccum[i] ?? 0) + (bins[i] ?? 0);
    }
    this.frames += 1;
    for (let i = 0; i < waveform.length; i++) {
      this.timeSamples.push(((waveform[i] ?? 128) - 128) / 128);
    }
    this.onBars?.(bins);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private resetAnalysis() {
    this.frequencyAccum = new Float32Array(BIN_COUNT);
    this.frames = 0;
    this.timeSamples = [];
  }

  private teardown() {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.onBars = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.analyser = null;
    if (this.audioContext && this.audioContext.state !== "closed") {
      void this.audioContext.close();
    }
    this.audioContext = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.mediaRecorder = null;
  }
}

export function formatOpusKb(bytes: number): string {
  const kb = bytes / 1024;
  return `${kb >= 10 ? kb.toFixed(1) : kb.toFixed(2)} KB`;
}
