interface CoachingDisplayProps {
  message: string | null;
  fallbackMessage: string;
}

export default function CoachingDisplay({ message, fallbackMessage }: CoachingDisplayProps) {
  const text = message ?? fallbackMessage;
  const segments = text.split(/(\s+)/);

  return (
    <p className="text-base text-content-secondary leading-relaxed max-w-xl">
      {segments.map((seg, i) => (
        <span
          key={i}
          className="coaching-word-fade"
          style={{ animationDelay: `${Math.min(i * 40, 800)}ms` }}
        >
          {seg}
        </span>
      ))}
    </p>
  );
}
