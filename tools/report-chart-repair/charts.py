from svgkit import *
import math

def empty_chart(w, h):
    return frame(w, h)[0] + t(w / 2, h / 2, "暂无数据", 12, MUT, "middle") + endtag()

def extent(values, lower=None, upper=None):
    if any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise ValueError("图表数据必须为有限数值")
    lo = min(values) if lower is None else lower
    hi = max(values) if upper is None else upper
    if not math.isfinite(lo) or not math.isfinite(hi) or hi < lo:
        raise ValueError("图表坐标范围无效")
    if hi == lo:
        pad = abs(lo) * 0.05 or 1
        lo, hi = lo - pad, hi + pad
    return lo, hi

def line_chart(series, labels, w=760, h=320, ymin=None, ymax=None, yfmt=None,
               annotate=None, ref=None, area=True, x_every=3, end_labels=True):
    yfmt = yfmt or (lambda v: f"{v:.0f}")
    annotate = annotate or []
    vals = [v for s in series for v in s["values"] if v is not None]
    if not vals: return empty_chart(w, h)
    if any(len(s["values"]) != len(labels) for s in series):
        raise ValueError("折线数据与标签数量不一致")
    lo, hi = extent(vals, ymin, ymax)
    if ymin is None: lo = lo - (hi - lo) * 0.14
    if ymax is None: hi = hi + (hi - lo) * 0.16
    head, pl, pr, pt, pb = frame(w, h)
    x0, x1, y0, y1 = pl, w - pr, pt, h - pb
    tl = ticks(lo, hi, 4)
    def X(i): return x0 + (x1 - x0) * i / max(len(labels) - 1, 1)
    def Y(v): return y1 - (v - lo) / (hi - lo) * (y1 - y0)
    s = head
    for v in tl:
        y = Y(v)
        s += f'<line x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}" stroke="{GRID}" stroke-width="1" stroke-dasharray="3 5"/>'
        s += t(x0 - 8, y + 4, yfmt(v), 10.5, MUT, "end")
    if ref:
        y = Y(ref["v"])
        s += f'<line x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}" stroke="{ref.get("color", AMBER)}" stroke-width="1.2" stroke-dasharray="6 5" opacity=".75"/>'
        s += t(x0 + 4, y - 6, ref["label"], 10, ref.get("color", AMBER), "start", "600")
    for si, se in enumerate(series):
        pts = [(X(i), Y(v)) for i, v in enumerate(se["values"]) if v is not None]
        if not pts: continue
        if area and si == 0:
            path = f'M {pts[0][0]:.1f} {y1:.1f} L ' + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts) + f' L {pts[-1][0]:.1f} {y1:.1f} Z'
            s += f'<path d="{path}" fill="url(#g{si})" opacity=".9"/>'
            s = f'<defs><linearGradient id="g{si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{se["color"]}" stop-opacity=".18"/><stop offset="1" stop-color="{se["color"]}" stop-opacity="0"/></linearGradient></defs>' + s
        path = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in pts)
        dash = ' stroke-dasharray="6 5"' if se.get("dash") else ""
        s += f'<path d="{path}" fill="none" stroke="{se["color"]}" stroke-width="{se.get("width",2.4)}" stroke-linecap="round" stroke-linejoin="round"{dash}/>'
        if se.get("dots", True):
            for i, v in enumerate(se["values"]):
                if v is not None and (i == len(se["values"]) - 1 or i in [a["i"] for a in annotate]):
                    s += f'<circle cx="{X(i):.1f}" cy="{Y(v):.1f}" r="4" fill="{PAPER}" stroke="{se["color"]}" stroke-width="2.2"/>'
    for a in annotate:
        i = a["i"]; v = series[0]["values"][i]
        if v is None: continue
        x, y = X(i), Y(v)
        dx, dy = a.get("dx", 0), a.get("dy", -14)
        s += f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x+dx:.1f}" y2="{y+dy+6:.1f}" stroke="{a.get("color", INK)}" stroke-width="1" opacity=".45"/>'
        s += t(x + dx, y + dy, a["text"], a.get("size", 11), a.get("color", INK), a.get("anchor", "middle"), "700")
    s += xaxis(labels, x0, x1, h - 12, x_every)
    return s + endtag()

