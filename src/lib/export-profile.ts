/** Export du profil (SVG affiché) en image PNG ou en PDF. */
async function svgToCanvas(svg: SVGSVGElement, scale = 2): Promise<HTMLCanvasElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const w = svg.width.baseVal.value, h = svg.height.baseVal.value;
  clone.setAttribute("width", String(w)); clone.setAttribute("height", String(h));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error("Rendu du profil impossible")); img.src = url; });
    const c = document.createElement("canvas"); c.width = w * scale; c.height = h * scale;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

export async function chartToPng(svg: SVGSVGElement): Promise<Blob> {
  const c = await svgToCanvas(svg);
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("Export PNG impossible"))), "image/png"));
}

export interface PdfMeta { title: string; lines: string[] }
export async function chartToPdf(svg: SVGSVGElement, meta: PdfMeta): Promise<Blob> {
  const [{ jsPDF }, canvas] = await Promise.all([import("jspdf"), svgToCanvas(svg)]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(18); doc.text(meta.title, 15, 20);
  doc.setFontSize(10); meta.lines.forEach((l, i) => doc.text(l, 15, 28 + i * 5));
  const imgW = 267, imgH = (canvas.height / canvas.width) * imgW;
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 15, 30 + meta.lines.length * 5, imgW, imgH);
  doc.setFontSize(8); doc.setTextColor(120); doc.text("Crête — profil altimétrique. Altitudes : IGN (RGE ALTI).", 15, 200);
  return doc.output("blob");
}
