/** The Doorward mark: an arched door with a keyhole. Same shape as app/icon.svg, themed for light and dark. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="14" className="fill-zinc-900 dark:fill-zinc-50" />
      <path
        d="M20 49V30a12 12 0 0 1 24 0v19z"
        fill="none"
        strokeWidth="4"
        strokeLinejoin="round"
        className="stroke-white dark:stroke-zinc-900"
      />
      <circle cx="32" cy="37" r="2.5" className="fill-white dark:fill-zinc-900" />
    </svg>
  );
}
