import { AnimatePresence, motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

/**
 * FEATURE STORY — an animated explainer that plays one working day.
 *
 * A first-time visitor will not read fourteen feature cards. They will watch a
 * shop open, a staff member punch in, and a payslip come out the other end. So
 * the page tells that story as a short cartoon: five scenes, roughly four
 * seconds each, drawn as flat SVG and animated rather than shipped as video —
 * which keeps it a few kilobytes, crisp at any size, correct in both themes,
 * and readable by search engines because the captions are real text.
 *
 * It starts itself when scrolled into view, not on page load, so it never
 * competes with the hero or burns battery off-screen. Anyone who prefers
 * reduced motion gets the same five beats as a plain list, no animation.
 */

type Scene = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  art: (playing: boolean) => React.ReactNode;
};

const SCENE_MS = 4200;

/* ── Small shared cartoon pieces ─────────────────────────────────────────── */

function Person({ x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="0" cy="-34" r="11" className="fill-primary" />
      <path d="M-12 -20 h24 a4 4 0 0 1 4 4 v22 a4 4 0 0 1 -4 4 h-24 a4 4 0 0 1 -4 -4 v-22 a4 4 0 0 1 4 -4 z" className="fill-primary/80" />
      <rect x="-9" y="10" width="6" height="16" rx="3" className="fill-primary/60" />
      <rect x="3" y="10" width="6" height="16" rx="3" className="fill-primary/60" />
    </g>
  );
}

function Phone({ x = 0, y = 0, children }: { x?: number; y?: number; children?: React.ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-15" y="-26" width="30" height="52" rx="6" className="fill-foreground" />
      <rect x="-12.5" y="-23" width="25" height="46" rx="4" className="fill-card" />
      {children}
    </g>
  );
}

