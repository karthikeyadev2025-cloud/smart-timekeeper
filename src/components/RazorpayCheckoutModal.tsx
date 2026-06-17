import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { createRazorpayOrder, verifyRazorpayPayment } from "@/lib/payment.functions";

interface RazorpayCheckoutProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  planName: string;
  amountInr: number;
  billing: "lifetime" | "monthly" | string;
  tenantId: string;
  onSuccess?: (result: { plan_name: string; expires_at: string | null }) => void;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

async function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.head.appendChild(script);
  });
}

export function RazorpayCheckoutModal({
  isOpen,
  onClose,
  planId,
  planName,
  amountInr,
  billing,
  tenantId,
  onSuccess,
}: RazorpayCheckoutProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "verifying">("idle");

  const handlePay = async () => {
    setStatus("loading");
    try {
      // 1. Load Razorpay SDK
      await loadRazorpayScript();

      // 2. Create order on our backend
      const order = await createRazorpayOrder({ plan_id: planId, tenant_id: tenantId });

      // 3. Open Razorpay checkout
      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.key_id,
          order_id: order.order_id,
          amount: order.amount_paise,
          currency: "INR",
          name: "Punchly",
          description: `${order.plan_name} — ${billing === "lifetime" ? "Lifetime" : "Monthly"}`,
          image: "/punchly-logo.png",
          prefill: {},
          theme: { color: "#4F46E5" },
          modal: {
            ondismiss() {
              reject(new Error("dismissed"));
            },
          },
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            setStatus("verifying");
            try {
              const result = await verifyRazorpayPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              });
              toast.success(`🎉 Payment successful! ${result.plan_name} is now active.`);
              onSuccess?.(result as { plan_name: string; expires_at: string | null });
              resolve();
            } catch (err: any) {
              reject(err);
            }
          },
        });
        rzp.open();
      });

      onClose();
    } catch (err: any) {
      if (err.message === "dismissed") {
        // User closed the modal — no error needed
        setStatus("idle");
        return;
      }
      toast.error(`Payment failed: ${err.message}`);
      setStatus("idle");
    } finally {
      if (status !== "idle") setStatus("idle");
    }
  };

  const displayAmount = amountInr.toLocaleString("en-IN");
  const billingLabel = billing === "lifetime" ? "one-time" : "/month";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Subscribe to {planName}</DialogTitle>
          <DialogDescription>
            Secure checkout via Razorpay. No card details stored on our servers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Price display */}
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-5 text-center">
            <p className="text-4xl font-bold tracking-tight">
              ₹{displayAmount}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{billingLabel}</p>
            {billing === "lifetime" && (
              <Badge variant="secondary" className="mt-2 text-xs">
                Pay once · Use forever
              </Badge>
            )}
          </div>

          {/* What you get */}
          <ul className="space-y-2 text-sm">
            {[
              "GPS + selfie biometric attendance",
              "Automatic payroll & payslips",
              "Leave & shift management",
              "Live staff tracking map",
              "Offline-ready mobile PWA",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                {f}
              </li>
            ))}
          </ul>

          {/* Trust indicators */}
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
            256-bit encrypted · Powered by Razorpay · GST invoice included
          </div>

          {/* CTA */}
          <Button
            onClick={handlePay}
            disabled={status !== "idle"}
            size="lg"
            className="w-full text-base font-semibold"
          >
            {status === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {status === "verifying" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {status === "idle" && "Pay ₹" + displayAmount + " securely"}
            {status === "loading" && "Opening checkout…"}
            {status === "verifying" && "Verifying payment…"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            By paying you agree to our{" "}
            <a href="/terms" target="_blank" className="underline hover:text-foreground">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" className="underline hover:text-foreground">
              Privacy Policy
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
