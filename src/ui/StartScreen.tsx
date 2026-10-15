import { useEffect, useMemo, useRef, useState } from "react";
import type { Difficulty } from "../sim/constants";
import { generateTerrain } from "../sim/terrain";
import { T } from "../sim/types";
import { AUTOSAVE_SLOT, slotInfo } from "../sim/save";
import { translate, type Lang } from "../i18n";

type Props = {
  lang: Lang;
  onLang: (l: Lang) => void;
  onStart: (opts: { name: string; difficulty: Difficulty; seed: number }) => void;
  onContinue: () => void;
  onDemo?: () => void;
  onClose?: () => void;
};

const SIZE = 128;

/** New-city dialog with a live preview of the generated terrain. */
export function StartScreen({ lang, onLang, onStart, onContinue, onDemo, onClose }: Props) {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const [name, setName] = useState(t("new.defaultName"));
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const canvas = useRef<HTMLCanvasElement>(null);
  const saved = useMemo(() => slotInfo(AUTOSAVE_SLOT), []);

  useEffect(() => {
    const terrain = generateTerrain(SIZE, seed);
    const ctx = canvas.current!.getContext("2d")!;
    const img = ctx.createImageData(SIZE, SIZE);
    for (let i = 0; i < SIZE * SIZE; i++) {
      const [r, g, b] =
        terrain[i] === T.Water ? [47, 111, 158] : terrain[i] === T.Forest ? [62, 112, 58] : [114, 158, 82];
      img.data.set([r, g, b, 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, [seed]);

  return (
    <div className="start">
      <div className="start-card">
        <div className="start-head">
          <div>
            <h1>
              City<span>Forge</span>
            </h1>
            <p>{t("app.tagline")}</p>
          </div>
          <div className="lang-switch">
            {(["es", "en"] as Lang[]).map((l) => (
              <button key={l} className={l === lang ? "on" : ""} onClick={() => onLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="start-body">
          <div className="start-map">
            <canvas ref={canvas} width={SIZE} height={SIZE} />
            <button className="btn ghost" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>
              ↻ {t("new.reroll")}
            </button>
          </div>
          <div className="start-form">
            <label>
              <span>{t("new.name")}</span>
              <input value={name} maxLength={28} onChange={(e) => setName(e.target.value)} />
            </label>
            <fieldset>
              <legend>{t("new.difficulty")}</legend>
              {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                <label key={d} className={`choice ${difficulty === d ? "on" : ""}`}>
                  <input type="radio" name="difficulty" checked={difficulty === d} onChange={() => setDifficulty(d)} />
                  {t(`new.${d}` as const)}
                </label>
              ))}
            </fieldset>
            <button
              className="btn primary big"
              onClick={() => onStart({ name: name.trim() || t("new.defaultName"), difficulty, seed })}
            >
              {t("new.start")}
            </button>
            {saved && (
              <button className="btn ghost" onClick={onContinue}>
                {t("new.continue")}: {saved.name}
              </button>
            )}
            {onDemo && (
              <button className="btn ghost" onClick={onDemo}>
                {t("new.demo")}
              </button>
            )}
            {onClose && (
              <button className="btn ghost" onClick={onClose}>
                {t("common.close")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