/* ── Scene 1 · the punch ─────────────────────────────────────────────────── */
function ArtPunch(playing: boolean) {
  return (
    <g>
      {/* shop */}
      <rect x="120" y="70" width="120" height="86" rx="8" className="fill-muted" />
      <path d="M114 70 h132 l-10 -20 h-112 z" className="fill-primary/25" />
      <rect x="164" y="112" width="32" height="44" rx="4" className="fill-card" />
      <rect x="132" y="88" width="24" height="18" rx="3" className="fill-card" />
      <rect x="204" y="88" width="24" height="18" rx="3" className="fill-card" />

      {/* geofence ring tightening around the staff member */}
      <motion.circle
        cx="76" cy="120" r="54"
        className="stroke-primary/45" fill="none" strokeWidth="2" strokeDasharray="5 6"
        animate={playing ? { r: [54, 34, 34], opacity: [0.35, 1, 1] } : { r: 34, opacity: 1 }}
        transition={{ duration: 2, times: [0, 0.55, 1], ease: "easeOut" }}
      />
      <Person x={76} y={128} />

      <Phone x={126} y={116}>
        {/* tick appears once the ring has closed */}
        <motion.g
          initial={{ scale: 0, opacity: 0 }}
          animate={playing ? { scale: [0, 1.15, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={{ delay: 1.9, duration: 0.5 }}
        >
          <circle cx="0" cy="0" r="10" className="fill-success" />
          <path d="M-4.5 0 l3 3 l6 -6.5" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </motion.g>
      </Phone>

      <motion.text
        x="126" y="176" textAnchor="middle"
        className="fill-muted-foreground font-data" style={{ fontSize: 11 }}
        initial={{ opacity: 0 }} animate={playing ? { opacity: [0, 1] } : { opacity: 1 }} transition={{ delay: 2.2 }}
      >
        09:02 · verified
      </motion.text>
    </g>
  );
}

/* ── Scene 2 · every branch on one map ───────────────────────────────────── */
function ArtMap(playing: boolean) {
  const pins = [
    { x: 92, y: 86, n: "42" },
    { x: 168, y: 62, n: "18" },
    { x: 214, y: 116, n: "11" },
    { x: 128, y: 140, n: "7" },
  ];
  return (
    <g>
      <path
        d="M56 66 q40 -22 84 -8 q46 14 88 -4 q18 40 4 84 q-40 26 -92 12 q-48 -14 -84 6 q-14 -46 0 -90 z"
        className="fill-muted stroke-border" strokeWidth="2"
      />
      {pins.map((p, i) => (
        <motion.g
          key={p.n}
          initial={{ y: -18, opacity: 0 }}
          animate={playing ? { y: 0, opacity: 1 } : { y: 0, opacity: 1 }}
          transition={{ delay: 0.35 + i * 0.42, type: "spring", stiffness: 260, damping: 16 }}
        >
          <path d={`M${p.x} ${p.y} c-9 0 -16 7 -16 16 c0 12 16 24 16 24 s16 -12 16 -24 c0 -9 -7 -16 -16 -16 z`} className="fill-primary" />
          <circle cx={p.x} cy={p.y + 15} r="6" className="fill-card" />
          <motion.circle
            cx={p.x} cy={p.y + 15} r="6"
            className="fill-success"
            initial={{ scale: 0 }}
            animate={playing ? { scale: 1 } : { scale: 1 }}
            transition={{ delay: 0.9 + i * 0.42 }}
            style={{ transformOrigin: `${p.x}px ${p.y + 15}px` }}
          />
          <text x={p.x} y={p.y + 56} textAnchor="middle" className="fill-muted-foreground font-data" style={{ fontSize: 10 }}>
            {p.n} in
          </text>
        </motion.g>
      ))}
    </g>
  );
}

/* ── Scene 3 · payroll adds itself up ────────────────────────────────────── */
function ArtPayroll(playing: boolean) {
  return (
    <g>
      <motion.g
        initial={{ y: 30, opacity: 0 }}
        animate={playing ? { y: 0, opacity: 1 } : { y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <rect x="104" y="48" width="112" height="128" rx="8" className="fill-card stroke-border" strokeWidth="2" />
        <rect x="120" y="66" width="52" height="7" rx="3.5" className="fill-muted-foreground/40" />
        {[0, 1, 2, 3].map((i) => (
          <motion.g
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={playing ? { opacity: 1, x: 0 } : { opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.28 }}
          >
            <rect x="120" y={88 + i * 16} width={i === 3 ? 34 : 58} height="6" rx="3" className="fill-muted-foreground/25" />
            <rect x="176" y={88 + i * 16} width="24" height="6" rx="3" className="fill-muted-foreground/25" />
          </motion.g>
        ))}
        <motion.g
          initial={{ opacity: 0 }}
          animate={playing ? { opacity: 1 } : { opacity: 1 }}
          transition={{ delay: 2 }}
        >
          <line x1="120" y1="152" x2="200" y2="152" className="stroke-border" strokeWidth="2" />
          <text x="120" y="168" className="fill-foreground font-data" style={{ fontSize: 13, fontWeight: 600 }}>₹18,420</text>
        </motion.g>
      </motion.g>
      <motion.g
        initial={{ scale: 0, rotate: -18, opacity: 0 }}
        animate={playing ? { scale: 1, rotate: -12, opacity: 1 } : { scale: 1, rotate: -12, opacity: 1 }}
        transition={{ delay: 2.5, type: "spring", stiffness: 200, damping: 12 }}
        style={{ transformOrigin: "196px 148px" }}
      >
        <rect x="164" y="124" width="66" height="26" rx="6" className="fill-success/15 stroke-success" strokeWidth="2" />
        <text x="197" y="141" textAnchor="middle" className="fill-success font-data" style={{ fontSize: 11, fontWeight: 600 }}>PAID</text>
      </motion.g>
    </g>
  );
}

/* ── Scene 4 · a whole class in one tap ──────────────────────────────────── */
function ArtSchool(playing: boolean) {
  const kids = Array.from({ length: 12 }, (_, i) => ({ x: 118 + (i % 4) * 34, y: 62 + Math.floor(i / 4) * 34 }));
  return (
    <g>
      <Person x={72} y={132} scale={0.85} />
      <rect x="86" y="96" width="22" height="16" rx="3" className="fill-foreground" />
      {kids.map((k, i) => (
        <motion.circle
          key={i}
          cx={k.x} cy={k.y} r="12"
          className={i === 9 ? "fill-muted-foreground/30" : "fill-success"}
          initial={{ scale: 0.4, opacity: 0.25 }}
          animate={playing ? { scale: 1, opacity: 1 } : { scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 + i * 0.13, type: "spring", stiffness: 300, damping: 18 }}
          style={{ transformOrigin: `${k.x}px ${k.y}px` }}
        />
      ))}
      <motion.text
        x="185" y="176" textAnchor="middle"
        className="fill-muted-foreground font-data" style={{ fontSize: 11 }}
        initial={{ opacity: 0 }} animate={playing ? { opacity: 1 } : { opacity: 1 }} transition={{ delay: 2.1 }}
      >
        11 / 12 present
      </motion.text>
    </g>
  );
}

/* ── Scene 5 · no signal, no problem ─────────────────────────────────────── */
function ArtOffline(playing: boolean) {
  return (
    <g>
      <Phone x={104} y={112}>
        <motion.g
          initial={{ opacity: 1 }}
          animate={playing ? { opacity: [1, 1, 0] } : { opacity: 0 }}
          transition={{ duration: 2.4, times: [0, 0.6, 1] }}
        >
          <path d="M-8 -6 l16 12 M8 -6 l-16 12" className="stroke-destructive" strokeWidth="2.5" strokeLinecap="round" />
        </motion.g>
        <motion.g
          initial={{ opacity: 0, scale: 0.6 }}
          animate={playing ? { opacity: [0, 0, 1], scale: [0.6, 0.6, 1] } : { opacity: 1, scale: 1 }}
          transition={{ duration: 2.8, times: [0, 0.62, 1] }}
        >
          <circle cx="0" cy="0" r="10" className="fill-success" />
          <path d="M-4.5 0 l3 3 l6 -6.5" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </motion.g>
      </Phone>

      {[0, 1, 2].map((i) => (
        <motion.rect
          key={i}
          x="150" y={92 + i * 22} width="0" height="14" rx="4"
          className="fill-primary/70"
          animate={playing ? { width: [0, 56] } : { width: 56 }}
          transition={{ delay: 1.7 + i * 0.22, duration: 0.5, ease: "easeOut" }}
        />
      ))}
      <rect x="224" y="80" width="40" height="60" rx="7" className="fill-muted stroke-border" strokeWidth="2" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x="232" y={90 + i * 16} width="24" height="6" rx="3" className="fill-muted-foreground/30" />
      ))}
    </g>
  );
}

const SCENES: Scene[] = [
  {
    key: "punch",
    eyebrow: "09:02 · the shop opens",
    title: "One tap, and he's on the register",
    body: "GPS confirms he is actually inside the branch, then the front camera takes a selfie as proof. No fingerprint machine on the wall, no register to sign.",
    art: ArtPunch,
  },
  {
    key: "map",
    eyebrow: "Across every branch",
    title: "See who's in, everywhere, right now",
    body: "Each branch reports live on one map — including field staff out on the road, with distance and accuracy logged against every punch.",
    art: ArtMap,
  },
  {
    key: "payroll",
    eyebrow: "Month end",
    title: "Payroll adds itself up",
    body: "Salary comes off the attendance already on record: overtime, paid leave and late deductions included. The payslip PDF is waiting for you.",
    art: ArtPayroll,
  },
  {
    key: "school",
    eyebrow: "For schools & colleges",
    title: "A whole class in one tap",
    body: "Teachers mark the register for the room in a single tap. Students need no phone and no GPS — and absent students' parents get a WhatsApp.",
    art: ArtSchool,
  },
  {
    key: "offline",
    eyebrow: "Weak signal at the site",
    title: "No network? The punch still counts",
    body: "Attendance is saved on the phone with its real timestamp and syncs the moment a signal returns. The time recorded is when they punched, not when it uploaded.",
    art: ArtOffline,
  },
];

export function FeatureStory() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: "-20% 0px -20% 0px" });
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Only runs while the section is actually on screen — never off-screen, and
  // never while paused.
  useEffect(() => {
    if (!inView || !playing || reduced) return;
    const t = setTimeout(() => setI((n) => (n + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(t);
  }, [i, inView, playing, reduced]);

  const scene = SCENES[i];

  // Reduced motion: same five beats, no movement.
  if (reduced) {
    return (
      <section className="border-b border-border py-20">
        <div className="mx-auto max-w-6xl px-4">
          <p className="font-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground">A day with Punchly</p>
          <h2 className="font-display mt-3 text-3xl tracking-[-0.02em] md:text-4xl" style={{ fontWeight: 600 }}>
            From the shop opening to the payslip
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
            {SCENES.map((s) => (
              <div key={s.key} className="bg-card p-7">
                <p className="font-data text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{s.eyebrow}</p>
                <h3 className="font-display mt-2 text-lg" style={{ fontWeight: 600 }}>{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="border-b border-border py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground">A day with Punchly</p>
            <h2 className="font-display mt-3 text-3xl tracking-[-0.02em] md:text-4xl" style={{ fontWeight: 600 }}>
              From the shop opening to the payslip
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause the story" : "Play the story"}
              className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => { setI(0); setPlaying(true); }}
              aria-label="Start the story again"
              className="grid h-9 w-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-10 grid items-center gap-8 overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-2">
          {/* Stage */}
          <div className="relative aspect-[4/3] w-full bg-muted/30">
            <svg viewBox="0 0 320 210" className="h-full w-full" role="img" aria-label={scene.title}>
              <AnimatePresence mode="wait">
                <motion.g
                  key={scene.key}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.03 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  {scene.art(playing && inView)}
                </motion.g>
              </AnimatePresence>
            </svg>
          </div>

          {/* Caption */}
          <div className="p-7 md:p-9">
            <AnimatePresence mode="wait">
              <motion.div
                key={scene.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
              >
                <p className="font-data text-[11px] uppercase tracking-[0.16em] text-primary">{scene.eyebrow}</p>
                <h3 className="font-display mt-3 text-2xl tracking-[-0.01em]" style={{ fontWeight: 600 }}>{scene.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">{scene.body}</p>
              </motion.div>
            </AnimatePresence>

            {/* Scene picker — doubles as the progress indicator. */}
            <div className="mt-8 flex items-center gap-2">
              {SCENES.map((s, n) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { setI(n); setPlaying(true); }}
                  aria-label={`Scene ${n + 1}: ${s.title}`}
                  aria-current={n === i}
                  className="group relative h-1.5 flex-1 overflow-hidden rounded-full bg-border"
                >
                  <span className={`block h-full rounded-full transition-all ${n < i ? "w-full bg-primary/40" : n === i ? "bg-primary" : "w-0"}`}
                        style={n === i ? { animation: playing && inView ? `story-fill ${SCENE_MS}ms linear forwards` : undefined, width: playing && inView ? undefined : "100%" } : undefined} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
