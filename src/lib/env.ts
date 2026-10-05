import 'server-only'

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}. Veja o arquivo .env.example.`)
  return value
}

export const env = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
  },
  get supabasePublishableKey() {
    return required(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )
  },
  get supabaseSecretKey() {
    return required('SUPABASE_SECRET_KEY', process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)
  },
  get encryptionKey() {
    return process.env.APP_ENCRYPTION_KEY ?? ''
  },
  get appUrl() {
    return process.env.APP_URL ?? ''
  },
  get graphVersion() {
    return process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'
  },
}
