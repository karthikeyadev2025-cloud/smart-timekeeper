"""Builds the print-ready HTML for the A5 flyer and the A4 one-pager.

Both carry the same identity as the website — Bricolage Grotesque for display,
IBM Plex Mono for anything that is data — so a person who scans the QR lands on
a page that looks like the paper in their hand.

Page geometry: trim size + 3mm bleed on every edge. All content sits at least
8mm inside the trim so nothing important dies in the guillotine.
"""
import sys, pathlib
sys.path.insert(0, "/tmp/pgtest")
from assets import QR, LOGOS

BLEED = 3          # mm
SAFE = 8           # mm inside trim

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
         'family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800'
         '&family=IBM+Plex+Mono:wght@400;500;600'
         '&family=Instrument+Sans:wght@400;500;600&display=swap">')

# Slightly desaturated from the screen indigo (#4F46E5). Very saturated RGB
# blues shift badly when a press converts to CMYK; this holds its colour.
INK    = "#12141C"
INDIGO = "#4038C4"
GREEN  = "#0B7261"
AMBER  = "#B45309"
PAPER  = "#FFFFFF"
RULE   = "#E3E5EE"
MUTED  = "#5A5F73"

BASE_CSS = f"""
  @page {{ margin: 0; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: "Instrument Sans", system-ui, sans-serif;
    color: {INK}; background: {PAPER};
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }}
  .display {{ font-family: "Bricolage Grotesque", sans-serif; font-optical-sizing: auto; }}
  .data {{ font-family: "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; }}
  .page {{ position: relative; overflow: hidden; background: {PAPER}; }}
  .safe {{ position: absolute; inset: {BLEED + SAFE}mm; display: flex; flex-direction: column; }}
  .eyebrow {{ font-family: "IBM Plex Mono", monospace; text-transform: uppercase;
              letter-spacing: .18em; color: {MUTED}; }}
  .row {{ display: flex; align-items: center; gap: 3mm; padding: 2.2mm 0; border-top: .25mm solid {RULE}; }}
  .pill {{ border-radius: 999px; padding: .6mm 2mm; font-family: "IBM Plex Mono", monospace; }}
  .logo-chip {{ background: #fff; border: .25mm solid {RULE}; border-radius: 2mm;
                display: flex; align-items: center; justify-content: center; }}
  .logo-chip img {{ object-fit: contain; }}
"""


def register_rows(scale=1.0):
    """The product's real output — the same ledger the website leads with."""
    rows = [
        ("09:02", "Aarav Singh", "HQ · Hyderabad", "Verified", GREEN, "#E4F4F0"),
        ("09:14", "Lakshmi Rao", "Vijayawada", "Verified", GREEN, "#E4F4F0"),
        ("09:41", "Imran Q.", "Guntur", "Late 11m", AMBER, "#FBF0DF"),
    ]
    out = []
    for t, n, p, s, c, bg in rows:
        out.append(f"""
        <div class="row">
          <span class="data" style="font-size:{2.9*scale}mm;font-weight:500;">{t}</span>
          <span style="width:.25mm;height:{5*scale}mm;background:{RULE};"></span>
          <span style="flex:1;min-width:0;">
            <span style="display:block;font-size:{3.0*scale}mm;font-weight:600;">{n}</span>
            <span class="data" style="display:block;font-size:{2.3*scale}mm;color:{MUTED};">{p}</span>
          </span>
          <span class="pill" style="background:{bg};color:{c};font-size:{2.2*scale}mm;">{s}</span>
        </div>""")
    return "".join(out)


def client_strip(h_mm=11):
    boxes = [
        ("rithvika", f"height:{h_mm}mm;width:{h_mm}mm;"),
        ("geetham", f"height:{h_mm*0.62}mm;width:{h_mm*2.2}mm;"),
        ("nila", f"height:{h_mm}mm;width:{h_mm}mm;"),
        ("techspire", f"height:{h_mm*0.8}mm;width:{h_mm*1.45}mm;"),
    ]
    chips = "".join(
        f'<span class="logo-chip" style="height:{h_mm+6}mm;padding:0 3.5mm;">'
        f'<img src="data:image/webp;base64,{LOGOS[k]}" style="{st}"></span>'
        for k, st in boxes)
    return f'<div style="display:flex;gap:2.5mm;align-items:center;flex-wrap:wrap;">{chips}</div>'


