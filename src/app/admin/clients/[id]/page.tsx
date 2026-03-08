'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Loader2,
  ArrowLeft,
  Building2,
  Truck,
  CheckCircle,
  AlertCircle,
  Mail,
  Phone,
  User,
  Send,
  Eye,
  Download,
  KeyRound,
  MapPin,
  Warehouse,
  RotateCcw,
  Copy,
  Calendar,
  Bike,
  Shield,
  Clock,
  CloudUpload,
  Info,
  FileText,
} from 'lucide-react'
import { Client, Livraison, Depot } from '@/lib/types/database'
import { PROCESS_STATUTS, STATUT_COLORS, STATUT_TRANSITIONS, type ProcessStatut } from '@/lib/constants'
import { getCommercialName } from '@/lib/tenants/commercial'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { LivraisonWithClient } from '@/components/admin/delivery-module'

const MiniMap = dynamic(() => import('@/components/ui/mini-map').then(m => ({ default: m.MiniMap })), {
  ssr: false,
  loading: () => <div className="h-[200px] w-full bg-muted/30 rounded animate-pulse" />,
})
