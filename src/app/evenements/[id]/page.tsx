import { EventPage } from "@/components/events/event-page";
export const metadata = { title: "Événement" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <EventPage id={id} />; }
