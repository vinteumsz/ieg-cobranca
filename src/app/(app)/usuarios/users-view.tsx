'use client'

import { KeyRound, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useToast } from '@/components/toast'
import { apiFetch, Badge, Button, Card, Field, Input, Modal, Select } from '@/components/ui'
import { formatDateTime } from '@/lib/format'
import type { Profile } from '@/lib/types'

export function UsersView({ users, meId }: { users: Profile[]; meId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [pwFor, setPwFor] = useState<Profile | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', role: 'operador', password: '' })
  const [newPw, setNewPw] = useState('')

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    try {
      await apiFetch(`/api/users/${id}`, { method: 'PATCH', json: body })
      toast(ok)
      router.refresh()
    } catch (e) {
      toast((e as Error).message, 'bad')
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="brand" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>
          Novo usuário
        </Button>
      </div>
      <Card>
        <ul className="divide-y divide-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-strong">
                {(u.full_name || u.email).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {u.full_name || '—'}
                  {u.id === meId && <Badge>você</Badge>}
                  {!u.active && <Badge tone="bad">inativo</Badge>}
                </p>
                <p className="truncate text-sm text-ink-3">
                  {u.email}
                  {u.created_at ? ` · desde ${formatDateTime(u.created_at).date}` : ''}
                </p>
              </div>
              <Select
                value={u.role}
                onChange={(e) => patch(u.id, { role: e.target.value }, 'Papel atualizado.')}
                className="w-40"
                aria-label={`Papel de ${u.email}`}
                disabled={u.id === meId}
              >
                <option value="operador">Operador</option>
                <option value="admin">Administrador</option>
              </Select>
              <Button size="sm" variant="ghost" icon={<KeyRound className="size-4" />} onClick={() => setPwFor(u)}>
                Senha
              </Button>
              {u.id !== meId && (
                <Button size="sm" variant={u.active ? 'secondary' : 'primary'} onClick={() => patch(u.id, { active: !u.active }, u.active ? 'Acesso desativado.' : 'Acesso reativado.')}>
                  {u.active ? 'Desativar' : 'Reativar'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Novo usuário"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await apiFetch('/api/users', { method: 'POST', json: form })
                  toast('Usuário criado. Passe a senha inicial pessoalmente.')
                  setCreating(false)
                  setForm({ full_name: '', email: '', role: 'operador', password: '' })
                  router.refresh()
                } catch (e) {
                  toast((e as Error).message, 'bad')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Criar usuário
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome" htmlFor="u-name">
            <Input id="u-name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label="E-mail" htmlFor="u-email">
            <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Papel" htmlFor="u-role">
            <Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="operador">Operador</option>
              <option value="admin">Administrador</option>
            </Select>
          </Field>
          <Field label="Senha inicial" htmlFor="u-pw" hint="Mínimo de 10 caracteres.">
            <Input id="u-pw" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!pwFor}
        onClose={() => setPwFor(null)}
        title={`Redefinir senha${pwFor ? ` · ${pwFor.full_name || pwFor.email}` : ''}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwFor(null)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={newPw.length < 10}
              onClick={async () => {
                await patch(pwFor!.id, { password: newPw }, 'Senha redefinida.')
                setNewPw('')
                setPwFor(null)
              }}
            >
              Salvar senha
            </Button>
          </>
        }
      >
        <Field label="Nova senha" htmlFor="pw-new" hint="Mínimo de 10 caracteres.">
          <Input id="pw-new" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}
