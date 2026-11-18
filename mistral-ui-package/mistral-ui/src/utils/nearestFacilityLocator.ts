export type GeoPoint = { lat: number; lon: number };

export type ReferralFacility = {
  hospitalName: string;
  specialistName: string;
  phone: string;
  address: string;
  lat: number;
  lon: number;
};

export type NearestFacilityResult = {
  hospitalName: string;
  specialistName: string;
  phone: string;
  distanceKm: number;
  address: string;
  directionsUrl: string;
};

const VILLAGE_COORDS: Record<string, GeoPoint> = {
  satara: { lat: 17.6805, lon: 74.0183 },
  karad: { lat: 17.289, lon: 74.181 },
  phaltan: { lat: 17.991, lon: 74.432 },
  wai: { lat: 17.952, lon: 73.891 },
  mahabaleshwar: { lat: 17.9307, lon: 73.6477 },
  koregaon: { lat: 17.699, lon: 74.159 },
  patan: { lat: 17.375, lon: 73.901 },
  pune: { lat: 18.5204, lon: 73.8567 },
  sangli: { lat: 16.8524, lon: 74.5815 },
  kolhapur: { lat: 16.705, lon: 74.2433 },
};

const FACILITIES: ReferralFacility[] = [
  {
    hospitalName: "Satara District Civil Hospital",
    specialistName: "Dr. Anjali Deshmukh, Pulmonology on-call",
    phone: "+912162234500",
    address: "Civil Hospital Campus, Sadar Bazar, Satara",
    lat: 17.6859,
    lon: 74.021,
  },
  {
    hospitalName: "Krishna Hospital & Medical College, Karad",
    specialistName: "Dr. Rohan Patil, Respiratory Medicine",
    phone: "+912164241555",
    address: "Malkapur, Karad, Satara district",
    lat: 17.2895,
    lon: 74.1819,
  },
  {
    hospitalName: "Sassoon General Hospital, Pune",
    specialistName: "Dr. Meera Kulkarni, Chest Medicine",
    phone: "+912026102345",
    address: "Jai Prakash Narayan Road, Pune",
    lat: 18.528,
    lon: 73.872,
  },
  {
    hospitalName: "Wanless Hospital, Miraj",
    specialistName: "Dr. Sameer Jadhav, Pulmonologist",
    phone: "+912332221144",
    address: "Miraj, Sangli district",
    lat: 16.8302,
    lon: 74.641,
  },
];

export function calculateDistanceKm(from: GeoPoint, to: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return earthKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function lookupVillage(village?: string | null, district?: string | null): GeoPoint {
  const hay = `${village ?? ""} ${district ?? ""}`.toLowerCase();
  for (const [key, point] of Object.entries(VILLAGE_COORDS)) {
    if (hay.includes(key)) return point;
  }
  return VILLAGE_COORDS.satara;
}

export function locateNearestFacility(args: {
  village?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): NearestFacilityResult {
  const origin: GeoPoint =
    args.latitude != null && args.longitude != null
      ? { lat: args.latitude, lon: args.longitude }
      : lookupVillage(args.village, args.district);
  let best = FACILITIES[0];
  let bestKm = calculateDistanceKm(origin, best);
  for (const facility of FACILITIES.slice(1)) {
    const km = calculateDistanceKm(origin, facility);
    if (km < bestKm) {
      best = facility;
      bestKm = km;
    }
  }
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}&destination=${best.lat},${best.lon}&travelmode=driving`;
  return {
    hospitalName: best.hospitalName,
    specialistName: best.specialistName,
    phone: best.phone,
    distanceKm: Math.round(bestKm * 10) / 10,
    address: best.address,
    directionsUrl,
  };
}
