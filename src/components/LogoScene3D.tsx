import { motion, useMotionTemplate, useMotionValue, useSpring } from "framer-motion";
import { useEffect } from "react";

const LOGO_URL = "/punchly-logo.png";

const layers = [
  { size: 320, top: "14%", left: "56%", depth: 1, duration: 18, delay: 0 },
  { size: 164, top: "12%", left: "74%", depth: 0.7, duration: 14, delay: 1.8 },
  { size: 132, top: "58%", left: "66%", depth: 0.55, duration: 16, delay: 0.6 },
  { size: 104, top: "68%", left: "50%", depth: 0.4, duration: 12, delay: 1.2 },
  { size: 88, top: "32%", left: "44%", depth: 0.35, duration: 11, delay: 2.2 },
] as const;

export function LogoScene3D() {
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateX = useSpring(pointerY, { stiffness: 90, damping: 18, mass: 0.8 });
  const rotateY = useSpring(pointerX, { stiffness: 90, damping: 18, mass: 0.8 });
  const groupTransform = useMotionTemplate`perspective(1600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const x = ((event.clientX / window.innerWidth) * 2 - 1) * 8;
      const y = ((event.clientY / window.innerHeight) * 2 - 1) * -6;
      pointerX.set(x);
      pointerY.set(y);
    };

    const onLeave = () => {
      pointerX.set(0);
      pointerY.set(0);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [pointerX, pointerY]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      <motion.div style={{ transform: groupTransform, transformStyle: "preserve-3d" }} className="absolute inset-0">
        {layers.map((layer, index) => (
          <motion.img
            key={`${layer.left}-${layer.top}-${index}`}
            src={LOGO_URL}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="absolute object-contain opacity-90"
            style={{
              width: layer.size,
              height: layer.size,
              top: layer.top,
              left: layer.left,
              x: "-50%",
              y: "-50%",
              filter: "drop-shadow(0 22px 40px color-mix(in oklab, var(--primary) 18%, transparent))",
              transformStyle: "preserve-3d",
            }}
            initial={{ opacity: 0, scale: 0.86, rotate: -12 }}
            animate={{
              opacity: [0.56, 0.9, 0.62],
              scale: [1, 1.08, 0.98, 1],
              rotate: [-8, 10, -6],
              y: ["-50%", "calc(-50% - 16px)", "-50%", "calc(-50% + 10px)", "-50%"],
            }}
            transition={{
              duration: layer.duration,
              repeat: Infinity,
              ease: "easeInOut",
              delay: layer.delay,
            }}
            whileInView={{ opacity: 1 }}
          />
        ))}
      </motion.div>
    </div>
  );
}

export default LogoScene3D;