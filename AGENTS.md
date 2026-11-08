# Agent notes

## UI rules

- Follow the Daily Label design doc (UI.md). Use only CSS variables from `src/styles.css`
  (design-token block at the top of the file).
- Fonts: Barlow Condensed (numerals, headings), DM Sans (body), IBM Plex Mono (quantities).
  Self-hosted in `public/fonts/`.
- Never use: Inter, Roboto, gradients, glassmorphism, rounded cards, shadows, emoji icons.
- Corners 2px max. Separate sections with rules, not boxes.
- Mobile first, 480px max content width. Touch targets 44px minimum.
- Over-goal uses a hatch pattern, never red.
- Charts are hand-built SVG/CSS, no chart libraries.
- Every interactive element needs hover, focus and active states.