def column_chart(values, labels, w=760, h=320, colors=None, ref=None, annotate=None,
                 yfmt=None, x_every=3, highlight=None, neg=False):
    yfmt = yfmt or (lambda v: f"{v:.0f}")
    annotate = annotate or []
    if not values: return empty_chart(w, h)
    if len(values) != len(labels): raise ValueError("柱状图数据与标签数量不一致")
    lo, hi = extent(values + [0])
    head, pl, pr, pt, pb = frame(w, h)
    x0, x1, y0, y1 = pl, w - pr, pt, h - pb
    tl = ticks(lo * 1.05 if lo < 0 else 0, hi * 1.12, 4)
    lo, hi = min(tl), max(tl)
    def Y(v): return y1 - (v - lo) / (hi - lo) * (y1 - y0)
    n = len(values); bw = (x1 - x0) / n * 0.58
    s = head
    for v in tl:
        y = Y(v)
        s += f'<line x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}" stroke="{GRID}" stroke-width="1" stroke-dasharray="3 5"/>'
        s += t(x0 - 8, y + 4, yfmt(v), 10.5, MUT, "end")
    if ref:
        y = Y(ref["v"])
        s += f'<line x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}" stroke="{ref.get("color", AMBER)}" stroke-width="1.2" stroke-dasharray="6 5"/>'
        s += t(x1, y - 6, ref["label"], 10, ref.get("color", AMBER), "end", "600")
    for i, v in enumerate(values):
        x = x0 + (x1 - x0) * (i + 0.5) / n
        col = (colors[i] if colors else GREEN)
        if highlight == i: col = EMBER
        top = Y(max(v, 0)); bot = Y(min(v, 0))
        s += f'<rect x="{x-bw/2:.1f}" y="{top:.1f}" width="{bw:.1f}" height="{bot-top:.1f}" rx="3" fill="{col}" opacity="{1 if highlight==i else .82}"/>'
    for a in annotate:
        i = a["i"]; x = x0 + (x1 - x0) * (i + 0.5) / n; y = Y(values[i])
        s += t(x + a.get("dx", 0), y + a.get("dy", -9), a["text"], a.get("size", 11), a.get("color", INK), "middle", "700")
    s += xaxis(labels, x0, x1, h - 12, x_every)
    return s + endtag()

def grouped_bars(cats, series, w=380, h=200, yfmt=None, gap=0.24, value_labels=True):
    yfmt = yfmt or (lambda v: f"{v:.1f}")
    vals = [v for s in series for v in s["values"] if v is not None]
    if not vals: return empty_chart(w, h)
    if any(len(s["values"]) != len(cats) for s in series):
        raise ValueError("分组柱状图数据与类别数量不一致")
    lo, hi = extent(vals + [0])
    lo, hi = lo * 1.18, hi * 1.18
    head, pl, pr, pt, pb = frame(w, h, 42, 12, 58, 34)
    x0, x1, y0, y1 = pl, w - pr, pt, h - pb
    tl = ticks(lo, hi, 3)
    lo, hi = min(tl), max(tl)
    def Y(v): return y1 - (v - lo) / (hi - lo) * (y1 - y0)
    n = len(cats); groupw = (x1 - x0) / n
    bw = groupw * (1 - gap) / len(series)
    s = head
    if any(se.get("name") for se in series):
        lx = x0
        for se in series:
            if not se.get("name"): continue
            s += f'<rect x="{lx}" y="8" width="8" height="8" rx="2" fill="{se["color"]}"/>'
            s += t(lx + 12, 16, se["name"], 9.5, MUT, "start", "600")
            lx += 26 + len(se["name"]) * 6.2
    for v in tl:
        y = Y(v)
        s += f'<line x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}" stroke="{GRID}" stroke-dasharray="3 5"/>'
        s += t(x0 - 6, y + 4, yfmt(v), 9.5, MUT, "end")
    for ci, c in enumerate(cats):
        for si, se in enumerate(series):
            v = se["values"][ci]
            if v is None: continue
            x = x0 + groupw * ci + groupw * gap / 2 + bw * si
            top, bottom = Y(max(v, 0)), Y(min(v, 0))
            s += f'<rect x="{x:.1f}" y="{top:.1f}" width="{bw*0.86:.1f}" height="{bottom-top:.1f}" rx="2.5" fill="{se["color"]}" opacity=".88"/>'
            if value_labels:
                s += t(x + bw * 0.43, Y(v) + (12 if v < 0 else -6), yfmt(v), 9.5, se["color"], "middle", "700")
        s += t(x0 + groupw * (ci + 0.5), h - 12, c, 10, MUT, "middle")
    return s + endtag()

