// 線條圖示（20×20），顏色跟著文字
import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  home: <path d="M3 9.5 10 4l7 5.5V17h-4.5v-4.5h-5V17H3z" />,
  quick: <><rect x="3" y="3" width="14" height="14" rx="3" /><path d="M10 7v6M7 10h6" /></>,
  calendar: <><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2.5v3M13 2.5v3" /></>,
  users: <><circle cx="8" cy="7" r="3" /><path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13.5 4.2a3 3 0 0 1 0 5.6M17.5 17c0-2.2-1-3.8-2.8-4.6" /></>,
  chart: <path d="M4 16V10M8 16V5M12 16v-4M16 16V8" />,
  settings: <><path d="M4 6h8M15 6h1M4 14h1M8 14h8" /><circle cx="13.5" cy="6" r="1.8" /><circle cx="6.5" cy="14" r="1.8" /></>,
  db: <><ellipse cx="10" cy="5" rx="6" ry="2.5" /><path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" /></>,
  moon: <path d="M16 12.5A7 7 0 0 1 7.5 4a7 7 0 1 0 8.5 8.5z" />,
  sun: <><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></>,
  plus: <path d="M10 4v12M4 10h12" />,
  left: <path d="m12 5-5 5 5 5" />,
  right: <path d="m8 5 5 5-5 5" />,
  check: <path d="m4.5 10.5 3.5 3.5 7.5-8" />,
  warn: <><path d="M10 2.5 18 17H2z" /><path d="M10 8v4M10 14.5v.01" /></>,
  folder: <path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3.5l2 2H16a1.5 1.5 0 0 1 1.5 1.5V15a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15z" />,
  search: <><circle cx="9" cy="9" r="5.5" /><path d="m13.5 13.5 3.5 3.5" /></>,
  download: <path d="M10 3v10M6 9l4 4 4-4M4 16h12" />,
  upload: <path d="M10 13V3M6 7l4-4 4 4M4 16h12" />,
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, stroke = 1.6, style }: { name: IconName; size?: number; stroke?: number; style?: React.CSSProperties }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }}>
      {paths[name]}
    </svg>
  );
}

/** 煙霧＋幾何背景 */
export function Backdrop({ full }: { full?: boolean }) {
  return (
    <svg aria-hidden="true" className={full ? 'backdrop full' : 'backdrop'} viewBox={full ? '0 0 1440 900' : '0 0 1440 560'}
      preserveAspectRatio={full ? 'xMidYMid slice' : 'xMaxYMin slice'}>
      <defs>
        <filter id="smk" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={full ? 80 : 64} /></filter>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity={full ? 1 : 0} /></linearGradient>
        <mask id="m"><rect width="1440" height={full ? 900 : 560} fill="url(#fade)" /></mask>
      </defs>
      <g mask="url(#m)">
        <g filter="url(#smk)" opacity="0.6">
          {full ? <>
            <ellipse cx="300" cy="180" rx="380" ry="170" style={{ fill: 'var(--smoke-b)' }} />
            <ellipse cx="1150" cy="700" rx="420" ry="190" style={{ fill: 'var(--smoke-a)' }} />
            <ellipse cx="1240" cy="160" rx="240" ry="120" style={{ fill: 'var(--smoke-a)' }} />
          </> : <>
            <ellipse cx="1080" cy="80" rx="360" ry="140" style={{ fill: 'var(--smoke-a)' }} />
            <ellipse cx="1330" cy="230" rx="220" ry="120" style={{ fill: 'var(--smoke-b)' }} />
            <ellipse cx="620" cy="-20" rx="300" ry="110" style={{ fill: 'var(--smoke-b)' }} />
          </>}
        </g>
        <g fill="none" strokeWidth="1" style={{ stroke: 'var(--geo)' }}>
          {full ? <>
            <path d="M120 620 L300 520 L420 680 L240 790 Z" /><path d="M300 520 L480 420 L560 600 L420 680" />
            <path d="M1040 120 L1200 60 L1300 200 L1120 260 Z" /><path d="M1120 260 L1300 200 L1360 360" />
            <circle cx="300" cy="520" r="3" /><circle cx="1200" cy="60" r="3" />
          </> : <>
            <path d="M940 40 L1100 140 L1010 300 L840 220 Z" /><path d="M1100 140 L1300 90 L1380 260 L1180 330 Z" />
            <path d="M1010 300 L1180 330 L1120 470" /><circle cx="1300" cy="90" r="3" /><circle cx="1100" cy="140" r="3" /><circle cx="1010" cy="300" r="3" />
          </>}
        </g>
      </g>
    </svg>
  );
}
