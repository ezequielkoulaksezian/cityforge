import { useEffect, useState } from "react";
import { MAX_LEVEL, START_YEAR, TOOLS, VALVE_LIMIT, ZONE_LEVELS, type Difficulty, type Speed, type ToolId } from "../sim/constants";
import { K, T } from "../sim/types";
import { growthScore, footprintAverage } from "../sim/zones";
import { isRail, isRoad } from "../sim/world";
import type { TKey } from "../i18n";
import { money, num, useGame } from "./context";
import { ToolIcon } from "./icons";
import { Panels, type PanelId } from "./Panels";
import { StartScreen } from "./StartScreen";

const GROUPS: { key: TKey; tools: ToolId[] }[] = [
  { key: "toolgroup.tools", tools: ["query", "bulldoze"] },
  { key: "toolgroup.transport", tools: ["road", "rail", "power"] },
  { key: "toolgroup.zones", tools: ["R", "C", "I", "park"] },
  { key: "toolgroup.services", tools: ["police", "fire"] },
  { key: "toolgroup.power", tools: ["coal", "nuclear"] },
  { key: "toolgroup.special", tools: ["stadium", "seaport", "airport"] },
];

const ZONE_COLORS: Partial<Record<ToolId, string>> = { R: "#4ade80", C: "#60a5fa", I: "#facc15" };

export function GameUI({ onNewWorld }: { onNewWorld: (o: { name: string; difficulty: Difficulty; seed: number }) => void }) {
  const { game } = useGame();
  const [panel, setPanel] = useState<PanelId | null>(null);
  const [newCity, setNewCity] = useState(false);

  return (
    <>
      <Hud panel={panel} onPanel={(p) => setPanel(panel === p ? null : p)} />
      <Toolbar />
      <Messages />
      <QueryPanel />
      <PointerTip />
      {panel && <Panels panel={panel} onClose={() => setPanel(null)} onNewCity={() => setNewCity(true)} />}
      {newCity && (
        <StartScreen
          lang={game.lang}
          onLang={(l) => game.setLang(l)}
          onStart={(opts) => {
            onNewWorld(opts);
            setNewCity(false);
            setPanel(null);
          }}
          onContinue={() => setNewCity(false)}
          onClose={() => setNewCity(false)}
        />
      )}
    </>
  );
}

function Hud({ panel, onPanel }: { panel: PanelId | null; onPanel: (p: PanelId) => void }) {
  const { game, world, t } = useGame();
  const c = world.census;
  const month = world.month % 12;
  const year = START_YEAR + Math.floor(world.month / 12);
  const speeds: { s: Speed; key: TKey; icon: string }[] = [
    { s: 0, key: "hud.pause", icon: "❚❚" },
    { s: 1, key: "hud.slow", icon: "▶" },
    { s: 2, key: "hud.normal", icon: "▶▶" },
    { s: 3, key: "hud.fast", icon: "▶▶▶" },
  ];
  const menus: { id: PanelId; key: TKey }[] = [
    { id: "budget", key: "menu.budget" },
    { id: "evaluation", key: "menu.evaluation" },
    { id: "graphs", key: "menu.graphs" },
    { id: "maps", key: "menu.maps" },
    { id: "disasters", key: "menu.disasters" },
    { id: "file", key: "menu.file" },
    { id: "options", key: "menu.options" },
    { id: "help", key: "menu.help" },
  ];
  return (
    <header className="hud">
      <div className="hud-city">
        <strong>{world.name}</strong>
        <span>
          {t(`month.${month}` as TKey)} {year} · {t(`class.${world.cityClass}` as TKey)}
        </span>
      </div>
      <div className="hud-stat">
        <span>{t("hud.funds")}</span>
        <strong className={world.funds < 1000 ? "low" : ""}>{money(world.funds, game.lang)}</strong>
      </div>
      <div className="hud-stat">
        <span>{t("hud.population")}</span>
        <strong>{num(c.residents, game.lang)}</strong>
      </div>
      <div className="rci" title={t("hud.demand")}>
        {(["R", "C", "I"] as const).map((k) => {
          const v = world.valves[k] / VALVE_LIMIT[k];
          return (
            <div key={k} className="rci-bar">
              <div className="rci-track">
                <div
                  className={`rci-fill ${k}`}
                  style={{
                    height: `${Math.abs(v) * 50}%`,
                    bottom: v >= 0 ? "50%" : `${50 - Math.abs(v) * 50}%`,
                  }}
                />
              </div>
              <span>{k}</span>
            </div>
          );
        })}
      </div>
      <div className="speeds">
        {speeds.map((s) => (
          <button
            key={s.s}
            className={game.speed === s.s ? "on" : ""}
            title={t(s.key)}
            aria-label={t(s.key)}
            onClick={() => game.setSpeed(s.s)}
          >
            {s.icon}
          </button>
        ))}
      </div>
      <nav className="menus">
        {menus.map((m) => (
          <button key={m.id} className={panel === m.id ? "on" : ""} onClick={() => onPanel(m.id)}>
            {t(m.key)}
          </button>
        ))}
      </nav>
    </header>
  );
}

