/** Line icons for the menu (24 × 24, drawn with the current text color). */

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const icons = {
  layout: icon('<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.4"/><circle cx="15" cy="17" r="2.4"/>'),
  touch: icon('<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V12m0-1a1.5 1.5 0 0 1 3 0v3.5A6.5 6.5 0 0 1 11.5 21h0A6.5 6.5 0 0 1 6 18l-2-3.2a1.4 1.4 0 0 1 2.3-1.6L9 16"/>'),
  motion: icon('<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9" ry="4"/><ellipse cx="12" cy="12" rx="4" ry="9"/>'),
  vibration: icon('<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4 8v8M20 8v8M1.5 10v4M22.5 10v4"/>'),
  general: icon('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  close: icon('<path d="M6 6l12 12M18 6L6 18" stroke-width="2.6"/>'),
  fullscreen: icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  edit: icon('<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>'),
  reset: icon('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>'),
};
