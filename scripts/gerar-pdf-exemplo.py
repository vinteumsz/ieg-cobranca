"""
Gera relatórios financeiros FICTÍCIOS para testar a leitura do PDF.
Todos os nomes, CPFs, telefones e e-mails são inventados.

Uso:  python3 scripts/gerar-pdf-exemplo.py
Requer: pip install reportlab
"""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cpf(base9: str) -> str:
    d = [int(c) for c in base9]
    for n in (10, 11):
        s = sum(v * (n - i) for i, v in enumerate(d))
        r = (s * 10) % 11
        d.append(0 if r == 10 else r)
    t = ''.join(map(str, d))
    return f"{t[:3]}.{t[3:6]}.{t[6:9]}-{t[9:]}"


def m(v):
    if v is None:
        return ''
    s = f"{v:,.2f}"
    return s.replace(',', 'X').replace('.', ',').replace('X', '.')


# (receita, parcela, venc, valor, desconto, pagamento, valor_pago)
def mens(n_paid, total=12, valor=603.00, desc=60.00, start=1, partial=None, blank_desc=False):
    rows = []
    for i in range(start, total + 1):
        venc = f"15/{i:02d}/2026"
        d = None if blank_desc else desc
        liq = valor - (desc if not blank_desc else 0)
        if i <= n_paid:
            rows.append(("MENSALIDADE", f"{i:02d}/{total}", venc, valor, d, liq, f"{min(i * 30 % 28 + 1, 28):02d}/{i:02d}/2026", liq))
        elif partial and i == partial[0]:
            rows.append(("MENSALIDADE", f"{i:02d}/{total}", venc, valor, d, liq, f"20/{i:02d}/2026", partial[1]))
        else:
            rows.append(("MENSALIDADE", f"{i:02d}/{total}", venc, valor, d, liq, None, 0.00))
    return rows


STUDENTS = [
    dict(aluno="PEDRO DA SILVA", turma="6º ANO A", resp="JOÃO DA SILVA", cpf=cpf("529982247"),
         email="joao.silva@exemplo.com.br", cel="(83) 99601-0331", rows=mens(3) ),
    dict(aluno="ANA BEATRIZ SOUZA", turma="1ª SÉRIE B", resp="MARIA DE FÁTIMA SOUZA", cpf=cpf("111444777"),
         email="", cel="(83) 98888-1234 / (83) 3264-0000", rows=[("MATRÍCULA 2026", "01/01", "10/01/2026", 450.00, None, 450.00, "10/01/2026", 450.00)] + mens(8, blank_desc=True)),
    dict(aluno="CARLOS EDUARDO OLIVEIRA", turma="9º ANO A", resp="ROBERTA OLIVEIRA", cpf=cpf("390533447"),
         email="roberta.oliveira@exemplo.com", cel="83 8777-6655", rows=mens(12)),
    dict(aluno="LUCAS OLIVEIRA", turma="3º ANO A", resp="ROBERTA OLIVEIRA", cpf=cpf("390533447"),
         email="roberta.oliveira@exemplo.com", cel="83 8777-6655", rows=mens(7, partial=(8, 300.00))),
    dict(aluno="SOFIA RAMOS PEREIRA", turma="INFANTIL V", resp="PAULO RAMOS PEREIRA", cpf=cpf("987654321"),
         email="paulo.ramos@exemplo.com", cel="(83) 99111-2222", rows=mens(0)),
]

COLS = [  # (título, x, alinhamento)
    ("C. RECEITA", 30, 'l'), ("PARCELA", 160, 'l'), ("VENCIMENTO", 225, 'l'), ("VALOR DA PARCELA", 395, 'r'),
    ("DESCONTO", 465, 'r'), ("VALOR LÍQUIDO", 555, 'r'), ("DATA DE PAGAMENTO", 600, 'l'), ("VALOR PAGO", 790, 'r'),
]


def header_page(c, page, total):
    w, h = landscape(A4)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(30, h - 30, "IEG COLÉGIO E CURSO")
    c.setFont("Helvetica", 8)
    c.drawRightString(w - 30, h - 30, f"Emitido em 05/10/2026 08:41   Página {page} de {total}")
    c.setFont("Helvetica-Bold", 10)
    c.drawString(30, h - 46, "RELATÓRIO FINANCEIRO POR ALUNO - 2026")
    return h - 70


def table_header(c, y):
    c.setFont("Helvetica-Bold", 7.5)
    for title, x, al in COLS:
        (c.drawRightString if al == 'r' else c.drawString)(x, y, title)
    c.line(30, y - 3, 800, y - 3)
    return y - 13


