import { AlertTriangle, CheckCheck, Clock, FlaskConical, X } from 'lucide-react'
import { Badge } from '@/components/ui'
import type { ChannelStatus, ChargeStatus } from '@/lib/types'

export function StatusBadge({ status }: { status: ChargeStatus }) {
  switch (status) {
    case 'enviado':
      return <Badge tone="accent">Enviado</Badge>
    case 'entregue':
      return <Badge tone="ok" icon={<CheckCheck className="size-3" />}>Entregue</Badge>
    case 'erro':
      return <Badge tone="bad" icon={<AlertTriangle className="size-3" />}>Erro</Badge>
    case 'cancelado':
      return <Badge icon={<X className="size-3" />}>Cancelado</Badge>
    default:
      return <Badge>Pendente</Badge>
  }
}

export function ChannelBadge({ status, available, missingLabel }: { status: ChannelStatus | null; available: boolean; missingLabel: string }) {
  if (!available) return <span className="text-xs text-ink-3">{missingLabel}</span>
  switch (status) {
    case 'enviado':
      return <Badge tone="accent">Enviado</Badge>
    case 'entregue':
      return <Badge tone="ok">Entregue</Badge>
    case 'lido':
      return <Badge tone="ok" icon={<CheckCheck className="size-3" />}>Lido</Badge>
    case 'erro':
      return <Badge tone="bad">Erro</Badge>
    case 'simulado':
      return <Badge tone="brand" icon={<FlaskConical className="size-3" />}>Teste</Badge>
    case 'pendente':
      return <Badge icon={<Clock className="size-3" />}>Enviando</Badge>
    default:
      return <span className="text-xs text-ink-2">Não enviado</span>
  }
}
