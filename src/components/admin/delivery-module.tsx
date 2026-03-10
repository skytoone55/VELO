'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Loader2,
  CheckCircle,
  XCircle,
  Bike,
  User,
  MapPin,
  Phone,
  Mail,
  ClipboardCheck,
  PenTool,
  FileCheck,
  ArrowRight,
  ArrowLeft,
  Printer,
  Camera,
  Trash2,
  Plus,
  Minus,
  ScanLine,
  Info,
  Download,
  AlertCircle,
  Copy,
  ExternalLink,
  Send,
} from 'lucide-react'

// ---------- Types ----------

export interface LivraisonWithClient {
  id: string
  client_id: string
  mode_livraison: string
  statut: string | null
  client: {
    id: string
    raison_sociale: string
    contact_nom: string | null
    contact_prenom: string | null
    velo_valide: number | null
    velo_devis: number
    email_beneficiaire: string | null
    telephone: string | null
    adresse_societe_ligne1: string
    adresse_societe_cp: string
    adresse_societe_ville: string
    code_enemat?: string | null
    reference_retina?: string | null
    siret?: string | null
  }
}

interface DeliveryModuleProps {
  livraison: LivraisonWithClient
  onComplete: () => void
  onClose: () => void
  /** Si true, rend en pleine page (pas de Dialog wrapper) */
  fullPage?: boolean
}

interface FnuciValidation {
  code: string
  valid: boolean | null
  loading: boolean
  error: string | null
}

// ---------- Constantes ----------

const STEPS = [
  { label: 'Instructions', icon: ClipboardCheck },
  { label: 'FNUCI', icon: ScanLine },
  { label: 'Signature', icon: PenTool },
  { label: 'Confirmation', icon: FileCheck },
]

const CHECKLIST_ITEMS_STATIC = [
  { key: 'fonctionnement', label: 'Vérification et explication du fonctionnement', highlight: false },
  { key: 'cable_recharge', label: 'Câble de recharge remis au bénéficiaire', highlight: false },
  { key: 'photos_cee', label: 'Les photos géolocalisées ont été fournies au financeur CEE', highlight: false },
  { key: 'signature_faciale', label: 'Le client a bien fait sa signature électronique faciale', highlight: false },
]

const FNUCI_REGEX = /BC[A-Z0-9]{6,10}/i

