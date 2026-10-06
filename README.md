# IEG Cobrança

Sistema interno da equipe financeira do **IEG Colégio e Curso** para transformar o relatório financeiro (PDF) em cobranças conferidas e enviadas por **WhatsApp** e **e-mail**.

Fluxo: **Login → Importar PDF → Leitura automática → Conferência → Seleção → Prévia → Confirmação → Envio → Histórico.**
Nada é enviado na importação.

**Duas formas de envio** (Configurações → Forma de envio):

- **Manual (padrão):** o sistema abre o WhatsApp (Web ou aplicativo) ou o e-mail (programa padrão, Gmail ou Outlook) já com o contato e a mensagem prontos. O funcionário confere, clica em enviar e confirma no sistema, que registra o envio no histórico. **Não precisa de API, token nem servidor de e-mail.**
- **Automático (opcional):** envio pela API oficial do WhatsApp (Meta) e por SMTP/Resend, com janela de confirmação e envio em lotes.

---

## Sumário

1. [O que já está pronto](#1-o-que-já-está-pronto)
2. [Tecnologias](#2-tecnologias)
3. [Colocar no ar (passo a passo)](#3-colocar-no-ar-passo-a-passo)
4. [Configurar o WhatsApp (Meta Cloud API)](#4-configurar-o-whatsapp-meta-cloud-api)
5. [Configurar o e-mail](#5-configurar-o-e-mail)
6. [Primeiro uso recomendado](#6-primeiro-uso-recomendado)
7. [Como a leitura do PDF funciona](#7-como-a-leitura-do-pdf-funciona)
8. [Regras de cobrança](#8-regras-de-cobrança)
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
| **Conferência** | Tabela com busca (responsável, aluno, CPF, turma) e filtros (Todos, Pendentes, Selecionados, Mensagem enviada, Erro no envio, Com alerta, Cancelados). Selecione várias cobranças para enviar ou **apagar**. No celular vira lista de cartões. |
| **Detalhes** | Dados do responsável, mensalidades em aberto, total, prévia do WhatsApp e do e-mail com **edição**, correção de contato, cancelamento e **exclusão** da cobrança. |
| **Envio manual** | No detalhe: “Abrir no WhatsApp” / “Abrir e-mail” com a mensagem pronta, botão “Copiar” e confirmação “Sim, registrar envio”. Para vários selecionados: janela “Você está prestes a enviar N mensagens de cobrança” e uma **fila**, um responsável por vez (abrir → enviar → registrar e ir para o próximo, ou pular). O WhatsApp Web abre sempre na mesma aba. |
| **Envio automático** | (Opcional) Mesma janela de confirmação, envio em lotes com barra de progresso pela API. |
| **Proteções** | Aviso de cobrança recente (“Este responsável recebeu uma cobrança em DD/MM/AAAA. Deseja enviar novamente?”), bloqueio de cobranças com alerta até alguém conferir, trava contra clique duplo e contra dois funcionários enviando ao mesmo tempo, **modo de testes** (envio automático) ligado por padrão. |
| **Histórico** | Data, horário, responsável, aluno, valor, canal, WhatsApp, e-mail, status (Enviado, Entregue, Erro, Pendente, Cancelado, Teste) e funcionário. Clique para ver o texto exato enviado. Administradores podem **apagar** envios (um ou vários); a cobrança volta a ficar pendente se não restar outro envio. |
| **Painel** | Total em aberto, responsáveis inadimplentes, alunos, mensalidades vencidas, mensagens enviadas hoje, cobranças por WhatsApp e por e-mail, e gráficos: inadimplência por mês, parcelas vencidas por tempo de atraso e valor em aberto por turma. |
| **Configurações** | Forma de envio, juros e multa (com conferência por um boleto), regra de parcela em aberto, valor cobrado (valor cheio, padrão), exibição do CPF, textos das mensagens com prévia, integrações do envio automático, modo de testes e arquivamento do PDF. |
| **Usuários e logs** | Criar, desativar e redefinir senha; logs de acesso e de todas as ações sensíveis. |

---

## 2. Tecnologias

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4**, ícones **Lucide**, fontes Sora e Inter (auto-hospedadas)
- **Supabase**: PostgreSQL, Auth e Storage (bucket privado opcional)
- **unpdf** (pdf.js) para ler o PDF e **tesseract.js** como OCR de reserva
- Envio manual: links oficiais do WhatsApp (`wa.me` / WhatsApp Web / aplicativo) e de e-mail (`mailto:`, Gmail, Outlook) — quem envia é o funcionário
- Envio automático (opcional): **Meta WhatsApp Cloud API** e **SMTP** (Nodemailer) ou **Resend**
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
| `APP_ENCRYPTION_KEY` | só no envio automático* | criptografa os tokens salvos pela tela. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `APP_URL` | recomendado | endereço público (ex.: `https://cobranca.iegcolegioecurso.com.br`) |
| `WHATSAPP_*`, `SMTP_*`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` | não | só para o envio automático |

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

### 3.5 Deixar o acesso privado

O sistema já exige login, não tem cadastro aberto (contas criadas por fora nascem desativadas), não é indexado pelo Google e registra todos os acessos. Para uma segunda tranca antes da tela de login, escolha uma na Vercel:

- **Só pessoas convidadas, de qualquer lugar:** *Settings → Deployment Protection → Vercel Authentication → All Deployments*. A página só abre para quem entrar com uma conta Vercel convidada para o projeto (no plano Pro, funcionários entram como *Viewer*, sem custo).
- **Só dentro da escola:** no *Firewall*, uma regra que bloqueia IPs diferentes do IP fixo da escola.

No envio manual não há webhook, então nenhuma exceção é necessária. Se um dia usar o webhook de entrega do envio automático, crie um *Protection Bypass for Automation* e cadastre na Meta a URL com `?x-vercel-protection-bypass=SEGREDO` (ou deixe `/api/webhooks` fora da regra de IP).

---

## 4. Envio automático (opcional): WhatsApp pela Meta Cloud API

> No **envio manual** (padrão) não há nada a configurar aqui: basta o WhatsApp da escola estar aberto no WhatsApp Web, no aplicativo de computador ou no celular de quem envia.

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

## 5. Envio automático (opcional): servidor de e-mail

> No **envio manual** o e-mail abre no programa padrão do computador, no Gmail ou no Outlook (escolha na própria tela), já com destinatário, assunto e texto. Nada a configurar.

Para o envio automático, em **Configurações → E-mail** escolha:

- **SMTP** — servidor, porta (587 ou 465), usuário e senha.
  *Gmail / Google Workspace:* `smtp.gmail.com`, porta 587, o e-mail como usuário e uma **senha de app** (Conta Google → Segurança → Verificação em duas etapas → Senhas de app).
- **Resend** — crie a conta em [resend.com](https://resend.com), **verifique o domínio** `iegcolegioecurso.com.br` (registros DNS no Registro.br) e cole a chave da API.

Preencha também o **e-mail remetente** (precisa estar autorizado no provedor), o **nome do remetente**, o **nome da equipe** e o **e-mail de resposta**. Para não cair em spam, configure SPF e DKIM do domínio conforme o provedor indicar.

---

## 6. Primeiro uso recomendado

1. Entre como administrador e confira **Configurações**. A forma de envio vem como **Manual**.
2. Abra o WhatsApp da escola no WhatsApp Web (ou no aplicativo) no computador de quem vai enviar.
3. Importe um relatório real e confira a leitura (compare alguns responsáveis com o PDF).
4. Faça um primeiro envio para você mesmo: use “Corrigir contato” numa cobrança para colocar o seu número/e-mail, abra, envie e veja como a mensagem chega. Depois cancele essa cobrança.
5. Cadastre os funcionários em **Usuários**.
6. Se um dia usar o envio automático, o **modo de testes** (ligado por padrão) manda tudo para o seu contato de teste até ser desligado.
7. O valor cobrado é o **valor cheio** da parcela (sem desconto), como a escola definiu, mais multa e juros conforme Configurações → Juros e multa.

---

## 7. Como a leitura do PDF funciona

- O PDF é lido **no navegador do funcionário**; para o servidor vão apenas as linhas de texto com posições. Isso evita o limite de upload da Vercel e o arquivo não precisa ser guardado.
- Se o PDF for uma imagem escaneada, o sistema faz **OCR** (português) página a página, também no navegador. Na primeira vez são baixados os arquivos do OCR (cerca de 15 MB).
- O leitor aceita rótulos com ou sem dois-pontos, vários rótulos na mesma linha, rótulos com o valor na linha de baixo, quebras de página no meio de um aluno e células vazias na tabela (ex.: desconto em branco).
- Cada cobrança recebe **alertas** quando algo merece atenção: CPF inválido, sem celular, telefone fixo, 9º dígito acrescentado, sem e-mail, valores que não fecham (parcela − desconto ≠ líquido), mesmo celular para responsáveis diferentes, responsável que precisou ser “herdado” do aluno anterior. Alertas **críticos** bloqueiam o envio até alguém clicar em “Marcar como conferido”.
- Se nenhum aluno for identificado, a tela mostra as primeiras linhas lidas — útil para ajustar o leitor a um layout diferente (`src/lib/pdf/parse.ts`).

- Layout do sistema da escola: reconhece `ALUNO: 1733 - NOME` (matrícula antes do nome), a turma dentro da tabela, as colunas `PARC(R$)`, `DESC(R$)`, `DESC(%)` (ignorada), `LIQUIDO(R$)`, `DT. PAGTO`, `V. PAGO(R$)`, as linhas `TOTAL POR RESPONSÁVEL` / `TOTAL POR ALUNO` e alunos com mais de um responsável financeiro.

> O leitor é testado com relatórios **fictícios**: três layouts genéricos (`scripts/gerar-pdf-exemplo.py`) e uma réplica do layout do relatório de débitos da escola (`scripts/gerar-pdf-ieg.py` → `tests/fixtures/layout-ieg.pdf`). Ao importar um relatório real, confira alguns responsáveis com o PDF.

---

## 8. Regras de cobrança

- **Parcela em aberto** (padrão): sem data de pagamento **ou** com valor pago zerado. Outras opções: só sem data de pagamento; só valor pago zerado; valor pago menor que o devido (inclui pagamentos parciais — quem pagou o valor com desconto em dia não fica devendo a diferença).
- **Somente vencidas** (padrão): parcelas a vencer aparecem na conferência, mas não entram no total nem na mensagem. Há tolerância em dias.
- **Valor cobrado**: **valor cheio** da parcela (sem desconto) — é o valor do débito na escola. Opção alternativa: valor líquido (com desconto). Ao trocar essa opção, as importações já feitas são **recalculadas**.
- As demais regras valem para as **próximas** importações; cada importação guarda as regras usadas.
- **Juros e multa** (Configurações → Juros e multa): padrão da escola de **2% de multa** (sobre o valor cheio de cada parcela vencida) e **juros fixos de R$ 0,19 por dia de atraso**, igual para qualquer parcela. O atraso conta a partir do **primeiro dia útil depois do vencimento** (vencimento na sexta, sábado ou domingo começa na segunda). Conferido com o relatório do sistema da escola (parcelas de R$ 563,00 de fevereiro a setembro: multa R$ 11,26 e juros batendo centavo por centavo). Use 0 para não cobrar. Para poder alterar o valor dos juros pela tela, rode uma vez `supabase/migrations/0002_juros_fixo.sql` no SQL Editor do Supabase (sem isso vale o padrão de R$ 0,19).
- **Apagar**: cobranças podem ser apagadas na conferência (uma pelo detalhe, ou várias pela seleção); envios podem ser apagados no Histórico (somente administradores). Toda exclusão fica nos logs de acesso.
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
npm test           # testes (leitura de PDF, regras, mensagens, exclusões e recálculo)
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
