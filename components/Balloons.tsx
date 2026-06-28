import { useEffect, useRef, useState } from 'react';

/**
 * Святкові кульки 🎈
 * Вільно літають по всьому екрану головної сторінки — один раз на рік, 29 червня.
 * Кульку можна лопнути кліком (десктоп) або дотиком (мобільні).
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

type Spec = {
  color: string;
  w: number; // ширина кульки, px
  h: number; // повна висота вузла (з ниткою), px
};

type Physics = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number; // фаза похитування
  wobble: number; // амплітуда похитування
  popped: boolean;
};

export default function Balloons() {
  const [specs, setSpecs] = useState<Spec[] | null>(null);

  const physicsRef = useRef<Physics[]>([]);
  const nodesRef = useRef<(HTMLButtonElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Гейтинг: показуємо лише 29 червня або за ?balloons=1
  useEffect(() => {
    const now = new Date();
    const isBalloonDay = now.getMonth() === 5 && now.getDate() === 29;
    const forced =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('balloons');

    if (!isBalloonDay && !forced) return;

    const isMobile = window.innerWidth < 640;
    const count = isMobile ? 10 : 18;

    const W = window.innerWidth;
    const H = window.innerHeight;

    const newSpecs: Spec[] = [];
    const phys: Physics[] = [];

    for (let i = 0; i < count; i++) {
      const w = rand(36, 62);
      const h = w * 1.22 + 26;
      newSpecs.push({ color: pick(COLORS), w, h });

      const speed = rand(0.35, 0.9);
      const angle = rand(0, Math.PI * 2);
      phys.push({
        x: rand(0, Math.max(0, W - w)),
        y: rand(0, Math.max(0, H - h)),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        phase: rand(0, Math.PI * 2),
        wobble: rand(0.3, 0.9),
        popped: false,
      });
    }

    physicsRef.current = phys;
    nodesRef.current = new Array(count).fill(null);
    setSpecs(newSpecs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Цикл анімації
  useEffect(() => {
    if (!specs) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    const onResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    let last = performance.now();

    const tick = (t: number) => {
      // нормалізуємо до ~60fps, щоб швидкість не залежала від частоти кадрів
      const dt = Math.min(3, (t - last) / 16.67);
      last = t;

      const phys = physicsRef.current;
      for (let i = 0; i < phys.length; i++) {
        const p = phys[i];
        const node = nodesRef.current[i];
        if (!node) continue;
        if (p.popped) continue; // лопнута — стоїть на місці поки грає ефект

        const spec = specs[i];
        p.phase += 0.02 * dt;

        p.x += p.vx * dt;
        p.y += (p.vy + Math.sin(p.phase) * 0.12) * dt;

        const maxX = Math.max(0, W - spec.w);
        const maxY = Math.max(0, H - spec.h);

        if (p.x <= 0) {
          p.x = 0;
          p.vx = Math.abs(p.vx);
        } else if (p.x >= maxX) {
          p.x = maxX;
          p.vx = -Math.abs(p.vx);
        }
        if (p.y <= 0) {
          p.y = 0;
          p.vy = Math.abs(p.vy);
        } else if (p.y >= maxY) {
          p.y = maxY;
          p.vy = -Math.abs(p.vy);
        }

        const tilt = Math.sin(p.phase) * 6 * p.wobble + p.vx * 4;
        node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${tilt}deg)`;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const timers = timersRef.current;
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, [specs]);

  const pop = (i: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const p = physicsRef.current[i];
    const node = nodesRef.current[i];
    if (!p || !node || p.popped) return;

    p.popped = true;
    node.classList.add('is-popped');

    const id = setTimeout(() => {
      // Відроджуємо кульку в новій випадковій точці
      const W = window.innerWidth;
      const H = window.innerHeight;
      const spec = specs![i];
      const speed = rand(0.35, 0.9);
      const angle = rand(0, Math.PI * 2);

      p.x = rand(0, Math.max(0, W - spec.w));
      p.y = Math.max(0, H - spec.h); // з'являється знизу
      p.vx = Math.cos(angle) * speed;
      p.vy = -Math.abs(Math.sin(angle) * speed); // спершу вгору
      p.popped = false;

      node.classList.remove('is-popped');
      node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      timersRef.current.delete(i);
    }, 460);

    timersRef.current.set(i, id);
  };

  if (!specs) return null;

  return (
    <div className="balloons-overlay" aria-hidden="true">
      {specs.map((spec, i) => {
        const p = physicsRef.current[i];
        const bodyH = spec.h - 26;
        return (
          <button
            key={i}
            type="button"
            aria-label="Лопнути кульку"
            className="balloon-hit"
            ref={(el) => {
              nodesRef.current[i] = el;
            }}
            onPointerDown={(e) => pop(i, e)}
            style={{
              width: spec.w,
              height: spec.h,
              transform: p
                ? `translate3d(${p.x}px, ${p.y}px, 0)`
                : undefined,
            }}
          >
            <svg
              width={spec.w}
              height={spec.h}
              viewBox={`0 0 ${spec.w} ${spec.h}`}
              className="balloon-svg"
              aria-hidden="true"
            >
              {/* нитка */}
              <path
                d={`M ${spec.w / 2} ${bodyH} q 6 10 -2 16 q -8 6 0 10`}
                stroke={spec.color}
                strokeWidth={1.2}
                fill="none"
                opacity={0.6}
              />
              {/* тіло */}
              <ellipse
                cx={spec.w / 2}
                cy={bodyH / 2}
                rx={spec.w / 2 - 2}
                ry={bodyH / 2 - 2}
                fill={spec.color}
              />
              {/* вузлик */}
              <path
                d={`M ${spec.w / 2 - 4} ${bodyH - 3} L ${spec.w / 2 + 4} ${bodyH - 3} L ${spec.w / 2} ${bodyH + 4} Z`}
                fill={spec.color}
              />
              {/* відблиск */}
              <ellipse
                cx={spec.w / 2 - spec.w * 0.16}
                cy={bodyH / 2 - bodyH * 0.18}
                rx={spec.w * 0.12}
                ry={bodyH * 0.16}
                fill="#ffffff"
                opacity={0.45}
              />
            </svg>

            {/* частинки при лусканні */}
            <span className="burst" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, k) => (
                <span
                  key={k}
                  className="burst-piece"
                  style={
                    {
                      background: spec.color,
                      ['--angle' as string]: `${k * 45}deg`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </span>
          </button>
        );
      })}

      <style jsx>{`
        .balloons-overlay {
          position: fixed;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 60;
        }
        .balloon-hit {
          position: absolute;
          top: 0;
          left: 0;
          pointer-events: auto;
          cursor: pointer;
          background: none;
          border: none;
          padding: 0;
          display: block;
          will-change: transform;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        .balloon-svg {
          display: block;
          filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.18));
          transition: transform 0.12s ease;
          transform-origin: center;
        }
        .balloon-hit:hover .balloon-svg {
          transform: scale(1.06);
        }
        .balloon-hit.is-popped .balloon-svg {
          animation: balloonPop 0.26s ease-out forwards;
        }
        .burst {
          position: absolute;
          inset: 0;
          display: block;
          opacity: 0;
        }
        .balloon-hit.is-popped .burst {
          opacity: 1;
        }
        .burst-piece {
          position: absolute;
          top: 36%;
          left: 50%;
          width: 7px;
          height: 7px;
          margin: -3.5px 0 0 -3.5px;
          border-radius: 50%;
          transform: rotate(var(--angle)) translateY(0);
          opacity: 0;
        }
        .balloon-hit.is-popped .burst-piece {
          animation: burstFly 0.45s ease-out forwards;
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
            transform: rotate(var(--angle)) translateY(-36px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