// ---------- Sous-composant: Indicateur de progression ----------

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <div className="flex items-center justify-between w-full px-2 py-3">
      {STEPS.map((step, index) => {
        const Icon = step.icon
        const isActive = index === currentStep
        const isDone = index < currentStep
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-full border-2 transition-colors ${
                  isDone
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : isActive
                      ? 'bg-primary border-primary text-white'
                      : 'bg-muted border-muted-foreground/30 text-muted-foreground'
                }`}
              >
                {isDone ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span className={`text-xs mt-1 ${isActive ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
            </div>
            {index < totalSteps - 1 && (
              <div
                className={`w-6 sm:w-10 h-0.5 mx-1 mt-[-12px] ${
                  index < currentStep ? 'bg-emerald-500' : 'bg-muted-foreground/20'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ---------- Sous-composant: Pad de signature canvas ----------

function SignaturePad({
  onSignatureChange,
}: {
  onSignatureChange: (dataUrl: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    // ctx.scale(dpr, dpr) already handles DPR — do NOT multiply by canvas.width/rect.width
    // as that would double-apply the DPR scaling and cause an offset
    if ('touches' in e) {
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    isDrawingRef.current = true
    const pos = getPos(e)
    lastPointRef.current = pos
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }
  }, [getPos])

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    const pos = getPos(e)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000'

    if (lastPointRef.current) {
      ctx.beginPath()
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }
    lastPointRef.current = pos
  }, [getPos])

  const endDraw = useCallback(() => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false
      lastPointRef.current = null
      setHasDrawn(true)
      const canvas = canvasRef.current
      if (canvas) {
        onSignatureChange(canvas.toDataURL('image/png'))
      }
    }
  }, [onSignatureChange])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasDrawn(false)
      onSignatureChange(null)
    }
  }, [onSignatureChange])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      // Save current content
      const imageData = canvas.width > 0 ? canvas.toDataURL() : null
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.scale(dpr, dpr)
        ctx.lineWidth = 2
        ctx.lineCap = 'round'
        ctx.strokeStyle = '#000'
        // Restore content if any
        if (imageData && hasDrawn) {
          const img = new Image()
          img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
          img.src = imageData
        }
      }
    }
    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [hasDrawn])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    canvas.addEventListener('touchstart', prevent, { passive: false })
    canvas.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      canvas.removeEventListener('touchstart', prevent)
      canvas.removeEventListener('touchmove', prevent)
    }
  }, [])

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-muted-foreground/30 rounded-lg bg-white">
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair"
          style={{ touchAction: 'none', height: '200px' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-muted-foreground/50 pointer-events-none">
          Signez ici
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={clear} type="button">
        <Trash2 className="h-4 w-4 mr-1" />
        Effacer
      </Button>
    </div>
  )
}

// ---------- Sous-composant: Scanner QR FNUCI ----------

function QrScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const scannerRef = useRef<HTMLDivElement>(null)
  const html5QrRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null)

  useEffect(() => {
    let mounted = true

    const startScanner = async () => {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (!mounted || !scannerRef.current) return

      const scannerId = 'qr-reader-' + Date.now()
      scannerRef.current.id = scannerId

      const scanner = new Html5Qrcode(scannerId)
      html5QrRef.current = scanner

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            const match = decodedText.match(FNUCI_REGEX)
            if (match) {
              if (navigator.vibrate) navigator.vibrate(100)
              onScan(match[0].toUpperCase())
            }
          },
          () => {} // ignore errors
        )
      } catch {
        // Camera access denied or not available
      }
    }

    startScanner()

    return () => {
      mounted = false
      try {
        if (html5QrRef.current) {
          html5QrRef.current.stop().catch(() => {})
        }
      } catch {
        // Scanner may not have fully started
      }
    }
  }, [onScan])

  return (
    <div className="space-y-3">
      <div ref={scannerRef} className="w-full rounded-lg overflow-hidden bg-black" style={{ minHeight: '280px' }} />
      <Button variant="outline" size="sm" onClick={onClose} className="w-full">
        Fermer le scanner
      </Button>
    </div>
  )
}

// ---------- Helper: compression image ----------

function compressImage(file: File, maxWidth: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Canvas not supported'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ---------- Helper: génération PDF ----------

async function generateAttestation(data: {
  clientName: string
  siret: string | null
  beneficiaire: string
  telephone: string | null
  email: string | null
  adresse: string
  fnuciCodes: string[]
  checklistItems: string[]
  photoIdentite: string | null
  signature: string
  date: string
  modeLivraison?: string
}) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  let y = 20

  const modeLabel = data.modeLivraison === 'retrait' ? 'retrait' : 'livraison'

  // Header
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('PPE Energie', pageW / 2, y, { align: 'center' })
  y += 8
  doc.setFontSize(12)
  doc.text(`Attestation de ${modeLabel} vélo cargo`, pageW / 2, y, { align: 'center' })
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Date : ${data.date}`, pageW / 2, y, { align: 'center' })
  y += 8

  // Separator
  doc.setDrawColor(200)
  doc.line(20, y, pageW - 20, y)
  y += 5

  // Client info
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Informations bénéficiaire', 20, y)
  y += 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const infos = [
    `Raison sociale : ${data.clientName}`,
    data.siret ? `SIRET : ${data.siret}` : null,
    `Bénéficiaire : ${data.beneficiaire}`,
    data.telephone ? `Téléphone : ${data.telephone}` : null,
    data.email ? `Email : ${data.email}` : null,
    `Adresse : ${data.adresse}`,
  ].filter(Boolean) as string[]

  for (const info of infos) {
    doc.text(info, 20, y)
    y += 5
  }
  y += 4

  // FNUCI table — 3 colonnes
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Numéros FNUCI', 20, y)
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const cols = 3
  const colW = (pageW - 40) / cols
  data.fnuciCodes.forEach((code, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    const rowY = y + row * 6
    if (row % 2 === 0 && col === 0) {
      doc.setFillColor(245, 245, 245)
      doc.rect(20, rowY - 3.5, pageW - 40, 6, 'F')
    }
    doc.text(`${i + 1}. ${code}`, 22 + col * colW, rowY)
  })
  y += Math.ceil(data.fnuciCodes.length / cols) * 6 + 6

  // Checklist
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Checklist de livraison', 20, y)
  y += 5
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  data.checklistItems.forEach((item) => {
    doc.text(`✓ ${item}`, 25, y)
    y += 5
  })
  y += 4

  // Photo identité (compact)
  if (data.photoIdentite) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Pièce d\'identité', 20, y)
    y += 4
    try {
      doc.addImage(data.photoIdentite, 'JPEG', 20, y, 45, 30)
      y += 33
    } catch {
      doc.text('[Photo non disponible]', 25, y + 4)
      y += 8
    }
  }

  // Tampon entreprise EN FOND + Signature PAR-DESSUS
  y += 6
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Signature du bénéficiaire', 20, y)
  y += 8

  // Tampon derrière la signature (dessiné en premier = fond)
  const stampX = pageW / 2 + 5
  const stampY = y - 2
  if (data.siret || data.clientName) {
    const stampW = pageW / 2 - 25
    const stampLines: string[] = []
    if (data.clientName) stampLines.push(data.clientName)
    if (data.adresse) {
      const parts = data.adresse.split(', ')
      if (parts[0]) stampLines.push(parts[0])
      if (parts[1] || parts[2]) stampLines.push([parts[1], parts[2]].filter(Boolean).join(' '))
    }
    if (data.siret) stampLines.push(`SIRET: ${data.siret}`)
    const stampH = 8 + stampLines.length * 5
    doc.setDrawColor(180)
    doc.setFillColor(248, 248, 248)
    doc.roundedRect(stampX, stampY, stampW, stampH, 2, 2, 'FD')
    doc.setTextColor(100)
    let ty = stampY + 6
    stampLines.forEach((line, i) => {
      doc.setFontSize(i === 0 ? 8 : 7)
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal')
      doc.text(line, stampX + stampW / 2, ty, { align: 'center' })
      ty += 5
    })
    doc.setTextColor(0)
  }

  // Signature par-dessus le tampon (côté gauche)
  try {
    doc.addImage(data.signature, 'PNG', 20, y, 80, 30)
    y += 34
  } catch {
    doc.text('[Signature non disponible]', 25, y + 4)
    y += 10
  }
  y += 4
  doc.setFontSize(8)
  doc.text(`Signé le ${data.date}`, 20, y)
  y += 12

  // Footer
  doc.setDrawColor(200)
  doc.line(20, y, pageW - 20, y)
  y += 6
  doc.setFontSize(8)
  doc.setTextColor(128)
  doc.text(`PPE Energie — Attestation de ${modeLabel} vélo cargo`, pageW / 2, y, { align: 'center' })

  return doc
}

// ---------- Composant principal ----------

export default function DeliveryModule({ livraison, onComplete, onClose, fullPage }: DeliveryModuleProps) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const refRetina = livraison.client.reference_retina

  const [retinaCopied, setRetinaCopied] = useState(false)
  const copyRetina = () => {
    if (refRetina) {
      navigator.clipboard.writeText(refRetina).catch(() => {})
      setRetinaCopied(true)
      setTimeout(() => setRetinaCopied(false), 1500)
    }
  }

  // Step 1 — Vélos
  const maxVelos = livraison.client.velo_valide || livraison.client.velo_devis || 1
  const [nbVelos, setNbVelos] = useState(maxVelos)
  const [shakeMax, setShakeMax] = useState(false)

  // Step 2 — FNUCI
  const [fnuciList, setFnuciList] = useState<FnuciValidation[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scanTargetIndex, setScanTargetIndex] = useState<number>(0)

  // Step 1 (nouveau) — Instructions + Checklist
  const beneficiaire = [livraison.client.contact_prenom, livraison.client.contact_nom]
    .filter(Boolean).join(' ') || livraison.client.raison_sociale
  const CHECKLIST_ITEMS = [
    ...CHECKLIST_ITEMS_STATIC,
    { key: 'identite_signataire', label: `C'est bien ${beneficiaire} qui a signé`, highlight: true },
  ]
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    fonctionnement: false,
    cable_recharge: false,
    photos_cee: false,
    signature_faciale: false,
    identite_signataire: false,
  })
  const [photoIdentite, setPhotoIdentite] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  // Step 4 — Signature
  const [signature, setSignature] = useState<string | null>(null)

  // Step 5 — PDF
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)

  // Initialize FNUCI list when nbVelos changes
  useEffect(() => {
    setFnuciList((prev) => {
      const newList: FnuciValidation[] = []
      for (let i = 0; i < nbVelos; i++) {
        newList.push(prev[i] || { code: '', valid: null, loading: false, error: null })
      }
      return newList
    })
  }, [nbVelos])

  // ---- Step 1 handlers ----
  const handleVeloChange = (delta: number) => {
    const next = nbVelos + delta
    if (next < 1) return
    if (next > maxVelos) {
      setShakeMax(true)
      if (navigator.vibrate) navigator.vibrate(50)
      setTimeout(() => setShakeMax(false), 400)
      return
    }
    setNbVelos(next)
  }

  // ---- Step 2 handlers ----
  const validateFnuci = async (index: number, code: string) => {
    if (!code || code.length < 6) return

    // Anti-doublon client-side
    const isDuplicate = fnuciList.some((f, i) => i !== index && f.code.toUpperCase() === code.toUpperCase() && f.valid)
    if (isDuplicate) {
      setFnuciList((prev) => {
        const next = [...prev]
        next[index] = { code, valid: false, loading: false, error: 'Code déjà utilisé' }
        return next
      })
      if (navigator.vibrate) navigator.vibrate([50, 50, 50])
      return
    }

    setFnuciList((prev) => {
      const next = [...prev]
      next[index] = { code, valid: null, loading: true, error: null }
      return next
    })

    try {
      const res = await fetch('/api/admin/fnuci/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: code }),
      })
      const data = await res.json()

      setFnuciList((prev) => {
        const next = [...prev]
        if (data.valid) {
          next[index] = { code: code.toUpperCase(), valid: true, loading: false, error: null }
          if (navigator.vibrate) navigator.vibrate(100)
        } else {
          next[index] = { code, valid: false, loading: false, error: data.error || 'Code invalide' }
          if (navigator.vibrate) navigator.vibrate([50, 50, 50])
        }
        return next
      })
    } catch {
      setFnuciList((prev) => {
        const next = [...prev]
        next[index] = { code, valid: false, loading: false, error: 'Erreur de validation' }
        return next
      })
    }
  }

  const handleScanResult = (code: string) => {
    setScannerOpen(false)
    // Find first empty or target slot
    const targetIdx = fnuciList.findIndex((f, i) => i >= scanTargetIndex && !f.valid)
    const idx = targetIdx >= 0 ? targetIdx : scanTargetIndex
    if (idx < fnuciList.length) {
      setFnuciList((prev) => {
        const next = [...prev]
        next[idx] = { code, valid: null, loading: false, error: null }
        return next
      })
      validateFnuci(idx, code)
    }
  }

  const handleFnuciInput = (index: number, value: string) => {
    const upper = value.toUpperCase()
    setFnuciList((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], code: upper, valid: null, error: null }
      return next
    })
  }

  // ---- Step 3 handlers ----
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const compressed = await compressImage(file, 1200, 0.8)
      setPhotoIdentite(compressed)
    } catch {
      setError('Erreur lors de la compression de la photo')
    }
  }

  // ---- Navigation ----
  const allFnuciValid = fnuciList.length === nbVelos && fnuciList.every((f) => f.valid)
  const allChecklistDone = Object.values(checklist).every(Boolean)

  const canNext = (() => {
    switch (step) {
      case 0: return allChecklistDone // Instructions + Checklist
      case 1: return nbVelos >= 1 && allFnuciValid // FNUCI + Vélos
      case 2: return !!signature && !!photoIdentite // Signature + Photo PI
      default: return false
    }
  })()

  // ---- Submit ----
  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      // Generate PDF FIRST so we can send it to the server
      const client = livraison.client
      const beneficiaire = [client.contact_prenom, client.contact_nom].filter(Boolean).join(' ') || client.raison_sociale
      const adresse = [client.adresse_societe_ligne1, client.adresse_societe_cp, client.adresse_societe_ville].filter(Boolean).join(', ')
      const now = new Date()
      const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

      const doc = await generateAttestation({
        clientName: client.raison_sociale,
        siret: client.siret || null,
        beneficiaire,
        telephone: client.telephone,
        email: client.email_beneficiaire,
        adresse,
        fnuciCodes: fnuciList.map((f) => f.code),
        checklistItems: CHECKLIST_ITEMS.map((i) => i.label),
        photoIdentite,
        signature: signature!,
        date: dateStr,
        modeLivraison: livraison.mode_livraison,
      })

      // Convert PDF to base64 for server storage
      const pdfBase64 = doc.output('datauristring')

      const res = await fetch(`/api/admin/livraisons/${livraison.id}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fnuci_codes: fnuciList.map((f) => f.code),
          nb_velos_livres: nbVelos,
          checklist: {
            fonctionnement: checklist.fonctionnement,
            cable_recharge: checklist.cable_recharge,
            photos_cee: checklist.photos_cee,
          },
          signature_base64: signature,
          photo_identite_base64: photoIdentite,
          attestation_pdf_base64: pdfBase64,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Erreur lors de la livraison')
      }

      setPdfBlob(doc.output('blob'))
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPdf = () => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    const dlMode = livraison.mode_livraison === 'retrait' ? 'retrait' : 'livraison'
    a.download = `attestation-${dlMode}-${livraison.client.raison_sociale.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handlePrint = () => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const w = window.open(url, '_blank')
    if (w) {
      w.onload = () => w.print()
    }
  }

  // ---- Render Steps ----

  // Step 0 — Instructions Retina + Checklist
  const renderStep0 = () => (
    <div className="space-y-5">
      {/* Infos client résumé */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{livraison.client.raison_sociale}</span>
          </div>
          {beneficiaire && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>Bénéficiaire : {beneficiaire}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{[livraison.client.adresse_societe_ligne1, livraison.client.adresse_societe_cp, livraison.client.adresse_societe_ville].filter(Boolean).join(', ')}</span>
          </div>
          {livraison.client.telephone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{livraison.client.telephone}</span>
            </div>
          )}
          {livraison.client.email_beneficiaire && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{livraison.client.email_beneficiaire}</span>
            </div>
          )}
          {livraison.client.code_enemat && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline">Code ENEMAT : {livraison.client.code_enemat}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Bloc Retina */}
      <Card className="border-blue-300 bg-blue-50 shadow-md">
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-200 shrink-0">
              <Info className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="font-semibold text-blue-900 text-base">Instructions Retina / ENEMAT</p>
              <p className="text-sm text-blue-700 mt-1">Rendez-vous sur <a href="https://retina.enemat.fr/#/treetable131" target="_blank" rel="noopener noreferrer" className="font-mono underline hover:text-blue-900">retina.enemat.fr/#/treetable131</a> pour :</p>
            </div>
          </div>
          <ol className="list-decimal list-inside text-sm text-blue-800 space-y-2 ml-3">
            <li>Générer la facture du bénéficiaire</li>
            <li>Entrer les numéros FNUCI dans Retina</li>
            <li>Signer l&apos;AH et prendre les photos</li>
            <li>Revenir ici pour finaliser</li>
          </ol>
          {refRetina && (
            <div className="flex items-center gap-2 bg-blue-100 border border-blue-200 rounded-lg px-3 py-2">
              <span className="text-sm font-medium text-blue-800">Réf. Retina :</span>
              <span className="font-mono text-sm font-bold text-blue-900">{refRetina}</span>
              <button
                onClick={copyRetina}
                className="ml-auto p-1 rounded hover:bg-blue-200 active:scale-90 transition-all"
                title="Copier la référence"
              >
                {retinaCopied
                  ? <CheckCircle className="h-4 w-4 text-green-600" />
                  : <Copy className="h-4 w-4 text-blue-600" />}
              </button>
            </div>
          )}
          <Button
            variant="default"
            size="lg"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white text-lg py-6 font-bold"
            onClick={() => window.open('https://retina.enemat.fr/#/treetable131', '_blank')}
          >
            <ExternalLink className="h-5 w-5 mr-2" />
            {refRetina
              ? `Ouvrir Retina — Réf. ${refRetina}`
              : 'Ouvrir retina.enemat.fr'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Checklist */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Checklist de vérification</Label>
        {CHECKLIST_ITEMS.map((item) => (
          <div
            key={item.key}
            className={`flex items-start gap-3 ${
              item.highlight
                ? 'bg-amber-50 border border-amber-300 rounded-lg p-3'
                : ''
            }`}
          >
            <Checkbox
              id={item.key}
              checked={checklist[item.key]}
              onCheckedChange={(checked) =>
                setChecklist((prev) => ({ ...prev, [item.key]: !!checked }))
              }
            />
            <Label
              htmlFor={item.key}
              className={`text-sm leading-snug cursor-pointer ${
                item.highlight ? 'font-semibold text-amber-900' : ''
              }`}
            >
              {item.label}
            </Label>
          </div>
        ))}
      </div>
    </div>
  )

  // Step 1 — Nombre de vélos + FNUCI
  const renderStep1 = () => (
    <div className="space-y-4">
      {/* Nombre de vélos */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Nombre de vélos à livrer</Label>
        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleVeloChange(-1)}
            disabled={nbVelos <= 1}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span
            className={`text-3xl font-bold tabular-nums min-w-[3ch] text-center transition-transform ${
              shakeMax ? 'animate-pulse text-red-500' : ''
            }`}
          >
            {nbVelos}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => handleVeloChange(1)}
            disabled={nbVelos >= maxVelos}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-center text-muted-foreground">
          Maximum autorisé : {maxVelos} vélo{maxVelos > 1 ? 's' : ''}
        </p>
      </div>

      <Separator />

      {/* Codes FNUCI */}
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Codes FNUCI ({fnuciList.filter((f) => f.valid).length}/{nbVelos})</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const nextEmpty = fnuciList.findIndex((f) => !f.valid)
            setScanTargetIndex(nextEmpty >= 0 ? nextEmpty : 0)
            setScannerOpen(true)
          }}
        >
          <Camera className="h-4 w-4 mr-1" />
          Scanner QR
        </Button>
      </div>

      {scannerOpen && (
        <QrScanner
          onScan={handleScanResult}
          onClose={() => setScannerOpen(false)}
        />
      )}

      <div className="space-y-3">
        {fnuciList.map((fnuci, i) => (
          <div key={i} className="space-y-1">
            <Label className="text-xs text-muted-foreground">Vélo {i + 1}</Label>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Input
                  value={fnuci.code}
                  onChange={(e) => handleFnuciInput(i, e.target.value)}
                  onBlur={() => fnuci.code && !fnuci.valid && validateFnuci(i, fnuci.code)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && fnuci.code) validateFnuci(i, fnuci.code)
                  }}
                  placeholder="BCXXXXXX"
                  className={`uppercase ${
                    fnuci.valid === true
                      ? 'border-emerald-500 bg-emerald-50'
                      : fnuci.valid === false
                        ? 'border-red-500 bg-red-50'
                        : ''
                  }`}
                  disabled={fnuci.loading}
                />
                {fnuci.loading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {fnuci.valid === true && <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />}
              {fnuci.valid === false && <XCircle className="h-5 w-5 text-red-500 shrink-0" />}
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => {
                  setScanTargetIndex(i)
                  setScannerOpen(true)
                }}
              >
                <ScanLine className="h-4 w-4" />
              </Button>
            </div>
            {fnuci.error && <p className="text-xs text-red-500">{fnuci.error}</p>}
          </div>
        ))}
      </div>
    </div>
  )

  // Step 2 — Signature + Photo pièce d'identité
  const renderStep2 = () => (
    <div className="space-y-4">
      {/* Photo pièce d'identité */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          Photo pièce d&apos;identité <span className="text-red-500">*</span>
        </Label>
        {photoIdentite ? (
          <div className="space-y-2">
            <img
              src={photoIdentite}
              alt="Pièce d'identité"
              className="w-full max-w-full sm:max-w-[300px] rounded-lg border"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPhotoIdentite(null)
                if (photoInputRef.current) photoInputRef.current.value = ''
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Reprendre
            </Button>
          </div>
        ) : (
          <div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              className="hidden"
              id="photo-identite"
            />
            <Button
              variant="outline"
              onClick={() => photoInputRef.current?.click()}
              className="w-full"
            >
              <Camera className="h-4 w-4 mr-2" />
              Prendre une photo
            </Button>
          </div>
        )}
        {!photoIdentite && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            La photo de la pièce d&apos;identité est obligatoire
          </p>
        )}
      </div>

      <Separator />

      {/* Signature */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Signataire</Label>
        <Input value={beneficiaire} readOnly className="bg-muted" />
      </div>
      <SignaturePad onSignatureChange={setSignature} />
      {!signature && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          La signature est obligatoire pour continuer
        </p>
      )}
    </div>
  )

  // Step 3 — Confirmation
  const [sendingBon, setSendingBon] = useState(false)
  const [bonSent, setBonSent] = useState(false)

  const handleSendBonToClient = async () => {
    setSendingBon(true)
    try {
      const res = await fetch(`/api/admin/livraisons/${livraison.id}/send-bon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur envoi')
      }
      setBonSent(true)
    } catch {
      setError('Erreur lors de l\'envoi du bon au client')
    } finally {
      setSendingBon(false)
    }
  }

  const renderStep3 = () => {
    if (!success) {
      return (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">Prêt à finaliser la livraison ?</p>
          <Card>
            <CardContent className="pt-4 text-sm space-y-2 text-left">
              <p><strong>Client :</strong> {livraison.client.raison_sociale}</p>
              <p><strong>Vélos livrés :</strong> {nbVelos}</p>
              <p><strong>Codes FNUCI :</strong> {fnuciList.map((f) => f.code).join(', ')}</p>
              <p><strong>Checklist :</strong> {Object.values(checklist).every(Boolean) ? '✓ Complète' : '✗ Incomplète'}</p>
              <p><strong>Photo ID :</strong> {photoIdentite ? '✓' : '✗'}</p>
              <p><strong>Signature :</strong> {signature ? '✓' : '✗'}</p>
            </CardContent>
          </Card>
          {error && (
            <div className="text-red-500 text-sm bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}
          <Button onClick={handleSubmit} disabled={loading} className="w-full" size="lg">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirmer la livraison
              </>
            )}
          </Button>
        </div>
      )
    }

    return (
      <div className="space-y-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-emerald-700">Livraison enregistrée !</h3>
          <p className="text-sm text-muted-foreground">
            {nbVelos} vélo{nbVelos > 1 ? 's' : ''} livré{nbVelos > 1 ? 's' : ''} à {livraison.client.raison_sociale}
          </p>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <Button onClick={handleDownloadPdf} disabled={!pdfBlob} variant="default" className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Télécharger l&apos;attestation PDF
          </Button>
          <Button onClick={handlePrint} disabled={!pdfBlob} variant="outline" className="w-full">
            <Printer className="h-4 w-4 mr-2" />
            Imprimer
          </Button>
          <Button
            onClick={handleSendBonToClient}
            disabled={sendingBon || bonSent || !pdfBlob}
            variant="outline"
            className="w-full"
          >
            {sendingBon ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Envoi en cours...</>
            ) : bonSent ? (
              <><CheckCircle className="h-4 w-4 mr-2 text-emerald-500" />Envoyé au client</>
            ) : (
              <><Send className="h-4 w-4 mr-2" />Envoyer au client</>
            )}
          </Button>
          <Separator />
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              onComplete()
              onClose()
            }}
          >
            Fermer
          </Button>
        </div>
      </div>
    )
  }

  const content = (
    <>
      <div className={fullPage ? 'mb-4' : ''}>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bike className="h-5 w-5" />
          Livraison — {livraison.client.raison_sociale}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {success
            ? 'Livraison terminée avec succès'
            : `Étape ${step + 1} sur ${STEPS.length} — ${STEPS[step].label}`
          }
        </p>
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 pb-2">
        <div className="flex items-center gap-2 mt-2 text-sm font-mono bg-muted/50 rounded px-3 py-1.5">
          <span className="text-muted-foreground">Réf. Retina :</span>
          <span className="font-semibold">{refRetina || '—'}</span>
          {refRetina && (
            <button
              type="button"
              onClick={copyRetina}
              className="ml-1 p-1 rounded hover:bg-muted-foreground/10 active:scale-90 active:bg-muted-foreground/20 transition-all"
              title="Copier la référence"
            >
              {retinaCopied ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
        </div>
      </div>

      {!success && <StepIndicator currentStep={step} totalSteps={STEPS.length} />}

      <div className="py-2">
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>

      {!success && step < 3 && (
        <div className="flex justify-between pt-2">
          <Button
            variant="outline"
            onClick={() => step === 0 ? onClose() : setStep((s) => s - 1)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {step === 0 ? 'Annuler' : 'Retour'}
          </Button>
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
          >
            Suivant
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </>
  )

  if (fullPage) {
    return <div className="space-y-4">{content}</div>
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose() }}>
      <DialogContent className="w-full max-w-lg mx-2 max-h-[90vh] overflow-y-auto">
        {content}
      </DialogContent>
    </Dialog>
  )
}
