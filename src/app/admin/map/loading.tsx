import { Loader2 } from 'lucide-react'

export default function MapLoading() {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-muted rounded animate-pulse" />
          <div className="h-10 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>

      {/* Map placeholder */}
      <div className="relative w-full rounded-lg border bg-muted/30 overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Chargement de la carte...</p>
          </div>
        </div>
        {/* Fake map grid */}
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-b border-muted-foreground/20" style={{ height: '16.66%' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
