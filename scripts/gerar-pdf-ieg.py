"""
Gera um relatório FICTÍCIO no mesmo layout do relatório de débitos do sistema do IEG
(bloco "ALUNO: <matrícula> - <nome>", dados do responsável em duas colunas e tabela
TURMA | C.RECEITA | PARC | VENCIM. | PARC(R$) | DESC(R$) | DESC(%) | LIQUIDO(R$) | DT. PAGTO | V. PAGO(R$)).
Todos os nomes, CPFs, telefones e e-mails são inventados.

Uso:  python3 scripts/gerar-pdf-ieg.py
Requer: pip install reportlab
"""
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = A4
L, R = 20, 575

# (título, centro do título, x do valor, alinhamento do valor)
COLS = [
    ("TURMA", 102, 22, 'l'),
    ("C.RECEITA", 212, 186, 'l'),
    ("PARC", 257, 272, 'r'),
    ("VENCIM.", 296, 313, 'r'),
    ("PARC(R$)", 337, 354, 'r'),
    ("DESC(R$)", 375, 391, 'r'),
    ("DESC(%)", 414, 430, 'r'),
    ("LIQUIDO(R$)", 457, 479, 'r'),
    ("DT. PAGTO", 504, 525, 'r'),
    ("V. PAGO(R$)", 551, 572, 'r'),
]
BORDERS = [20, 184, 240, 275, 317, 357, 394, 433, 481, 527, 575]


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


def parc(turma, n, total, venc, valor, pct, pago_em=None, pago=None):
    desc = round(valor * pct / 100, 2)
    return dict(turma=turma, rec="MENSALIDADE", parc=f"{n:02d}/{total}", venc=venc, valor=valor, desc=desc, pct=pct,
                liq=round(valor - desc, 2), pago_em=pago_em, pago=pago)


RESP = {
    'thiago': dict(nome="THIAGO DE OLIVEIRA COSTA CAVALCANTI", cpf=cpf("529982247"), email="enterltda@hotmail.com",
                   tel="", cel="(83)98767-7071", end="RUA SEVERINA MARTINS DE OLIVEIRA, 27 - BAIRRO: JOSÉ AMÉRICO DE ALMEIDA",
                   cidade="JOÃO PESSOA ESTADO: PB - CEP:58074125"),
    'patricia': dict(nome="PATRÍCIA ARAÚJO LIMA", cpf=cpf("111444777"), email="patricia.lima@exemplo.com.br",
                     tel="(83)3245-1122", cel="(83)99812-3344", end="AV. EPITÁCIO PESSOA, 1500 - BAIRRO: TAMBAÚ",
                     cidade="JOÃO PESSOA ESTADO: PB - CEP:58039000"),
    'carlos': dict(nome="CARLOS MOURA COSTA", cpf=cpf("390533447"), email="carlos.moura@exemplo.com",
                   tel="", cel="(83)98877-6655", end="RUA DAS TRINCHEIRAS, 210 - BAIRRO: CENTRO",
                   cidade="JOÃO PESSOA ESTADO: PB - CEP:58011000"),
    'fernanda': dict(nome="FERNANDA MOURA COSTA", cpf=cpf("987654321"), email="fernanda.moura@exemplo.com",
                     tel="", cel="(83)99111-2222", end="RUA DAS TRINCHEIRAS, 210 - BAIRRO: CENTRO",
                     cidade="JOÃO PESSOA ESTADO: PB - CEP:58011000"),
    'jose': dict(nome="JOSÉ BARBOSA NETO", cpf=cpf("123456789"), email="jose.barbosa@exemplo.com",
                 tel="", cel="(83)98620-1020", end="RUA JOAQUIM NABUCO, 45 - BAIRRO: BESSA",
                 cidade="JOÃO PESSOA ESTADO: PB - CEP:58035000"),
    'helena': dict(nome="HELENA RÊGO", cpf=cpf("246813579"), email="", tel="(83)3233-4455", cel="",
                   end="RUA PROJETADA, S/N - BAIRRO: MANGABEIRA", cidade="JOÃO PESSOA ESTADO: PB - CEP:58055000"),
}

T7 = "7° ANO"
STUDENTS = [
    dict(matr=1733, aluno="ANA CLARA SILVA CAVALCANTI", blocos=[
        ('thiago', [parc(T7, 8, 11, "30/09/2026", 626.00, 8)]),
    ]),
    dict(matr=1802, aluno="MIGUEL ARAÚJO LIMA", blocos=[
        ('patricia', [parc("INFANTIL IV", i, 11, f"30/{i - 1:02d}/2026", 1250.00, 0) for i in (8, 9, 10)]
                     + [parc("INFANTIL IV", 11, 11, "30/10/2026", 1250.00, 0)]),
    ]),
    # Um aluno, dois responsáveis financeiros (cada um paga uma parte)
    dict(matr=1650, aluno="BEATRIZ MOURA COSTA", blocos=[
        ('carlos', [parc("9° ANO B", 7, 11, "30/08/2026", 313.00, 5), parc("9° ANO B", 8, 11, "30/09/2026", 313.00, 5)]),
        ('fernanda', [parc("9° ANO B", 8, 11, "30/09/2026", 313.00, 5)]),
    ]),
    # Irmãos com o mesmo responsável; uma parcela paga aparece com data e valor pagos
    dict(matr=1901, aluno="LUCAS BARBOSA NETO", blocos=[
        ('jose', [parc("1ª SÉRIE", 7, 11, "30/08/2026", 890.00, 10, "05/08/2026", 801.00),
                  parc("1ª SÉRIE", 8, 11, "30/09/2026", 890.00, 10)]),
    ]),
    dict(matr=1902, aluno="LARA BARBOSA NETO", blocos=[
        # 11 parcelas: a tabela continua na página seguinte; as 3 últimas ainda vão vencer
        ('jose', [parc("4° ANO", n, 11, f"10/{n + 1:02d}/2026", 740.00, 10) for n in range(1, 12)]),
    ]),
    # Sem e-mail e sem celular (só telefone residencial)
    dict(matr=2010, aluno="DAVI RÊGO", blocos=[
        ('helena', [parc("2° ANO", 9, 11, "30/09/2026", 580.00, 8)]),
    ]),
]