# ── A5 FLYER ────────────────────────────────────────────────────────────────
# One job: make a shop owner stop, understand what it replaces, and scan.
def flyer():
    W, H = 148 + 2 * BLEED, 210 + 2 * BLEED
    return f"""<!doctype html><html><head><meta charset="utf-8">{FONTS}
<style>{BASE_CSS}
  .page {{ width:{W}mm; height:{H}mm; }}
  .band {{ position:absolute; left:0; right:0; top:0; height:{BLEED + 62}mm; background:{INDIGO}; }}
</style></head><body>
<div class="page">
  <div class="band"></div>
  <div class="safe">

    <div style="color:#fff;">
      <div class="eyebrow" style="color:#C9C6F5;font-size:2.4mm;">Punchly · attendance &amp; payroll</div>
      <h1 class="display" style="font-size:11.5mm;line-height:1.02;font-weight:800;margin-top:3mm;letter-spacing:-.03em;">
        Throw away the<br>fingerprint machine.
      </h1>
      <p style="font-size:3.5mm;line-height:1.45;margin-top:4mm;color:#DEDCFA;max-width:96mm;">
        Your staff already carry a phone. That is the only hardware you need.
      </p>
    </div>

    <div style="margin-top:{BLEED + 16}mm;">
      <div class="eyebrow" style="font-size:2.3mm;">What your register looks like now</div>
      <div style="margin-top:3mm;border:.3mm solid {RULE};border-radius:2.5mm;padding:0 4mm 2mm;">
        {register_rows(1.05)}
      </div>
      <p class="data" style="font-size:2.4mm;color:{MUTED};margin-top:2.5mm;">
        Every row carries GPS + a selfie. Nobody punches for a friend.
      </p>
    </div>

    <div style="margin-top:7mm;display:grid;grid-template-columns:1fr 1fr;gap:3.5mm 5mm;align-items:start;">
      {"".join(f'''<div style="display:flex;gap:2.5mm;align-items:flex-start;">
        <span style="color:{GREEN};font-size:3.4mm;line-height:1;font-weight:700;">✓</span>
        <span style="font-size:3.0mm;line-height:1.35;">{t}</span></div>'''
        for t in [
          "<b>Salary adds itself up</b> — payslip PDF monthly",
          "<b>Every branch on one map</b>, live",
          "<b>Schools:</b> mark a whole class at once",
          "<b>No signal?</b> The punch still counts",
        ])}
    </div>

    <div style="margin-top:6mm;">
      <div class="eyebrow" style="font-size:2.2mm;margin-bottom:2.5mm;">Already running on</div>
      {client_strip(8)}
    </div>

    <div style="margin-top:5mm;display:flex;align-items:center;gap:5mm;
                border-top:.3mm solid {RULE};padding-top:4mm;">
      <div style="width:26mm;height:26mm;flex:none;">{QR}</div>
      <div>
        <div class="display" style="font-size:5.2mm;font-weight:700;line-height:1.1;">
          Scan and try a real check-in
        </div>
        <div style="font-size:2.9mm;color:{MUTED};margin-top:1.5mm;line-height:1.4;">
          Takes six seconds. No signup, no card.<br>
          <span class="data" style="color:{INDIGO};font-weight:500;">punchly.online</span>
        </div>
        <div class="data" style="font-size:2.5mm;margin-top:2mm;">
          7-day free trial · ☎ <b>__________</b>
        </div>
      </div>
    </div>

    <div style="margin-top:4mm;font-size:2.2mm;color:{MUTED};text-align:center;">
      An innovation by <b>Nikki Technologies</b> · nikkitechnologies.com
    </div>

  </div>
</div></body></html>"""