function Toolbar() {
  const { game, t } = useGame();
  return (
    <aside className="toolbar">
      {GROUPS.map((g) => (
        <div key={g.key} className="tool-group">
          <span className="tool-group-name">{t(g.key)}</span>
          <div className="tool-grid">
            {g.tools.map((id) => {
              const def = TOOLS.find((x) => x.id === id)!;
              return (
                <button
                  key={id}
                  className={`tool ${game.tool === id ? "on" : ""}`}
                  onClick={() => game.setTool(id)}
                  style={ZONE_COLORS[id] ? ({ "--zone": ZONE_COLORS[id] } as React.CSSProperties) : undefined}
                  aria-label={t(`tool.${id}` as TKey)}
                >
                  <ToolIcon id={id} />
                  <span className="tool-tip">
                    <strong>{t(`tool.${id}` as TKey)}</strong>
                    {def.cost > 0 && <em>{money(def.cost, game.lang)}</em>}
                    <kbd>{def.key.toUpperCase()}</kbd>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

function Messages() {
  const { game, world, t } = useGame();
  const recent = world.messages.slice(-5).reverse();
  return (
    <section className="messages" aria-live="polite">
      {recent.map((m) => {
        const params = { ...m.params };
        if (m.key === "classUp" && params.cls) params.cls = t(`class.${params.cls}` as TKey);
        const year = START_YEAR + Math.floor(m.month / 12);
        return (
          <button
            key={m.id}
            className={`msg ${m.severity}`}
            onClick={() => m.x !== undefined && m.y !== undefined && game.focusTile(m.x, m.y)}
          >
            <span className="msg-date">
              {t(`month.${m.month % 12}` as TKey)} {year}
            </span>
            {t(`msg.${m.key}` as TKey, params)}
          </button>
        );
      })}
    </section>
  );
}

function QueryPanel() {
  const { game, world, t } = useGame();
  const s = game.selected;
  if (!s || game.tool !== "query") return null;
  const i = world.idx(s.x, s.y);
  const b = world.buildingAt(s.x, s.y);
  const k = world.kind[i];
  const rows: [string, string][] = [];
  let title: string;
  if (b) {
    title = t(`tool.${b.type}` as TKey);
    const zone = b.type === "R" || b.type === "C" || b.type === "I";
    if (zone) {
      const max = MAX_LEVEL[b.type as "R" | "C" | "I"];
      const lvl = b.level === 0 ? t("level.empty") : b.level >= max - 1 ? t("level.high") : b.level >= 2 ? t("level.mid") : t("level.low");
      rows.push([t("query.level"), `${lvl} (${b.level}/${max})`]);
      const amount = ZONE_LEVELS[b.type as "R" | "C" | "I"][b.level];
      rows.push([b.type === "R" ? t("query.residents") : t("query.jobs"), num(amount, game.lang)]);
      rows.push([t("query.transport"), b.transport ? t("query.yes") : t("query.no")]);
      const score = growthScore(world, b);
      rows.push([t("query.growth"), score > 10 ? t("query.growing") : score < -10 ? t("query.declining") : t("query.stable")]);
    }
    rows.push([t("query.powered"), b.powered ? t("query.yes") : t("query.no")]);
    rows.push([t("query.landValue"), num(footprintAverage(world, world.landValue, b), game.lang)]);
    rows.push([t("query.pollution"), num(footprintAverage(world, world.pollution, b), game.lang)]);
    rows.push([t("query.crime"), num(footprintAverage(world, world.crime, b), game.lang)]);
  } else {
    if (world.terrain[i] === T.Water && !isRoad(k)) title = t("query.water");
    else if (isRoad(k)) title = t("query.road");
    else if (isRail(k)) title = t("query.rail");
    else if (k === K.Power) title = t("query.powerLine");
    else if (k === K.Park) title = t("query.park");
    else if (k === K.Rubble) title = t("query.rubble");
    else if (k === K.Radioactive) title = t("query.radioactive");
    else if (world.terrain[i] === T.Forest) title = t("query.forest");
    else title = t("query.empty");
    if (isRoad(k)) rows.push([t("query.traffic"), num(world.traffic[i], game.lang)]);
    if (world.terrain[i] !== T.Water) {
      rows.push([t("query.landValue"), num(world.landValue[i], game.lang)]);
      rows.push([t("query.pollution"), num(world.pollution[i], game.lang)]);
      rows.push([t("query.crime"), num(world.crime[i], game.lang)]);
    }
  }
  return (
    <aside className="query">
      <div className="panel-head">
        <strong>{title}</strong>
        <button className="x" onClick={() => game.clearSelection()} aria-label={t("common.close")}>
          ×
        </button>
      </div>
      <dl>
        {rows.map(([a, v]) => (
          <div key={a}>
            <dt>{a}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="coords">
        {s.x}, {s.y}
      </p>
    </aside>
  );
}

/** Cost preview next to the pointer and short feedback after building. */
function PointerTip() {
  const { game, t } = useGame();
  const [, force] = useState(0);
  const fb = game.feedback;
  useEffect(() => {
    if (!fb) return;
    const id = setTimeout(() => force((n) => n + 1), 1300);
    return () => clearTimeout(id);
  }, [fb]);
  const p = game.preview;
  const showFb = fb && performance.now() - fb.at < 1200;
  return (
    <>
      {p && p.cost > 0 && (
        <div className={`tip ${p.ok ? "" : "bad"}`} style={{ left: p.clientX + 16, top: p.clientY + 16 }}>
          {money(p.cost, game.lang)}
        </div>
      )}
      {showFb && (
        <div className={`toast ${fb.text === "cost" ? "" : "bad"}`} style={{ left: fb.x, top: fb.y - 30 }}>
          {fb.text === "cost" ? `−${money(fb.cost ?? 0, game.lang)}` : t(`err.${fb.text}` as TKey)}
        </div>
      )}
    </>
  );
}
