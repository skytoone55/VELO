'use client'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChevronDown } from 'lucide-react'
import type { CommercialOption } from '@/lib/tenants/use-commerciaux'

interface CommercialFilterProps {
  /** Hiérarchie des commerciaux (résultat de useCommerciaux().parents) */
  options: CommercialOption[]
  /** Codes sélectionnés (string[]) */
  value: string[]
  onChange: (value: string[]) => void
  className?: string
}

/**
 * Popover multi-select hiérarchique pour le filtre commercial.
 * Parents en gras, enfants indentés avec "↳".
 * Bouton "Effacer" si au moins un code sélectionné.
 */
export function CommercialFilter({ options, value, onChange, className }: CommercialFilterProps) {
  const toggle = (code: string, checked: boolean) => {
    if (checked) {
      onChange([...value, code])
    } else {
      onChange(value.filter(v => v !== code))
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`h-9 px-3 shrink-0 ${className ?? ''}`}>
          Commercial {value.length > 0 && `(${value.length})`}
          <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="max-h-72 overflow-y-auto">
          {options.map(parent => (
            <div key={parent.id}>
              {/* Parent — affiché en gras */}
              <label className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-muted rounded font-medium">
                <input
                  type="checkbox"
                  checked={value.includes(parent.code)}
                  onChange={(e) => toggle(parent.code, e.target.checked)}
                  className="rounded border-gray-300"
                />
                {parent.nom}
              </label>
              {/* Enfants — indentés avec ↳ */}
              {(parent.enfants ?? []).map(child => (
                <label
                  key={child.id}
                  className="flex items-center gap-2 pl-6 pr-2 py-1 text-sm cursor-pointer hover:bg-muted rounded"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(child.code)}
                    onChange={(e) => toggle(child.code, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  ↳ {child.nom}
                </label>
              ))}
            </div>
          ))}
        </div>
        {value.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-1 text-xs"
            onClick={() => onChange([])}
          >
            Effacer
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