# ── A4 ONE-PAGER ────────────────────────────────────────────────────────────
# For the meeting: the principal, the hospital administrator, the owner.
def onepager():
    W, H = 210 + 2 * BLEED, 297 + 2 * BLEED
    def block(title, body):
        return f"""<div style="break-inside:avoid;">
          <div class="display" style="font-size:4.4mm;font-weight:700;">{title}</div>
          <p style="font-size:3.1mm;line-height:1.45;color:{MUTED};margin-top:1.5mm;">{body}</p>
        </div>"""
    return f"""<!doctype html><html><head><meta charset="utf-8">{FONTS}
<style>{BASE_CSS}
  .page {{ width:{W}mm; height:{H}mm; }}
</style></head><body>
<div class="page"><div class="safe">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;
              border-bottom:.4mm solid {INK};padding-bottom:4mm;">
    <div>
      <div class="display" style="font-size:8mm;font-weight:800;letter-spacing:-.02em;">Punchly</div>
      <div class="eyebrow" style="font-size:2.4mm;margin-top:1mm;">Attendance · Payroll · Leave</div>
    </div>
    <div style="text-align:right;font-size:2.8mm;color:{MUTED};line-height:1.5;">
      <span class="data" style="color:{INDIGO};font-weight:500;">punchly.online</span><br>
      Hyderabad · serving AP &amp; Telangana
    </div>
  </div>

  <h1 class="display" style="font-size:12mm;line-height:1.03;font-weight:800;
             letter-spacing:-.03em;margin-top:9mm;max-width:150mm;">
    Your attendance register,<br>without the paperwork.
  </h1>
  <p style="font-size:3.9mm;line-height:1.5;color:{MUTED};margin-top:4mm;max-width:140mm;">
    Staff punch in on the phone they already own. GPS confirms they are actually at the branch,
    a selfie proves it is them, and the month's salary is calculated from the attendance already
    on record. No fingerprint machine to buy, wire, or repair.
  </p>

  <div style="display:grid;grid-template-columns:1.15fr .85fr;gap:10mm;margin-top:10mm;">
    <div>
      <div class="eyebrow" style="font-size:2.4mm;">A working morning</div>
      <div style="margin-top:3mm;border:.3mm solid {RULE};border-radius:2.5mm;padding:0 4mm 2mm;">
        {register_rows(1.15)}
      </div>
      <p class="data" style="font-size:2.6mm;color:{MUTED};margin-top:2.5mm;">
        Punches outside the branch geofence are flagged automatically.
      </p>

      <div style="margin-top:9mm;display:flex;flex-direction:column;gap:5mm;">
        {block("Payroll that adds itself up",
               "Overtime, paid leave and late deductions are already counted. The payslip PDF is ready at month end — nothing to key in.")}
        {block("Every branch on one live map",
               "See who is in, and where, across every branch and campus. Field staff punch from the road with distance and accuracy logged.")}
      </div>
    </div>

    <div>
      <div class="eyebrow" style="font-size:2.4mm;">Built for</div>
      <div style="margin-top:3mm;display:flex;flex-direction:column;gap:3.5mm;">
        {"".join(f'''<div style="border-left:.8mm solid {INDIGO};padding-left:3.5mm;">
            <div class="display" style="font-size:3.7mm;font-weight:700;">{h}</div>
            <div style="font-size:2.9mm;color:{MUTED};line-height:1.4;margin-top:.8mm;">{b}</div>
          </div>'''
          for h, b in [
            ("Hospitals &amp; clinics", "Night shifts, rotating rosters, multiple branches — all on one roll."),
            ("Schools &amp; colleges", "Teachers mark a whole class in one tap. Absent students' parents get a WhatsApp. Students need no phone."),
            ("Retail &amp; showrooms", "Shift timings, late deductions and salary, settled from the same record."),
            ("Field &amp; delivery teams", "Punch from anywhere; the distance from base is logged with it."),
          ])}
      </div>

      <div style="margin-top:8mm;border:.3mm solid {RULE};border-radius:2.5mm;padding:4mm;">
        <div class="eyebrow" style="font-size:2.2mm;">Also included</div>
        <div style="margin-top:2.5mm;display:flex;flex-direction:column;gap:1.8mm;">
          {"".join(f'<div style="font-size:2.9mm;display:flex;gap:2mm;"><span style="color:{GREEN};font-weight:700;">✓</span>{t}</div>'
            for t in ["Staff ID cards with photo &amp; QR",
                      "Leave requests and approvals",
                      "Works offline, syncs when signal returns",
                      "Mock-GPS detection",
                      "Data stays in India"])}
        </div>
      </div>
    </div>
  </div>

  <div style="margin-top:auto;">
    <div class="eyebrow" style="font-size:2.3mm;margin-bottom:3mm;">Already running on</div>
    {client_strip(10)}
  </div>

  <div style="margin-top:7mm;border-top:.4mm solid {INK};padding-top:5mm;
              display:flex;align-items:center;gap:7mm;">
    <div style="width:30mm;height:30mm;flex:none;">{QR}</div>
    <div style="flex:1;">
      <div class="display" style="font-size:6mm;font-weight:800;line-height:1.1;">
        Try a real check-in before you decide
      </div>
      <div style="font-size:3.1mm;color:{MUTED};margin-top:2mm;line-height:1.45;">
        Scan the code and punch in yourself — it takes six seconds, and needs no signup.<br>
        7-day free trial. No card required to start.
      </div>
    </div>
    <div style="text-align:right;font-size:3mm;line-height:1.6;">
      <div class="eyebrow" style="font-size:2.2mm;">Talk to us</div>
      <div class="data" style="font-size:3.4mm;font-weight:600;margin-top:1mm;">☎ ______________</div>
      <div class="data" style="font-size:2.9mm;color:{MUTED};">✉ ______________</div>
    </div>
  </div>

  <div style="margin-top:4mm;font-size:2.3mm;color:{MUTED};">
    An innovation by Nikki Technologies · nikkitechnologies.com · Powered by K² Adexos Global Technologies
  </div>

</div></div></body></html>"""


pathlib.Path("/tmp/pgtest/flyer.html").write_text(flyer())
pathlib.Path("/tmp/pgtest/onepager.html").write_text(onepager())
print("flyer.html + onepager.html written")
