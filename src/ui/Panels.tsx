import { useRef, useState } from "react";
import { MAX_TAX } from "../sim/constants";
import { projectedTaxIncome, requestedBudget } from "../sim/budget";
import type { DisasterId } from "../sim/disasters";
import { deserialize, loadFromSlot, saveToSlot, serialize, slotInfo, AUTOSAVE_SLOT } from "../sim/save";
import type { History } from "../sim/types";
import type { OverlayId } from "../render/cityView";
import type { Lang, TKey } from "../i18n";
import { money, num, useGame } from "./context";

export type PanelId = "budget" | "evaluation" | "graphs" | "maps" | "disasters" | "file" | "options" | "help";

export function Panels({ panel, onClose, onNewCity }: { panel: PanelId; onClose: () => void; onNewCity: () => void }) {
  const { t } = useGame();
  const titles: Record<PanelId, TKey> = {
    budget: "budget.title",
    evaluation: "eval.title",
    graphs: "graph.title",
    maps: "menu.maps",
    disasters: "menu.disasters",
    file: "file.title",
    options: "options.title",
    help: "help.title",
  };
  return (
    <section className="panel" role="dialog" aria-label={t(titles[panel])}>
      <div className="panel-head">
        <h2>{t(titles[panel])}</h2>
        <button className="x" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>
      </div>
      <div className="panel-body">
        {panel === "budget" && <Budget />}
        {panel === "evaluation" && <EvaluationPanel />}
        {panel === "graphs" && <Graphs />}
        {panel === "maps" && <Maps />}
        {panel === "disasters" && <Disasters onDone={onClose} />}
        {panel === "file" && <FilePanel onNewCity={onNewCity} onClose={onClose} />}
        {panel === "options" && <Options />}
        {panel === "help" && <Help />}
      </div>
    </section>
  );
}

