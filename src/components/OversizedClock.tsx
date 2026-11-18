import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CloudSun, Lock } from 'lucide-react';

export type ModalWidthTier = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveClockMetrics {
  modalWidth: number;
  screenWidth: number;
  tier: ModalWidthTier;
  useCompactDate: boolean;
  clockClassName: string;
  dateClassName: string;
  lockIconClassName: string;
  weatherIconClassName: string;
  haloClassName: string;
}

interface UseResponsiveClockOptions {
  modalContainerRef?: React.RefObject<HTMLElement | null>;
  screenContainerRef?: React.RefObject<HTMLElement | null>;
}

function getInitialModalWidth(): number {
  if (typeof window === 'undefined') return 390;
  return window.innerWidth;
}

function resolveModalTier(modalWidth: number): ModalWidthTier {
  if (modalWidth < 640) return 'mobile';
  if (modalWidth < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Dynamically tracks the modal container width (and phone screen width) via ResizeObserver
 * so the lockscreen clock stays genuinely oversized on mobile viewports while maintaining
 * balanced iOS/Android proportion on larger tablet and desktop previews.
 */
export function useResponsiveClockSize({
  modalContainerRef,
  screenContainerRef,
}: UseResponsiveClockOptions): ResponsiveClockMetrics {
  const [modalWidth, setModalWidth] = useState<number>(getInitialModalWidth);
  const [screenWidth, setScreenWidth] = useState<number>(186);

  useEffect(() => {
    const readDimensions = () => {
      const modalEl = modalContainerRef?.current;
      const screenEl = screenContainerRef?.current;

      const nextModalWidth = modalEl
        ? Math.round(modalEl.getBoundingClientRect().width)
        : typeof window !== 'undefined'
          ? window.innerWidth
          : 390;

      if (nextModalWidth > 0) {
        setModalWidth(nextModalWidth);
      }

      if (screenEl) {
        const nextScreenWidth = Math.round(screenEl.getBoundingClientRect().width);
        if (nextScreenWidth > 0) {
          setScreenWidth(nextScreenWidth);
        }
      }
    };

    readDimensions();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        readDimensions();
      });

      if (modalContainerRef?.current) {
        observer.observe(modalContainerRef.current);
      }
      if (screenContainerRef?.current) {
        observer.observe(screenContainerRef.current);
      }

      window.addEventListener('resize', readDimensions, { passive: true });
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', readDimensions);
      };
    }

    window.addEventListener('resize', readDimensions, { passive: true });
    return () => {
      window.removeEventListener('resize', readDimensions);
    };
  }, [modalContainerRef, screenContainerRef]);

  return useMemo(() => {
    const tier = resolveModalTier(modalWidth);
    const useCompactDate = screenWidth < 176;

    if (tier === 'mobile') {
      // Mobile devices: maximize visual presence (~32.5% of screen width) so the clock feels unmistakably oversized
      return {
        modalWidth,
        screenWidth,
        tier,
        useCompactDate,
        clockClassName:
          'text-[length:clamp(48px,32.5cqw,68px)] leading-[0.86] tracking-[-0.045em]',
        dateClassName: 'text-[length:clamp(8.5px,4.8cqw,11px)]',
        lockIconClassName: 'h-3 w-3',
        weatherIconClassName: 'h-2.5 w-2.5',
        haloClassName: '-inset-x-4 -top-3 -bottom-2',
      };
    }

    if (tier === 'tablet') {
      // Larger tablet previews: scale cleanly with balanced vertical breathing room above notifications
      return {
        modalWidth,
        screenWidth,
        tier,
        useCompactDate,
        clockClassName:
          'text-[length:clamp(60px,29cqw,82px)] leading-[0.88] tracking-[-0.04em]',
        dateClassName: 'text-[length:clamp(10px,4.5cqw,12.5px)]',
        lockIconClassName: 'h-3.5 w-3.5',
        weatherIconClassName: 'h-3 w-3',
        haloClassName: '-inset-x-5 -top-3.5 -bottom-2.5',
      };
    }

    // Desktop studio stage: refined modern iOS/Android lockscreen proportion capped for elegance
    return {
      modalWidth,
      screenWidth,
      tier,
      useCompactDate,
      clockClassName:
        'text-[length:clamp(70px,27.5cqw,92px)] leading-[0.88] tracking-[-0.04em]',
      dateClassName: 'text-[length:clamp(11px,4.3cqw,13px)]',
      lockIconClassName: 'h-3.5 w-3.5',
      weatherIconClassName: 'h-3 w-3',
      haloClassName: '-inset-x-6 -top-4 -bottom-3',
    };
  }, [modalWidth, screenWidth]);
}

interface OversizedClockProps {
  timeText: string;
  dateText: string;
  compactDateText?: string;
  temperatureText?: string;
  modalContainerRef?: React.RefObject<HTMLElement | null>;
}

export function OversizedClock({
  timeText,
  dateText,
  compactDateText,
  temperatureText = '68°',
  modalContainerRef,
}: OversizedClockProps) {
  const localWrapperRef = useRef<HTMLDivElement | null>(null);
  const {
    tier,
    useCompactDate,
    clockClassName,
    dateClassName,
    lockIconClassName,
    weatherIconClassName,
    haloClassName,
  } = useResponsiveClockSize({
    modalContainerRef,
    screenContainerRef: localWrapperRef,
  });

  const renderedDate = useCompactDate && compactDateText ? compactDateText : dateText;

  return (
    <div
      ref={localWrapperRef}
      data-clock-tier={tier}
      className="relative flex w-full flex-col items-center text-center"
    >
      {/* Adaptive Soft Contrast Halo so the Oversized Clock Remains Crisp Over Bright Wallpapers */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.5)_0%,transparent_72%)] ${haloClassName}`}
      />

      <Lock
        className={`relative mb-1 text-white/95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${lockIconClassName}`}
      />

      <div
        className={`relative flex items-center justify-center gap-1 whitespace-nowrap font-semibold tracking-wide text-white [text-shadow:0_2px_10px_rgba(0,0,0,0.9)] ${dateClassName}`}
      >
        <span>{renderedDate}</span>
        <span aria-hidden="true" className="text-white/75">
          ·
        </span>
        <span className="inline-flex items-center gap-0.5 tabular-nums">
          <CloudSun className={`shrink-0 text-amber-200 ${weatherIconClassName}`} />
          <span>{temperatureText}</span>
        </span>
      </div>

      <span
        className={`relative mt-1 font-display font-extrabold text-white tabular-nums transition-[font-size] duration-150 [text-shadow:0_6px_28px_rgba(0,0,0,0.8),0_2px_6px_rgba(0,0,0,0.95)] ${clockClassName}`}
      >
        {timeText}
      </span>
    </div>
  );
}
