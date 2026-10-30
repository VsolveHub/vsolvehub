"use client";

import { useEffect, useRef } from "react";
import { Check, CheckCircle2, Clock, Sparkles, Smartphone, ArrowRight } from "lucide-react";
import { Button } from "@vsolve/ui";
import type { Schemas } from "@vsolve/api-client";

interface RegistrationSuccessModalProps {
  open: boolean;
  onClose: () => void;
  application: Schemas["PartnerApplication"] | null;
}

export function RegistrationSuccessModal({
  open,
  onClose,
  application,
}: RegistrationSuccessModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Confetti Particle Animation
  useEffect(() => {
    if (!open) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ["#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4"];
    const particles: Array<{
      x: number;
      y: number;
      size: number;
      color: string;
      speedX: number;
      speedY: number;
      rotation: number;
      rotationSpeed: number;
      opacity: number;
    }> = [];

    // Create 120 confetti particles
    for (let i = 0; i < 120; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.4 + (Math.random() - 0.5) * 80,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)] ?? "#10b981",
        speedX: (Math.random() - 0.5) * 12,
        speedY: (Math.random() - 1) * 14 - 2,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
      });
    }

    let animationFrameId: number;
    let frame = 0;

    const render = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.x += p.speedX;
        p.y += p.speedY;
        p.speedY += 0.35; // Gravity
        p.rotation += p.rotationSpeed;
        if (frame > 60) {
          p.opacity = Math.max(0, p.opacity - 0.015);
        }

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      if (frame < 180) {
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [open]);

  if (!open) return null;

  const partnerName = application?.display_name || "Partner";
  const track = application?.track;
  const trackLabel =
    track === "SERVICES"
      ? "Services & Home Trades"
      : track === "RENTAL_OWNER"
      ? "Equipment & Tool Rentals"
      : track === "STAY_HOST"
      ? "Accommodation & Stays"
      : "Partner Registration";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Confetti Animation Canvas */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-60"
        style={{ width: "100vw", height: "100vh" }}
      />

      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#000f28]/75 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal Dialog */}
      <div className="relative z-50 w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl border border-white/20 bg-surface shadow-[0_25px_70px_rgba(0,17,46,0.35)] animate-in fade-in zoom-in-95 duration-200">
        {/* Top Celebration Accent Bar */}
        <div className="bg-[#00112e] px-6 pt-8 pb-7 text-white text-center relative overflow-hidden">
          {/* Ambient Lighting */}
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 h-44 w-44 rounded-full bg-amber-500/20 blur-3xl" />

          {/* Animated Celebration Icon */}
          <div className="relative z-10 mx-auto mb-4 flex h-20 w-20 items-center justify-center">
            {/* Ripple Waves */}
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-25" />
            <span className="absolute inline-flex h-16 w-16 animate-pulse rounded-full bg-emerald-500/30" />
            <div className="relative grid h-16 w-16 place-items-center rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-xl shadow-emerald-500/30">
              <Check size={32} strokeWidth={3} className="animate-in zoom-in duration-300" />
            </div>
          </div>

          <div className="relative z-10 flex flex-col items-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-300 border border-white/10 mb-2">
              <Sparkles size={12} />
              Registration Submitted!
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Welcome aboard, {partnerName}!
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-slate-300 max-w-sm leading-relaxed">
              Your partner registration and KYC documents have been securely received. Our verification team is now reviewing your application.
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 sm:p-7 flex flex-col gap-5 bg-surface">
          {/* 3-Step Verification Timeline */}
          <div className="rounded-2xl border border-line bg-surface-sunken p-4 flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
              What Happens Next
            </h3>

            <div className="flex flex-col gap-3">
              {/* Step 1: Submitted */}
              <div className="flex items-start gap-3">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-navy-900">Application Submitted</p>
                  <p className="text-[11px] text-text-secondary">All details & KYC documents uploaded</p>
                </div>
              </div>

              {/* Step 2: In Review */}
              <div className="flex items-start gap-3">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 animate-pulse">
                  <Clock size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-navy-900">Background & KYC Verification</p>
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                      In Progress
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary">Estimated review time: within 24 hours</p>
                </div>
              </div>

              {/* Step 3: Activation */}
              <div className="flex items-start gap-3 opacity-60">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                  <Smartphone size={16} />
                </div>
                <div>
                  <p className="text-xs font-bold text-navy-900">Partner Mobile App Activation</p>
                  <p className="text-[11px] text-text-secondary">Dispatches & customer jobs unlocked upon approval</p>
                </div>
              </div>
            </div>
          </div>

          {/* Partner Reference Card */}
          <div className="flex items-center justify-between text-xs px-2 py-1">
            <span className="text-text-muted">Registered Category</span>
            <span className="font-bold text-navy-900">{trackLabel}</span>
          </div>

          {/* Action Button */}
          <Button
            size="lg"
            block
            onClick={onClose}
            className="h-12 font-bold text-base shadow-md flex items-center justify-center gap-2"
          >
            <span>Continue to Application Status</span>
            <ArrowRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