function Budget() {
  const { game, world, t } = useGame();
  const req = requestedBudget(world);
  const income = projectedTaxIncome(world);
  const rows: { key: "police" | "fire" | "transport"; label: TKey }[] = [
    { key: "police", label: "budget.police" },
    { key: "fire", label: "budget.fireDept" },
    { key: "transport", label: "budget.transport" },
  ];
  const spend = rows.reduce((s, r) => s + Math.round((req[r.key] * world.funding[r.key]) / 100), 0);
  const last = world.lastBudget;
  return (
    <div className="budget">
      <label className="slider">
        <span>
          {t("budget.tax")} <strong>{world.tax}%</strong>
        </span>
        <input type="range" min={0} max={MAX_TAX} value={world.tax} onChange={(e) => game.setTax(+e.target.value)} />
        <small>{t("budget.taxHint")}</small>
      </label>
      <table>
        <thead>
          <tr>
            <th />
            <th>{t("budget.requested")}</th>
            <th>{t("budget.funded")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{t(r.label)}</td>
              <td>{money(req[r.key], game.lang)}</td>
              <td>
                <div className="fund">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={world.funding[r.key]}
                    onChange={(e) => game.setFunding(r.key, +e.target.value)}
                  />
                  <span>{world.funding[r.key]}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="totals">
        <div>
          <dt>{t("budget.income")}</dt>
          <dd>{money(income, game.lang)}</dd>
        </div>
        <div>
          <dt>{t("budget.total")}</dt>
          <dd>−{money(spend, game.lang)}</dd>
        </div>
        <div className="strong">
          <dt>{t("budget.cashflow")}</dt>
          <dd className={income - spend < 0 ? "neg" : "pos"}>{money(income - spend, game.lang)}</dd>
        </div>
      </dl>
      {last && (
        <p className="muted">
          {t("budget.lastYear")}: {money(last.taxIncome, game.lang)} − {money(last.spent.police + last.spent.fire + last.spent.transport, game.lang)} ={" "}
          {money(last.cashflow, game.lang)}
        </p>
      )}
      <p className="muted">{t("budget.noDeficit")}</p>
    </div>
  );
}

function EvaluationPanel() {
  const { game, world, t } = useGame();
  const e = world.evaluation;
  if (!e) return <p className="muted">{t("eval.pending")}</p>;
  return (
    <div className="evaluation">
      <div className="approval">
        <p>{t("eval.approval")}</p>
        <div className="approval-bar">
          <div style={{ width: `${e.approval}%` }}>
            {t("eval.yes")} {e.approval}%
          </div>
          <span>
            {t("eval.no")} {100 - e.approval}%
          </span>
        </div>
        {e.approval < 55 && <p className="warn">{t("eval.atRisk")}</p>}
      </div>
      <h3>{t("eval.problems")}</h3>
      {e.problems.length ? (
        <ul className="problems">
          {e.problems.map((p) => (
            <li key={p.id}>
              <span>{t(`problem.${p.id}` as TKey)}</span>
              <div className="pbar">
                <div style={{ width: `${p.percent}%` }} />
              </div>
              <strong>{p.percent}%</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t("eval.noProblems")}</p>
      )}
      <h3>{t("eval.statistics")}</h3>
      <dl className="stats">
        <div>
          <dt>{t("eval.population")}</dt>
          <dd>{num(e.population, game.lang)}</dd>
        </div>
        <div>
          <dt>{t("eval.migration")}</dt>
          <dd>{(e.delta >= 0 ? "+" : "") + num(e.delta, game.lang)}</dd>
        </div>
        <div>
          <dt>{t("eval.assessed")}</dt>
          <dd>{money(e.assessedValue, game.lang)}</dd>
        </div>
        <div>
          <dt>{t("eval.category")}</dt>
          <dd>{t(`class.${e.cityClass}` as TKey)}</dd>
        </div>
        <div>
          <dt>{t("eval.score")}</dt>
          <dd>{e.score} / 1000</dd>
        </div>
      </dl>
    </div>
  );
}

const SERIES: { key: keyof History; label: TKey; color: string }[] = [
  { key: "residents", label: "graph.residents", color: "#4ade80" },
  { key: "comJobs", label: "graph.comJobs", color: "#60a5fa" },
  { key: "indJobs", label: "graph.indJobs", color: "#facc15" },
  { key: "funds", label: "graph.funds", color: "#e2e8f0" },
  { key: "crime", label: "graph.crime", color: "#f87171" },
  { key: "pollution", label: "graph.pollution", color: "#c08457" },
];

function Graphs() {
  const { world, t } = useGame();
  const [on, setOn] = useState<Set<keyof History>>(new Set(["residents", "comJobs", "indJobs"]));
  const h = world.history;
  if (h.residents.length < 2) return <p className="muted">{t("graph.empty")}</p>;
  const W = 420;
  const H = 180;
  return (
    <div className="graphs">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} className="grid" />
        ))}
        {SERIES.filter((s) => on.has(s.key)).map((s) => {
          const data = h[s.key];
          const max = Math.max(1, ...data);
          const min = Math.min(0, ...data);
          const pts = data
            .map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / (max - min)) * (H - 8) - 4}`)
            .join(" ");
          return <polyline key={s.key} points={pts} fill="none" stroke={s.color} strokeWidth={2} />;
        })}
      </svg>
      <div className="legend">
        {SERIES.map((s) => (
          <label key={s.key}>
            <input
              type="checkbox"
              checked={on.has(s.key)}
              onChange={() => {
                const next = new Set(on);
                if (next.has(s.key)) next.delete(s.key);
                else next.add(s.key);
                setOn(next);
              }}
            />
            <i style={{ background: s.color }} />
            {t(s.label)}
          </label>
        ))}
      </div>
    </div>
  );
}

const OVERLAYS: OverlayId[] = ["none", "power", "pollution", "landValue", "crime", "traffic", "density", "police", "fire"];

function Maps() {
  const { game, t } = useGame();
  return (
    <div className="maps">
      {OVERLAYS.map((o) => (
        <button key={o} className={`choice ${game.overlay === o ? "on" : ""}`} onClick={() => game.setOverlay(o)}>
          {t(`overlay.${o}` as TKey)}
        </button>
      ))}
    </div>
  );
}

const DISASTERS: DisasterId[] = ["fire", "flood", "tornado", "earthquake", "monster", "planeCrash", "meltdown"];

function Disasters({ onDone }: { onDone: () => void }) {
  const { game, world, t } = useGame();
  return (
    <div className="disasters">
      <p className="muted">{t("disaster.trigger")}</p>
      <div className="maps">
        {DISASTERS.map((d) => {
          const disabled =
            (d === "planeCrash" && !world.census.airports) || (d === "meltdown" && !world.census.nuclear);
          return (
            <button
              key={d}
              className="choice danger"
              disabled={disabled}
              onClick={() => {
                if (game.disaster(d)) onDone();
              }}
            >
              {t(`disaster.${d}` as TKey)}
            </button>
          );
        })}
      </div>
      <p className="muted">{t("disaster.note")}</p>
    </div>
  );
}

function FilePanel({ onNewCity, onClose }: { onNewCity: () => void; onClose: () => void }) {
  const { game, world, t } = useGame();
  const [, refresh] = useState(0);
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const slots = [AUTOSAVE_SLOT, 1, 2, 3];

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(serialize(world))], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${world.name.replace(/[^\w-]+/g, "_") || "city"}.cityforge.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      game.loadWorld(deserialize(JSON.parse(await file.text())));
      onClose();
    } catch {
      setNote(t("file.importError"));
    }
  };

  return (
    <div className="file">
      <button className="btn primary" onClick={onNewCity}>
        {t("file.new")}
      </button>
      <ul className="slots">
        {slots.map((s) => {
          const info = slotInfo(s);
          return (
            <li key={s}>
              <div>
                <strong>{s === AUTOSAVE_SLOT ? t("file.autosave") : `${t("file.slot")} ${s}`}</strong>
                <span>
                  {info
                    ? `${info.name} · ${num(info.population, game.lang)} · ${new Date(info.savedAt).toLocaleString(game.lang)}`
                    : t("file.empty")}
                </span>
              </div>
              {s !== AUTOSAVE_SLOT && (
                <button
                  className="btn"
                  onClick={() => {
                    saveToSlot(world, s);
                    setNote(t("file.saved"));
                    refresh((n) => n + 1);
                  }}
                >
                  {t("file.save")}
                </button>
              )}
              <button
                className="btn"
                disabled={!info}
                onClick={() => {
                  const w = loadFromSlot(s);
                  if (w) {
                    game.loadWorld(w);
                    onClose();
                  }
                }}
              >
                {t("file.load")}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row">
        <button className="btn" onClick={exportFile}>
          {t("file.export")}
        </button>
        <button className="btn" onClick={() => input.current?.click()}>
          {t("file.import")}
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
        />
      </div>
      {note && <p className="muted">{note}</p>}
    </div>
  );
}

function Options() {
  const { game, world, t } = useGame();
  return (
    <div className="options">
      <label className="check">
        <input type="checkbox" checked={world.settings.disasters} onChange={(e) => game.setDisasters(e.target.checked)} />
        {t("options.disasters")}
      </label>
      <label className="check">
        <input type="checkbox" checked={world.settings.shadows} onChange={(e) => game.setShadows(e.target.checked)} />
        {t("options.shadows")}
      </label>
      <div className="row">
        <span>{t("options.language")}</span>
        {(["es", "en"] as Lang[]).map((l) => (
          <button key={l} className={`choice ${game.lang === l ? "on" : ""}`} onClick={() => game.setLang(l)}>
            {l === "es" ? "Español" : "English"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Help() {
  const { t } = useGame();
  return (
    <div className="help">
      <p className="pre">{t("help.body")}</p>
      <h3>{t("help.controls")}</h3>
      <p className="pre">{t("help.controlsBody")}</p>
    </div>
  );
}
