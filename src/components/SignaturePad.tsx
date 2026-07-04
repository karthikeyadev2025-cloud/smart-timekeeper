/**
 * Signature capture widget.
 *
 * Two ways to provide a signature:
 *   1. Draw it — a canvas pad with pointer events, Clear + Save
 *   2. Upload an image file (e.g. a scanned signature)
 *
 * Two usage contexts, controlled by the `kind` prop:
 *   'employee' — writes to signatures/{userId}/signature.png (or goes
 *                through the pending_signature_changes approval flow if
 *                signatureLocked && !bypassApproval)
 *   'tenant'   — writes to signatures/tenant/{tenantId}/signature.png,
 *                always a direct write (admin's own signature, no approval)
 */

import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, Trash2, Loader2, Eraser, PenLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/** Signed URL for a signature file. Works for both employee and tenant paths. */
export function useSignatureUrl(path: string | undefined) {
  return useQuery({
    queryKey: ["signature-url", path],
    enabled: !!path,
    staleTime: 4 * 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      try {
        const { data: files } = await supabase.storage
          .from("signatures")
          .list(path!.split("/").slice(0, -1).join("/"), { search: path!.split("/").pop(), limit: 1 });
        if (!files || files.length === 0) return null;
        const { data, error } = await supabase.storage.from("signatures").createSignedUrl(path!, 300);
        if (error) return null;
        return data?.signedUrl ?? null;
      } catch {
        return null;
      }
    },
  });
}

interface Props {
  kind: "employee" | "tenant";
  /** For kind='employee': the staff's user id. For kind='tenant': the tenant id. */
  ownerId: string;
  onChanged?: () => void;
  bypassApproval?: boolean;
  signatureLocked?: boolean;
}

export function SignaturePad({ kind, ownerId, onChanged, bypassApproval = false, signatureLocked = false }: Props) {
  const path = kind === "employee" ? `${ownerId}/signature.png` : `tenant/${ownerId}/signature.png`;
  const { data: signedUrl, refetch } = useSignatureUrl(path);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDrawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  useEffect(() => setPreview(signedUrl ?? null), [signedUrl]);

  // ── Canvas drawing handlers ──
  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true;
    hasDrawnRef.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = getPos(e);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0F172A";
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const endDraw = () => { isDrawingRef.current = false; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  };

  const saveFromCanvas = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawnRef.current) {
      toast.error("Draw your signature first");
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      await doUpload(blob);
      setDrawing(false);
      clearCanvas();
    }, "image/png");
  };

  // ── File upload ──
  const handleFileInput = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file");
      return;
    }
    await doUpload(file);
  };

  // ── Shared upload logic (used by both draw-save and file-upload paths) ──
  const doUpload = async (blob: Blob) => {
    setUploading(true);
    try {
      const needsApproval = kind === "employee" && signatureLocked && !bypassApproval;

      if (needsApproval) {
        const pendingPath = `${ownerId}/pending-${Date.now()}.png`;
        const { error: upErr } = await supabase.storage
          .from("signatures")
          .upload(pendingPath, blob, { upsert: false, contentType: "image/png" });
        if (upErr) throw upErr;

        const { requestSignatureChange } = await import("@/lib/signature-change.functions");
        await requestSignatureChange({ data: { signature_path: pendingPath } });

        toast.success("Signature change submitted — waiting for admin approval");
        onChanged?.();
        return;
      }

      const { error } = await supabase.storage
        .from("signatures")
        .upload(path, blob, { upsert: true, contentType: "image/png" });
      if (error) throw error;

      if (kind === "employee" && !bypassApproval && !signatureLocked) {
        await (supabase as any).from("profiles").update({ signature_locked: true }).eq("id", ownerId);
      }

      await refetch();
      onChanged?.();
      toast.success("Signature saved");
    } catch (e: any) {
      toast.error(`Upload failed: ${e?.message ?? e}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remove this signature?")) return;
    setUploading(true);
    try {
      await supabase.storage.from("signatures").remove([path]);
      setPreview(null);
      onChanged?.();
      toast.success("Signature removed");
      await refetch();
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message ?? e}`);
    } finally {
      setUploading(false);
    }
  };

  const locked = kind === "employee" && signatureLocked && !bypassApproval;

  return (
    <Card className="p-5">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm font-semibold self-start flex items-center gap-2">
          <PenLine className="h-4 w-4 text-primary" />
          {kind === "tenant" ? "Issuing authority signature" : "Your signature"}
        </p>

        <div className="w-full max-w-xs h-24 rounded-lg border-2 border-dashed border-border bg-muted/20 flex items-center justify-center overflow-hidden">
          {drawing ? (
            <canvas
              ref={canvasRef}
              width={320}
              height={96}
              className="w-full h-full touch-none cursor-crosshair bg-white"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
            />
          ) : preview ? (
            <img src={preview} alt="Signature" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">No signature yet</span>
          )}
        </div>

        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : drawing ? (
          <div className="flex gap-2 w-full max-w-xs">
            <Button variant="outline" size="sm" onClick={clearCanvas} className="flex-1 gap-1.5">
              <Eraser className="h-3.5 w-3.5" /> Clear
            </Button>
            <Button size="sm" onClick={saveFromCanvas} className="flex-1">Save</Button>
            <Button variant="ghost" size="sm" onClick={() => { setDrawing(false); clearCanvas(); }}>Cancel</Button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-2 w-full max-w-xs">
            <Button variant="outline" size="sm" disabled={locked} onClick={() => setDrawing(true)} className="flex-1 gap-1.5">
              <PenLine className="h-3.5 w-3.5" /> Draw
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileInput(e.target.files[0])} />
            <Button variant="outline" size="sm" disabled={locked} onClick={() => fileInputRef.current?.click()} className="flex-1 gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
            {preview && !locked && (
              <Button variant="ghost" size="sm" onClick={handleDelete} className="text-destructive hover:text-destructive gap-1.5">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}

        {locked && (
          <div className="w-full max-w-xs rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-800 dark:text-amber-200">
            <strong>Change needs approval.</strong> You've already set your signature — new changes go to your admin for review.
          </div>
        )}
      </div>
    </Card>
  );
}
