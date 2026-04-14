export function FlashcardSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-gray-700 rounded-xl p-6 space-y-3">
          <div className="h-4 bg-gray-600 rounded w-3/4" />
          <div className="h-4 bg-gray-600 rounded w-1/2" />
          <div className="border-t border-gray-600 pt-3">
            <div className="h-4 bg-gray-600 rounded w-full" />
            <div className="h-4 bg-gray-600 rounded w-2/3 mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
