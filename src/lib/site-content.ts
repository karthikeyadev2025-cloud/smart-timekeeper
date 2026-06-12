import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CITIES, type CityData } from "@/lib/cities";

// ---------- Defaults: used when DB row is missing ----------

export type HomeHero = {
  badge: string;
  title: string;
  subtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
};

export type Branding = {
  brandName: string;
  tagline: string;
  contactPhone: string;
  contactEmail: string;
  whatsapp: string;
  address: string;
  logoUrl: string;
  ogImageUrl: string;
};

export type SeoDefaults = {
  titleSuffix: string;
  defaultDescription: string;
  keywords: string;
  robots: string;
};

export type CityOverride = Partial<Pick<CityData, "name" | "intro" | "areas" | "industries">> & {
  h1?: string;
  faqs?: { q: string; a: string }[];
  metaTitle?: string;
  metaDescription?: string;
};

export type PublishableKeys = {
  razorpayKeyId: string;
  googleOauthClientId: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    messagingSenderId: string;
    storageBucket: string;
  };
};

export const DEFAULTS = {
  "home.hero": {
    badge: "Built for Andhra Pradesh & Telangana",
    title: "Biometric attendance for every Telugu business",
    subtitle:
      "GPS + selfie face biometric punch-in. Works on any Android — no fingerprint hardware. Used by schools, offices and field teams across Hyderabad, Vijayawada, Vizag, Guntur, Tirupati and Warangal.",
    ctaPrimary: "Start free trial",
    ctaSecondary: "See pricing",
  } as HomeHero,
  "branding.site": {
    brandName: "Punchly",
    tagline: "Biometric attendance for Telugu states",
    contactPhone: "",
    contactEmail: "",
    whatsapp: "",
    address: "",
    logoUrl: "",
    ogImageUrl: "",
  } as Branding,
  "seo.defaults": {
    titleSuffix: " | Punchly",
    defaultDescription:
      "Punchly is the #1 biometric attendance app for Andhra Pradesh & Telangana — GPS + selfie face biometric punch-in.",
    keywords: "biometric attendance, face attendance, GPS attendance, Andhra Pradesh, Telangana",
    robots: "index, follow, max-image-preview:large, max-snippet:-1",
  } as SeoDefaults,
  "integrations.publishable": {
    razorpayKeyId: "",
    googleOauthClientId: "",
    firebase: {
      apiKey: "",
      authDomain: "",
      projectId: "",
      appId: "",
      messagingSenderId: "",
      storageBucket: "",
    },
  } as PublishableKeys,
} as const;

export type ScopeKey =
  | "home.hero"
  | "branding.site"
  | "seo.defaults"
  | "integrations.publishable"
  | `city.${string}`;

function split(sk: string): [string, string] {
  const i = sk.indexOf(".");
  return [sk.slice(0, i), sk.slice(i + 1)];
}

export async function fetchContent<T = any>(sk: ScopeKey, fallback: T): Promise<T> {
  const [scope, key] = split(sk);
  const { data } = await supabase
    .from("site_content")
    .select("content")
    .eq("scope", scope)
    .eq("key", key)
    .maybeSingle();
  if (!data) return fallback;
  return { ...(fallback as any), ...(data.content as any) } as T;
}

export function useSiteContent<T = any>(sk: ScopeKey, fallback: T) {
  return useQuery({
    queryKey: ["site-content", sk],
    queryFn: () => fetchContent<T>(sk, fallback),
    staleTime: 30_000,
  });
}

export function useUpsertContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sk, content }: { sk: ScopeKey; content: any }) => {
      const [scope, key] = split(sk);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("site_content")
        .upsert(
          { scope, key, content, updated_by: auth.user?.id ?? null },
          { onConflict: "scope,key" },
        );
      if (error) throw error;
      // revision
      await supabase
        .from("content_revisions")
        .insert({ scope, key, content, created_by: auth.user?.id ?? null });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["site-content", vars.sk] });
    },
  });
}

export function cityKey(slug: string): ScopeKey {
  return `city.${slug}` as ScopeKey;
}

export function cityFallback(slug: string): CityOverride {
  const c = CITIES.find((x) => x.slug === slug);
  if (!c) return {};
  return { name: c.name, intro: c.intro, areas: c.areas, industries: c.industries };
}
