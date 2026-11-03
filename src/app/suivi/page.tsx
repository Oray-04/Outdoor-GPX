import { Tracker } from "@/components/tracking/tracker";
export const metadata = { title: "Suivi GPS" };
export default async function Page({ searchParams }: { searchParams: Promise<{ route?: string }> }) {
  const { route } = await searchParams;
  return <Tracker initialRouteId={route && /^[\w-]{6,64}$/.test(route) ? route : undefined} />;
}
