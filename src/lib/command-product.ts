export interface CommandNavItem {
  href: string
  label: string
  description: string
}

export const COMMAND_IDENTITY = {
  name: 'Command',
  title: 'Executive Surface',
  description: 'Principal-facing executive front door for the Synaplex workspace.',
} as const

export const COMMAND_NAV: CommandNavItem[] = [] as const

export function isActiveNavItem(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
