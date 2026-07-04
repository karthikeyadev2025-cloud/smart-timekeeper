/**
 * ID Card preview modal. Reused by both:
 *  - staff's "My ID Card" page (they see their own)
 *  - admin's staff detail page (they see any staff member's)
 *
 * Renders the card, offers a Download PNG and a Share button.
 */

import { useRef, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { IdCardFront, IdCardBack, type StaffForCard, type TenantForCard } from "@/components/IdCard";
import { useStaffPhotoUrl } from "@/components/StaffPhotoUpload";
import { useSignatureUrl } from "@/components/SignaturePad";
import { cardToDataUrl, downloadDataUrl, shareCard } from "@/lib/id-card-export";

export function IdCardPreviewModal({
  open, onOpenChange, staff, tenant,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  staff: StaffForCard;
  tenant: TenantForCard;
}) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"idle" | "download" | "share">("idle");
  // Fresh signed URL for the photo — avatar_url on the row may be stale
  const { data: photoUrl } = useStaffPhotoUrl(staff.id);
  const { data: sigUrl } = useSignatureUrl(`${staff.id}/signature.png`);
  const { data: authoritySigUrl } = useSignatureUrl(tenant.id ? `tenant/${tenant.id}/signature.png` : undefined);
  const staffWithFreshPhoto = { ...staff, avatar_url: photoUrl ?? staff.avatar_url, signature_url: sigUrl ?? null };
  const tenantWithSignature = { ...tenant, authority_signature_url: authoritySigUrl ?? null };

  // Verify URL — a public route that shows a minimal "This is a valid Punchly
  // ID for {name} at {tenant}" page. Even before we build that route, scanning
  // the QR gets a clean deep link with the staff id, which is what people
  // actually use it for.
  const verifyUrl = `${typeof window !== "undefined" ? window.location.origin : "https://punchly.online"}/verify/${staff.id}`;

  const filename = `${(staff.staff_id || "EMP")}_${(staff.full_name || "id").replace(/\s+/g, "_")}_id.png`;

  // Pre-generate the PNG as soon as the modal opens (and the card refs +
  // photo/signature URLs are ready) — NOT when Download/Share is tapped.
  // navigator.share() only works within a short window of the actual
  // click; doing 1-3s of image-fetch + render work first silently breaks
  // it on strict browsers (Safari/iOS especially), making Share look
  // like it just downloads instead.
  const [preparedUrl, setPreparedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!open) { setPreparedUrl(null); return; }
    if (!frontRef.current || !backRef.current) return;
    let cancelled = false;
    cardToDataUrl(frontRef.current, backRef.current)
      .then((url) => { if (!cancelled) setPreparedUrl(url); })
      .catch((e) => console.warn("[id-card] pre-generation failed:", e));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staffWithFreshPhoto.avatar_url, staffWithFreshPhoto.signature_url, tenantWithSignature.authority_signature_url, tenantWithSignature.id_card_template]);

  const handleDownload = () => {
    if (preparedUrl) {
      downloadDataUrl(preparedUrl, filename);
      toast.success("ID card downloaded");
      return;
    }
    // Fallback: pre-generation hasn't finished yet (just opened the modal)
    if (!frontRef.current || !backRef.current) return;
    setBusy("download");
    cardToDataUrl(frontRef.current, backRef.current)
      .then((url) => { setPreparedUrl(url); downloadDataUrl(url, filename); toast.success("ID card downloaded"); })
      .catch((e: any) => toast.error(`Download failed: ${e?.message ?? e}`))
      .finally(() => setBusy("idle"));
  };

  const handleShare = () => {
    if (preparedUrl) {
      shareCard(preparedUrl, filename, staff.full_name || "staff");
      return;
    }
    if (!frontRef.current || !backRef.current) return;
    setBusy("share");
    cardToDataUrl(frontRef.current, backRef.current)
      .then((url) => { setPreparedUrl(url); shareCard(url, filename, staff.full_name || "staff"); })
      .catch((e: any) => toast.error(`Share failed: ${e?.message ?? e}`))
      .finally(() => setBusy("idle"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Employee ID Card</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div ref={frontRef}>
            <IdCardFront staff={staffWithFreshPhoto} tenant={tenantWithSignature} verifyUrl={verifyUrl} />
          </div>
          <div ref={backRef}>
            <IdCardBack staff={staffWithFreshPhoto} tenant={tenantWithSignature} />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={handleDownload} disabled={busy !== "idle"} className="flex-1 gap-2">
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download
          </Button>
          <Button onClick={handleShare} disabled={busy !== "idle"} className="flex-1 gap-2">
            {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            Share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
