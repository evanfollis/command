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

export const COMMAND_NAV: CommandNavItem[] = [
  {
    href: '/',
    label: 'Executive',
    description: 'Authority, health, and live control posture.',
  },
  {
    href: '/orchestrate',
    label: 'Dispatch',
    description: 'Route new work into the right lane.',
  },
  {
    href: '/sessions',
    label: 'Sessions',
    description: 'Inspect and steer active agent lanes.',
  },
  {
    href: '/terminal',
    label: 'Console',
    description: 'Direct shell access when operator work is justified.',
  },
  {
    href: '/telemetry',
    label: 'Signals',
    description: 'Operational events and control-plane traces.',
  },
  {
    href: '/meta',
    label: 'Learning',
    description: 'Recurring patterns, friction, and synthesis input.',
  },
] as const

export function isActiveNavItem(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
