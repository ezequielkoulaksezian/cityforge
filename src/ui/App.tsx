import { useEffect, useRef, useState } from "react";
import { Game } from "../game";
import { detectLang, type Lang } from "../i18n";
import type { Difficulty } from "../sim/constants";
import { AUTOSAVE_SLOT, loadFromSlot } from "../sim/save";
import { demoCity } from "../sim/demo";
import { translate } from "../i18n";
import { World } from "../sim/world";
import { GameContext } from "./context";
import { GameUI } from "./GameUI";
import { StartScreen } from "./StartScreen";

function newWorld(opts: { name: string; difficulty: Difficulty; seed: number }): World {
  const w = new World(opts);
  w.notify("welcome", "info", { params: { name: opts.name }, cooldown: 0 });
  return w;
}

/** Shows the new-city screen first, then mounts the 3D game on a full-screen canvas. */
export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [lang, setLang] = useState<Lang>(detectLang);
  const [pending, setPending] = useState<World | null>(() =>
    new URLSearchParams(location.search).has("demo") ? demoCity(translate(detectLang(), "new.demoName")) : null,
  );

  useEffect(() => {
    if (!pending || !canvas.current) return;
    const g = new Game(canvas.current, pending);
    g.lang = lang;
    setGame(g);
    return () => g.dispose();
  }, [pending]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const changeLang = (l: Lang) => {
    setLang(l);
    try {
      localStorage.setItem("cityforge.lang", l);
    } catch {}
  };

  return (
    <>
      <canvas ref={canvas} className="scene" />
      {!pending && (
        <StartScreen
          lang={lang}
          onLang={changeLang}
          onStart={(opts) => setPending(newWorld(opts))}
          onContinue={() => {
            const w = loadFromSlot(AUTOSAVE_SLOT);
            if (w) setPending(w);
          }}
          onDemo={() => setPending(demoCity(translate(lang, "new.demoName")))}
        />
      )}
      {game && (
        <GameContext.Provider value={game}>
          <GameUI onNewWorld={(opts) => game.loadWorld(newWorld(opts))} />
        </GameContext.Provider>
      )}
    </>
  );
}
