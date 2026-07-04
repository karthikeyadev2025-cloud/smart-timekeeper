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
  id_card_template?: "corporate" | "modern" | "compact" | null;
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

export type IdCardTemplate = "corporate" | "modern" | "compact";

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
          width: 72, height: 88,
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

      <div style={{ padding: "10px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
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
      {/* Hero band with big tenant name */}
      <div style={{
        background: `linear-gradient(135deg, #0F172A 0%, ${accent} 130%)`,
        color: "#ffffff",
        padding: "14px 16px 34px",
        position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {tenant.logo_url ? (
            <img src={tenant.logo_url} alt="" crossOrigin="anonymous"
              style={{ height: 20, width: 20, borderRadius: 4, background: "#ffffff", padding: 2, objectFit: "contain" }} />
          ) : null}
          <span style={{ fontSize: 8, opacity: 0.7, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>
            {tenant.name}
          </span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1, marginTop: 6 }}>
          EMPLOYEE
        </div>
      </div>

      {/* Photo overlapping the band */}
      <div style={{ position: "absolute", top: 62, left: 16 }}>
        <div style={{
          width: 78, height: 78,
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
            <div style={{ fontSize: 28, fontWeight: 700, color: accent }}>
              {initials(staff.full_name)}
            </div>
          )}
        </div>
      </div>

      {/* Body — offset to make room for the overlapping photo */}
      <div style={{ padding: "24px 16px 8px 104px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.1 }}>
          {staff.full_name || "—"}
        </div>
        {staff.designation && (
          <div style={{ fontSize: 9, color: "#64748B", marginTop: 2 }}>
            {staff.designation}
          </div>
        )}
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ height: 2, width: 14, background: accent, borderRadius: 1 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: 0.5 }}>
            {staff.staff_id || "EMP —"}
          </span>
        </div>
        {staff.branch_name && (
          <div style={{ fontSize: 8, color: "#94A3B8", marginTop: 3, letterSpacing: 0.5, textTransform: "uppercase" }}>
            {staff.branch_name}
          </div>
        )}
      </div>

      {/* Bottom row: QR + phone */}
      <div style={{
        padding: "6px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#F8FAFC", borderTop: "1px solid #E2E8F0",
      }}>
        {staff.phone && (
          <div style={{ fontSize: 8, color: "#64748B" }}>
            <span style={{ letterSpacing: 1, textTransform: "uppercase", fontWeight: 600 }}>Contact</span>
            <div style={{ color: "#0F172A", fontWeight: 600, marginTop: 1 }}>{staff.phone}</div>
          </div>
        )}
        <div style={{ background: "#ffffff", padding: 4, borderRadius: 4, border: "1px solid #E2E8F0" }}>
          <QRCodeCanvas value={verifyUrl} size={54} level="H" includeMargin={false} />
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

      <div style={{ padding: "10px 16px", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
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
        {/* Vertical text */}
        <div style={{
          fontSize: 7, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase",
          writingMode: "vertical-rl", transform: "rotate(180deg)",
        }}>
          Employee ID
        </div>
        <div style={{ background: "#ffffff", padding: 3, borderRadius: 3 }}>
          <QRCodeCanvas value={verifyUrl} size={44} level="H" includeMargin={false} />
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

      <div style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
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