class Doc:
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
        self.page = 1
        self.y = self.page_header()

    def page_header(self):
        c = self.c
        c.setFont("Helvetica-Bold", 10)
        c.drawString(L, H - 30, "IEG - COLÉGIO E CURSO")
        c.setFont("Helvetica", 7)
        c.drawRightString(R, H - 30, f"Página: {self.page}")
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(L, H - 44, "RELAÇÃO DE DÉBITOS POR ALUNO - PÓS MATRÍCULA")
        c.setFont("Helvetica", 7)
        c.drawString(L, H - 54, "PERÍODO: 01/01/2026 A 30/09/2026")
        return H - 72

    def need(self, h, repeat_table=False):
        if self.y - h < 40:
            self.c.showPage()
            self.page += 1
            self.y = self.page_header()
            if repeat_table:
                self.table_header()

    def aluno(self, s):
        c = self.c
        self.need(70)
        c.rect(L, self.y - 4, R - L, 13)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(L + 3, self.y, f"ALUNO: {s['matr']} - {s['aluno']}")
        self.y -= 15

    def responsavel(self, r):
        c = self.c
        self.need(60)
        top = self.y
        c.setFont("Helvetica", 7)
        c.drawString(L + 3, self.y, f"RESPONSÁVEL: {r['nome']} CPF: {r['cpf']}")
        c.drawString(396, self.y, "EMAIL:")
        if r['email']:
            c.drawString(429, self.y, r['email'])
        self.y -= 9
        c.drawString(L + 3, self.y, f"ENDEREÇO: {r['end']}")
        c.drawString(396, self.y, "TEL. RESID:")
        if r['tel']:
            c.drawString(436, self.y, r['tel'])
        self.y -= 9
        c.drawString(L + 3, self.y, f"CIDADE: {r['cidade']}")
        c.drawString(396, self.y, "CELULAR:")
        if r['cel']:
            c.drawString(436, self.y, r['cel'])
        c.rect(L, self.y - 3, R - L, top - self.y + 11)
        self.y -= 12
        self.table_header()

    def table_header(self):
        c = self.c
        c.setFont("Helvetica-Bold", 6.5)
        for title, cx, _, _ in COLS:
            c.drawCentredString(cx, self.y, title)
        for x in BORDERS:
            c.line(x, self.y - 3, x, self.y + 8)
        c.line(L, self.y - 3, R, self.y - 3)
        self.y -= 11

    def row(self, p):
        c = self.c
        self.need(12, repeat_table=True)
        c.setFont("Helvetica", 7)
        vals = [p['turma'], p['rec'], p['parc'], p['venc'], m(p['valor']), m(p['desc']), f"{m(p['pct'])}%", m(p['liq']),
                p['pago_em'] or '', m(p['pago']) if p['pago'] is not None else '']
        for (_, _, x, al), v in zip(COLS, vals):
            if v:
                (c.drawRightString if al == 'r' else c.drawString)(x, self.y, v)
        for x in BORDERS:
            c.line(x, self.y - 3, x, self.y + 8)
        c.line(L, self.y - 3, R, self.y - 3)
        self.y -= 11

    def total(self, label, rows, bold=False):
        c = self.c
        self.need(12)
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 7)
        c.drawString(L + 3, self.y, label)
        sums = [sum(p['valor'] for p in rows), sum(p['desc'] for p in rows), None, sum(p['liq'] for p in rows), None,
                sum(p['pago'] or 0 for p in rows)]
        for (_, _, x, _), v in zip(COLS[4:], sums):
            if v is not None:
                c.drawRightString(x, self.y, m(v))
        c.line(L, self.y - 3, R, self.y - 3)
        self.y -= 12 if not bold else 18

    def save(self):
        self.c.save()


def build(path):
    d = Doc(path)
    for s in STUDENTS:
        d.aluno(s)
        todas = []
        for key, rows in s['blocos']:
            d.responsavel(RESP[key])
            for p in rows:
                d.row(p)
            d.total("TOTAL POR RESPONSÁVEL", rows)
            todas += rows
        d.y -= 4
        d.total("TOTAL POR ALUNO", todas, bold=True)
    d.c.setFont("Helvetica-Bold", 7.5)
    d.c.drawString(L + 3, d.y, "TOTAL GERAL")
    d.save()


if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'tests', 'fixtures'), exist_ok=True)
    build(os.path.join(ROOT, 'tests', 'fixtures', 'layout-ieg.pdf'))
    print('ok')