def row(c, y, r):
    rec, parc, venc, val, desc, liq, pag, pago = r
    c.setFont("Helvetica", 7.5)
    vals = [rec, parc, venc, m(val), m(desc), m(liq), pag or '', m(pago)]
    for (title, x, al), v in zip(COLS, vals):
        if v:
            (c.drawRightString if al == 'r' else c.drawString)(x, y, v)
    return y - 11


def student_header(c, y, s, layout):
    if layout == 'inline':
        c.setFont("Helvetica", 8.5)
        c.drawString(30, y, f"ALUNO: {s['aluno']}")
        c.drawString(420, y, f"TURMA: {s['turma']}")
        y -= 12
        c.drawString(30, y, f"RESPONSÁVEL: {s['resp']}")
        c.drawString(420, y, f"CPF: {s['cpf']}")
        y -= 12
        c.drawString(30, y, f"E-MAIL: {s['email']}")
        c.drawString(420, y, f"CELULAR: {s['cel']}")
        y -= 12
        c.drawString(30, y, "ENDEREÇO: RUA DAS ACÁCIAS, 75 - JOSÉ AMÉRICO - JOÃO PESSOA/PB - CEP 58074-082")
        y -= 12
        c.drawString(30, y, "")
    elif layout == 'columns':
        c.setFont("Helvetica-Bold", 7)
        for t, x in [("ALUNO", 30), ("TURMA", 250), ("RESPONSÁVEL", 340), ("CPF", 560), ("CELULAR", 660)]:
            c.drawString(x, y, t)
        y -= 10
        c.setFont("Helvetica", 8)
        for t, x in [(s['aluno'], 30), (s['turma'], 250), (s['resp'], 340), (s['cpf'], 560), (s['cel'], 660)]:
            c.drawString(x, y, t)
        y -= 12
        c.setFont("Helvetica-Bold", 7)
        c.drawString(30, y, "E-MAIL")
        c.drawString(340, y, "ENDEREÇO")
        y -= 10
        c.setFont("Helvetica", 8)
        c.drawString(30, y, s['email'] or ' ')
        c.drawString(340, y, "RUA DAS ACÁCIAS, 75 - JOÃO PESSOA/PB")
        y -= 12
    else:  # 'cells' — rótulo e valor em células separadas, sem dois-pontos
        c.setFont("Helvetica-Bold", 8)
        c.drawString(30, y, "Aluno")
        c.setFont("Helvetica", 8)
        c.drawString(95, y, s['aluno'].title())
        c.setFont("Helvetica-Bold", 8)
        c.drawString(420, y, "Turma")
        c.setFont("Helvetica", 8)
        c.drawString(470, y, s['turma'])
        y -= 12
        for lab, val, x, vx in [("Responsável", s['resp'].title(), 30, 95), ("CPF", s['cpf'], 420, 470)]:
            c.setFont("Helvetica-Bold", 8); c.drawString(x, y, lab)
            c.setFont("Helvetica", 8); c.drawString(vx, y, val)
        y -= 12
        for lab, val, x, vx in [("E-mail", s['email'], 30, 95), ("Celular", s['cel'], 420, 470)]:
            c.setFont("Helvetica-Bold", 8); c.drawString(x, y, lab)
            if val:
                c.setFont("Helvetica", 8); c.drawString(vx, y, val)
        y -= 14
    return y


def build(path, layout, rows_per_page=26):
    # pagina simples: cada aluno começa onde houver espaço; quebra de página repete o cabeçalho do aluno
    c = canvas.Canvas(path, pagesize=landscape(A4))
    pages = []
    page = 1
    total_pages = 4
    y = header_page(c, page, total_pages)
    for s in STUDENTS:
        if y < 200:
            c.showPage(); page += 1; y = header_page(c, page, total_pages)
        y = student_header(c, y, s, layout)
        y = table_header(c, y)
        for r in s['rows']:
            if y < 40:
                c.showPage(); page += 1; y = header_page(c, page, total_pages)
                y = student_header(c, y, s, layout)  # continuação
                y = table_header(c, y)
            y = row(c, y, r)
        aberto = sum(r[5] for r in s['rows'] if not r[6])
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(30, y - 2, "TOTAL DO ALUNO")
        c.drawRightString(555, y - 2, m(aberto))
        y -= 26
    c.save()


if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'exemplos'), exist_ok=True)
    os.makedirs(os.path.join(ROOT, 'tests', 'fixtures'), exist_ok=True)
    build(os.path.join(ROOT, 'exemplos', 'relatorio-exemplo.pdf'), 'inline')
    build(os.path.join(ROOT, 'tests', 'fixtures', 'layout-inline.pdf'), 'inline')
    build(os.path.join(ROOT, 'tests', 'fixtures', 'layout-colunas.pdf'), 'columns')
    build(os.path.join(ROOT, 'tests', 'fixtures', 'layout-celulas.pdf'), 'cells')
    print('ok')
