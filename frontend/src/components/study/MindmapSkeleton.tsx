export function MindmapSkeleton() {
  return (
    <div className="animate-pulse flex flex-col items-center gap-6 p-8">
      <div className="skeleton h-10 rounded-full w-32" />
      <div className="flex gap-6 w-full justify-center">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-3">
            <div className="skeleton h-8 rounded-full w-24" />
            <div className="flex flex-col gap-2 items-center">
              <div className="skeleton h-6 rounded-full w-20" />
              <div className="skeleton h-6 rounded-full w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
