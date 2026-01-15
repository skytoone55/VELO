'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import {
  Zap,
  LogOut,
  User,
  LayoutDashboard,
  Users,
  Building2,
  Truck,
  Settings,
  RefreshCcw,
  Menu,
  X,
  FileText,
  Bell,
  Sun,
  Moon,
  Map,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { UserRole } from '@/lib/types/database'
import { createClient } from '@/lib/supabase/client'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles: UserRole[]
}

const adminNavItems: NavItem[] = [
  {
    href: '/admin/dashboard',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    roles: ['admin_general', 'admin_regional', 'agent_regional', 'agent_depot', 'livreur'],
  },
  {
    href: '/admin/clients',
    label: 'Clients',
    icon: FileText,
    roles: ['admin_general', 'admin_regional', 'agent_regional'],
  },
  {
    href: '/admin/livraisons',
    label: 'Livraisons',
    icon: Truck,
    roles: ['admin_general', 'admin_regional', 'agent_regional', 'agent_depot', 'livreur'],
  },
  {
    href: '/admin/map',
    label: 'Carte',
    icon: Map,
    roles: ['admin_general', 'admin_regional', 'agent_regional'],
  },
  {
    href: '/admin/depots',
    label: 'Dépôts',
    icon: Building2,
    roles: ['admin_general', 'admin_regional'],
  },
  {
    href: '/admin/users',
    label: 'Utilisateurs',
    icon: Users,
    roles: ['admin_general', 'admin_regional'],
  },
  {
    href: '/admin/alertes',
    label: 'Alertes',
    icon: Bell,
    roles: ['admin_general', 'admin_regional'],
  },
  {
    href: '/admin/sync',
    label: 'Synchronisation',
    icon: RefreshCcw,
    roles: ['admin_general'],
  },
  {
    href: '/admin/settings',
    label: 'Paramètres',
    icon: Settings,
    roles: ['admin_general'],
  },
]

const roleLabels: Record<UserRole, string> = {
  admin_general: 'Admin Général',
  admin_regional: 'Admin Régional',
  agent_regional: 'Agent Régional',
  agent_depot: 'Agent Dépôt',
  livreur: 'Livreur',
  client: 'Client',
}

interface AdminNavProps {
  user: {
    id: string
    email: string
    role: UserRole
    nom: string
    prenom: string
    territoire?: string | null
  }
}

export function AdminNav({ user }: AdminNavProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

  const filteredNavItems = adminNavItems.filter(item =>
    item.roles.includes(user.role)
  )

  return (
    <>
      {/* Sidebar for desktop */}
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow bg-sidebar text-sidebar-foreground overflow-y-auto">
          {/* Logo + Theme Toggle */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-sidebar-primary rounded-full flex items-center justify-center">
                <Zap className="w-4 h-4 text-sidebar-primary-foreground" />
              </div>
              <span className="font-bold text-lg">ECO-VOLT</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Changer le thème</span>
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-4 space-y-1">
            {filteredNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          {/* User info at bottom */}
          <div className="p-4 border-t border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-sidebar-accent rounded-full flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.prenom} {user.nom}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {roleLabels[user.role]}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground">
            <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-sidebar-primary rounded-full flex items-center justify-center">
                  <Zap className="w-4 h-4 text-sidebar-primary-foreground" />
                </div>
                <span className="font-bold text-lg">ECO-VOLT</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="px-2 py-4 space-y-1">
              {filteredNavItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Top header for mobile */}
      <header className="sticky top-0 z-40 md:hidden flex items-center justify-between h-16 px-4 border-b bg-background">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold">ECO-VOLT</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <User className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user.prenom} {user.nom}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {roleLabels[user.role]}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    </>
  )
}
