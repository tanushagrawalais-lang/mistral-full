import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import type { AcousticChannelType, Level1Status } from '../lib/clinical';
import {
  fallbackSynthesisProfile,
  sampleFromAudioBuffer,
  synthesizePatientAudio,
  type SynthesizedSample,
} from '../utils/audioSynthesizer';

interface AcousticSamplePlayerProps {
  playbackKey: string;
  coughAudioUrl: string | null;
  speechAudioUrl: string | null;
  level1Status: Level1Status | null;
  theme?: 'light' | 'dark';
  activeChannel: AcousticChannelType;
  onChannelChange: (channel: AcousticChannelType) => void;
  onPlaybackSync: (state: { isPlaying: boolean; progress: number; channel: AcousticChannelType }) => void;
}

type LoadedSample = SynthesizedSample & { source: 'storage' | 'synthetic' };

function formatTimeSec(sec: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
}

async function loadChannelSample(
  audioCtx: AudioContext,
  url: string | null,
  channel: AcousticChannelType,
  playbackKey: string,
): Promise<LoadedSample | null> {
  if (url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Audio fetch failed');
    const decoded = await audioCtx.decodeAudioData((await response.arrayBuffer()).slice(0));
    return { ...sampleFromAudioBuffer(decoded), source: 'storage' };
  }
  const profile = fallbackSynthesisProfile(`${playbackKey}:${channel}`);
  const durationSec = channel === 'cough' ? profile.cough.durationSec : profile.phonation.durationSec;
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, Math.max(1, Math.floor(22050 * durationSec)), 22050);
  return { ...synthesizePatientAudio(offline, profile, channel), source: 'synthetic' };
}

