/** Shanyraq mark: the yurt's crown ring with crossed poles and a sun dot. */
export default function BrandMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="3" />
      <path
        d="M24 4v40M4 24h40M9.9 9.9l28.2 28.2M38.1 9.9L9.9 38.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="24" cy="24" r="6" className="fill-sun-400" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
