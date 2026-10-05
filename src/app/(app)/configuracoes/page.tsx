import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { PageHeader } from '@/components/ui'
import { requireAdmin } from '@/lib/auth'
import { TEMPLATE_VARIABLES } from '@/lib/billing/messages'
import { canEncrypt } from '@/lib/crypto'
import { loadSettings } from '@/lib/data'
import { env } from '@/lib/env'
import { todayISO } from '@/lib/format'
import { getSecretStatus, SECRET_META } from '@/lib/secrets'
import { DEFAULT_EMAIL_BODY, DEFAULT_EMAIL_SUBJECT, DEFAULT_WA_TEMPLATE_BODY, DEFAULT_WA_TEMPLATE_PARAMS, DEFAULT_WA_TEXT } from '@/lib/settings'
import { SettingsView } from './settings-view'

export const metadata: Metadata = { title: 'Configurações' }

export default async function SettingsPage() {
  await requireAdmin()
  const [settings, secretStatus] = await Promise.all([loadSettings(), getSecretStatus()])
  const h = await headers()
  const origin = env.appUrl || `https://${h.get('x-forwarded-host') ?? h.get('host')}`
  const secretMeta = Object.fromEntries(Object.entries(SECRET_META).map(([k, v]) => [k, { label: v.label, sensitive: v.sensitive, group: v.group, env: v.env }]))

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Regras de cobrança, textos das mensagens e integrações. Credenciais ficam somente no servidor e nunca são exibidas depois de salvas."
      />
      <SettingsView
        initial={settings}
        secretStatus={secretStatus}
        secretMeta={secretMeta}
        canEncrypt={canEncrypt()}
        webhookUrl={`${origin.replace(/\/$/, '')}/api/webhooks/whatsapp`}
        variables={TEMPLATE_VARIABLES}
        defaults={{
          waText: DEFAULT_WA_TEXT,
          waTemplateBody: DEFAULT_WA_TEMPLATE_BODY,
          waTemplateParams: DEFAULT_WA_TEMPLATE_PARAMS,
          emailSubject: DEFAULT_EMAIL_SUBJECT,
          emailBody: DEFAULT_EMAIL_BODY,
        }}
        today={todayISO()}
      />
    </>
  )
}
