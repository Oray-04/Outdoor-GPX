"use client";
import { useEditorial } from "@/lib/repo";
export function Announcement() {
  const e = useEditorial();
  if (!e.announcementOn || !e.announcement.trim()) return null;
  return <div role="status" className="bg-ember-500 px-4 py-2 text-center text-sm font-medium text-white">{e.announcement}</div>;
}
