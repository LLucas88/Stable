from html import escape
import math

INK = "#1E1C18"
MUT = "#7A7266"
LINE = "#E5DCCB"
GRID = "#ECE4D6"
PAPER = "#FFFDF8"
GREEN = "#2E6B57"
GREEN_L = "#8FB8A8"
RED = "#B23A2F"
RED_L = "#D9A49D"
AMBER = "#C98A3E"
EMBER = "#C2522A"
BLUE = "#46647F"
FONT = "'PingFang SC','Microsoft YaHei','Noto Sans SC',sans-serif"
NUM = "'DIN Alternate','Helvetica Neue',Arial,sans-serif"

def t(x, y, s, size=12, fill=INK, anchor="start", weight="400", opacity=1, family=FONT):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-family="{family}" font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}" font-weight="{weight}" opacity="{opacity}">{escape(str(s))}</text>')

def fmt(v, d=1, unit=""):
    if v is None:
        return "-"
    return f"{v:,.{d}f}{unit}"

def pct(v, d=1, sign=True):
    if v is None:
        return "-"
    s = f"{v*100:+.{d}f}%" if sign else f"{v*100:.{d}f}%"
    return s

def wan(v, d=1):
    if v is None:
        return "-"
    return f"{v/10000:,.{d}f}万"

def ticks(vmin, vmax, n=4):
    if vmax == vmin:
        vmax = vmin + 1
    raw = (vmax - vmin) / n
    mag = 10 ** math.floor(math.log10(abs(raw))) if raw else 1
    step = mag * 10
    for m in (1, 2, 2.5, 5, 10):
        if raw <= mag * m:
            step = mag * m
            break
    start = math.floor(vmin / step) * step
    out = []
    v = start
    while v <= vmax + step * 0.001:
        out.append(round(v, 10))
        v += step
    return out

def frame(w, h, pl=56, pr=20, pt=30, pb=38):
    return f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" role="img">', pl, pr, pt, pb

def xaxis(labels, x0, x1, y, every=3):
    s = ""
    n = len(labels)
    for i, lab in enumerate(labels):
        if i % every == 0 or i == n - 1:
            x = x0 + (x1 - x0) * i / max(n - 1, 1)
            s += t(x, y, lab, 10.5, MUT, "middle")
    return s

def endtag():
    return "</svg>"
