'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Loader2, Phone, MapPin, Bike, Clock, ChevronDown, ChevronUp,
  Truck, CheckCircle, AlertTriangle, Navigation, ClipboardCheck,
} from 'lucide-react'
import { PROCESS_STATUTS, STATUT_COLORS } from '@/lib/constants'
import type { ProcessStatut } from '@/lib/constants'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