export function AcousticSamplePlayer({
  playbackKey,
  coughAudioUrl,
  speechAudioUrl,
  level1Status,
  theme = 'light',
  activeChannel,
  onChannelChange,
  onPlaybackSync,
}: AcousticSamplePlayerProps) {
  const isDark = theme === 'dark';
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number>(0);
  const playStartCtxTimeRef = useRef(0);
  const playOffsetSecRef = useRef(0);
  const samplesRef = useRef<Record<AcousticChannelType, LoadedSample | null>>({ cough: null, phonation: null });

  const [samples, setSamples] = useState<Record<AcousticChannelType, LoadedSample | null>>({
    cough: null,
    phonation: null,
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playingChannel, setPlayingChannel] = useState<AcousticChannelType | null>(null);
  const [offsets, setOffsets] = useState<Record<AcousticChannelType, number>>({ cough: 0, phonation: 0 });

  const stopPlayback = () => {
    cancelAnimationFrame(rafRef.current);
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore already stopped source
      }
      sourceNodeRef.current = null;
    }
    setPlayingChannel(null);
  };

  const ensureAudioContext = async (): Promise<AudioContext> => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  useEffect(() => {
    let cancelled = false;
    stopPlayback();
    setOffsets({ cough: 0, phonation: 0 });
    setSamples({ cough: null, phonation: null });
    onPlaybackSync({ isPlaying: false, progress: 0, channel: activeChannel });

    void (async () => {
      try {
        const ctx = await ensureAudioContext();
        const [cough, phonation] = await Promise.all([
          loadChannelSample(ctx, coughAudioUrl, 'cough', playbackKey),
          loadChannelSample(ctx, speechAudioUrl, 'phonation', playbackKey),
        ]);
        if (cancelled) return;
        const next = { cough, phonation };
        samplesRef.current = next;
        setSamples(next);
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Stored audio could not be loaded.');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Reload only when the screening or its stored URLs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackKey, coughAudioUrl, speechAudioUrl]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch {
          // Ignore
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const startChannelAtOffset = async (channel: AcousticChannelType, startSec: number) => {
    const sample = samplesRef.current[channel];
    if (!sample) return;
    const clampedStart =
      startSec >= sample.durationSec - 0.05 ? 0 : Math.max(0, Math.min(sample.durationSec, startSec));
    stopPlayback();
    onChannelChange(channel);
    const ctx = await ensureAudioContext();
    const liveBuffer = ctx.createBuffer(1, sample.buffer.length, sample.buffer.sampleRate);
    liveBuffer.copyToChannel(sample.buffer.getChannelData(0), 0);
    const src = ctx.createBufferSource();
    src.buffer = liveBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain);
    gain.connect(ctx.destination);
    playStartCtxTimeRef.current = ctx.currentTime;
    playOffsetSecRef.current = clampedStart;
    sourceNodeRef.current = src;
    setPlayingChannel(channel);
    src.onended = () => {
      cancelAnimationFrame(rafRef.current);
      sourceNodeRef.current = null;
      setPlayingChannel(null);
      setOffsets((prev) => ({ ...prev, [channel]: 0 }));
      onPlaybackSync({ isPlaying: false, progress: 0, channel });
    };
    src.start(0, clampedStart);
    const updateProgress = () => {
      if (!audioCtxRef.current || !sourceNodeRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - playStartCtxTimeRef.current;
      const currentSec = Math.min(sample.durationSec, playOffsetSecRef.current + elapsed);
      const progress = sample.durationSec > 0 ? currentSec / sample.durationSec : 0;
      setOffsets((prev) => ({ ...prev, [channel]: currentSec }));
      onPlaybackSync({ isPlaying: true, progress, channel });
      if (currentSec < sample.durationSec) rafRef.current = requestAnimationFrame(updateProgress);
    };
    rafRef.current = requestAnimationFrame(updateProgress);
  };

  const handleTogglePlay = async (channel: AcousticChannelType) => {
    if (playingChannel === channel) {
      const currentOffset = offsets[channel];
      stopPlayback();
      const duration = samples[channel]?.durationSec ?? 1;
      onPlaybackSync({ isPlaying: false, progress: duration > 0 ? currentOffset / duration : 0, channel });
      return;
    }
    await startChannelAtOffset(channel, offsets[channel]);
  };

  const handleScrub = (channel: AcousticChannelType, ratio: number) => {
    const sample = samples[channel];
    if (!sample) return;
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const targetSec = clampedRatio * sample.durationSec;
    onChannelChange(channel);
    setOffsets((prev) => ({ ...prev, [channel]: targetSec }));
    if (playingChannel === channel) {
      void startChannelAtOffset(channel, targetSec);
    } else {
      onPlaybackSync({ isPlaying: false, progress: clampedRatio, channel });
    }
  };

  const renderTrackCard = (channel: AcousticChannelType, title: string, url: string | null) => {
    const sample = samples[channel];
    const duration = sample?.durationSec ?? 0;
    const currentSec = offsets[channel];
    const progress = duration > 0 ? Math.min(1, currentSec / duration) : 0;
    const isTrackPlaying = playingChannel === channel;
    const isTrackActive = activeChannel === channel;
    const accentHex =
      level1Status === 'urgent' ? '#E63946' : level1Status === 'normal' ? (isDark ? '#2DD4BF' : '#0D9488') : isDark ? '#E2E8F0' : '#111315';
    const sourceLabel =
      sample?.source === 'storage'
        ? 'Convex storage stream'
        : sample?.source === 'synthetic'
          ? 'Synthetic preview — stored sample missing'
          : url
            ? 'Loading stored sample…'
            : 'Preparing synthetic preview…';

    return (
      <div
        className={`rounded-lg border p-3.5 transition-colors ${
          isTrackActive
            ? 'border-[#111315]/35 dark:border-white/30 bg-[#FFFFFF] dark:bg-[#1E293B]/80'
            : 'border-[#111315]/12 dark:border-white/12 bg-[#FAF9F6]/70 dark:bg-[#0B0F17]/55'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              onChannelChange(channel);
              onPlaybackSync({ isPlaying: isTrackPlaying, progress, channel });
            }}
            className="text-left text-xs font-bold text-[#111315] dark:text-[#F8FAFC] hover:underline cursor-pointer truncate"
          >
            {title}
          </button>
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="font-mono text-[11px] tabular-nums text-[#111315]/75 dark:text-[#F1F5F9]/75 whitespace-nowrap">
              {formatTimeSec(currentSec)} / {formatTimeSec(duration)}
            </span>
            <button
              type="button"
              disabled={!sample}
              onClick={() => void handleTogglePlay(channel)}
              aria-label={isTrackPlaying ? `Pause ${title}` : `Play ${title}`}
              className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 ${
                isTrackPlaying
                  ? 'bg-[#E63946] text-white'
                  : 'bg-[#111315] dark:bg-[#F8FAFC] text-[#FAF9F6] dark:text-[#111315]'
              }`}
            >
              {isTrackPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-[#111315]/60 dark:text-[#F1F5F9]/60 mt-1 mb-3">{sourceLabel}</p>
        <WaveformScrubber
          peaks={sample?.waveformPeaks ?? []}
          progress={progress}
          accentHex={accentHex}
          isDark={isDark}
          label={`Scrub ${title} audio`}
          onScrub={(ratio) => handleScrub(channel, ratio)}
        />
      </div>
    );
  };

  return (
    <section
      aria-label="Dual Acoustic Sample Player"
      className="border border-[#111315]/12 dark:border-white/14 bg-[#FFFFFF]/90 dark:bg-[#111827]/88 backdrop-blur-md rounded-xl p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-[#111315]/70 dark:text-[#F1F5F9]/75" aria-hidden="true" />
          <h3 className="text-xs font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC]">
            Dual Acoustic Sample Player
          </h3>
        </div>
        <span className="text-[11px] font-mono text-[#111315]/55 dark:text-[#F1F5F9]/55">Click waveform to scrub</span>
      </div>
      {loadError && (
        <p role="alert" className="text-[11px] text-[#E63946] dark:text-[#FF6B77]">
          {loadError}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {renderTrackCard('cough', 'Voluntary Cough', coughAudioUrl)}
        {renderTrackCard('phonation', 'Sustained "Aaa" Phonation', speechAudioUrl)}
      </div>
    </section>
  );
}

interface WaveformScrubberProps {
  peaks: number[];
  progress: number;
  accentHex: string;
  isDark: boolean;
  label: string;
  onScrub: (ratio: number) => void;
}

function WaveformScrubber({ peaks, progress, accentHex, isDark, label, onScrub }: WaveformScrubberProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const bars = peaks.length > 0 ? peaks : Array.from({ length: 48 }, () => 0.16);
  const computeRatio = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          onScrub(Math.min(1, progress + 0.05));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onScrub(Math.max(0, progress - 0.05));
        }
      }}
      onPointerDown={(e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrub(computeRatio(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        onScrub(computeRatio(e.clientX));
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      className="relative h-11 w-full rounded-md bg-[#FAF9F6] dark:bg-[#0B0F17]/80 border border-[#111315]/10 dark:border-white/12 px-1.5 flex items-center gap-[2px] cursor-ew-resize select-none touch-none"
    >
      {bars.map((peak, index) => {
        const barRatio = index / Math.max(1, bars.length - 1);
        const isPlayed = barRatio <= progress;
        return (
          <span
            key={index}
            aria-hidden="true"
            className="flex-1 rounded-[1px]"
            style={{
              height: `${Math.max(14, Math.round(peak * 86))}%`,
              backgroundColor: isPlayed ? accentHex : isDark ? 'rgba(226, 232, 240, 0.22)' : 'rgba(17, 19, 21, 0.18)',
            }}
          />
        );
      })}
      <span
        aria-hidden="true"
        className="absolute top-0.5 bottom-0.5 w-[2px] bg-[#111315] dark:bg-[#F8FAFC] pointer-events-none"
        style={{ left: `calc(${(progress * 100).toFixed(2)}% - 1px)` }}
      />
    </div>
  );
}
