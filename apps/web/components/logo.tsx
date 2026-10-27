export function Mark({
  mono = false,
  activity = false,
  className = "",
}: {
  mono?: boolean;
  activity?: boolean;
  className?: string;
}) {
  const nick = mono ? "currentColor" : "var(--tf-warning)";
  return (
    <svg
      className={`${activity ? "mark-activity" : ""} ${className}`.trim()}
      width={32}
      height={32}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <rect className="mark-seg mark-seg-a" x="1" y="8" width="10" height="16" rx="1" fill="currentColor" />
      <rect className="mark-seg mark-seg-b" x="20" y="13" width="11" height="6" rx="1" fill="currentColor" />
      <rect className="mark-seg mark-seg-c" x="14" y="4" width="2" height="6" fill="currentColor" />
      <rect className="mark-seg mark-seg-d" x="14" y="22" width="2" height="6" fill="currentColor" />
      <rect className="mark-seg mark-seg-nick" x="13" y="27" width="3" height="3" rx="0.5" fill={nick} />
    </svg>
  );
}

export function Wordmark({ clip = false }: { clip?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Mark className="size-8 shrink-0" />
      <span className={clip ? "wordmark-copy" : undefined}>
        <span className="block text-sm font-semibold leading-5 tracking-[-0.02em]">ThrottleForge</span>
        <span className="block text-[12px] leading-4 text-ink-dim">Traffic control</span>
      </span>
    </span>
  );
}