def hbar_rank(items, w=640, h=300, label_w=118, fmtv=None, maxv=None, show_note=True):
    fmtv = fmtv or (lambda v: f"{v:.1f}%")
    n = len(items)
    if not n: return empty_chart(w, h)
    extent([i["value"] for i in items])
    head, pl, pr, pt, pb = frame(w, h, 8, 16, 14, 14)
    x0, x1 = label_w, w - pr - 54
    top, bot = pt + 6, h - pb
    row = (bot - top) / n
    maxv = max(abs(i["value"]) for i in items) if maxv is None else maxv
    if not math.isfinite(maxv) or maxv < 0: raise ValueError("排名图范围无效")
    if maxv == 0 and any(i["value"] != 0 for i in items): raise ValueError("非零数据不能使用零范围")
    s = head
    s += f'<line x1="{x0}" y1="{top}" x2="{x0}" y2="{bot}" stroke="{LINE}"/>'
    for i, it in enumerate(items):
        y = top + row * i + row * 0.5
        bw = (x1 - x0) * abs(it["value"]) / maxv if maxv else 0
        col = it.get("color", GREEN)
        s += t(x0 - 10, y + 4, it["label"], 11.5, INK, "end", "600")
        s += f'<rect x="{x0}" y="{y-row*0.24:.1f}" width="{bw:.1f}" height="{row*0.48:.1f}" rx="3" fill="{col}" opacity=".9"/>'
        s += t(x1 + 6, y + 4, it["text"] if "text" in it else fmtv(it["value"]), 11, col, "start", "700", family=NUM)
        if show_note and it.get("note"):
            s += t(x0 + 6, y + row * 0.38, it["note"], 9.5, MUT)
    return s + endtag()

def scatter(points, w=760, h=330, ref=None, xlabel="", ylabel=""):
    if not points: return empty_chart(w, h)
    xs = [p["x"] for p in points]; ys = [p["y"] for p in points]
    extent(xs); extent(ys)
    if min(xs) <= 0: raise ValueError("对数散点图横坐标必须大于零")
    lxmin, lxmax = math.log10(min(xs) * 0.8), math.log10(max(xs) * 1.25)
    ymin, ymax = min(ys + [0]) - 0.03, max(ys + [0]) + 0.04
    head, pl, pr, pt, pb = frame(w, h, 56, 22, 26, 44)
    x0, x1, y0, y1 = pl, w - pr, pt, h - pb
    def X(v): return x0 + (math.log10(v) - lxmin) / (lxmax - lxmin) * (x1 - x0)
    def Y(v): return y1 - (v - ymin) / (ymax - ymin) * (y1 - y0)
    s = head
    for v in ticks(ymin, ymax, 4):
        y = Y(v)
        s += f'<line x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}" stroke="{GRID}" stroke-dasharray="3 5"/>'
        s += t(x0 - 8, y + 4, f"{v*100:+.0f}%", 10, MUT, "end")
    if ref is not None:
        y = Y(ref)
        s += f'<line x1="{x0}" y1="{y:.1f}" x2="{x1}" y2="{y:.1f}" stroke="{EMBER}" stroke-width="1.3" stroke-dasharray="6 5"/>'
        s += t(x1 - 4, y - 7, f"大盘 {ref*100:+.1f}%", 10, EMBER, "end", "700")
    for p in points:
        r = p.get("r", 5)
        s += f'<circle cx="{X(p["x"]):.1f}" cy="{Y(p["y"]):.1f}" r="{r}" fill="{p.get("color", GREEN)}" opacity=".82" stroke="{PAPER}" stroke-width="1.5"/>'
        s += t(X(p["x"]) + p.get("dx", 0), Y(p["y"]) + p.get("dy", -9), p["label"], p.get("size", 10.5), p.get("tcolor", INK), p.get("anchor", "middle"), "600")
    s += t((x0 + x1) / 2, h - 8, xlabel, 10, MUT, "middle")
    s += t(12, pt - 8, ylabel, 10, MUT, "start")
    return s + endtag()

