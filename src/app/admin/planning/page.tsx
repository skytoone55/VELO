'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAdminUser } from '@/components/admin/admin-user-provider'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Loader2, ChevronLeft, ChevronRight, Calendar, Truck,
  Send, MapPin, Bike, Clock, Search, Eye, X,
} from 'lucide-react'
import { DELIVERY_STATUS } from '@/lib/constants'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
