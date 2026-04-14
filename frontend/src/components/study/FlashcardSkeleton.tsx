export function FlashcardSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface border border-white/[0.05] rounded-3xl p-6 space-y-3">
          <div className="skeleton h-4 rounded w-3/4" />
          <div className="skeleton h-4 rounded w-1/2" />
          <div className="border-t border-white/[0.05] pt-3">
            <div className="skeleton h-4 rounded w-full" />
            <div className="skeleton h-4 rounded w-2/3 mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
