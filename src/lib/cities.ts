export type CityData = {
  slug: string;
  name: string;
  state: "Andhra Pradesh" | "Telangana";
  stateCode: "IN-AP" | "IN-TG";
  geo: string; // "lat;lng"
  intro: string;
  areas: string[];
  industries: string[];
};

export const CITIES: CityData[] = [
  {
    slug: "hyderabad",
    name: "Hyderabad",
    state: "Telangana",
    stateCode: "IN-TG",
    geo: "17.3850;78.4867",
    intro:
      "Hyderabad's IT corridors, hospitals, schools and retail chains run on Punchly's biometric attendance — face-biometric selfie + GPS instead of fingerprint hardware.",
    areas: ["HITEC City", "Gachibowli", "Madhapur", "Kondapur", "Banjara Hills", "Jubilee Hills", "Kukatpally", "Secunderabad", "Begumpet", "Ameerpet"],
    industries: ["IT & ITES", "Hospitals", "Schools & Colleges", "Retail chains", "Pharma", "Real estate"],
  },
  {
    slug: "vijayawada",
    name: "Vijayawada",
    state: "Andhra Pradesh",
    stateCode: "IN-AP",
    geo: "16.5062;80.6480",
    intro:
      "Vijayawada businesses, schools and field teams across Krishna district use Punchly biometric attendance to replace bulky fingerprint machines.",
    areas: ["Benz Circle", "MG Road", "Governorpet", "Patamata", "Auto Nagar", "Gunadala", "Kanuru", "Tadepalli"],
    industries: ["Schools & junior colleges", "Hospitals", "Logistics", "Retail", "Construction", "Government contractors"],
  },
  {
    slug: "visakhapatnam",
    name: "Visakhapatnam",
    state: "Andhra Pradesh",
    stateCode: "IN-AP",
    geo: "17.6868;83.2185",
    intro:
      "Vizag offices, port-side logistics teams and coastal schools run staff attendance on Punchly — biometric face + GPS check-in from any phone.",
    areas: ["MVP Colony", "Dwaraka Nagar", "Siripuram", "Madhurawada", "Gajuwaka", "Rushikonda", "Asilmetta", "Seethammadhara"],
    industries: ["Port & logistics", "Steel & manufacturing", "IT (Rushikonda)", "Hospitals", "Schools", "Tourism & hospitality"],
  },
  {
    slug: "guntur",
    name: "Guntur",
    state: "Andhra Pradesh",
    stateCode: "IN-AP",
    geo: "16.3067;80.4365",
    intro:
      "Guntur schools, chilli/tobacco trading firms and clinics manage daily haajaru (attendance) with Punchly biometric — no fingerprint device needed.",
    areas: ["Brodipet", "Arundelpet", "Lakshmipuram", "Nallapadu", "Pattabhipuram", "Mangalagiri", "Tadepalli"],
    industries: ["Schools & coaching centres", "Agri trade", "Hospitals", "Textile retail", "Government offices"],
  },
  {
    slug: "tirupati",
    name: "Tirupati",
    state: "Andhra Pradesh",
    stateCode: "IN-AP",
    geo: "13.6288;79.4192",
    intro:
      "Tirupati educational institutions, hospitals and hospitality teams use Punchly biometric attendance with GPS geofence around each campus and hotel.",
    areas: ["Tirumala", "Alipiri", "Renigunta", "Sri City corridor", "Tiruchanoor", "Chandragiri"],
    industries: ["Universities & schools", "Hospitality", "Hospitals", "Manufacturing (Sri City)", "Temple trust contractors"],
  },
  {
    slug: "warangal",
    name: "Warangal",
    state: "Telangana",
    stateCode: "IN-TG",
    geo: "17.9689;79.5941",
    intro:
      "Warangal schools, NIT-area startups and district offices track staff on Punchly biometric attendance — works on any Android phone, no hardware to buy.",
    areas: ["Hanamkonda", "Kazipet", "KUC", "Mulugu Road", "Subedari", "Fort Warangal"],
    industries: ["Schools & colleges", "Hospitals", "Textiles & handlooms", "Government offices", "Retail"],
  },
];

export function getCity(slug: string): CityData | undefined {
  return CITIES.find((c) => c.slug === slug);
}
