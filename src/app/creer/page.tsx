import { Editor } from "@/components/editor/editor";

export const metadata = { title: "Créer un parcours" };

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <Editor routeId={id && /^[\w-]{6,64}$/.test(id) ? id : undefined} />;
}
