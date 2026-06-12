// Approved art lives in assets/art/ (PNG + Aseprite JSON pairs) — the only
// folder the game loads from. Vite turns these imports into hashed URLs.
//
// Current palette: "Cube" tiles recovered from the old AutoPlatformer levels
// (Weird Random Cubes set) on a plain black background. The Old Stone family
// also lives in assets/art/, approved but currently unused.
import solidUrl from "../assets/art/Cube Block.png";
import ladderUrl from "../assets/art/Cube Ladder.png";
import platformUrl from "../assets/art/Cube Platform.png";

export interface Art {
  solid: HTMLImageElement;
  ladder: HTMLImageElement;
  platform: HTMLImageElement;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function loadArt(): Promise<Art> {
  const [solid, ladder, platform] = await Promise.all([
    loadImage(solidUrl),
    loadImage(ladderUrl),
    loadImage(platformUrl),
  ]);
  return { solid, ladder, platform };
}
