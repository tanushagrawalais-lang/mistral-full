import { useEffect, useRef } from 'react';
import dayMeadowArtwork from '../assets/images/hero_botanical_meadow_1794722134618.jpg';
import nightMeadowArtwork from '../assets/images/hero_botanical_meadow_night_1794762324886.jpg';
import type { Level1Status } from '../lib/clinical';

interface ResonanceCanvasProps {
  mode: 'welcome' | 'console';
  theme: 'light' | 'dark';
  riskScore: number | null;
  level1Status: Level1Status | null;
  isPlaying: boolean;
  playbackProgress: number;
}

const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS; // 33.33ms strict 30 FPS throttle

interface AmbientMote {
  dirX: number;
  dirY: number;
  z: number;
  speedZ: number;
  baseRadius: number;
  alpha: number;
  phase: number;
}

export function ResonanceCanvas({
  mode,
  theme,
  riskScore,
  level1Status,
  isPlaying,
  playbackProgress,
}: ResonanceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    mode,
    theme,
    riskScore: riskScore ?? 22,
    level1Status: level1Status ?? null,
    isPlaying,
    playbackProgress,
    smoothedAmplitude: 0.25,
    smoothedSpeed: 0.45,
    smoothedPulse: 0,
    smoothedConsoleVeil: mode === 'console' ? 1 : 0,
    smoothedDarkness: theme === 'dark' ? 1 : 0,
  });

  useEffect(() => {
    stateRef.current.mode = mode;
    stateRef.current.theme = theme;
    stateRef.current.riskScore = riskScore ?? 22;
    stateRef.current.level1Status = level1Status;
    stateRef.current.isPlaying = isPlaying;
    stateRef.current.playbackProgress = playbackProgress;
  }, [mode, theme, riskScore, level1Status, isPlaying, playbackProgress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let rafId = 0;
    let lastRenderTime = 0;
    let phaseTime = 0;
    let driftClock = 0;
    let forwardProgress = 0;

    // Load both sunny day and moonlit night botanical meadow paintings
    const dayImg = new Image();
    let dayReady = false;
    dayImg.onload = () => {
      dayReady = true;
      drawFrame(performance.now());
    };
    dayImg.src = dayMeadowArtwork;

    const nightImg = new Image();
    let nightReady = false;
    nightImg.onload = () => {
      nightReady = true;
      drawFrame(performance.now());
    };
    nightImg.src = nightMeadowArtwork;

    // Deterministic 3D depth motes moving forward from the meadow horizon toward the viewer
    const motes: AmbientMote[] = Array.from({ length: 34 }, (_, idx) => {
      const angle = ((idx * 137.5) % 360) * (Math.PI / 180);
      const spread = 0.28 + ((idx * 29) % 72) / 100;
      return {
        dirX: Math.cos(angle) * spread,
        dirY: Math.sin(angle) * spread * 0.62 + 0.06,
        z: 0.15 + ((idx * 19) % 85) / 100,
        speedZ: 0.0014 + (idx % 4) * 0.00035,
        baseRadius: 1.0 + (idx % 3) * 0.45,
        alpha: 0.22 + (idx % 4) * 0.065,
        phase: idx * 0.65,
      };
    });

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Draw image anchored at the meadow horizon (0.5, 0.43) so zooming expands foreground outward toward viewer
    const drawCoverImage = (
      img: HTMLImageElement,
      alpha: number,
      zoom: number,
      width: number,
      height: number
    ) => {
      if (alpha <= 0.005) return;
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const viewAspect = width / Math.max(1, height);

      let drawW = width * zoom;
      let drawH = drawW / imgAspect;
      if (drawH < height * zoom) {
        drawH = height * zoom;
        drawW = drawH * imgAspect;
      }
      if (viewAspect > imgAspect) {
        drawW = width * zoom;
        drawH = drawW / imgAspect;
      }

      // Anchor slightly above vertical center (horizon line) for an authentic walking-into-field perspective
      const horizonY = 0.43;
      const drawX = (width - drawW) * 0.5;
      const drawY = (height - drawH) * horizonY;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();
    };

    // Seamless infinite forward Z-camera glide (crossfades two half-cycle zoomed layers with zero jump)
    const drawForwardGlidingArtwork = (
      img: HTMLImageElement,
      baseAlpha: number,
      cycle: number,
      width: number,
      height: number
    ) => {
      if (baseAlpha <= 0.005) return;
      if (prefersReducedMotion) {
        drawCoverImage(img, baseAlpha, 1.04, width, height);
        return;
      }

      const maxZoomDelta = 0.28;
      const pA = cycle % 1;
      const pB = (cycle + 0.5) % 1;

      const smoothstep = (t: number) => t * t * (3 - 2 * t);

      if (pA < 0.5) {
        // Layer B (0.5 -> 1.0) underneath, Layer A (0.0 -> 0.5) fading smoothly in on top
        const zoomB = 1.0 + pB * maxZoomDelta;
        const zoomA = 1.0 + pA * maxZoomDelta;
        const blendA = smoothstep(pA * 2);
        drawCoverImage(img, baseAlpha, zoomB, width, height);
        drawCoverImage(img, baseAlpha * blendA, zoomA, width, height);
      } else {
        // Layer A (0.5 -> 1.0) underneath, Layer B (0.0 -> 0.5) fading smoothly in on top
        const zoomA = 1.0 + pA * maxZoomDelta;
        const zoomB = 1.0 + pB * maxZoomDelta;
        const blendB = smoothstep(pB * 2);
        drawCoverImage(img, baseAlpha, zoomA, width, height);
        drawCoverImage(img, baseAlpha * blendB, zoomB, width, height);
      }
    };

    const drawFrame = (timeMs: number) => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const s = stateRef.current;

      const isConsole = s.mode === 'console';
      const targetVeil = isConsole ? 1 : 0;
      const targetDark = s.theme === 'dark' ? 1 : 0;
      s.smoothedConsoleVeil += (targetVeil - s.smoothedConsoleVeil) * 0.1;
      s.smoothedDarkness += (targetDark - s.smoothedDarkness) * 0.14;

      const normalizedRisk = Math.max(0, Math.min(1, s.riskScore / 100));
      const targetAmp = isConsole
        ? 0.24 + normalizedRisk * 0.55 + (s.isPlaying ? 0.34 : 0)
        : 0.22;
      const targetSpeed = isConsole
        ? 0.42 + normalizedRisk * 0.55 + (s.isPlaying ? 0.55 : 0)
        : 0.35;
      const targetPulse = isConsole && s.isPlaying ? 1 : 0;

      s.smoothedAmplitude += (targetAmp - s.smoothedAmplitude) * 0.08;
      s.smoothedSpeed += (targetSpeed - s.smoothedSpeed) * 0.08;
      s.smoothedPulse += (targetPulse - s.smoothedPulse) * 0.12;

      if (!prefersReducedMotion) {
        phaseTime += 0.022 * s.smoothedSpeed;
        driftClock += 0.015;
        // Calm, unhurried forward glide (~34 seconds per seamless depth cycle at 30 FPS)
        forwardProgress = (forwardProgress + 0.00098) % 1;
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Base Painterly Botanical Meadow (Day or Moonlit Night) gliding steadily forward into the screen
      ctx.fillStyle = s.smoothedDarkness > 0.5 ? '#0B0F17' : '#FAF9F6';
      ctx.fillRect(0, 0, width, height);

      if (dayReady && dayImg.naturalWidth > 0 && s.smoothedDarkness < 0.99) {
        drawForwardGlidingArtwork(dayImg, 1 - s.smoothedDarkness, forwardProgress, width, height);
      }
      if (nightReady && nightImg.naturalWidth > 0 && s.smoothedDarkness > 0.01) {
        drawForwardGlidingArtwork(nightImg, s.smoothedDarkness, forwardProgress, width, height);
      }

      // 2. Calm Z-depth radial mist & forward-drifting motes (moving outward from horizon toward viewer)
      if (!prefersReducedMotion) {
        const mistVisibility = 1 - s.smoothedConsoleVeil * 0.55;
        const isDarkTheme = s.smoothedDarkness > 0.5;
        const horizonX = width * 0.5;
        const horizonY = height * 0.44;

        // Soft expanding depth mist rings from the valley horizon
        for (let b = 0; b < 2; b++) {
          const mistCycle = (forwardProgress + b * 0.5) % 1;
          const mistRadius = width * (0.12 + mistCycle * 0.55);
          const mistFade = Math.sin(mistCycle * Math.PI);

          ctx.save();
          ctx.translate(horizonX, horizonY + mistCycle * height * 0.18);
          ctx.scale(1.4, 0.55);
          const mistGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, mistRadius);
          const mistRgb = isDarkTheme ? '218, 228, 244' : '255, 252, 244';
          const mistAlpha = (isDarkTheme ? 0.09 : 0.16) * mistFade * mistVisibility;
          mistGrad.addColorStop(0, `rgba(${mistRgb}, ${mistAlpha.toFixed(3)})`);
          mistGrad.addColorStop(1, `rgba(${mistRgb}, 0)`);
          ctx.fillStyle = mistGrad;
          ctx.beginPath();
          ctx.arc(0, 0, mistRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Motes traveling forward out of the meadow toward the viewer (3D perspective projection)
        for (const m of motes) {
          m.z -= m.speedZ;
          if (m.z <= 0.08) {
            m.z = 1.0;
          }

          const depthScale = 0.24 / m.z;
          const px = horizonX + m.dirX * width * depthScale;
          const py = horizonY + m.dirY * height * depthScale;

          if (px < -10 || px > width + 10 || py < -10 || py > height + 10) {
            continue;
          }

          const depthFade = Math.sin(Math.min(1, Math.max(0, (1 - m.z) / 0.92)) * Math.PI);
          const shimmer = 0.72 + 0.28 * Math.sin(driftClock * 1.8 + m.phase);
          const radius = m.baseRadius * (0.65 + (1 - m.z) * 1.15);

          ctx.beginPath();
          const moteRgb = isDarkTheme ? '241, 245, 249' : '255, 248, 224';
          ctx.fillStyle = `rgba(${moteRgb}, ${(m.alpha * depthFade * shimmer * mistVisibility).toFixed(3)})`;
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 3. Atmospheric Scrim (Day vs Night across Welcome & Console modes)
      const welcomeScrimAlpha = 1 - s.smoothedConsoleVeil;
      const d = s.smoothedDarkness;

      if (welcomeScrimAlpha > 0.02) {
        if (d <= 0.5) {
          const lightStrength = (1 - d * 2) * welcomeScrimAlpha;
          const skyMist = ctx.createLinearGradient(0, 0, 0, height);
          skyMist.addColorStop(0, `rgba(250, 249, 246, ${(0.52 * lightStrength).toFixed(3)})`);
          skyMist.addColorStop(0.32, `rgba(250, 249, 246, ${(0.18 * lightStrength).toFixed(3)})`);
          skyMist.addColorStop(0.75, `rgba(250, 249, 246, ${(0.22 * lightStrength).toFixed(3)})`);
          skyMist.addColorStop(1, `rgba(250, 249, 246, ${(0.88 * lightStrength).toFixed(3)})`);
          ctx.fillStyle = skyMist;
          ctx.fillRect(0, 0, width, height);
        } else {
          const darkStrength = ((d - 0.5) * 2) * welcomeScrimAlpha;
          const nightMist = ctx.createLinearGradient(0, 0, width, 0);
          nightMist.addColorStop(0, `rgba(11, 15, 23, ${(0.58 * darkStrength).toFixed(3)})`);
          nightMist.addColorStop(0.55, `rgba(11, 15, 23, ${(0.22 * darkStrength).toFixed(3)})`);
          nightMist.addColorStop(1, `rgba(11, 15, 23, ${(0.18 * darkStrength).toFixed(3)})`);
          ctx.fillStyle = nightMist;
          ctx.fillRect(0, 0, width, height);
        }
      }

      if (s.smoothedConsoleVeil > 0.02) {
        if (d <= 0.5) {
          ctx.fillStyle = `rgba(250, 249, 246, ${(0.79 * s.smoothedConsoleVeil).toFixed(3)})`;
        } else {
          ctx.fillStyle = `rgba(11, 15, 23, ${(0.76 * s.smoothedConsoleVeil).toFixed(3)})`;
        }
        ctx.fillRect(0, 0, width, height);
      }

      // 4. Procedural Acoustic Resonance Wave Contours (calm 30 FPS subtle telemetry lines)
      const isDarkMode = d > 0.5;
      let accentRgb = isDarkMode ? '226, 232, 240' : '17, 19, 21';
      if (isConsole) {
        if (s.level1Status === 'urgent') {
          accentRgb = '230, 57, 70';
        } else if (s.level1Status === 'normal') {
          accentRgb = isDarkMode ? '45, 212, 191' : '13, 148, 136';
        }
      } else {
        accentRgb = isDarkMode ? '226, 232, 240' : '13, 148, 136';
      }

      const secondaryRgb = isDarkMode ? '226, 232, 240' : '17, 19, 21';
      const contourCount = isConsole ? 7 : 4;
      const baseCenterY = isConsole ? height * 0.56 : height * 0.42;
      const xStep = Math.max(12, Math.floor(width / 88));

      for (let c = 0; c < contourCount; c++) {
        const ratio = c / Math.max(1, contourCount - 1);
        const isPrimaryContour = c === 1 || c === 3;
        const yOffset = (c - (contourCount - 1) / 2) * (height * (isConsole ? 0.075 : 0.065));

        const baseAlpha = isConsole
          ? isPrimaryContour
            ? 0.075 + s.smoothedPulse * 0.055
            : 0.04 + s.smoothedPulse * 0.028
          : isPrimaryContour
            ? 0.08
            : 0.04;

        ctx.beginPath();
        ctx.strokeStyle = isPrimaryContour
          ? `rgba(${accentRgb}, ${baseAlpha.toFixed(3)})`
          : `rgba(${secondaryRgb}, ${baseAlpha.toFixed(3)})`;
        ctx.lineWidth = isPrimaryContour ? 1.35 : 0.9;

        const freqA = 0.0022 + ratio * 0.001 + (isConsole ? normalizedRisk * 0.0012 : 0);
        const freqB = 0.0048 + ratio * 0.0017;
        const ampPx = (16 + ratio * 18) * s.smoothedAmplitude;

        const playbackWaveBoost =
          s.smoothedPulse * Math.sin(s.playbackProgress * Math.PI * 6 + c) * 8;

        for (let x = 0; x <= width + xStep; x += xStep) {
          const nx = x / Math.max(1, width);
          const envelope = Math.sin(nx * Math.PI);
          const wave1 = Math.sin(x * freqA + phaseTime + c * 0.85) * ampPx;
          const wave2 =
            Math.cos(x * freqB - phaseTime * 0.72 + c * 1.4) *
            (ampPx * 0.4 + playbackWaveBoost);
          const harmonicRipple = isConsole
            ? Math.sin(x * (freqA * 2.8) + phaseTime * 1.35) *
              (normalizedRisk * 9 * s.smoothedAmplitude)
            : 0;

          const y =
            baseCenterY + yOffset + (wave1 + wave2 + harmonicRipple) * (0.45 + 0.55 * envelope);

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      }

      lastRenderTime = timeMs;
    };

    const tick = (now: number) => {
      if (now - lastRenderTime >= FRAME_INTERVAL_MS) {
        drawFrame(now);
      }
      if (!prefersReducedMotion) {
        rafId = requestAnimationFrame(tick);
      }
    };

    drawFrame(performance.now());
    if (!prefersReducedMotion) {
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0"
    />
  );
}
