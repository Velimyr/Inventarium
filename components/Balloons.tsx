import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Святкові кульки 🎈
 * Літають по головній сторінці один раз на рік — 29 червня.
 * Кульки можна лопати кліком (десктоп) або дотиком (мобільні).
 *
 * Для попереднього перегляду в будь-який день: додати ?balloons=1 до URL.
 */

const COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#22C55E', // green
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

type BalloonParams = {
  left: number; // vw
  width: number; // px
  color: string;
  duration: number; // s (підйом)
  sway: number; // px амплітуда коливання
};

function makeParams(): BalloonParams {
  const width = rand(38, 64);
  return {
    left: rand(2, 92),
    width,
    color: pick(COLORS),
    duration: rand(9, 17),
    sway: rand(20, 55) * (Math.random() < 0.5 ? -1 : 1),
  };
}

function Balloon() {
  const [params, setParams] = useState<BalloonParams>(makeParams);
  const [cycle, setCycle] = useState(0);
  const [popped, setPopped] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Невелика випадкова затримка старту, щоб кульки не злітали одночасно
  const startDelay = useRef(rand(0, 8)).current;

  const respawn = useCallback(() => {
    setParams(makeParams());
    setPopped(false);
    setCycle((c) => c + 1);
  }, []);

  const handlePop = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (popped) return;
      setPopped(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(respawn, 480);
    },
    [popped, respawn]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const height = params.width * 1.22;

  return (
    <div
      key={cycle}
      className="balloon-rise"
      style={
        {
          left: `${params.left}vw`,
          animationDuration: `${params.duration}s`,
          animationDelay: cycle === 0 ? `${startDelay}s` : '0s',
          animationPlayState: popped ? 'paused' : 'running',
          ['--sway' as string]: `${params.sway}px`,
        } as React.CSSProperties
      }
      onAnimationEnd={(e) => {
        // Підйом анімується на самому елементі (target === currentTarget);
        // pop/burst — на дочірніх вузлах, тож їх ігноруємо.
        if (e.target === e.currentTarget && !popped) respawn();
      }}
    >
      <button
        type="button"
        aria-label="Лопнути кульку"
        className={`balloon-hit${popped ? ' is-popped' : ''}`}
        onPointerDown={handlePop}
        style={{ width: params.width, height: height + 26 }}
      >
        <svg
          width={params.width}
          height={height + 26}
          viewBox={`0 0 ${params.width} ${height + 26}`}
          className="balloon-svg"
          aria-hidden="true"
        >
          {/* нитка */}
          <path
            d={`M ${params.width / 2} ${height} q 6 10 -2 16 q -8 6 0 ${10}`}
            stroke={params.color}
            strokeWidth={1.2}
            fill="none"
            opacity={0.6}
          />
          {/* тіло кульки */}
          <ellipse
            cx={params.width / 2}
            cy={height / 2}
            rx={params.width / 2 - 2}
            ry={height / 2 - 2}
            fill={params.color}
          />
          {/* вузлик */}
          <path
            d={`M ${params.width / 2 - 4} ${height - 3} L ${params.width / 2 + 4} ${height - 3} L ${params.width / 2} ${height + 4} Z`}
            fill={params.color}
          />
          {/* відблиск */}
          <ellipse
            cx={params.width / 2 - params.width * 0.16}
            cy={height / 2 - height * 0.18}
            rx={params.width * 0.12}
            ry={height * 0.16}
            fill="#ffffff"
            opacity={0.45}
          />
        </svg>

        {/* частинки при лусканні */}
        {popped && (
          <span className="burst" aria-hidden="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="burst-piece"
                style={
                  {
                    background: params.color,
                    ['--angle' as string]: `${i * 45}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
          </span>
        )}
      </button>
    </div>
  );
}

export default function Balloons() {
  const [show, setShow] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const now = new Date();
    const isBalloonDay = now.getMonth() === 5 && now.getDate() === 29; // 29 червня
    const forced =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('balloons');

    if (!isBalloonDay && !forced) return;

    // Менше кульок на вузьких екранах
    const isMobile = window.innerWidth < 640;
    setCount(isMobile ? 9 : 16);
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="balloons-overlay" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Balloon key={i} />
      ))}

      <style jsx>{`
        .balloons-overlay {
          position: fixed;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 60;
        }
        .balloon-rise {
          position: absolute;
          bottom: -180px;
          will-change: transform;
          animation-name: balloonRise;
          animation-timing-function: linear;
          animation-iteration-count: 1;
          animation-fill-mode: forwards;
        }
        .balloon-hit {
          pointer-events: auto;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          position: relative;
          display: block;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          transform-origin: center;
        }
        .balloon-svg {
          display: block;
          filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.18));
          transition: transform 0.15s ease;
        }
        .balloon-hit:hover .balloon-svg {
          transform: scale(1.05);
        }
        .balloon-hit.is-popped .balloon-svg {
          animation: balloonPop 0.25s ease-out forwards;
        }
        .burst {
          position: absolute;
          inset: 0;
          display: block;
        }
        .burst-piece {
          position: absolute;
          top: 38%;
          left: 50%;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          transform: rotate(var(--angle)) translateY(0);
          animation: burstFly 0.45s ease-out forwards;
        }
        @keyframes balloonRise {
          0% {
            transform: translateY(0) translateX(0) rotate(-2deg);
          }
          25% {
            transform: translateY(-25vh) translateX(var(--sway)) rotate(2deg);
          }
          50% {
            transform: translateY(-50vh) translateX(calc(var(--sway) * -1))
              rotate(-2deg);
          }
          75% {
            transform: translateY(-75vh) translateX(var(--sway)) rotate(2deg);
          }
          100% {
            transform: translateY(calc(-100vh - 220px)) translateX(0)
              rotate(0deg);
          }
        }
        @keyframes balloonPop {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          40% {
            transform: scale(1.35);
            opacity: 0.9;
          }
          100% {
            transform: scale(0.1);
            opacity: 0;
          }
        }
        @keyframes burstFly {
          0% {
            transform: rotate(var(--angle)) translateY(0);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--angle)) translateY(-34px);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .balloon-rise {
            animation-duration: 22s !important;
          }
        }
      `}</style>
    </div>
  );
}
