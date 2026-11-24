/** The spec's layout widths: mobile below 768 px, tablet 768 to 1023 px, desktop from 1024 px. Tailwind md and lg match. */
export const MEDIA = {
  mobile: '(max-width: 767.98px)',
  tablet: '(min-width: 768px) and (max-width: 1023.98px)',
} as const;
