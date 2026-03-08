'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  LogOut,
  LayoutDashboard,
  Users,
  Building2,
  Truck,
  Settings,
  Menu,
  X,
  FileText,
  Bell,
  Map,
  ChevronDown,
  Calendar,
  ArrowLeftRight,
  LogIn,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getTenantConfig, TENANTS } from '@/lib/tenants'
import type { TenantId } from '@/lib/tenants'
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
  children?: NavItem[]
}

const adminNavItems: NavItem[] = [
  {
    href: '/admin/dashboard',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
    roles: ['super_admin', 'admin', 'agent_secteur', 'livreur'],
  },
  {
    href: '/admin/clients',
    label: 'Clients',
    icon: FileText,
    roles: ['super_admin', 'admin', 'agent_secteur'],
  },
  {
    href: '/admin/livraisons',
    label: 'Livraisons',
    icon: Truck,
    roles: ['super_admin', 'admin', 'agent_secteur', 'livreur'],
  },
  {
    href: '/admin/planning',
    label: 'Planning',
    icon: Calendar,
    roles: ['super_admin', 'admin', 'agent_secteur'],
  },
  {
    href: '/admin/map',
    label: 'Carte',
    icon: Map,
    roles: ['super_admin', 'admin', 'agent_secteur'],
  },
  {
    href: '/admin/alertes',
    label: 'Alertes',
    icon: Bell,
    roles: ['super_admin', 'admin', 'agent_secteur'],
  },
  {
    href: '/admin/settings',
    label: 'Parametres',
    icon: Settings,
    roles: ['super_admin', 'admin', 'agent_secteur'],
    children: [
      {
        href: '/admin/users',
        label: 'Utilisateurs',
        icon: Users,
        roles: ['super_admin', 'admin', 'agent_secteur'],
      },
      {
        href: '/admin/depots',
        label: 'Depots',
        icon: Building2,
        roles: ['super_admin'],
      },
      {
        href: '/admin/settings',
        label: 'Monday',
        icon: Calendar,
        roles: ['super_admin'],
      },
    ],
  },
]

const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  agent_secteur: 'Agent Secteur',
  livreur: 'Livreur',
  client: 'Client',
}

interface AdminNavProps {
  user: {
    id: string
    email: string
    role: UserRole
    is_super_admin?: boolean
    nom: string
    prenom: string
    territoire?: string | null
  }
}

