// The format panel's button icons: drawn here as 16px line icons in the text colour, so they
// match each other and the theme. They replace letters ("L", "C", "R"), truncated words ("Mid")
// and Unicode arrows, which Windows draws from its colour emoji font — the order buttons came
// out red and purple.
import type { ReactNode } from "react";

function Icon({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------- text alignment
export const TextAlignLeft = () => (
  <Icon>
    <path d="M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8" />
  </Icon>
);
export const TextAlignCenter = () => (
  <Icon>
    <path d="M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8" />
  </Icon>
);
export const TextAlignRight = () => (
  <Icon>
    <path d="M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8" />
  </Icon>
);

// ---------------------------------------------------------------- label position in the shape
export const LabelTop = () => (
  <Icon>
    <rect x="2" y="2" width="12" height="12" rx="1.5" />
    <path d="M5 5h6" />
  </Icon>
);
export const LabelMiddle = () => (
  <Icon>
    <rect x="2" y="2" width="12" height="12" rx="1.5" />
    <path d="M5 8h6" />
  </Icon>
);
export const LabelBottom = () => (
  <Icon>
    <rect x="2" y="2" width="12" height="12" rx="1.5" />
    <path d="M5 11h6" />
  </Icon>
);

// ---------------------------------------------------------------- z-order
// Two overlapping squares; the one the button moves is filled.
export const ToFront = () => (
  <Icon>
    <rect x="2" y="2" width="8" height="8" rx="1" />
    <rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor" />
  </Icon>
);
export const ToBack = () => (
  <Icon>
    <rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor" />
    <rect x="2" y="2" width="8" height="8" rx="1" fill="var(--nd-panel-bg, #fff)" />
  </Icon>
);
export const Forward = () => (
  <Icon>
    <rect x="2" y="5" width="8" height="8" rx="1" />
    <path d="M12 10V3M9.5 5.5 12 3l2.5 2.5" />
  </Icon>
);
export const Backward = () => (
  <Icon>
    <rect x="2" y="3" width="8" height="8" rx="1" />
    <path d="M12 6v7M9.5 10.5 12 13l2.5-2.5" />
  </Icon>
);

// ---------------------------------------------------------------- aligning shapes to each other
export const AlignLeft = () => (
  <Icon>
    <path d="M2.5 1.5v13" />
    <rect x="4.5" y="3.5" width="9" height="3" rx="0.5" />
    <rect x="4.5" y="9.5" width="5" height="3" rx="0.5" />
  </Icon>
);
export const AlignCenterH = () => (
  <Icon>
    <path d="M8 1.5v13" />
    <rect x="3" y="3.5" width="10" height="3" rx="0.5" />
    <rect x="5" y="9.5" width="6" height="3" rx="0.5" />
  </Icon>
);
export const AlignRight = () => (
  <Icon>
    <path d="M13.5 1.5v13" />
    <rect x="2.5" y="3.5" width="9" height="3" rx="0.5" />
    <rect x="6.5" y="9.5" width="5" height="3" rx="0.5" />
  </Icon>
);
export const AlignTop = () => (
  <Icon>
    <path d="M1.5 2.5h13" />
    <rect x="3.5" y="4.5" width="3" height="9" rx="0.5" />
    <rect x="9.5" y="4.5" width="3" height="5" rx="0.5" />
  </Icon>
);
export const AlignMiddleV = () => (
  <Icon>
    <path d="M1.5 8h13" />
    <rect x="3.5" y="3" width="3" height="10" rx="0.5" />
    <rect x="9.5" y="5" width="3" height="6" rx="0.5" />
  </Icon>
);
export const AlignBottom = () => (
  <Icon>
    <path d="M1.5 13.5h13" />
    <rect x="3.5" y="2.5" width="3" height="9" rx="0.5" />
    <rect x="9.5" y="6.5" width="3" height="5" rx="0.5" />
  </Icon>
);
export const DistributeH = () => (
  <Icon>
    <path d="M1.5 2v12M14.5 2v12" />
    <rect x="6" y="4.5" width="4" height="7" rx="0.5" />
  </Icon>
);
export const DistributeV = () => (
  <Icon>
    <path d="M2 1.5h12M2 14.5h12" />
    <rect x="4.5" y="6" width="7" height="4" rx="0.5" />
  </Icon>
);
