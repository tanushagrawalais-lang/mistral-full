import { useEffect, useRef, useState } from 'react';
import type { AcousticChannelType, Level1Status } from '../lib/clinical';

export interface FrequencyChartData {
  fftBins: number[];
  fundamentalFreqHz: number;
  spectralCentroidHz: number;
  zeroCrossingRate: number;
  peakRmsEnergy?: number;
}

interface FftSpectrumChartProps {
  frequencyChartData: FrequencyChartData | null;
  level1Status: Level1Status | null;
  theme?: 'light' | 'dark';
  activeChannel: AcousticChannelType;
  isPlaying: boolean;
  playbackProgress: number;
}

export function FftSpectrumChart({
  frequencyChartData,
  level1Status,
  theme = 'light',
  activeChannel,
  isPlaying,
  playbackProgress,
}: FftSpectrumChartProps) {
  const isDark = theme === 'dark';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    binIndex: number;
    freqHz: number;
    magnitudePct: number;
    dbValue: number;
    x: number;
  } | null>(null);

  const activeBins = frequencyChartData?.fftBins ?? [];

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = 200;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, width, height);
      if (!frequencyChartData || activeBins.length === 0) return;

      const padLeft = 36;
      const padRight = 14;
      const padTop = 18;
      const padBottom = 26;
      const plotW = width - padLeft - padRight;
      const plotH = height - padTop - padBottom;

      // Grid lines (dB / normalized magnitude)
      ctx.strokeStyle = isDark ? 'rgba(226, 232, 240, 0.1)' : 'rgba(17, 19, 21, 0.08)';
      ctx.lineWidth = 1;
      ctx.font = '500 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = isDark ? 'rgba(226, 232, 240, 0.62)' : 'rgba(17, 19, 21, 0.5)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const yTicks = [
        { ratio: 0, label: '0 dB' },
        { ratio: 0.5, label: '-24' },
        { ratio: 1, label: '-48' },
      ];
      for (const tick of yTicks) {
        const y = padTop + tick.ratio * plotH;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(width - padRight, y);
        ctx.stroke();
        ctx.fillText(tick.label, padLeft - 6, y);
      }

      // Frequency X-axis ticks (0 - 8000 Hz)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xFreqs = [0, 1000, 2000, 4000, 6000, 8000];
      for (const freq of xFreqs) {
        const x = padLeft + (freq / 8000) * plotW;
        ctx.beginPath();
        ctx.strokeStyle = isDark ? 'rgba(226, 232, 240, 0.08)' : 'rgba(17, 19, 21, 0.06)';
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotH);
        ctx.stroke();
        ctx.fillStyle = isDark ? 'rgba(226, 232, 240, 0.65)' : 'rgba(17, 19, 21, 0.55)';
        ctx.fillText(freq === 0 ? '0' : `${freq / 1000}k`, x, padTop + plotH + 6);
      }

      // Color discipline: Urgent = #E63946, Normal = #0D9488/#2DD4BF, Monitor = #111315/#E2E8F0
      const primaryColor =
        level1Status === 'urgent'
          ? '#E63946'
          : level1Status === 'normal'
            ? isDark
              ? '#2DD4BF'
              : '#0D9488'
            : isDark
              ? '#E2E8F0'
              : '#111315';

      const primaryRgb =
        level1Status === 'urgent'
          ? '230, 57, 70'
          : level1Status === 'normal'
            ? isDark
              ? '45, 212, 191'
              : '13, 148, 136'
            : isDark
              ? '226, 232, 240'
              : '17, 19, 21';

      // Real-time playhead spectral shimmer synchronized with audio playhead
      const binCount = activeBins.length;
      const barWidth = plotW / binCount;
      const animatedBins = activeBins.map((val, idx) => {
        if (!isPlaying && playbackProgress === 0) return val;
        // Modulate bins around traveling playhead harmonic ripple
        const timePhase = playbackProgress * Math.PI * 10;
        const binHarmonic = Math.sin(idx * 0.45 + timePhase) * 0.065 + Math.cos(idx * 0.21 - timePhase * 1.3) * 0.04;
        const energyLift = isPlaying ? 0.045 : 0.015;
        return Math.max(0.03, Math.min(1, val + binHarmonic + energyLift));
      });

      // Draw FFT Bars
      for (let i = 0; i < binCount; i++) {
        const mag = animatedBins[i];
        const barH = mag * plotH;
        const x = padLeft + i * barWidth + 1;
        const y = padTop + plotH - barH;
        const w = Math.max(2, barWidth - 2);

        const isHovered = hoverInfo?.binIndex === i;
        ctx.fillStyle = isHovered
          ? isDark
            ? '#F8FAFC'
            : '#111315'
          : `rgba(${primaryRgb}, ${(0.22 + mag * 0.48).toFixed(2)})`;
        ctx.fillRect(x, y, w, barH);
      }

      // Smooth Spectral Envelope Curve over FFT bins
      ctx.beginPath();
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1.75;
      for (let i = 0; i < binCount; i++) {
        const x = padLeft + (i + 0.5) * barWidth;
        const y = padTop + plotH - animatedBins[i] * plotH;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevX = padLeft + (i - 0.5) * barWidth;
          const prevY = padTop + plotH - animatedBins[i - 1] * plotH;
          const midX = (prevX + x) / 2;
          ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + y) / 2);
        }
      }
      ctx.stroke();

      // Spectral Centroid vertical marker
      const centroidX = padLeft + (frequencyChartData.spectralCentroidHz / 8000) * plotW;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = isDark ? '#E2E8F0' : '#111315';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(centroidX, padTop);
      ctx.lineTo(centroidX, padTop + plotH);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = isDark ? '#E2E8F0' : '#111315';
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.textAlign = centroidX > width - 95 ? 'right' : 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(
        `SC ${frequencyChartData.spectralCentroidHz} Hz`,
        centroidX > width - 95 ? centroidX - 5 : centroidX + 5,
        padTop + 2
      );

      // Synchronized Playhead Sweeper Marker across timeline progress
      if (isPlaying || playbackProgress > 0) {
        const playX = padLeft + playbackProgress * plotW;
        ctx.strokeStyle = isDark ? 'rgba(45, 212, 191, 0.75)' : 'rgba(13, 148, 136, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(playX, padTop);
        ctx.lineTo(playX, padTop + plotH);
        ctx.stroke();
      }
    };

    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeBins, activeChannel, frequencyChartData, hoverInfo, isDark, isPlaying, level1Status, playbackProgress]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padLeft = 36;
    const padRight = 14;
    const plotW = rect.width - padLeft - padRight;
    if (x < padLeft || x > rect.width - padRight || plotW <= 0) {
      setHoverInfo(null);
      return;
    }

    if (activeBins.length === 0) {
      setHoverInfo(null);
      return;
    }
    const ratio = (x - padLeft) / plotW;
    const binIndex = Math.max(0, Math.min(activeBins.length - 1, Math.floor(ratio * activeBins.length)));
    const mag = activeBins[binIndex] ?? 0;
    const freqHz = Math.round((binIndex + 0.5) * 125);
    const dbValue = Number((-48 * (1 - mag)).toFixed(1));

    setHoverInfo({
      binIndex,
      freqHz,
      magnitudePct: Math.round(mag * 100),
      dbValue,
      x,
    });
  };

  return (
    <section
      aria-label="FFT Frequency Spectrum and Formant Chart"
      className="border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/90 dark:bg-[#111827]/88 backdrop-blur-md rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC]">
            FFT Frequency Spectrum & Formant Profile
          </h3>
          <p className="text-[11px] text-[#111315]/60 dark:text-[#F1F5F9]/60">
            {activeChannel === 'cough'
              ? 'Showing Voluntary Cough 64-bin spectral density (0–8 kHz)'
              : 'Showing Sustained /a/ Phonation harmonic & F1/F2/F3 formants'}
          </p>
        </div>

        {/* Acoustic Biomarker Readouts */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="block text-[10px] text-[#111315]/55 dark:text-[#F1F5F9]/55">
              Fundamental F0
            </span>
            <span className="font-mono font-semibold tabular-nums text-[#111315] dark:text-[#F8FAFC]">
              {frequencyChartData ? `${frequencyChartData.fundamentalFreqHz} Hz` : '—'}
            </span>
          </div>
          <span className="h-6 w-px bg-[#111315]/10 dark:bg-white/12" aria-hidden="true" />
          <div>
            <span className="block text-[10px] text-[#111315]/55 dark:text-[#F1F5F9]/55">
              Spectral Centroid
            </span>
            <span className="font-mono font-semibold tabular-nums text-[#111315] dark:text-[#F8FAFC]">
              {frequencyChartData ? `${frequencyChartData.spectralCentroidHz} Hz` : '—'}
            </span>
          </div>
          <span className="h-6 w-px bg-[#111315]/10 dark:bg-white/12" aria-hidden="true" />
          <div>
            <span className="block text-[10px] text-[#111315]/55 dark:text-[#F1F5F9]/55">
              Zero Crossing Rate
            </span>
            <span className="font-mono font-semibold tabular-nums text-[#111315] dark:text-[#F8FAFC]">
              {frequencyChartData ? frequencyChartData.zeroCrossingRate.toFixed(3) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Canvas Stage */}
      <div
        ref={containerRef}
        className="relative w-full bg-[#FAF9F6]/65 dark:bg-[#0B0F17]/75 rounded-lg border border-[#111315]/10 dark:border-white/12 overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
          className="block w-full h-[200px] cursor-crosshair"
        />

        {hoverInfo && (
          <div
            className="pointer-events-none absolute top-2 px-2.5 py-1 rounded bg-[#111315] dark:bg-[#F8FAFC] text-[#FAF9F6] dark:text-[#111315] font-mono text-[10px] tabular-nums shadow-sm whitespace-nowrap"
            style={{
              left: `${Math.min(Math.max(12, hoverInfo.x - 52), 420)}px`,
            }}
          >
            {hoverInfo.freqHz} Hz · {hoverInfo.dbValue} dB ({hoverInfo.magnitudePct}%)
          </div>
        )}
      </div>
    </section>
  );
}
