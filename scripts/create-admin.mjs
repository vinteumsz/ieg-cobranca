// Cria (ou promove) um administrador do IEG Cobrança.
// Uso:  node --env-file=.env.local scripts/create-admin.mjs email@escola.com.br "Nome Completo" "SenhaForte123"
import { createClient } from '@supabase/supabase-js'

const [email, name, password] = process.argv.slice(2)
if (!email || !name || !password) {
  console.error('Uso: node --env-file=.env.local scripts/create-admin.mjs <email> "<nome>" "<senha>"')
  process.exit(1)
}
if (password.length < 10) {
  console.error('A senha precisa ter pelo menos 10 caracteres.')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY (veja .env.example).')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })
let userId
const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } })
if (error) {
  if (!/already|registered|exists/i.test(error.message)) {
    console.error('Erro:', error.message)
    process.exit(1)
  }
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
  userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
  console.log('Usuário já existia; promovendo a administrador.')
} else {
  userId = data.user.id
}
const { error: e2 } = await db.from('profiles').upsert({ id: userId, email: email.toLowerCase(), full_name: name, role: 'admin', active: true })
if (e2) {
  console.error('Erro ao gravar perfil:', e2.message)
  process.exit(1)
}
console.log(`Pronto: ${email} é administrador.`)
