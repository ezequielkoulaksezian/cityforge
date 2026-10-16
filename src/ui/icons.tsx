import type { ToolId } from "../sim/constants";

const S = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Pause / slow / normal / fast icons for the speed buttons. */
export function SpeedIcon({ speed }: { speed: 0 | 1 | 2 | 3 }) {
  if (speed === 0)
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
        <rect x="2" y="2" width="3.5" height="10" rx="1" />
        <rect x="8.5" y="2" width="3.5" height="10" rx="1" />
      </svg>
    );
  const w = 6 * speed + 4;
  return (
    <svg width={w + 2} height="14" viewBox={`0 0 ${w + 2} 14`} fill="currentColor" aria-hidden="true">
      {Array.from({ length: speed }, (_, k) => (
        <path key={k} d={`M${1 + k * 6} 2l7 5-7 5z`} />
      ))}
    </svg>
  );
}

/** Simple pictograms for every tool. */
export function ToolIcon({ id }: { id: ToolId }) {
  switch (id) {
    case "query":
      return (
        <svg {...S}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.5-4.5" />
          <path d="M11 9v4M11 7.5v0" />
        </svg>
      );
    case "bulldoze":
      return (
        <svg {...S}>
          <path d="M3 17h11v-5H8L6 9H3z" />
          <circle cx="6" cy="18" r="2" />
          <circle cx="12" cy="18" r="2" />
          <path d="M14 14h3l4 4M17 14l2-5" />
        </svg>
      );
    case "road":
      return (
        <svg {...S}>
          <path d="M8 3 5 21M16 3l3 18" />
          <path d="M12 4v3M12 10v3M12 16v3" />
        </svg>
      );
    case "rail":
      return (
        <svg {...S}>
          <path d="M8 3v18M16 3v18" />
          <path d="M5 6h14M5 11h14M5 16h14" />
        </svg>
      );
    case "power":
      return (
        <svg {...S}>
          <path d="M13 2 5 13h6l-1 9 8-11h-6z" />
        </svg>
      );
    case "park":
      return (
        <svg {...S}>
          <path d="m12 3 5 8h-3l4 6H6l4-6H7z" />
          <path d="M12 17v4" />
        </svg>
      );
    case "R":
      return (
        <svg {...S}>
          <path d="M4 11 12 4l8 7" />
          <path d="M6 10v10h12V10" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case "C":
      return (
        <svg {...S}>
          <path d="M4 9h16l-1-5H5z" />
          <path d="M5 9v11h14V9" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "I":
      return (
        <svg {...S}>
          <path d="M3 20V10l5 3V10l5 3V5h3l1 15z" />
          <path d="M3 20h18" />
        </svg>
      );
    case "police":
      return (
        <svg {...S}>
          <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z" />
          <path d="m12 9 1 2h2l-1.5 1.5.5 2.5-2-1.2-2 1.2.5-2.5L9 11h2z" />
        </svg>
      );
    case "fire":
      return (
        <svg {...S}>
          <path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 3-6 1 2 2 2 3 2 0-3-1-5 0-7z" />
        </svg>
      );
    case "stadium":
      return (
        <svg {...S}>
          <ellipse cx="12" cy="12" rx="9" ry="6" />
          <ellipse cx="12" cy="12" rx="4.5" ry="2.5" />
        </svg>
      );
    case "coal":
      return (
        <svg {...S}>
          <path d="M3 20V12h8v8M11 20V9h3v11M16 20V6h3v14" />
          <path d="M2 20h20" />
          <path d="M17.5 4c0-1 1-1.5 1-2.5" />
        </svg>
      );
    case "nuclear":
      return (
        <svg {...S}>
          <path d="M4 21c1-4 1-9-1-14h7c-2 5-2 10-1 14z" />
          <path d="M13 21c1-4 1-8-1-12h7c-2 4-2 8-1 12z" />
          <path d="M2 21h20" />
        </svg>
      );
    case "seaport":
      return (
        <svg {...S}>
          <path d="M12 3v14M8 7h8" />
          <path d="M4 14c0 4 4 6 8 6s8-2 8-6" />
          <path d="M4 14h3M17 14h3" />
        </svg>
      );
    case "airport":
      return (
        <svg {...S}>
          <path d="M21 15 13 11V5a1 1 0 0 0-2 0v6l-8 4v2l8-2v4l-2 1.5V22l3-1 3 1v-1.5L13 19v-4l8 2z" />
        </svg>
      );
  }
}
