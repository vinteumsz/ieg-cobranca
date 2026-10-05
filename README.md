# IEG Cobrança

Sistema interno da equipe financeira do **IEG Colégio e Curso** para transformar o relatório financeiro (PDF) em cobranças conferidas e enviadas por **WhatsApp** (API oficial da Meta) e **e-mail**.

Fluxo: **Login → Importar PDF → Leitura automática → Conferência → Seleção → Prévia → Confirmação → Envio → Histórico.**
Nada é enviado na importação. Todo envio passa por uma janela de confirmação.

---

## Sumário

1. [O que já está pronto](#1-o-que-já-está-pronto)
2. [Tecnologias](#2-tecnologias)
3. [Colocar no ar (passo a passo)](#3-colocar-no-ar-passo-a-passo)
4. [Configurar o WhatsApp (Meta Cloud API)](#4-configurar-o-whatsapp-meta-cloud-api)
5. [Configurar o e-mail](#5-configurar-o-e-mail)
6. [Primeiro uso recomendado](#6-primeiro-uso-recomendado)
7. [Como a leitura do PDF funciona](#7-como-a-leitura-do-pdf-funciona)
8. [Regras de cobrança e juros](#8-regras-de-cobrança-e-juros)
9. [Segurança e LGPD](#9-segurança-e-lgpd)
10. [Desenvolvimento e testes](#10-desenvolvimento-e-testes)
11. [Estrutura do projeto](#11-estrutura-do-projeto)

---

## 1. O que já está pronto

| Área | O que faz |
|---|---|
| **Login** | E-mail e senha (Supabase Auth). Sem cadastro público: usuários são criados por um administrador. Papéis **Administrador** e **Operador**. |
| **Importar relatório** | Arrastar ou selecionar o PDF, ver nome, tamanho e data. “Processar relatório” lê o arquivo **no navegador** e mostra quantos responsáveis e cobranças foram encontrados. OCR automático se o PDF for escaneado. Avisa se o mesmo arquivo já foi importado. |
| **Leitura do PDF** | Identifica aluno, responsável, CPF, e-mail, celular, turma e a tabela de parcelas (C. Receita, Parcela, Vencimento, Valor, Desconto, Líquido, Data de pagamento, Valor pago). Tolera variações de layout e gera **alertas** quando algo parece estranho. |
| **Agrupamento** | Uma cobrança por **responsável + aluno**, com as parcelas listadas por mês (`15/04/2026 → Abril/2026`) e o total. |
| **Conferência** | Tabela com busca (responsável, aluno, CPF, turma) e filtros (Todos, Pendentes, Selecionados, Mensagem enviada, Erro no envio, Com alerta, Cancelados). No celular vira lista de cartões. |
| **Detalhes** | Dados do responsável, mensalidades em aberto, total, juros (se configurados), prévia do WhatsApp e do e-mail com **edição**, correção de contato, cancelamento da cobrança. |
| **Envio em massa** | Seleção por caixas, janela “Você está prestes a enviar N mensagens de cobrança” com WhatsApps, e-mails e responsáveis sem e-mail; envio em lotes com barra de progresso. |
| **Proteções** | Aviso de cobrança recente (“Este responsável recebeu uma cobrança em DD/MM/AAAA. Deseja enviar novamente?”), bloqueio de cobranças com alerta até alguém conferir, trava contra clique duplo e contra dois funcionários enviando ao mesmo tempo, **modo de testes** ligado por padrão. |
| **Histórico** | Data, horário, responsável, aluno, valor, canal, WhatsApp, e-mail, status (Enviado, Entregue, Erro, Pendente, Cancelado, Teste) e funcionário. Clique para ver o texto exato enviado. |
| **Painel** | Total em aberto, responsáveis inadimplentes, alunos, mensalidades vencidas, mensagens enviadas hoje, cobranças por WhatsApp e por e-mail, e gráficos: inadimplência por mês, parcelas vencidas por tempo de atraso e valor em aberto por turma. |
| **Configurações** | Regras de atualização da dívida (juros diário, multa, data inicial), regra de parcela em aberto, exibição do CPF, textos das mensagens com prévia, WhatsApp, e-mail, modo de testes e arquivamento do PDF. |
| **Usuários e logs** | Criar, desativar e redefinir senha; logs de acesso e de todas as ações sensíveis. |

---

## 2. Tecnologias

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**, ícones **Lucide**, fontes Sora e Inter (auto-hospedadas)
- **Supabase**: PostgreSQL, Auth e Storage (bucket privado opcional)
- **unpdf** (pdf.js) para ler o PDF e **tesseract.js** como OCR de reserva
- **Meta WhatsApp Cloud API** (sem WhatsApp Web / automação de navegador)
- **SMTP** (Nodemailer — serve para Gmail/Google Workspace com senha de app) ou **Resend**
- **Vitest** para os testes

---

## 3. Colocar no ar (passo a passo)

### 3.1 Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (região **São Paulo** — `sa-east-1`).
2. Abra **SQL Editor**, cole todo o conteúdo de `supabase/migrations/0001_ieg_cobranca.sql` e execute.
   (Ou, com a CLI: `supabase link` e `supabase db push`.)
3. Em **Authentication → Sign In / Providers**, **desligue “Allow new users to sign up”**.
   Mesmo que fique ligado por engano, contas criadas fora do sistema nascem **inativas**.
4. Em **Project Settings → API**, copie a URL, a chave *publishable* (anon) e a chave *secret* (service_role).

### 3.2 Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

| Variável | Obrigatória | Para quê |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | sim | URL do projeto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sim | chave pública (anon) |
| `SUPABASE_SECRET_KEY` | sim | chave secreta — só no servidor |
| `APP_ENCRYPTION_KEY` | sim* | criptografa os tokens salvos pela tela. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `APP_URL` | recomendado | endereço público (ex.: `https://cobranca.iegcolegioecurso.com.br`) |
| `WHATSAPP_*`, `SMTP_*`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` | não | alternativa a configurar pela tela |

\* Sem ela, as credenciais só podem ser definidas como variáveis de ambiente.

> **Guarde a `APP_ENCRYPTION_KEY`.** Se ela mudar, os tokens salvos pela tela deixam de abrir e precisam ser digitados de novo.

### 3.3 Primeiro administrador

```bash
npm install
npm run create-admin -- financeiro@iegcolegioecurso.com.br "Nome Completo" "UmaSenhaForte123"
```

(O primeiro usuário criado no Supabase também vira administrador automaticamente.)

### 3.4 Publicar na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Na Vercel: **Add New → Project**, importe o repositório (o framework Next.js é detectado sozinho).
3. Em **Settings → Environment Variables**, cadastre as variáveis do item 3.2.
4. Faça o deploy e, se quiser, aponte um subdomínio (ex.: `cobranca.iegcolegioecurso.com.br`) com um registro **CNAME** para a Vercel. O HTTPS é automático.

Rodar localmente: `npm run dev` e abrir `http://localhost:3000`.

---

## 4. Configurar o WhatsApp (Meta Cloud API)

**Importante:** a Meta só deixa a empresa **iniciar** conversa usando **modelos (templates) aprovados**. Mensagem de texto livre só é entregue se o responsável tiver falado com a escola nas últimas 24 horas. Por isso o modo padrão é **“Modelo aprovado”**.

1. Crie um app em [developers.facebook.com](https://developers.facebook.com) do tipo **Business** e adicione o produto **WhatsApp**.
2. Registre o número da escola na Cloud API (WhatsApp Manager → Números de telefone). Anote o **Phone Number ID** e o **WhatsApp Business Account ID**.
3. Gere um **token permanente** de um *usuário do sistema* no Business Manager (Configurações do negócio → Usuários do sistema), com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
4. No **WhatsApp Manager → Modelos de mensagem**, crie o modelo:
   - **Nome:** `cobranca_mensalidade` · **Categoria:** Utilidade · **Idioma:** Português (BR)
   - **Corpo:** use o texto sugerido em *Configurações → WhatsApp → Texto do modelo aprovado* (com `{{1}}` = nome do responsável, `{{2}}` = aluno, `{{3}}` = mensalidades, `{{4}}` = valor total).
   - Exemplos para a aprovação: `Maria da Silva`, `Pedro da Silva`, `Abril/2026 – R$ 543,00; Maio/2026 – R$ 543,00`, `R$ 1.086,00`.
   - A Meta pode reclassificar a categoria. Mantenha o tom informativo (o Código de Defesa do Consumidor, art. 42, proíbe expor o devedor a constrangimento ou ameaça).
5. No sistema, em **Configurações → WhatsApp**: modo “Modelo aprovado”, nome do modelo, idioma `pt_BR` e as credenciais (Phone Number ID, WABA ID, token).
6. **Status de entrega (opcional, recomendado):** em **App → WhatsApp → Configuration → Webhook**, cadastre a URL exibida na tela (`https://SEU-DOMINIO/api/webhooks/whatsapp`), o **token de verificação** que você definiu em Configurações e assine o campo `messages`. Informe também o **App Secret** (App → Configurações → Básico) — ele valida que os avisos vêm mesmo da Meta. Assim o histórico mostra **Entregue** e **Lido**.
7. Use **“Enviar teste”** para o seu próprio celular.

Limites da Meta: contas novas começam com um teto de destinatários por 24 horas, que sobe com o uso e a boa qualidade das mensagens. A Meta também exige que as pessoas tenham concordado em receber mensagens da escola — vale incluir essa autorização no contrato de matrícula.

---

## 5. Configurar o e-mail

Em **Configurações → E-mail** escolha:

- **SMTP** — servidor, porta (587 ou 465), usuário e senha.
  *Gmail / Google Workspace:* `smtp.gmail.com`, porta 587, o e-mail como usuário e uma **senha de app** (Conta Google → Segurança → Verificação em duas etapas → Senhas de app).
- **Resend** — crie a conta em [resend.com](https://resend.com), **verifique o domínio** `iegcolegioecurso.com.br` (registros DNS no Registro.br) e cole a chave da API.

Preencha também o **e-mail remetente** (precisa estar autorizado no provedor), o **nome do remetente**, o **nome da equipe** e o **e-mail de resposta**. Para não cair em spam, configure SPF e DKIM do domínio conforme o provedor indicar.

---

## 6. Primeiro uso recomendado

1. Entre como administrador e confira **Configurações**. O **modo de testes vem ligado**: nenhuma mensagem chega aos responsáveis.
2. Em *Testes e segurança*, informe o **seu** celular e e-mail de teste. Com eles, as mensagens vão para você; sem eles, o envio é só simulado.
3. Importe um relatório real, confira a leitura (compare alguns responsáveis com o PDF), envie algumas cobranças e veja como chegam.
4. Quando tudo estiver certo, **desligue o modo de testes**.
5. Defina com a direção: taxa de juros diária, multa e data inicial (deixe em branco se ainda não houver decisão — o sistema **não inventa** percentuais) e se a cobrança considera o valor **com** ou **sem** desconto.

---

## 7. Como a leitura do PDF funciona

- O PDF é lido **no navegador do funcionário**; para o servidor vão apenas as linhas de texto com posições. Isso evita o limite de upload da Vercel e o arquivo não precisa ser guardado.
- Se o PDF for uma imagem escaneada, o sistema faz **OCR** (português) página a página, também no navegador. Na primeira vez são baixados os arquivos do OCR (cerca de 15 MB).
- O leitor aceita rótulos com ou sem dois-pontos, vários rótulos na mesma linha, rótulos com o valor na linha de baixo, quebras de página no meio de um aluno e células vazias na tabela (ex.: desconto em branco).
- Cada cobrança recebe **alertas** quando algo merece atenção: CPF inválido, sem celular, telefone fixo, 9º dígito acrescentado, sem e-mail, valores que não fecham (parcela − desconto ≠ líquido), mesmo celular para responsáveis diferentes, responsável que precisou ser “herdado” do aluno anterior. Alertas **críticos** bloqueiam o envio até alguém clicar em “Marcar como conferido”.
- Se nenhum aluno for identificado, a tela mostra as primeiras linhas lidas — útil para ajustar o leitor a um layout diferente (`src/lib/pdf/parse.ts`).

> O leitor foi testado com relatórios **fictícios** montados a partir dos campos descritos (veja `exemplos/relatorio-exemplo.pdf` e `scripts/gerar-pdf-exemplo.py`). Antes de usar em produção, importe um relatório real do sistema da escola e confira o resultado.

---

## 8. Regras de cobrança e juros

- **Parcela em aberto** (padrão): sem data de pagamento **ou** com valor pago zerado. Outras opções: só sem data de pagamento; só valor pago zerado; valor pago menor que o da parcela (inclui pagamentos parciais).
- **Somente vencidas** (padrão): parcelas a vencer aparecem na conferência, mas não entram no total nem na mensagem. Há tolerância em dias.
- **Valor considerado**: líquido (com desconto, padrão) ou valor da parcela (sem desconto).
- As regras valem para as **próximas** importações; cada importação guarda as regras usadas.
- **Juros**: juros simples diários sobre o valor em aberto de cada parcela, contados do vencimento (ou da data inicial configurada, se for posterior), mais multa única. Sem taxa configurada, nada é calculado e as mensagens trazem apenas o aviso de que os valores estão sujeitos à atualização.
- **CPF na mensagem**: não exibir, parcial (`***.***.***-45`, padrão) ou completo.
- **Variáveis** disponíveis nos textos: `{{nome_responsavel}}`, `{{nome_aluno}}`, `{{lista_mensalidades}}`, `{{valor_total}}`, `{{detalhe_atualizacao}}`, `{{linha_cpf}}`, `{{turma}}` e outras (lista completa na tela).

---

## 9. Segurança e LGPD

- **Autenticação** obrigatória em todas as páginas e APIs; perfis desativados perdem o acesso na hora.
- **Controle de acesso**: operadores importam, conferem e enviam; só administradores mexem em configurações, credenciais, usuários e logs.
- **Banco**: RLS ligado em todas as tabelas. Funcionários só **leem** pelo Supabase; toda gravação passa pelo servidor do app, que registra quem fez. Ninguém consegue forjar histórico chamando a API do Supabase diretamente.
- **Credenciais** das APIs ficam no servidor, **criptografadas (AES-256-GCM)** numa tabela sem acesso público. A tela só mostra se estão configuradas e os 4 últimos caracteres.
- **HTTPS** (Vercel) com HSTS e cabeçalhos de segurança; APIs com `Cache-Control: no-store` e checagem de origem contra CSRF; webhook da Meta com assinatura validada.
- **Logs de acesso**: entradas (e falhas), importações, aberturas de conferência, edições, envios, cancelamentos e mudanças de configuração, com usuário, data e IP.
- **Minimização**: o endereço do relatório não é armazenado; parcelas pagas não são guardadas; o PDF original **não é armazenado** (a menos que a administração ligue o arquivamento, em bucket privado).
- **Exclusão**: cada importação pode ser excluída (apaga as cobranças e o PDF, se houver). O histórico de envios é mantido como registro de auditoria.
- Recomendações: exclua importações antigas quando não forem mais necessárias, mantenha poucos administradores e use senhas fortes.

---

## 10. Desenvolvimento e testes

```bash
npm run dev        # servidor local
npm test           # testes (leitura de PDF, regras, juros, mensagens)
npm run typecheck  # checagem de tipos
npm run build      # build de produção

# Gerar novamente os PDFs fictícios de teste (requer Python + reportlab)
python3 scripts/gerar-pdf-exemplo.py
```

Os testes leem três layouts diferentes de PDF fictício e conferem alunos, contatos, parcelas, agrupamento, totais, regras alternativas, juros e textos das mensagens.

---

## 11. Estrutura do projeto

```
src/
  app/
    login/                 tela de login (server action)
    (app)/                 área logada: painel, importar, importações, conferência,
                           histórico, configurações, usuários, logs
    api/                   imports, charges, send, settings, integrations, users,
                           webhooks/whatsapp
  components/              interface (botões, diálogos, gráficos, menu)
  lib/
    pdf/                   extração (texto e OCR) e leitura do relatório
    billing/               regras de cobrança, juros, montagem das mensagens
    send/                  WhatsApp Cloud API, e-mail, orquestração dos envios
    auth.ts, audit.ts, crypto.ts, secrets.ts, settings.ts, format.ts
  proxy.ts                 renovação da sessão e bloqueio de quem não está logado
supabase/migrations/       banco, RLS e bucket privado
scripts/                   criar administrador, gerar PDFs de teste
tests/                     testes automatizados (Vitest)
exemplos/                  relatório fictício para experimentar a importação
```

**Logo:** a marca exibida é provisória. Coloque a logo oficial em `public/logo.svg` e ajuste `src/components/logo.tsx` e `public/icon.svg`.
