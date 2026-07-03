/**
 * Staff photo uploader.
 *
 * Handles upload for both the staff themselves (uploading their own photo)
 * and admins (uploading on behalf of a staff member). RLS on the
 * staff-photos bucket enforces "own photo OR admin of their tenant" so this
 * component can trust supabase.storage calls to reject unauthorized writes.
 *
 * Two entry paths — file picker AND camera capture (mobile "capture=user"
 * hint opens front camera). We compress client-side to 640x800 max at 80%
 * JPEG quality — good enough for a 200x200 ID card slot, tiny bandwidth.
 *
 * After upload, avatar_url on profiles is set to a signed URL (5 min) —
 * we always fetch a fresh signed URL on read via useStaffPhotoUrl(). This
 * keeps the bucket private without needing a public CDN.
 */

import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, Upload, Trash2, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook: get a signed URL for a staff member's photo. Refreshes every 4
 * minutes so the URL (5-min lifetime) never goes stale while the page is
 * open. Returns null while loading OR if the file doesn't exist.
 */
export function useStaffPhotoUrl(userId: string | undefined) {
  return useQuery({
    queryKey: ["staff-photo-url", userId],
    enabled: !!userId,
    staleTime: 4 * 60 * 1000,   // 4 min — signed URL is valid 5 min
    refetchInterval: 4 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      try {
        const path = `${userId}/profile.jpg`;
        const { data, error } = await supabase.storage.from("staff-photos").createSignedUrl(path, 300);
        if (error) return null;
        return data?.signedUrl ?? null;
      } catch {
        return null;
      }
    },
  });
}

interface Props {
  userId: string;
  currentName?: string | null;
  /**
   * Callback fired after a successful upload/delete. Parent should update
   * profiles.avatar_url on the DB (this component only touches storage).
   */
  onChanged?: (newSignedUrl: string | null) => void;
  /** Show as a large panel or a compact inline row. */
  variant?: "panel" | "inline";
  /**
   * When true, this staff member's photo can be changed directly without
   * approval — the "first upload OR admin editing on behalf". When false
   * (the default for a locked staff self-upload), the widget submits a
   * pending_photo_change instead of writing over the canonical photo.
   *
   * Callers:
   *  - /my-profile passes false (or omits) unless the profile is unlocked
   *  - Admin staff-detail passes true (admins bypass approval)
   */
  bypassApproval?: boolean;
  /** Whether the photo is currently locked (staff already uploaded once). */
  photoLocked?: boolean;
}

export function StaffPhotoUpload({
  userId, currentName, onChanged, variant = "panel",
  bypassApproval = false, photoLocked = false,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { data: signedUrl, refetch } = useStaffPhotoUrl(userId);

  useEffect(() => {
    setPreview(signedUrl ?? null);
  }, [signedUrl]);

  const compress = async (file: File): Promise<Blob> => {
    // Simple canvas compression: max 640x800, JPEG q=0.8. Good enough for an
    // ID card slot; keeps files ~40-100 KB from typical phone captures.
    const bitmap = await createImageBitmap(file);
    const maxW = 640, maxH = 800;
    const ratio = Math.min(maxW / bitmap.width, maxH / bitmap.height, 1);
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
        "image/jpeg",
        0.8,
      );
    });
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    setUploading(true);
    try {
      const blob = await compress(file);
      const needsApproval = photoLocked && !bypassApproval;

      if (needsApproval) {
        // Locked-photo path: upload to a pending-* filename in the same
        // per-user folder (RLS allows this — the user owns their folder),
        // then submit a pending_photo_changes row for admin review. The
        // canonical profile.jpg is NOT touched until admin approves.
        const pendingPath = `${userId}/pending-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("staff-photos")
          .upload(pendingPath, blob, { upsert: false, contentType: "image/jpeg" });
        if (upErr) throw upErr;

        // Dynamic import to keep server-fn code out of the initial bundle
        const { requestPhotoChange } = await import("@/lib/photo-change.functions");
        await requestPhotoChange({ data: { photo_path: pendingPath } });

        toast.success("Photo change submitted — waiting for admin approval");
        onChanged?.(preview);   // preview unchanged, show current photo
        return;
      }

      // Direct write path — first upload or admin bypass
      const path = `${userId}/profile.jpg`;
      const { error } = await supabase.storage
        .from("staff-photos")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (error) throw error;

      // Refresh signed URL and set it on profiles.avatar_url so downstream
      // widgets (dashboard, admin views) see the new photo immediately.
      const { data: signed } = await supabase.storage.from("staff-photos").createSignedUrl(path, 300);
      const url = signed?.signedUrl ?? null;
      const patch: Record<string, any> = { avatar_url: url };
      // First-upload path: flip the lock so future changes need approval.
      // Admin bypass path: leave the lock alone (may already be true).
      if (!bypassApproval && !photoLocked) patch.photo_locked = true;
      await (supabase as any).from("profiles").update(patch).eq("id", userId);

      await refetch();
      onChanged?.(url);
      toast.success("Photo updated");
    } catch (e: any) {
      toast.error(`Upload failed: ${e?.message ?? e}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove this photo?")) return;
    setUploading(true);
    try {
      await supabase.storage.from("staff-photos").remove([`${userId}/profile.jpg`]);
      await (supabase as any).from("profiles").update({ avatar_url: null }).eq("id", userId);
      setPreview(null);
      onChanged?.(null);
      toast.success("Photo removed");
      await refetch();
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message ?? e}`);
    } finally {
      setUploading(false);
    }
  };

  const initials = (currentName ?? "?").trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");

  // Inline compact version — used inside admin staff edit dialogs
  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3">
        <div className="relative h-16 w-16 rounded-full overflow-hidden bg-primary/10 border-2 border-primary/20 flex items-center justify-center shrink-0">
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-primary">{initials || "?"}</span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="gap-1.5">
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {preview ? "Replace" : "Upload"}
          </Button>
          {preview && (
            <Button size="sm" variant="ghost" disabled={uploading} onClick={handleDelete} className="text-destructive hover:text-destructive gap-1.5 h-auto py-1">
              <Trash2 className="h-3 w-3" /> Remove
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Panel — used on /my-profile and detail screens
  return (
    <Card className="p-5">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-32 w-32 rounded-full overflow-hidden bg-primary/10 border-4 border-primary/20 flex items-center justify-center">
          {preview ? (
            <img src={preview} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl font-bold text-primary">{initials || <User className="h-12 w-12" />}</span>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-center gap-2 w-full">
          {/* Camera capture — the capture attribute hints the front camera on mobile */}
          <input
            ref={cameraInputRef} type="file" accept="image/*" capture="user" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button variant="outline" disabled={uploading} onClick={() => cameraInputRef.current?.click()} className="gap-2 flex-1">
            <Camera className="h-4 w-4" /> Take photo
          </Button>

          {/* File upload */}
          <input
            ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <Button variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="gap-2 flex-1">
            <Upload className="h-4 w-4" /> Upload
          </Button>
        </div>

        {preview && !(photoLocked && !bypassApproval) && (
          <Button variant="ghost" size="sm" disabled={uploading} onClick={handleDelete} className="text-destructive hover:text-destructive gap-2">
            <Trash2 className="h-4 w-4" /> Remove photo
          </Button>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Used on your Punchly ID card. Front-facing headshot works best.
        </p>
        {photoLocked && !bypassApproval && (
          <div className="w-full rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-800 dark:text-amber-200">
            <strong>Change needs approval.</strong> Since you've already set your photo,
            any new upload will be sent to your admin for review before it appears on your ID card.
          </div>
        )}
      </div>
    </Card>
  );
}