def waterfall(steps, w=380, h=210, fmtv=None):
    fmtv = fmtv or (lambda v: f"{v/10000:,.0f}万")
    vals = [s["value"] for s in steps]
    if not vals: return empty_chart(w, h)
    extent(vals)
    run, bars = 0, []
    for i, st in enumerate(steps):
        if st.get("total"):
            bars.append((0, st["value"])); run = st["value"]
        else:
            bars.append((run, run + st["value"])); run += st["value"]
    lo, hi = extent([v for bar in bars for v in bar])
    pad = (hi - lo) * 0.14
    head, pl, pr, pt, pb = frame(w, h, 44, 12, 24, 38)
    x0, x1, y0, y1 = pl, w - pr, pt, h - pb
    def Y(v): return y1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad)) * (y1 - y0)
    n = len(steps); bw = (x1 - x0) / n * 0.54
    s = head
    s += f'<line x1="{x0}" y1="{Y(0):.1f}" x2="{x1}" y2="{Y(0):.1f}" stroke="{LINE}"/>'
    for i, st in enumerate(steps):
        a, b = bars[i]
        col = st.get("color", GREEN if b >= a else RED)
        if st.get("total"): col = INK
        x = x0 + (x1 - x0) * (i + 0.5) / n
        s += f'<rect x="{x-bw/2:.1f}" y="{Y(max(a,b)):.1f}" width="{bw:.1f}" height="{abs(Y(a)-Y(b)):.1f}" rx="3" fill="{col}" opacity=".9"/>'
        s += t(x, Y(max(a, b)) - 7, st.get("text", fmtv(abs(b - a))), 10, col, "middle", "700")
        s += t(x, h - 12, st["label"], 10, MUT, "middle")
        if i < n - 1:
            s += f'<line x1="{x+bw/2:.1f}" y1="{Y(b):.1f}" x2="{x+(x1-x0)/n:.1f}" y2="{Y(b):.1f}" stroke="{MUT}" stroke-dasharray="2 3" opacity=".4"/>'
    return s + endtag()

def funnel(steps, w=380, h=220):
    if not steps: return empty_chart(w, h)
    values = [st["value"] for st in steps]
    extent(values)
    if min(values) < 0 or any(a < b for a, b in zip(values, values[1:])):
        raise ValueError("漏斗数据必须非负且逐层不增")
    head, pl, pr, pt, pb = frame(w, h, 14, 14, 14, 12)
    x0, x1 = pl, w - pr
    top, bot = pt, h - pb
    maxv = steps[0]["value"]
    s = head
    row = (bot - top) / len(steps)
    for i, st in enumerate(steps):
        y = top + row * i
        wbar = (x1 - x0 - 74) * st["value"] / maxv if maxv else 0
        col = st.get("color", GREEN)
        s += t(x0, y + 13, st["label"], 10.5, INK, "start", "600")
        s += f'<rect x="{x0}" y="{y+19:.1f}" width="{wbar:.1f}" height="13" rx="4" fill="{col}" opacity="{st.get("opacity", .85)}"/>'
        if i < len(steps) - 1:
            s += f'<rect x="{x0}" y="{y+19:.1f}" width="{x1-x0-74:.1f}" height="13" rx="4" fill="{col}" opacity=".10"/>'
        s += t(x0 + wbar + 8, y + 30, st["note"], 10, st.get("note_color", INK), "start", "700")
    return s + endtag()

