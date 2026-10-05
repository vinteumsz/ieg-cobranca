// Marca provisória. Para usar a logo oficial, coloque o arquivo em public/logo.svg
// e troque o <span> abaixo por <img src="/logo.svg" alt="IEG" className="size-9" />.
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-brand font-display text-[11px] font-bold tracking-tight text-white"
      >
        IEG
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block font-display text-[15px] font-semibold">IEG Cobrança</span>
          <span className="block text-[11px] text-ink-3">Colégio e Curso</span>
        </span>
      )}
    </div>
  )
}
