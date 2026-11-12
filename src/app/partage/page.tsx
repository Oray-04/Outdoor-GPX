import { SharedView } from "@/components/share/shared-view";
export const metadata = { title: "Parcours partagé", robots: { index: false } };
export default function Page() { return <SharedView embed={false} />; }
