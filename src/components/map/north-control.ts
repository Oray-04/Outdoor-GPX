import type { IControl, Map as MLMap } from "maplibre-gl";

/**
 * Boussole « Nord » : apparaît dès que la carte est tournée ou inclinée (aiguille orientée vers le nord réel) ;
 * un clic remet aussitôt le nord en haut et la carte à plat. Rotation et inclinaison restent possibles.
 */
export function northControl(): IControl {
  let map: MLMap | null = null, box: HTMLDivElement | null = null, btn: HTMLButtonElement | null = null, needle: SVGElement | null = null;
  const update = () => {
    if (!map || !box || !btn || !needle) return;
    const b = map.getBearing(), p = map.getPitch(), off = Math.abs(b) > 0.5 || p > 0.5;
    box.style.display = off ? "" : "none";
    needle.style.transform = `rotate(${-b}deg)`;
    btn.title = `Revenir au nord${p > 0.5 ? " et à plat" : ""} (orientation actuelle ${Math.round(((b % 360) + 360) % 360)}°)`;
  };
  return {
    onAdd(m) {
      map = m;
      box = document.createElement("div"); box.className = "maplibregl-ctrl maplibregl-ctrl-group"; box.dataset.north = "1";
      btn = document.createElement("button"); btn.type = "button"; btn.setAttribute("aria-label", "Revenir au nord");
      btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" style="display:block;margin:auto;transition:transform .15s"><path d="M12 2.5 16 12h-8z" fill="#d4202a"/><path d="M12 21.5 8 12h8z" fill="#5f7069"/><circle cx="12" cy="12" r="1.6" fill="#fff"/></svg>`;
      needle = btn.querySelector("svg");
      btn.addEventListener("click", () => map?.easeTo({ bearing: 0, pitch: 0, duration: 250 }));
      box.append(btn);
      m.on("rotate", update); m.on("pitch", update); m.on("load", update);
      update();
      return box;
    },
    onRemove() { map?.off("rotate", update); map?.off("pitch", update); map?.off("load", update); box?.remove(); map = null; },
  };
}
