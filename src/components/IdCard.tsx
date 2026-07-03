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

import { QRCodeSVG } from "qrcode.react";

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
};

export type TenantForCard = {
  id: string;
  name: string;
  logo_url?: string | null;
  id_card_accent?: string | null;
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

/* ─────────────── FRONT ─────────────── */
export function IdCardFront({ staff, tenant, verifyUrl, className }: {
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
      <div style={{ display: "flex", padding: "12px 14px", gap: 12, flex: 1 }}>
        {/* Photo */}
        <div style={{
          width: 76, height: 96,
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
        <div style={{ background: "#ffffff", padding: 3, borderRadius: 4, border: "1px solid #E2E8F0" }}>
          <QRCodeSVG value={verifyUrl} size={40} level="M" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────── BACK ─────────────── */
export function IdCardBack({ staff, tenant, className }: {
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
            <div style={{ borderBottom: "1px solid #94A3B8", height: 24 }} />
            <div style={{ fontSize: 7, color: "#64748B", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
              Employee signature
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ borderBottom: "1px solid #94A3B8", height: 24 }} />
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
