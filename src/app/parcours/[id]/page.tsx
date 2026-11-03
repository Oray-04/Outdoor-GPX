import { RoutePage } from "@/components/route/route-page";
export const metadata = { title: "Fiche parcours" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoutePage id={id} />;
}
