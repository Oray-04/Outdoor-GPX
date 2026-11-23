"use client";
/**
 * Image importée (bandeau, carte des coureurs) : réduite dans le navigateur et intégrée à la page en JPEG,
 * sous une taille maximale — jamais envoyée à un service tiers, jamais référencée par une adresse externe.
 */
export async function imageToDataUrl(f: File, o: { maxChars: number; widths?: number[] }): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) throw new Error("Format accepté : JPEG, PNG ou WebP.");
  if (f.size > 20 * 1024 * 1024) throw new Error("Image trop lourde (20 Mo au plus).");
  const url = URL.createObjectURL(f);
  try {
    const img = new Image(); await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("Image illisible.")); img.src = url; });
    for (const w of o.widths ?? [1600, 1400, 1200, 1000]) for (const q of [0.85, 0.75, 0.65]) {
      const k = Math.min(1, w / img.naturalWidth), c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const g = c.getContext("2d")!; g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL("image/jpeg", q); if (data.length <= o.maxChars) return data;
    }
    throw new Error("Image trop détaillée : essayez une image plus petite.");
  } finally { URL.revokeObjectURL(url); }
}
