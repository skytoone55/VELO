'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import DeliveryModule, { type LivraisonWithClient } from '@/components/admin/delivery-module'

/**
 * Page plein écran pour le module de livraison.
 * Usage : /admin/livraisons/deliver?id=LIVRAISON_ID
 * Charge la livraison + client depuis l'API, puis rend le DeliveryModule.
 */
export default function DeliverPage() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <DeliverContent />
    </Suspense>
  )
}

function DeliverContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const livraisonId = searchParams.get('id')

  const [livraison, setLivraison] = useState<LivraisonWithClient | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!livraisonId) {
      setError('ID de livraison manquant')
      setLoading(false)
      return
    }

    const fetchLivraison = async () => {
      try {
        const res = await fetch(`/api/admin/livraisons/${livraisonId}`)
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          const detail = errData?.error || res.statusText || 'Erreur inconnue'
          setError(`Erreur ${res.status} : ${detail}`)
          console.error('Deliver page fetch error:', res.status, detail)
          return
        }
        const data = await res.json()

        // Construire l'objet LivraisonWithClient
        const liv = data.livraison || data
        const client = liv.client || {}

        setLivraison({
          id: liv.id,
          client_id: liv.client_id,
          mode_livraison: liv.mode_livraison || 'retrait',
          statut: liv.statut,
          client: {
            id: client.id || liv.client_id,
            raison_sociale: client.raison_sociale || '',
            contact_nom: client.contact_nom || null,
            contact_prenom: client.contact_prenom || null,
            velo_valide: client.velo_valide || null,
            velo_devis: client.velo_devis || 1,
            email_beneficiaire: client.email_beneficiaire || null,
            telephone: client.telephone || null,
            adresse_societe_ligne1: client.adresse_societe_ligne1 || '',
            adresse_societe_cp: client.adresse_societe_cp || '',
            adresse_societe_ville: client.adresse_societe_ville || '',
            code_enemat: client.code_enemat || null,
            reference_retina: client.reference_retina || null,
            siret: client.siret || null,
          },
        })
      } catch {
        setError('Erreur de chargement')
      } finally {
        setLoading(false)
      }
    }

    fetchLivraison()
  }, [livraisonId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !livraison) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">{error || 'Livraison introuvable'}</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto py-4 px-4">
      <DeliveryModule
        livraison={livraison}
        onComplete={() => router.push('/admin/livraisons')}
        onClose={() => router.push('/admin/livraisons')}
        fullPage
      />
    </div>
  )
}
