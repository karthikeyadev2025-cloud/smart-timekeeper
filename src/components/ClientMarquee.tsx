import { useEffect, useState } from "react";

/**
 * CLIENT WALL — a continuously scrolling strip of customer logos.
 *
 * The hard part is not the movement, it's the sizing. These logos are drawn to
 * completely different proportions: two are square badges (1:1), one is a wide
 * banner (3.6:1), one is a landscape lockup (1.8:1). Setting a single height on
 * all of them makes the banner four times wider than the badges and visually
 * shout over them; setting a single width shrinks the badges to nothing.
 *
 * So each logo carries its own box, tuned so that all four occupy roughly the
 * same optical AREA rather than the same height or width. `object-contain`
 * inside that box means a logo is never cropped or stretched, whatever its
 * source proportions — dropping a new client in only needs its box picked from
 * the same scale.
 *
 * Every logo is drawn for a white background (NILA in particular is pure black
 * line art, invisible on a dark surface), so each sits on its own white chip.
 * That renders identically in light and dark rather than half-disappearing in
 * one of them.
 */

type Client = {
  name: string;
  src: string;
  /**
   * Box tuned per logo so all four occupy a similar optical AREA despite
   * running from 1:1 to 3.6:1. Rendered areas land within ~1.2x of each other,
   * which is close enough that no single logo shouts over the rest.
   */
  box: string;
};

const CLIENTS: Client[] = [
  // 1:1 badge — 72x72 ≈ 5.2k px²
  { name: "Rithvika Super Speciality Hospital, Guntur", src: "/clients/rithvika-hospital.webp", box: "h-[4.5rem] w-[4.5rem]" },
  // 3.6:1 banner — 152x42 ≈ 6.4k px². Widest of the four, so it is the one
  // the uniform chip width is sized around.
  { name: "Geetham Junior College", src: "/clients/geetham-junior-college.webp", box: "w-[9.5rem]" },
  // 1:1 badge
  { name: "NILA — Every Day Jewellery", src: "/clients/nila-jewellery.webp", box: "h-[4.5rem] w-[4.5rem]" },
  // 1.8:1 lockup — 104x58 ≈ 6.0k px²
  { name: "Techspire Summits", src: "/clients/techspire-summits.webp", box: "w-[6.5rem]" },
];

function LogoChip({ c, lazy }: { c: Client; lazy: boolean }) {
  return (
    <div className="flex h-28 w-52 shrink-0 items-center justify-center rounded-2xl bg-white px-6 shadow-sm ring-1 ring-black/5">
      <img
        src={c.src}
        alt={c.name}
        loading={lazy ? "lazy" : "eager"}
        decoding="async"
        draggable={false}
        className={`${c.box} object-contain`}
      />
    </div>
  );
}

export function ClientMarquee() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  return (
    <section className="border-b border-border bg-card/30 py-12">
      <div className="mx-auto max-w-6xl px-4">
        <p className="font-data text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Trusted by teams across Andhra Pradesh &amp; Telangana
        </p>
      </div>

      {reduced ? (
        // No movement: the same logos, wrapped and centred.
        <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center justify-center gap-4 px-4">
          {CLIENTS.map((c) => (
            <LogoChip key={c.name} c={c} lazy />
          ))}
        </div>
      ) : (
        <div
          className="group relative mt-8 overflow-hidden"
          // Fades the strip out at both edges so logos slide away rather than
          // being chopped off by the viewport.
          style={{
            maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          }}
        >
          <div className="marquee-track flex w-max gap-4 group-hover:[animation-play-state:paused]">
            {CLIENTS.map((c) => (
              <LogoChip key={c.name} c={c} lazy={false} />
            ))}
            {/* A second identical set makes the loop seamless: the animation
                travels exactly one set-width, so the copy lands where the
                original started and there is never a visible gap or jump. */}
            {CLIENTS.map((c) => (
              <div key={`dup-${c.name}`} aria-hidden>
                <LogoChip c={c} lazy />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
