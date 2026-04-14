export function SummarySkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="skeleton h-6 rounded w-1/3" />
      <div className="space-y-2">
        <div className="skeleton h-4 rounded w-full" />
        <div className="skeleton h-4 rounded w-5/6" />
        <div className="skeleton h-4 rounded w-4/5" />
      </div>
      <div className="skeleton h-5 rounded w-1/4 mt-6" />
      <div className="space-y-2">
        <div className="skeleton h-4 rounded w-full" />
        <div className="skeleton h-4 rounded w-3/4" />
        <div className="skeleton h-4 rounded w-5/6" />
      </div>
      <div className="skeleton h-5 rounded w-1/4 mt-6" />
      <div className="space-y-2">
        <div className="skeleton h-4 rounded w-full" />
        <div className="skeleton h-4 rounded w-4/6" />
      </div>
    </div>
  );
}
