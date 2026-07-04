/**
 * Staff ID Card — front + back, standard credit-card ratio (85.6 × 53.98 mm).
 * Rendered as inline HTML/CSS so html2canvas can capture it faithfully.
 *
 * Front: tenant logo + name, staff photo, name, EMP ID, designation, branch,
 * QR code linking to a verify URL, accent stripe.
 * Back: address, phone, emergency contact, blood group, DoB, ID proof (masked),
 * a signature line, and small print.
 *
 * The card is deliberately sized in "px per mm" so that when captured at 4x
 * scale (html2canvas option), the output PNG is ~1024×645 — sharp enough for
 * both screen viewing and print.
 */

import { QRCodeCanvas } from "qrcode.react";

// 85.6 × 53.98 mm at 4 px/mm = 342 × 216 px in the DOM. Renders at 4x scale
// when downloaded, so exported PNGs come out at ~1370×864 (print-friendly).
const CARD_W = 342;
const CARD_H = 216;

export type StaffForCard = {
  id: string;
  staff_id?: string | null;
  full_name?: string | null;
  designation?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  date_of_joining?: string | null;
  blood_group?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  id_proof_type?: string | null;
  id_proof_number?: string | null;
  address?: string | null;
  branch_name?: string | null;
  signature_url?: string | null;
};

export type TenantForCard = {
  id: string;
  name: string;
  logo_url?: string | null;
  id_card_accent?: string | null;
  id_card_template?: "corporate" | "modern" | "compact" | "minimal" | "bold" | "formal" | "badge" | null;
  authority_signature_url?: string | null;
};

