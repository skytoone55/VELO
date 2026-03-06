import { Loader2 } from 'lucide-react'

export default function ClientsLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-56 bg-muted/60 rounded animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-64 bg-muted rounded animate-pulse" />
          <div className="h-10 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>

      {/* Filters row */}
      <div className="flex gap-3 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 w-36 bg-muted/50 rounded animate-pulse" />
        ))}
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <div className="border-b px-4 py-3 flex gap-6">
          {['Société', 'Contact', 'Dép.', 'Statut', 'NAF'].map((h) => (
            <div key={h} className="h-4 bg-muted/60 rounded animate-pulse" style={{ width: `${h.length * 12}px` }} />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="border-b last:border-0 px-4 py-3 flex gap-6 items-center">
            <div className="h-4 w-40 bg-muted/40 rounded animate-pulse" />
            <div className="h-4 w-32 bg-muted/40 rounded animate-pulse" />
            <div className="h-4 w-10 bg-muted/40 rounded animate-pulse" />
            <div className="h-6 w-20 bg-muted/30 rounded-full animate-pulse" />
            <div className="h-6 w-16 bg-muted/30 rounded-full animate-pulse" />
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
