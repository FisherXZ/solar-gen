export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Title skeleton */}
      <div className="mb-8">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-slate-200" />
      </div>

      {/* Stats bar skeleton */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 bg-white p-5"
          >
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-6 w-16 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Filter tabs skeleton */}
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-32 animate-pulse rounded-md bg-slate-200"
          />
        ))}
      </div>

      {/* Two-panel skeleton */}
      <div className="flex gap-6">
        <div className="flex-[3]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="mb-3 h-14 animate-pulse rounded bg-slate-100"
              />
            ))}
          </div>
        </div>
        <div className="flex-[2]">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
            <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="mt-6 h-32 w-full animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </div>
    </main>
  );
}
