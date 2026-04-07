type VeyraMonogramProps = {
  className?: string;
};

export function VeyraMonogram({ className }: VeyraMonogramProps) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="veyra-monogram-gradient" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#1D5D60" />
          <stop offset="100%" stopColor="#8FC8B3" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="80" height="80" rx="24" fill="#132D2F" />
      <path
        d="M28 24L45 69C46 72 50 72 51 69L68 24"
        stroke="url(#veyra-monogram-gradient)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
