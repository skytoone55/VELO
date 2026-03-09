'use client'

import { useAdminUser } from '@/components/admin/admin-user-provider'
import { UserRole } from '@/lib/types/database'
import Link from 'next/link'
import {
  FileText,
  Truck,
  Map,
  Bell,
  Users,
  Building2,
  Settings,
  Calendar,
} from 'lucide-react'

interface MenuCard {
  href: string
  label: string
  description: string
  icon: React.ElementType
  color: string
  roles: UserRole[]
}

const menuCards: MenuCard[] = [
  {
    href: '/admin/clients',
    label: 'Clients',
    description: 'Gestion des dossiers clients',
    icon: FileText,
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    roles: ['super_admin', 'admin', 'agent_secteur'],
  },
  {
    href: '/admin/livraisons',
    label: 'Livraisons',
    description: 'Suivi des livraisons',
    icon: Truck,
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    roles: ['super_admin', 'admin', 'agent_secteur', 'livreur'],
  },
  {
    href: '/admin/planning',
    label: 'Planning',
    description: 'Creneaux et planification',
    icon: Calendar,
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    roles: ['super_admin', 'admin', 'agent_secteur', 'livreur'],
  },
  {
    href: '/admin/map',
    label: 'Carte',
    description: 'Vue geographique',
    icon: Map,
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    roles: ['super_admin', 'admin', 'agent_secteur'],
  },
  {
    href: '/admin/alertes',
    label: 'Alertes',
    description: 'Notifications et alertes',
    icon: Bell,
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    roles: ['super_admin', 'admin'],
  },
  {
    href: '/admin/users',
    label: 'Utilisateurs',
    description: 'Gestion des comptes',
    icon: Users,
    color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    roles: ['super_admin'],
  },
  {
    href: '/admin/depots',
    label: 'Depots',
    description: 'Gestion des depots',
    icon: Building2,
    color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    roles: ['super_admin'],
  },
  {
    href: '/admin/settings',
    label: 'Parametres',
    description: 'Configuration Monday',
    icon: Settings,
    color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    roles: ['super_admin'],
  },
]

export default function DashboardPage() {
  const user = useAdminUser()

  const visibleCards = menuCards.filter(card => card.roles.includes(user.role))

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold tracking-tight">
          Bonjour{user.prenom ? `, ${user.prenom}` : ''}
        </h1>
        <p className="text-muted-foreground mt-2">
          Que souhaitez-vous faire ?
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-3xl w-full">
        {visibleCards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex flex-col items-center gap-3 p-6 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all"
          >
            <div className={`p-3 rounded-xl ${card.color}`}>
              <card.icon className="h-6 w-6" />
            </div>
            <div className="text-center">
              <div className="font-semibold text-sm group-hover:text-primary transition-colors">
                {card.label}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {card.description}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
