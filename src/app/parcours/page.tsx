import { Library } from "@/components/library/library";
export const metadata = { title: "Bibliothèque de parcours" };
export default async function Page({ searchParams }: { searchParams: Promise<{ sport?: string }> }) {
  const { sport } = await searchParams;
  return <Library initialSport={sport} />;
}