function initials(name?: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

function maskId(v?: string | null): string {
  if (!v) return "—";
  const s = String(v);
  if (s.length <= 4) return s;
  return "•••• " + s.slice(-4);
}

export type IdCardTemplate = "corporate" | "modern" | "compact" | "minimal" | "bold" | "formal" | "badge";

/* ─────────────── DISPATCHERS ───────────────
 * These are what consumers use. They pick the right front/back rendering
 * based on tenant.id_card_template (falls back to 'corporate' if unset). */
export function IdCardFront(props: {
  staff: StaffForCard;
  tenant: TenantForCard;
  verifyUrl: string;
  className?: string;
}) {
  const t = (props.tenant.id_card_template as IdCardTemplate) || "corporate";
  if (t === "modern") return <ModernFront {...props} />;
  if (t === "compact") return <CompactFront {...props} />;
  if (t === "minimal") return <MinimalFront {...props} />;
  if (t === "bold") return <BoldFront {...props} />;
  if (t === "formal") return <FormalFront {...props} />;
  if (t === "badge") return <BadgeFront {...props} />;
  return <CorporateFront {...props} />;
}

export function IdCardBack(props: {
  staff: StaffForCard;
  tenant: TenantForCard;
  className?: string;
}) {
  const t = (props.tenant.id_card_template as IdCardTemplate) || "corporate";
  if (t === "modern") return <ModernBack {...props} />;
  if (t === "compact") return <CompactBack {...props} />;
  if (t === "minimal") return <MinimalBack {...props} />;
  if (t === "bold") return <BoldBack {...props} />;
  if (t === "formal") return <FormalBack {...props} />;
  if (t === "badge") return <BadgeBack {...props} />;
  return <CorporateBack {...props} />;
}

/* ─────────────── CORPORATE (default, was the original design) ─────────────── */
function CorporateFront({ staff, tenant, verifyUrl, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  verifyUrl: string;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";

  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Accent header strip with tenant logo + name */}
      <div style={{
        background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`,
        color: "#ffffff",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        {tenant.logo_url ? (
          <img
            src={tenant.logo_url}
            alt=""
            crossOrigin="anonymous"
            style={{ height: 26, width: 26, borderRadius: 5, background: "#ffffff", padding: 2, objectFit: "contain" }}
          />
        ) : (
          <div style={{
            height: 26, width: 26, borderRadius: 5, background: "rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700
          }}>
            {initials(tenant.name)}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.1 }}>
            {tenant.name}
          </div>
          <div style={{ fontSize: 8, opacity: 0.85, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 2 }}>
            Employee ID Card
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", padding: "8px 14px", gap: 12, flex: 1, minHeight: 0 }}>
        {/* Photo */}
        <div style={{
          width: 70, height: 84,
          borderRadius: 6,
          background: "#F1F5F9",
          border: `2px solid ${accent}`,
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {staff.avatar_url ? (
            <img src={staff.avatar_url} alt="" crossOrigin="anonymous"
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ fontSize: 30, fontWeight: 700, color: accent }}>
              {initials(staff.full_name)}
            </div>
          )}
        </div>

        {/* Text block */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1, wordBreak: "break-word" }}>
            {staff.full_name || "—"}
          </div>
          {staff.designation && (
            <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.2 }}>
              {staff.designation}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
            <span style={{
              fontSize: 8, letterSpacing: 1, textTransform: "uppercase",
              background: accent, color: "#ffffff", padding: "2px 6px", borderRadius: 3, fontWeight: 700
            }}>
              {staff.staff_id || "EMP —"}
            </span>
          </div>
          {staff.branch_name && (
            <div style={{ fontSize: 9, color: "#64748B", marginTop: 3 }}>
              📍 {staff.branch_name}
            </div>
          )}
          {staff.phone && (
            <div style={{ fontSize: 9, color: "#64748B" }}>
              📞 {staff.phone}
            </div>
          )}
        </div>
      </div>

      {/* Bottom strip: QR + valid-through */}
      <div style={{
        borderTop: "1px solid #E2E8F0",
        padding: "6px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#F8FAFC",
      }}>
        <div style={{ fontSize: 8, color: "#64748B" }}>
          <div style={{ letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Joined</div>
          <div style={{ color: "#0F172A", fontWeight: 600, marginTop: 1 }}>{fmtDate(staff.date_of_joining)}</div>
        </div>
        <div style={{ background: "#ffffff", padding: 4, borderRadius: 4, border: "1px solid #E2E8F0" }}>
          <QRCodeCanvas value={verifyUrl} size={56} level="H" includeMargin={false} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────── CORPORATE BACK ─────────────── */
function CorporateBack({ staff, tenant, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";

  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        position: "relative",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Header stripe */}
      <div style={{ height: 4, background: accent }} />

      <div style={{ padding: "10px 14px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "#64748B", fontWeight: 700 }}>
          Personal Details
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontSize: 9 }}>
          <BackRow label="DOB" value={fmtDate(staff.date_of_birth)} />
          <BackRow label="Blood group" value={staff.blood_group || "—"} accent={accent} bold={!!staff.blood_group} />
          <BackRow label="Emergency" value={staff.emergency_contact_phone || "—"} />
          <BackRow label="Contact name" value={staff.emergency_contact_name || "—"} />
          {staff.id_proof_type && (
            <BackRow label={staff.id_proof_type.toUpperCase()} value={maskId(staff.id_proof_number)} span={2} />
          )}
          {staff.address && (
            <BackRow label="Address" value={staff.address} span={2} />
          )}
        </div>

        {/* Signature area */}
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 24, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid #94A3B8" }}>
              {staff.signature_url && (
                <img src={staff.signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 22, maxWidth: "90%", objectFit: "contain" }} />
              )}
            </div>
            <div style={{ fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
              Employee signature
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 24, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid #94A3B8" }}>
              {tenant.authority_signature_url && (
                <img src={tenant.authority_signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 22, maxWidth: "90%", objectFit: "contain" }} />
              )}
            </div>
            <div style={{ fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
              Issuing authority
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: "#F8FAFC",
        borderTop: "1px solid #E2E8F0",
        padding: "5px 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: 7, color: "#64748B",
      }}>
        <span>If found, please return to {tenant.name}.</span>
        <span style={{ fontWeight: 600 }}>{staff.staff_id || ""}</span>
      </div>
    </div>
  );
}

function BackRow({ label, value, span, accent, bold }: {
  label: string; value: string; span?: number; accent?: string; bold?: boolean;
}) {
  return (
    <div style={{ gridColumn: span === 2 ? "1 / -1" : undefined }}>
      <div style={{ fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: "#94A3B8", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{
        fontSize: 10,
        fontWeight: bold ? 700 : 500,
        color: bold ? accent : "#0F172A",
        wordBreak: "break-word",
        lineHeight: 1.2,
        marginTop: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

/* ─────────────── MODERN ───────────────
 * A dark hero band takes the top third with the tenant name and a large
 * headline treatment. The photo is a big circle overlapping the band. Below
 * is a single-column, generous-whitespace layout. Feels newer and more
 * design-forward than the classic corporate look.
 */
function ModernFront({ staff, tenant, verifyUrl, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  verifyUrl: string;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";

  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Hero band — fixed height so the layout budget below is exact and
          the QR footer can never get pushed off the card. */}
      <div style={{
        height: 58,
        flexShrink: 0,
        background: `linear-gradient(135deg, #0F172A 0%, ${accent} 130%)`,
        color: "#ffffff",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        {tenant.logo_url ? (
          <img src={tenant.logo_url} alt="" crossOrigin="anonymous"
            style={{ height: 20, width: 20, borderRadius: 4, background: "#ffffff", padding: 2, objectFit: "contain", flexShrink: 0 }} />
        ) : null}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {tenant.name}
          </div>
          <div style={{ fontSize: 7, opacity: 0.75, letterSpacing: 2, textTransform: "uppercase", marginTop: 1 }}>
            Staff Identity Card
          </div>
        </div>
      </div>

      {/* Photo — overlaps the bottom of the band by a modest, budgeted
          amount (18px) so the body below never needs more than ~46px of
          top padding to clear it. */}
      <div style={{ position: "absolute", top: 40, left: 14 }}>
        <div style={{
          width: 64, height: 64,
          borderRadius: "50%",
          background: "#F1F5F9",
          border: `3px solid #ffffff`,
          boxShadow: "0 2px 8px rgba(15,23,42,0.2)",
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {staff.avatar_url ? (
            <img src={staff.avatar_url} alt="" crossOrigin="anonymous"
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>
              {initials(staff.full_name)}
            </div>
          )}
        </div>
      </div>

      {/* Body — flex:1 + minHeight:0 so it always occupies exactly the
          remaining space between the fixed-height band and footer, never
          forcing the card taller than CARD_H. */}
      <div style={{
        padding: "8px 14px 6px 88px",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 2,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {staff.full_name || "—"}
        </div>
        {staff.designation && (
          <div style={{ fontSize: 9, color: "#64748B", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {staff.designation}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
          <div style={{ height: 2, width: 12, background: accent, borderRadius: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: accent, letterSpacing: 0.3 }}>
            {staff.staff_id || "EMP —"}
          </span>
          {staff.branch_name && (
            <span style={{ fontSize: 8, color: "#94A3B8" }}>
              · {staff.branch_name}
            </span>
          )}
        </div>
      </div>

      {/* Footer — fixed height, guaranteed visible (never depends on
          shrinking body content). */}
      <div style={{
        height: 54,
        flexShrink: 0,
        padding: "0 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#F8FAFC", borderTop: "1px solid #E2E8F0",
      }}>
        {staff.phone ? (
          <div style={{ fontSize: 8, color: "#64748B", minWidth: 0 }}>
            <span style={{ letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Contact</span>
            <div style={{ color: "#0F172A", fontWeight: 600, marginTop: 1 }}>{staff.phone}</div>
          </div>
        ) : <span />}
        <div style={{ background: "#ffffff", padding: 3, borderRadius: 4, border: "1px solid #E2E8F0", flexShrink: 0 }}>
          <QRCodeCanvas value={verifyUrl} size={44} level="H" includeMargin={false} />
        </div>
      </div>
    </div>
  );
}

function ModernBack({ staff, tenant, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";
  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ background: "#0F172A", color: "#ffffff", padding: "8px 16px" }}>
        <div style={{ fontSize: 8, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7, fontWeight: 600 }}>
          Employee Details
        </div>
      </div>

      <div style={{ padding: "10px 16px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 9 }}>
          <BackRow label="Date of birth" value={fmtDate(staff.date_of_birth)} />
          <BackRow label="Blood group" value={staff.blood_group || "—"} accent={accent} bold={!!staff.blood_group} />
          <BackRow label="Emergency contact" value={staff.emergency_contact_name || "—"} />
          <BackRow label="Emergency phone" value={staff.emergency_contact_phone || "—"} />
          {staff.id_proof_type && (
            <BackRow label={staff.id_proof_type.toUpperCase()} value={maskId(staff.id_proof_number)} span={2} />
          )}
          {staff.address && (
            <BackRow label="Address" value={staff.address} span={2} />
          )}
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 20, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: `2px solid ${accent}` }}>
              {staff.signature_url && (
                <img src={staff.signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 18, maxWidth: "90%", objectFit: "contain" }} />
              )}
            </div>
            <div style={{ fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
              Signature
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 20, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: `2px solid ${accent}` }}>
              {tenant.authority_signature_url && (
                <img src={tenant.authority_signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 18, maxWidth: "90%", objectFit: "contain" }} />
              )}
            </div>
            <div style={{ fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
              Authority
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: "#0F172A", color: "#ffffff",
        padding: "5px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        fontSize: 7, opacity: 0.85,
      }}>
        <span>Property of {tenant.name}</span>
        <span style={{ fontWeight: 600 }}>{staff.staff_id || ""}</span>
      </div>
    </div>
  );
}

/* ─────────────── COMPACT ───────────────
 * Dense landscape layout with a thin colored bar on the left. Everything
 * fits in a smaller visual footprint. Best when the card is worn on a
 * lanyard where users look at it at a glance.
 */
function CompactFront({ staff, tenant, verifyUrl, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  verifyUrl: string;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";

  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        display: "flex",
        position: "relative",
      }}
    >
      {/* Left accent bar with tenant */}
      <div style={{
        width: 40,
        background: accent,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: "12px 0",
        color: "#ffffff",
      }}>
        {tenant.logo_url ? (
          <img src={tenant.logo_url} alt="" crossOrigin="anonymous"
            style={{ height: 26, width: 26, borderRadius: 4, background: "#ffffff", padding: 2, objectFit: "contain" }} />
        ) : (
          <div style={{
            height: 26, width: 26, borderRadius: 4, background: "rgba(255,255,255,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700
          }}>
            {initials(tenant.name)}
          </div>
        )}
        {/* Vertical text — kept short so it reliably fits the bar's height
            alongside the logo and QR without any risk of clipping. */}
        <div style={{
          fontSize: 7, letterSpacing: 1, fontWeight: 700, textTransform: "uppercase",
          writingMode: "vertical-rl", transform: "rotate(180deg)",
        }}>
          Staff ID
        </div>
        <div style={{ background: "#ffffff", padding: 3, borderRadius: 3 }}>
          <QRCodeCanvas value={verifyUrl} size={40} level="H" includeMargin={false} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "10px 12px", display: "flex", gap: 10 }}>
        {/* Photo */}
        <div style={{
          width: 70, height: 90,
          borderRadius: 4,
          background: "#F1F5F9",
          border: `1.5px solid #E2E8F0`,
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {staff.avatar_url ? (
            <img src={staff.avatar_url} alt="" crossOrigin="anonymous"
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ fontSize: 26, fontWeight: 700, color: accent }}>
              {initials(staff.full_name)}
            </div>
          )}
        </div>

        {/* Details */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontSize: 7, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, color: accent }}>
            {tenant.name}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.05, marginTop: 2 }}>
            {staff.full_name || "—"}
          </div>
          {staff.designation && (
            <div style={{ fontSize: 9, color: "#475569", lineHeight: 1.2 }}>
              {staff.designation}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginTop: 4, fontSize: 7 }}>
            <div>
              <div style={{ color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>ID</div>
              <div style={{ fontWeight: 700, fontSize: 9, marginTop: 1 }}>{staff.staff_id || "—"}</div>
            </div>
            {staff.blood_group && (
              <div>
                <div style={{ color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Blood</div>
                <div style={{ fontWeight: 700, fontSize: 9, marginTop: 1, color: accent }}>{staff.blood_group}</div>
              </div>
            )}
            {staff.date_of_joining && (
              <div>
                <div style={{ color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Joined</div>
                <div style={{ fontWeight: 600, fontSize: 8, marginTop: 1 }}>{fmtDate(staff.date_of_joining)}</div>
              </div>
            )}
            {staff.branch_name && (
              <div>
                <div style={{ color: "#94A3B8", letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Branch</div>
                <div style={{ fontWeight: 600, fontSize: 8, marginTop: 1 }}>{staff.branch_name}</div>
              </div>
            )}
          </div>

          {staff.phone && (
            <div style={{ fontSize: 8, color: "#64748B", marginTop: "auto", fontWeight: 500 }}>
              📞 {staff.phone}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactBack({ staff, tenant, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";
  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        display: "flex",
      }}
    >
      <div style={{ width: 6, background: accent }} />

      <div style={{ flex: 1, minHeight: 0, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "#64748B", fontWeight: 700 }}>
          If found, return to
        </div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{tenant.name}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontSize: 9, marginTop: 4 }}>
          <BackRow label="DOB" value={fmtDate(staff.date_of_birth)} />
          <BackRow label="Blood" value={staff.blood_group || "—"} accent={accent} bold={!!staff.blood_group} />
          <BackRow label="Emergency" value={staff.emergency_contact_phone || "—"} span={2} />
          {staff.id_proof_type && (
            <BackRow label={staff.id_proof_type.toUpperCase()} value={maskId(staff.id_proof_number)} span={2} />
          )}
        </div>

        <div style={{
          marginTop: "auto",
          borderTop: "1px dashed #CBD5E1",
          paddingTop: 4,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontSize: 7, color: "#94A3B8",
        }}>
          <span>Not transferable · Punchly</span>
          <span style={{ fontWeight: 600 }}>{staff.staff_id || ""}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── MINIMAL ───────────────
 * Plain white card, thin colored underline instead of a full-color header.
 * Understated, works well for consulting/professional-services brands that
 * don't want a loud design.
 */
function MinimalFront({ staff, tenant, verifyUrl, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  verifyUrl: string;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";

  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header — fixed height, plain white with a thin accent underline */}
      <div style={{ height: 42, flexShrink: 0, padding: "8px 14px 0", display: "flex", alignItems: "center", gap: 8 }}>
        {tenant.logo_url ? (
          <img src={tenant.logo_url} alt="" crossOrigin="anonymous"
            style={{ height: 22, width: 22, borderRadius: 4, objectFit: "contain", flexShrink: 0 }} />
        ) : (
          <div style={{ height: 22, width: 22, borderRadius: 4, background: `${accent}1a`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: accent, flexShrink: 0 }}>
            {initials(tenant.name)}
          </div>
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {tenant.name}
          </div>
          <div style={{ fontSize: 7, color: "#94A3B8", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 1 }}>
            Employee ID
          </div>
        </div>
      </div>
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />

      {/* Body */}
      <div style={{ display: "flex", padding: "10px 14px", gap: 12, flex: 1, minHeight: 0 }}>
        <div style={{
          width: 64, height: 78,
          borderRadius: 4,
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {staff.avatar_url ? (
            <img src={staff.avatar_url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>{initials(staff.full_name)}</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {staff.full_name || "—"}
          </div>
          {staff.designation && (
            <div style={{ fontSize: 9, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {staff.designation}
            </div>
          )}
          <div style={{ fontSize: 9, fontWeight: 700, color: accent, marginTop: 3 }}>
            {staff.staff_id || "EMP —"}
          </div>
          {staff.branch_name && (
            <div style={{ fontSize: 8, color: "#94A3B8", marginTop: 2 }}>{staff.branch_name}</div>
          )}
        </div>
      </div>

      {/* Footer — fixed height */}
      <div style={{
        height: 52, flexShrink: 0,
        borderTop: "1px solid #F1F5F9",
        padding: "0 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 8, color: "#94A3B8" }}>
          {staff.phone ?? ""}
        </div>
        <div style={{ padding: 3, border: "1px solid #E2E8F0", borderRadius: 4 }}>
          <QRCodeCanvas value={verifyUrl} size={40} level="H" includeMargin={false} />
        </div>
      </div>
    </div>
  );
}

function MinimalBack({ staff, tenant, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";
  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />
      <div style={{ padding: "10px 14px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "#94A3B8", fontWeight: 700 }}>
          Details
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontSize: 9 }}>
          <BackRow label="DOB" value={fmtDate(staff.date_of_birth)} />
          <BackRow label="Blood group" value={staff.blood_group || "—"} accent={accent} bold={!!staff.blood_group} />
          <BackRow label="Emergency" value={staff.emergency_contact_phone || "—"} />
          <BackRow label="Contact name" value={staff.emergency_contact_name || "—"} />
          {staff.id_proof_type && (
            <BackRow label={staff.id_proof_type.toUpperCase()} value={maskId(staff.id_proof_number)} span={2} />
          )}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 22, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid #E2E8F0" }}>
              {staff.signature_url && <img src={staff.signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 20, maxWidth: "90%", objectFit: "contain" }} />}
            </div>
            <div style={{ fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Signature</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 22, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid #E2E8F0" }}>
              {tenant.authority_signature_url && <img src={tenant.authority_signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 20, maxWidth: "90%", objectFit: "contain" }} />}
            </div>
            <div style={{ fontSize: 7, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Authority</div>
          </div>
        </div>
      </div>
      <div style={{ height: 28, flexShrink: 0, borderTop: "1px solid #F1F5F9", padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 7, color: "#94A3B8" }}>
        <span>{tenant.name}</span>
        <span style={{ fontWeight: 600 }}>{staff.staff_id || ""}</span>
      </div>
    </div>
  );
}

/* ─────────────── BOLD ───────────────
 * Full accent-color background on the front. High visual impact, best for
 * retail/hospitality brands wanting the badge to pop from across a room.
 * Back reverts to white for readability of the fine print.
 */
function BoldFront({ staff, tenant, verifyUrl, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  verifyUrl: string;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";

  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: accent,
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ height: 40, flexShrink: 0, padding: "8px 14px 0", display: "flex", alignItems: "center", gap: 8 }}>
        {tenant.logo_url ? (
          <img src={tenant.logo_url} alt="" crossOrigin="anonymous"
            style={{ height: 20, width: 20, borderRadius: 4, background: "#ffffff", padding: 2, objectFit: "contain", flexShrink: 0 }} />
        ) : null}
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, opacity: 0.95, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {tenant.name}
        </span>
      </div>

      {/* Body */}
      <div style={{ display: "flex", alignItems: "center", padding: "6px 14px", gap: 12, flex: 1, minHeight: 0 }}>
        <div style={{
          width: 68, height: 68,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.15)",
          border: "3px solid rgba(255,255,255,0.85)",
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {staff.avatar_url ? (
            <img src={staff.avatar_url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ fontSize: 24, fontWeight: 700, color: "#ffffff" }}>{initials(staff.full_name)}</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {staff.full_name || "—"}
          </div>
          {staff.designation && (
            <div style={{ fontSize: 9, opacity: 0.85, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {staff.designation}
            </div>
          )}
          <div style={{ marginTop: 5, display: "inline-block", background: "#ffffff", color: accent, fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 3, letterSpacing: 0.3 }}>
            {staff.staff_id || "EMP —"}
          </div>
          {staff.branch_name && (
            <div style={{ fontSize: 8, opacity: 0.8, marginTop: 4 }}>📍 {staff.branch_name}</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        height: 52, flexShrink: 0,
        padding: "0 14px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(0,0,0,0.12)",
      }}>
        <span style={{ fontSize: 8, opacity: 0.9 }}>{staff.phone ?? ""}</span>
        <div style={{ background: "#ffffff", padding: 3, borderRadius: 4 }}>
          <QRCodeCanvas value={verifyUrl} size={40} level="H" includeMargin={false} />
        </div>
      </div>
    </div>
  );
}

function BoldBack({ staff, tenant, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";
  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ height: 6, background: accent, flexShrink: 0 }} />
      <div style={{ padding: "10px 14px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: accent, fontWeight: 700 }}>
          Employee Details
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontSize: 9 }}>
          <BackRow label="DOB" value={fmtDate(staff.date_of_birth)} />
          <BackRow label="Blood group" value={staff.blood_group || "—"} accent={accent} bold={!!staff.blood_group} />
          <BackRow label="Emergency" value={staff.emergency_contact_phone || "—"} />
          <BackRow label="Contact name" value={staff.emergency_contact_name || "—"} />
          {staff.id_proof_type && (
            <BackRow label={staff.id_proof_type.toUpperCase()} value={maskId(staff.id_proof_number)} span={2} />
          )}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 22, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: `2px solid ${accent}` }}>
              {staff.signature_url && <img src={staff.signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 20, maxWidth: "90%", objectFit: "contain" }} />}
            </div>
            <div style={{ fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Signature</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 22, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: `2px solid ${accent}` }}>
              {tenant.authority_signature_url && <img src={tenant.authority_signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 20, maxWidth: "90%", objectFit: "contain" }} />}
            </div>
            <div style={{ fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>Authority</div>
          </div>
        </div>
      </div>
      <div style={{ height: 26, flexShrink: 0, background: accent, color: "#ffffff", padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 7 }}>
        <span>Property of {tenant.name}</span>
        <span style={{ fontWeight: 600 }}>{staff.staff_id || ""}</span>
      </div>
    </div>
  );
}

/* ─────────────── FORMAL ───────────────
 * Symmetric, centered layout with a double-border frame and cream
 * background. Reads as an "official" institutional ID — a good fit for
 * schools, colleges, and organizations that want a formal, government-ID
 * feel rather than a modern startup look.
 */
function FormalFront({ staff, tenant, verifyUrl, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  verifyUrl: string;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";

  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#FDFBF7",
        borderRadius: 8,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#1C1917",
        display: "flex",
        flexDirection: "column",
        border: `2px solid ${accent}`,
      }}
    >
      <div style={{ margin: 5, flex: 1, minHeight: 0, border: `1px solid ${accent}88`, borderRadius: 4, display: "flex", flexDirection: "column", padding: "8px 12px" }}>
        {/* Centered header */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt="" crossOrigin="anonymous"
              style={{ height: 24, width: 24, objectFit: "contain", margin: "0 auto" }} />
          ) : (
            <div style={{ height: 24, width: 24, borderRadius: "50%", background: `${accent}1a`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: accent, margin: "0 auto" }}>
              {initials(tenant.name)}
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tenant.name}
          </div>
          <div style={{ fontSize: 7, color: "#78716C", letterSpacing: 2, textTransform: "uppercase", marginTop: 1 }}>
            Identity Card
          </div>
        </div>

        {/* Centered photo + details */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
          <div style={{
            width: 52, height: 62,
            borderRadius: 3,
            background: "#F5F0E8",
            border: `1.5px solid ${accent}`,
            overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {staff.avatar_url ? (
              <img src={staff.avatar_url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ fontSize: 18, fontWeight: 700, color: accent }}>{initials(staff.full_name)}</div>
            )}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 3, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {staff.full_name || "—"}
          </div>
          {staff.designation && (
            <div style={{ fontSize: 8, color: "#78716C", textAlign: "center" }}>{staff.designation}</div>
          )}
          <div style={{ fontSize: 8, fontWeight: 700, color: accent, letterSpacing: 0.5, marginTop: 1 }}>
            {staff.staff_id || "EMP —"}
          </div>
        </div>

        {/* Footer row */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid ${accent}55`, paddingTop: 4 }}>
          <span style={{ fontSize: 7, color: "#78716C" }}>{staff.branch_name ?? staff.phone ?? ""}</span>
          <QRCodeCanvas value={verifyUrl} size={34} level="H" includeMargin={false} />
        </div>
      </div>
    </div>
  );
}

function FormalBack({ staff, tenant, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";
  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#FDFBF7",
        borderRadius: 8,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#1C1917",
        display: "flex",
        border: `2px solid ${accent}`,
      }}
    >
      <div style={{ margin: 5, flex: 1, minHeight: 0, border: `1px solid ${accent}88`, borderRadius: 4, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: accent, fontWeight: 700, textAlign: "center" }}>
          Particulars
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 10px", fontSize: 9 }}>
          <BackRow label="DOB" value={fmtDate(staff.date_of_birth)} />
          <BackRow label="Blood group" value={staff.blood_group || "—"} accent={accent} bold={!!staff.blood_group} />
          <BackRow label="Emergency" value={staff.emergency_contact_phone || "—"} span={2} />
          {staff.id_proof_type && (
            <BackRow label={staff.id_proof_type.toUpperCase()} value={maskId(staff.id_proof_number)} span={2} />
          )}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 20, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid #78716C" }}>
              {staff.signature_url && <img src={staff.signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 18, maxWidth: "90%", objectFit: "contain" }} />}
            </div>
            <div style={{ fontSize: 7, color: "#78716C", textTransform: "uppercase", letterSpacing: 1, marginTop: 2, textAlign: "center" }}>Signatory</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 20, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid #78716C" }}>
              {tenant.authority_signature_url && <img src={tenant.authority_signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 18, maxWidth: "90%", objectFit: "contain" }} />}
            </div>
            <div style={{ fontSize: 7, color: "#78716C", textTransform: "uppercase", letterSpacing: 1, marginTop: 2, textAlign: "center" }}>Authority</div>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 7, color: "#A8A29E", borderTop: `1px solid ${accent}55`, paddingTop: 4 }}>
          {tenant.name} · {staff.staff_id || ""}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── BADGE ───────────────
 * Symmetric conference-badge style: photo centered at top, name centered
 * below, everything stacked and centered rather than left-aligned. Good
 * for events, field teams, or any use case where the card is viewed
 * head-on rather than read left-to-right.
 */
function BadgeFront({ staff, tenant, verifyUrl, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  verifyUrl: string;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";

  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Top color band */}
      <div style={{ width: "100%", height: 34, flexShrink: 0, background: accent, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        {tenant.logo_url ? (
          <img src={tenant.logo_url} alt="" crossOrigin="anonymous"
            style={{ height: 16, width: 16, borderRadius: 3, background: "#ffffff", padding: 1, objectFit: "contain", flexShrink: 0 }} />
        ) : null}
        <span style={{ fontSize: 10, fontWeight: 700, color: "#ffffff", letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
          {tenant.name}
        </span>
      </div>

      {/* Centered photo, overlapping the band bottom by a small, budgeted amount */}
      <div style={{ marginTop: -22, flexShrink: 0 }}>
        <div style={{
          width: 60, height: 60,
          borderRadius: "50%",
          background: "#F1F5F9",
          border: "3px solid #ffffff",
          boxShadow: "0 2px 6px rgba(15,23,42,0.25)",
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {staff.avatar_url ? (
            <img src={staff.avatar_url} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ fontSize: 20, fontWeight: 700, color: accent }}>{initials(staff.full_name)}</div>
          )}
        </div>
      </div>

      {/* Centered text block — flex:1 + minHeight:0 to always fit the
          remaining space between the photo and the footer. */}
      <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2px 16px", gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 700, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
          {staff.full_name || "—"}
        </div>
        {staff.designation && (
          <div style={{ fontSize: 9, color: "#64748B", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {staff.designation}
          </div>
        )}
        <div style={{
          fontSize: 9, fontWeight: 700, color: "#ffffff", background: accent,
          padding: "2px 10px", borderRadius: 10, marginTop: 3, letterSpacing: 0.3,
        }}>
          {staff.staff_id || "EMP —"}
        </div>
        {staff.branch_name && (
          <div style={{ fontSize: 7, color: "#94A3B8", marginTop: 2, letterSpacing: 0.5, textTransform: "uppercase" }}>
            {staff.branch_name}
          </div>
        )}
      </div>

      {/* Footer — fixed height, centered QR */}
      <div style={{ width: "100%", height: 44, flexShrink: 0, borderTop: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ padding: 2, border: "1px solid #E2E8F0", borderRadius: 4 }}>
          <QRCodeCanvas value={verifyUrl} size={34} level="H" includeMargin={false} />
        </div>
      </div>
    </div>
  );
}

function BadgeBack({ staff, tenant, className }: {
  staff: StaffForCard;
  tenant: TenantForCard;
  className?: string;
}) {
  const accent = tenant.id_card_accent || "#4F46E5";
  return (
    <div
      className={className}
      style={{
        width: CARD_W, height: CARD_H,
        background: "#ffffff",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgba(15, 23, 42, 0.35)",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#0F172A",
        display: "flex", flexDirection: "column", alignItems: "center",
      }}
    >
      <div style={{ width: "100%", height: 6, background: accent, flexShrink: 0 }} />
      <div style={{ flex: 1, minHeight: 0, width: "100%", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 5, alignItems: "center" }}>
        <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: "uppercase", color: "#64748B", fontWeight: 700 }}>
          Details
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 14px", fontSize: 9, width: "100%" }}>
          <BackRow label="DOB" value={fmtDate(staff.date_of_birth)} />
          <BackRow label="Blood group" value={staff.blood_group || "—"} accent={accent} bold={!!staff.blood_group} />
          <BackRow label="Emergency" value={staff.emergency_contact_phone || "—"} span={2} />
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "center", gap: 20, alignItems: "flex-end", width: "100%" }}>
          <div style={{ flex: 1, maxWidth: 120 }}>
            <div style={{ height: 20, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid #94A3B8" }}>
              {staff.signature_url && <img src={staff.signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 18, maxWidth: "90%", objectFit: "contain" }} />}
            </div>
            <div style={{ fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginTop: 2, textAlign: "center" }}>Signature</div>
          </div>
          <div style={{ flex: 1, maxWidth: 120 }}>
            <div style={{ height: 20, display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid #94A3B8" }}>
              {tenant.authority_signature_url && <img src={tenant.authority_signature_url} alt="" crossOrigin="anonymous" style={{ maxHeight: 18, maxWidth: "90%", objectFit: "contain" }} />}
            </div>
            <div style={{ fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginTop: 2, textAlign: "center" }}>Authority</div>
          </div>
        </div>
      </div>
      <div style={{ width: "100%", height: 26, flexShrink: 0, borderTop: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 7, color: "#94A3B8" }}>
        <span>{tenant.name}</span>
        <span>·</span>
        <span style={{ fontWeight: 600 }}>{staff.staff_id || ""}</span>
      </div>
    </div>
  );
}
