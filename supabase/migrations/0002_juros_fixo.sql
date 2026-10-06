-- IEG Cobrança — juros com valor fixo por dia (em centavos).
-- Opcional: sem esta coluna o sistema usa o padrão da escola (R$ 0,19 por dia).
-- Rode uma vez no Supabase (SQL Editor) só se quiser poder alterar o valor em
-- Configurações → Juros e multa.

alter table public.settings
  add column if not exists daily_interest_cents integer
  check (daily_interest_cents is null or (daily_interest_cents between 0 and 100000));

notify pgrst, 'reload schema';
