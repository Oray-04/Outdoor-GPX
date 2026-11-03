import { Explorer } from "@/components/explorer/explorer";

export const metadata = { title: "Explorer la carte" };

export default async function Page({ searchParams }: { searchParams: Promise<{ lng?: string; lat?: string }> }) {
  const sp = await searchParams;
  const lng = Number(sp.lng), lat = Number(sp.lat);
  const initial = Number.isFinite(lng) && Number.isFinite(lat) && sp.lng && sp.lat && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lng, lat } : undefined;
  return <Explorer initial={initial} />;
}
