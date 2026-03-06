import { Loader2 } from 'lucide-react'

export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="h-4 w-72 bg-muted/60 rounded animate-pulse" />
        </div>
        <div className="h-10 w-32 bg-muted rounded animate-pulse" />
      </div>

      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-2">
            <div className="h-4 w-20 bg-muted/60 rounded animate-pulse" />
            <div className="h-7 w-16 bg-muted rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="border rounded-lg">
        <div className="border-b px-4 py-3 flex gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 bg-muted/60 rounded animate-pulse" style={{ width: `${60 + i * 20}px` }} />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b last:border-0 px-4 py-3 flex gap-4">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-4 bg-muted/40 rounded animate-pulse" style={{ width: `${50 + j * 25}px` }} />
            ))}
          </div>
        ))}
      </div>

      {/* Centered spinner overlay */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="bg-background/80 backdrop-blur-sm rounded-full p-3 shadow-lg">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    </div>
  )
}
