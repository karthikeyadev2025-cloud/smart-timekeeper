/**
 * ID Card preview modal. Reused by both:
 *  - staff's "My ID Card" page (they see their own)
 *  - admin's staff detail page (they see any staff member's)
 *
 * Renders the card, offers a Download PNG and a Share button.
 */

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { IdCardFront, IdCardBack, type StaffForCard, type TenantForCard } from "@/components/IdCard";
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

  // Verify URL — a public route that shows a minimal "This is a valid Punchly
  // ID for {name} at {tenant}" page. Even before we build that route, scanning
  // the QR gets a clean deep link with the staff id, which is what people
  // actually use it for.
  const verifyUrl = `${typeof window !== "undefined" ? window.location.origin : "https://punchly.online"}/verify/${staff.id}`;

  const filename = `${(staff.staff_id || "EMP")}_${(staff.full_name || "id").replace(/\s+/g, "_")}_id.png`;

  const handleDownload = async () => {
    if (!frontRef.current || !backRef.current) return;
    setBusy("download");
    try {
      const dataUrl = await cardToDataUrl(frontRef.current, backRef.current);
      downloadDataUrl(dataUrl, filename);
      toast.success("ID card downloaded");
    } catch (e: any) {
      toast.error(`Download failed: ${e?.message ?? e}`);
    } finally {
      setBusy("idle");
    }
  };

  const handleShare = async () => {
    if (!frontRef.current || !backRef.current) return;
    setBusy("share");
    try {
      const dataUrl = await cardToDataUrl(frontRef.current, backRef.current);
      await shareCard(dataUrl, filename, staff.full_name || "staff");
    } catch (e: any) {
      toast.error(`Share failed: ${e?.message ?? e}`);
    } finally {
      setBusy("idle");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Employee ID Card</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <div ref={frontRef}>
            <IdCardFront staff={staff} tenant={tenant} verifyUrl={verifyUrl} />
          </div>
          <div ref={backRef}>
            <IdCardBack staff={staff} tenant={tenant} />
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
