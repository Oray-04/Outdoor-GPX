import { OrganizerEvent } from "@/components/organizer/organizer-event";
export const metadata = { title: "Gérer l'événement" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <OrganizerEvent id={id} />; }
