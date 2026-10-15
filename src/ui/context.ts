import { createContext, useContext, useSyncExternalStore } from "react";
import type { Game } from "../game";
import { translate, type TKey } from "../i18n";

export const GameContext = createContext<Game | null>(null);

/** Subscribes a component to game updates and returns the game plus a translator. */
export function useGame() {
  const game = useContext(GameContext)!;
  useSyncExternalStore(game.subscribe, game.getVersion);
  const t = (key: TKey, params?: Record<string, string | number>) => translate(game.lang, key, params);
  return { game, world: game.world, t };
}

export function money(n: number, lang: string): string {
  return `$${Math.round(n).toLocaleString(lang === "es" ? "es-AR" : "en-US")}`;
}

export function num(n: number, lang: string): string {
  return Math.round(n).toLocaleString(lang === "es" ? "es-AR" : "en-US");
}