def dumbbell(rows, w=380, h=190, unit=""):
    if not rows: return empty_chart(w, h)
    head, pl, pr, pt, pb = frame(w, h, 108, 58, 22, 20)
    x0, x1 = pl, w - pr
    top, bot = pt, h - pb
    vals = [v for r in rows for v in (r["a"], r["b"])]
    lo, hi = extent(vals)
    pad = (hi - lo) * 0.06
    lo, hi = lo - pad, hi + pad
    def X(v): return x0 + (v - lo) / (hi - lo) * (x1 - x0)
    s = head
    for i, r in enumerate(rows):
        y = top + (bot - top) * (i + 0.5) / len(rows)
        s += t(x0 - 10, y + 4, r["label"], 10.5, INK, "end", "600")
        s += f'<line x1="{X(r["a"]):.1f}" y1="{y:.1f}" x2="{X(r["b"]):.1f}" y2="{y:.1f}" stroke="{LINE}" stroke-width="4"/>'
        s += f'<circle cx="{X(r["a"]):.1f}" cy="{y:.1f}" r="5" fill="{MUT}"/>'
        s += f'<circle cx="{X(r["b"]):.1f}" cy="{y:.1f}" r="5" fill="{GREEN}"/>'
        s += t(X(r["a"]), y - 9, f'{r["a"]:.1f}', 9.5, MUT, "middle", family=NUM)
        s += t(X(r["b"]), y - 9, f'{r["b"]:.1f}', 9.5, GREEN, "middle", "700", family=NUM)
    return s + endtag()

def sparkline(values, w=120, h=34, color=GREEN):
    vals = [v for v in values if v is not None]
    if not vals: return empty_chart(w, h)
    lo, hi = extent(vals)
    rng = hi - lo or 1
    pts = " ".join(f"{(i/(len(vals)-1) if len(vals)>1 else 0.5)*w:.1f},{h-(v-lo)/rng*(h-6)-3:.1f}" for i, v in enumerate(vals))
    return f'<svg viewBox="0 0 {w} {h}" width="{w}" height="{h}"><polyline points="{pts}" fill="none" stroke="{color}" stroke-width="1.8" stroke-linecap="round"/></svg>'

def donut(parts, w=200, h=200, center=""):
    if not parts: return empty_chart(w, h)
    extent([p["value"] for p in parts])
    if any(p["value"] < 0 for p in parts): raise ValueError("环形图数据不能为负数")
    total = sum(p["value"] for p in parts)
    if total == 0: return empty_chart(w, h)
    r, cx, cy, sw = 62, 100, 100, 22
    s = f'<svg viewBox="0 0 {w} {h}">'
    start = -90
    for p in parts:
        ang = p["value"] / total * 360
        large = 1 if ang > 180 else 0
        a1 = math.radians(start); a2 = math.radians(start + ang)
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        x2, y2 = cx + r * math.cos(a2), cy + r * math.sin(a2)
        s += f'<path d="M {x1:.1f} {y1:.1f} A {r} {r} 0 {large} 1 {x2:.1f} {y2:.1f}" fill="none" stroke="{p["color"]}" stroke-width="{sw}" stroke-linecap="butt"/>'
        start += ang
    s += t(cx, cy - 2, center, 17, INK, "middle", "700", family=NUM)
    return s + "</svg>"