export function AdminNav({ user }: AdminNavProps) {
  const tenant = getTenantConfig()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(
    pathname.startsWith('/admin/settings') || pathname.startsWith('/admin/users') || pathname.startsWith('/admin/depots')
  )
  const [desktopSettingsOpen, setDesktopSettingsOpen] = useState(false)
  const desktopSettingsRef = useRef<HTMLDivElement>(null)
  const [impersonating, setImpersonating] = useState<{ prenom: string; nom: string } | null>(null)

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Impersonation check
  useEffect(() => {
    const stored = localStorage.getItem('impersonate_return')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (Date.now() - data.timestamp < 4 * 60 * 60 * 1000) {
          setImpersonating({ prenom: data.prenom, nom: data.nom })
        } else {
          localStorage.removeItem('impersonate_return')
        }
      } catch { localStorage.removeItem('impersonate_return') }
    }
  }, [])

  // Close desktop settings dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (desktopSettingsRef.current && !desktopSettingsRef.current.contains(e.target as Node)) {
        setDesktopSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleReturnToAdmin = async () => {
    localStorage.removeItem('impersonate_return')
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
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

  const userInitials = `${user.prenom?.[0] ?? ''}${user.nom?.[0] ?? ''}`.toUpperCase()

  const isItemActive = (item: NavItem): boolean => {
    if (item.children) {
      return item.children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'))
    }
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  return (
    <>
      {/* Impersonation banner — ABOVE nav bar */}
      {impersonating && (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-orange-500 text-white px-4 py-1.5 flex items-center justify-between text-sm">
          <span>
            Connect&eacute; en tant que <strong>{user.prenom} {user.nom}</strong> &mdash; Session de {impersonating.prenom} {impersonating.nom}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReturnToAdmin}
            className="text-white hover:bg-orange-600 hover:text-white h-7"
          >
            <LogIn className="h-4 w-4 mr-1" />
            Revenir
          </Button>
        </div>
      )}

      {/* Fixed top bar */}
      <nav
        className={cn(
          'fixed left-0 right-0 z-50 h-14 bg-white border-b border-gray-200',
          impersonating ? 'top-[36px]' : 'top-0'
        )}
      >
        <div className="h-full px-4 flex items-center justify-between">
          {/* Left: Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <Image
                src={tenant.branding.logo}
                alt={tenant.branding.logoAlt}
                width={28}
                height={28}
                className="h-7 w-auto"
              />
              <span className="font-bold text-base text-gray-900 hidden sm:inline">
                {tenant.name}
              </span>
            </Link>
          </div>

          {/* Center: Desktop nav items (hidden on mobile) */}
          <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {filteredNavItems.map((item) => {
              if (item.children) {
                const childActive = isItemActive(item)
                const filteredChildren = item.children.filter(c => c.roles.includes(user.role))

                return (
                  <div key={item.label} className="relative" ref={desktopSettingsRef}>
                    <button
                      onClick={() => setDesktopSettingsOpen(!desktopSettingsOpen)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors relative',
                        childActive
                          ? 'text-primary'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                      <ChevronDown className={cn(
                        'h-3.5 w-3.5 transition-transform',
                        desktopSettingsOpen && 'rotate-180'
                      )} />
                      {childActive && (
                        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                      )}
                    </button>

                    {/* Desktop dropdown */}
                    {desktopSettingsOpen && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                        {filteredChildren.map((child) => {
                          const isChildActive = pathname === child.href || pathname.startsWith(child.href + '/')
                          return (
                            <Link
                              key={child.href + child.label}
                              href={child.href}
                              onClick={() => setDesktopSettingsOpen(false)}
                              className={cn(
                                'flex items-center gap-2 px-3 py-2 text-sm transition-colors',
                                isChildActive
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              )}
                            >
                              <child.icon className="h-4 w-4" />
                              {child.label}
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              const isActive = isItemActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors relative',
                    isActive
                      ? 'text-primary'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                  )}
                </Link>
              )
            })}
          </div>

          {/* Right: Tenant switch + User menu (desktop) + Mobile hamburger */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Tenant switch — super_admin only, visible on desktop */}
            {user.is_super_admin && (() => {
              const otherTenantId: TenantId = tenant.id === 'ppe' ? 'ecovolt' : 'ppe'
              const otherTenant = TENANTS[otherTenantId]
              return (
                <a
                  href={`${otherTenant.url}/admin/dashboard`}
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  {otherTenant.name}
                </a>
              )
            })()}

            {/* User menu dropdown — desktop */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden md:flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors">
                  <div className="w-8 h-8 bg-primary/15 text-primary rounded-full flex items-center justify-center text-xs font-semibold">
                    {userInitials}
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                </button>
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
                {/* Tenant switch in mobile user menu too */}
                {user.is_super_admin && (() => {
                  const otherTenantId: TenantId = tenant.id === 'ppe' ? 'ecovolt' : 'ppe'
                  const otherTenant = TENANTS[otherTenantId]
                  return (
                    <>
                      <DropdownMenuItem asChild>
                        <a href={`${otherTenant.url}/admin/dashboard`} className="flex items-center gap-2 cursor-pointer">
                          <ArrowLeftRight className="h-4 w-4" />
                          Basculer vers {otherTenant.name}
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )
                })()}
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" />
                  Se deconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile: avatar + hamburger */}
            <div className="flex md:hidden items-center gap-1">
              <div className="w-8 h-8 bg-primary/15 text-primary rounded-full flex items-center justify-center text-xs font-semibold">
                {userInitials}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="h-9 w-9"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        <div
          className={cn(
            'md:hidden overflow-hidden transition-all duration-200 ease-in-out bg-white border-b border-gray-200 shadow-lg',
            mobileMenuOpen ? 'max-h-[calc(100vh-56px)] opacity-100' : 'max-h-0 opacity-0 border-b-0'
          )}
        >
          <div className="px-4 py-3 space-y-1">
            {filteredNavItems.map((item) => {
              if (item.children) {
                const filteredChildren = item.children.filter(c => c.roles.includes(user.role))
                const childActive = filteredChildren.some(c =>
                  pathname === c.href || pathname.startsWith(c.href + '/')
                )

                return (
                  <div key={item.label}>
                    <button
                      onClick={() => setSettingsOpen(!settingsOpen)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors w-full',
                        childActive
                          ? 'text-primary bg-primary/5'
                          : 'text-gray-700 hover:bg-gray-100'
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                      <ChevronDown className={cn(
                        'h-4 w-4 ml-auto transition-transform',
                        settingsOpen && 'rotate-180'
                      )} />
                    </button>
                    <div
                      className={cn(
                        'overflow-hidden transition-all duration-200',
                        settingsOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                      )}
                    >
                      <div className="ml-2 mt-1 space-y-0.5 border-l-2 border-gray-200 pl-3">
                        {filteredChildren.map((child) => {
                          const isChildActive = pathname === child.href || pathname.startsWith(child.href + '/')
                          return (
                            <Link
                              key={child.href + child.label}
                              href={child.href}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                                isChildActive
                                  ? 'text-primary font-medium bg-primary/5 border-l-2 border-primary -ml-[2px] pl-[14px]'
                                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              )}
                            >
                              <child.icon className="h-4 w-4" />
                              {child.label}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              }

              const isActive = isItemActive(item)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'text-primary bg-primary/5 border-l-2 border-primary'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              )
            })}

            {/* Tenant switch in mobile menu */}
            {user.is_super_admin && (() => {
              const otherTenantId: TenantId = tenant.id === 'ppe' ? 'ecovolt' : 'ppe'
              const otherTenant = TENANTS[otherTenantId]
              return (
                <div className="pt-2 mt-2 border-t border-gray-200">
                  <a
                    href={`${otherTenant.url}/admin/dashboard`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  >
                    <ArrowLeftRight className="h-5 w-5" />
                    Basculer vers {otherTenant.name}
                  </a>
                </div>
              )
            })()}

            {/* User info + sign out in mobile menu */}
            <div className="pt-2 mt-2 border-t border-gray-200">
              <div className="flex items-center gap-3 px-3 py-2">
                <div className="w-9 h-9 bg-primary/15 text-primary rounded-full flex items-center justify-center text-sm font-semibold">
                  {userInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user.prenom} {user.nom}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {roleLabels[user.role]}
                  </p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors w-full mt-1"
              >
                <LogOut className="h-5 w-5" />
                Se deconnecter
              </button>
            </div>
          </div>
        </div>
      </nav>
    </>
  )
}
