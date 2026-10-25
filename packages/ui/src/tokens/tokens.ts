// Source of truth for Cozy Pixel tokens; tokens.css mirrors these values.
export const color = {
  night: "#101820",
  slate: "#26323D",
  surface2: "#1B252E",
  border: "#34424E",
  honey: "#F0BE79",
  mint: "#7DD3B0",
  cream: "#F6F0E5",
  muted: "#A7B3BE",
  error: "#F2867A",
  focus: "#8EC5FF",
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 } as const;
export const radius = { sm: 10, md: 12, lg: 14 } as const;

export const font = {
  sans: '"Geist", system-ui, sans-serif',
  mono: '"Geist Mono", ui-monospace, monospace',
  pixel: '"Pixelify Sans", sans-serif',
} as const;
