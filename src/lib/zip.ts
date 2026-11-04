/** Archive ZIP de plusieurs fichiers (chargée à la demande). */
export async function makeZip(files: { name: string; content: string }[]): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip(); const used = new Set<string>();
  for (const f of files) { let n = f.name, i = 2; while (used.has(n)) n = f.name.replace(/(\.[^.]+)$/, `-${i++}$1`); used.add(n); zip.file(n, f.content); }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
