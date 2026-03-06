import { Loader2 } from 'lucide-react'

export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="h-8 w-40 bg-muted rounded animate-pulse" />

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-24 bg-muted/60 rounded animate-pulse" />
              <div className="h-8 w-8 bg-muted/40 rounded animate-pulse" />
            </div>
            <div className="h-8 w-16 bg-muted rounded animate-pulse" />
            <div className="h-3 w-32 bg-muted/40 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Charts area */}
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 space-y-4">
            <div className="h-5 w-32 bg-muted/60 rounded animate-pulse" />
            <div className="h-48 bg-muted/20 rounded animate-pulse" />
          </div>
        ))}
      </div>

      <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="bg-background/80 backdrop-blur-sm rounded-full p-3 shadow-lg">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    </div>
  )
}
