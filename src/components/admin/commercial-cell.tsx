'use client'

/**
 * CommercialCell — affiche la colonne Commercial sur 2 lignes :
 *   - nom du commercial en gras (ligne 1)
 *   - master (ENR / AMR) en gris dessous (ligne 2, seulement si parent_code présent)
 *
 * Attend que le client soit enrichi de la jointure :
 *   commercial:commercial_code(code, nom, parent_code)
 */

interface CommercialData {
  code: string
  nom: string
  parent_code: string | null
}

interface ClientWithCommercial {
  commercial_code?: string | null
  commercial_assigne?: string | null
  monday_board_id?: string | null
  commercial?: CommercialData | null
}

interface CommercialCellProps {
  client: ClientWithCommercial
}

export function CommercialCell({ client }: CommercialCellProps) {
  const c = client.commercial

  if (!c) {
    // Fallback : pas de jointure — on affiche le code brut ou commercial_assigne
    const fallback = client.commercial_code || client.commercial_assigne || client.monday_board_id || '-'
    return (
      <div className="flex flex-col">
        <span className="font-medium text-sm">{fallback}</span>
      </div>
    )
  }

  // Master : code parent en majuscules (ex. "enr" → "ENR", "amr" → "AMR")
  // Affiché seulement si ce commercial est un enfant (parent_code non null)
  const master = c.parent_code ? c.parent_code.toUpperCase() : null

  // Nom du commercial — on retire le suffixe " (MASTER)" present dans le nom
  // stocke (ex. "Christophe Plessier (ENR)" → "Christophe Plessier") pour ne pas
  // afficher le master deux fois quand la ligne master est visible juste dessous.
  const nom = master ? c.nom.replace(/\s*\([^)]*\)\s*$/, '') : c.nom

  return (
    <div className="flex flex-col">
      <span className="font-medium text-sm">{nom}</span>
      {master && (
        <span className="text-xs text-muted-foreground">{master}</span>
      )}
    </div>
  )
}
