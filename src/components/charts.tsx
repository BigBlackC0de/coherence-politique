"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, LabelList } from "recharts";

/**
 * Graphiques partagés (Recharts). Les couleurs des partis viennent de la configuration (identité fixe) ;
 * les couleurs de statut (pour / contre / abstention) des jetons CSS. Les textes utilisent les jetons d'encre.
 */

export interface Slice {
  id?: string;
  name: string;
  value: number;
  color: string;
  hint?: string;
  /** Lien ouvert au clic (les composants sont des Client Components : pas de fonction en prop). */
  href?: string;
}

export type NumberFormat = "int" | "pct" | "fixed2" | "signed2";
const formatters: Record<NumberFormat, (v: number) => string> = {
  int: (v) => v.toLocaleString("fr-FR"),
  pct: (v) => `${(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`,
  fixed2: (v) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  signed2: (v) => `${v > 0 ? "+" : ""}${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
};

const fmt = (n: number) => n.toLocaleString("fr-FR");

function ChartTooltip({ active, payload, total, unit }: { active?: boolean; payload?: { payload: Slice }[]; total?: number; unit?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="flex items-center gap-1.5 font-medium">
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
        {d.name}
      </div>
      <div className="num text-ink-2">
        {fmt(d.value)}
        {unit ? ` ${unit}` : ""}
        {total ? ` · ${((d.value / total) * 100).toFixed(0)} %` : ""}
      </div>
      {d.hint && <div className="text-ink-3 mt-0.5">{d.hint}</div>}
    </div>
  );
}

/** Anneau (part d'un tout), avec libellé central et légende. */
export function Donut({ data, centerLabel, centerValue, height = 220, unit, legend = true }: { data: Slice[]; centerLabel?: string; centerValue?: string; height?: number; unit?: string; legend?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const router = useRouter();
  const shown = data.filter((d) => d.value > 0);
  const total = shown.reduce((a, d) => a + d.value, 0);
  if (!total) return <p className="text-sm text-ink-3 text-center py-6">Aucune donnée.</p>;
  const current = active !== null ? shown[active] : null;
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] items-center">
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={shown.length > 1 ? 1.5 : 0} stroke="var(--surface)" strokeWidth={2} isAnimationActive onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}>
              {shown.map((d, i) => (
                <Cell key={i} fill={d.color} opacity={active === null || active === i ? 1 : 0.4} style={{ cursor: d.href ? "pointer" : "default", transition: "opacity .15s" }} onClick={() => d.href && router.push(d.href)} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip total={total} unit={unit} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <div className="text-xl font-semibold num leading-tight">{current ? `${((current.value / total) * 100).toFixed(0)} %` : (centerValue ?? fmt(total))}</div>
          <div className="text-[11px] text-ink-3 max-w-[70%] truncate">{current ? current.name : centerLabel}</div>
        </div>
      </div>
      {legend && (
        <ul className="text-xs space-y-1 min-w-[140px]">
          {shown.map((d, i) => (
            <li key={i} className="flex items-center gap-2 cursor-default" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="truncate text-ink-2">{d.name}</span>
              <span className="ml-auto num text-ink-3">{((d.value / total) * 100).toFixed(0)} %</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Hémicycle : demi-anneau, sièges par parti de gauche à droite. */
export function Hemicycle({ data, total, title, height = 200 }: { data: Slice[]; total?: number; title?: string; height?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const router = useRouter();
  const shown = data.filter((d) => d.value > 0);
  const sum = total ?? shown.reduce((a, d) => a + d.value, 0);
  if (!sum) return <p className="text-sm text-ink-3 text-center py-6">Aucune donnée.</p>;
  const current = active !== null ? shown[active] : null;
  return (
    <div>
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={shown} dataKey="value" nameKey="name" startAngle={180} endAngle={0} cy="88%" innerRadius="58%" outerRadius="100%" paddingAngle={0.8} stroke="var(--surface)" strokeWidth={1.5} isAnimationActive onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}>
              {shown.map((d, i) => (
                <Cell key={i} fill={d.color} opacity={active === null || active === i ? 1 : 0.4} style={{ transition: "opacity .15s", cursor: d.id ? "pointer" : "default" }} onClick={() => d.id && router.push(`/partis/${d.id}`)} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip total={sum} unit="sièges" />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute left-0 right-0 bottom-0 text-center pointer-events-none">
          <div className="text-2xl font-semibold num leading-none">{current ? fmt(current.value) : fmt(sum)}</div>
          <div className="text-[11px] text-ink-3">{current ? current.name : (title ?? "sièges")}</div>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-[11px] mt-2">
        {shown.map((d, i) => (
          <li key={i} className="inline-flex items-center gap-1 text-ink-2" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: d.color }} />
            {d.name} <span className="num text-ink-3">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface HBarItem {
  id?: string;
  name: string;
  value: number;
  color: string;
  hint?: string;
  href?: string;
}

/** Barres horizontales triées (une mesure, identités colorées). */
export function HBars({ data, max, format: fmtKey = "int", height, barSize = 14 }: { data: HBarItem[]; max?: number; format?: NumberFormat; height?: number; barSize?: number }) {
  const router = useRouter();
  const format = formatters[fmtKey];
  const h = height ?? Math.max(120, data.length * (barSize + 14) + 24);
  const domainMax = max ?? Math.max(...data.map((d) => d.value), 0.0001);
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} strokeDasharray="2 4" />
          <XAxis type="number" domain={[0, domainMax]} hide />
          <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-2)", fontSize: 12 }} />
          <Tooltip cursor={{ fill: "color-mix(in srgb, var(--ink) 5%, transparent)" }} content={({ active, payload }) => (active && payload?.length ? <div className="chart-tooltip"><div className="font-medium">{(payload[0].payload as HBarItem).name}</div><div className="num text-ink-2">{format((payload[0].payload as HBarItem).value)}</div>{(payload[0].payload as HBarItem).hint && <div className="text-ink-3">{(payload[0].payload as HBarItem).hint}</div>}</div> : null)} />
          <Bar dataKey="value" barSize={barSize} radius={[0, 6, 6, 0]} isAnimationActive>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} style={{ cursor: d.href ? "pointer" : "default" }} onClick={() => d.href && router.push(d.href)} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(v: unknown) => format(Number(v))} style={{ fill: "var(--ink-2)", fontSize: 11, fontVariantNumeric: "tabular-nums" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barres divergentes autour de zéro (positions −1 … +1). */
export function DivergingBars({ data, leftLabel, rightLabel, height, barSize = 14 }: { data: HBarItem[]; leftLabel?: string; rightLabel?: string; height?: number; barSize?: number }) {
  const h = height ?? Math.max(120, data.length * (barSize + 14) + 40);
  const f = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
  return (
    <div>
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} strokeDasharray="2 4" />
            <XAxis type="number" domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} tickFormatter={(v: number) => f(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-2)", fontSize: 12 }} />
            <ReferenceLine x={0} stroke="var(--ink-3)" />
            <Tooltip cursor={{ fill: "color-mix(in srgb, var(--ink) 5%, transparent)" }} content={({ active, payload }) => (active && payload?.length ? <div className="chart-tooltip"><div className="font-medium">{(payload[0].payload as HBarItem).name}</div><div className="num text-ink-2">{f((payload[0].payload as HBarItem).value)}</div>{(payload[0].payload as HBarItem).hint && <div className="text-ink-3">{(payload[0].payload as HBarItem).hint}</div>}</div> : null)} />
            <Bar dataKey="value" barSize={barSize} radius={4} isAnimationActive>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
              <LabelList dataKey="value" position="right" formatter={(v: unknown) => f(Number(v))} style={{ fill: "var(--ink-2)", fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between text-[11px] text-ink-3 px-[118px] -mt-1">
          <span className="truncate max-w-[45%]">← {leftLabel}</span>
          <span className="truncate max-w-[45%] text-right">{rightLabel} →</span>
        </div>
      )}
    </div>
  );
}

export interface StackRow {
  name: string;
  id?: string;
  color?: string;
  pour: number;
  contre: number;
  abstention: number;
  nonVotant?: number;
}

/** Barres empilées 100 % : répartition pour / contre / abstention par groupe. */
export function VoteStacks({ rows, height }: { rows: StackRow[]; height?: number }) {
  const data = rows.map((r) => {
    const t = r.pour + r.contre + r.abstention + (r.nonVotant ?? 0) || 1;
    return { ...r, pPour: (r.pour / t) * 100, pContre: (r.contre / t) * 100, pAbst: (r.abstention / t) * 100, pNv: ((r.nonVotant ?? 0) / t) * 100 };
  });
  const h = height ?? Math.max(120, rows.length * 28 + 24);
  return (
    <div>
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 4 }} barCategoryGap={6} stackOffset="none">
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} tick={{ fill: "var(--ink-2)", fontSize: 12 }} />
            <Tooltip cursor={{ fill: "color-mix(in srgb, var(--ink) 5%, transparent)" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as StackRow;
              return (
                <div className="chart-tooltip">
                  <div className="font-medium flex items-center gap-1.5">{r.color && <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />}{r.name}</div>
                  <div className="num text-ink-2">
                    <span className="text-good">{r.pour} pour</span> · <span className="text-bad">{r.contre} contre</span> · <span className="text-warn">{r.abstention} abst.</span>
                    {r.nonVotant ? <span className="text-ink-3"> · {r.nonVotant} non votant{r.nonVotant > 1 ? "s" : ""}</span> : null}
                  </div>
                </div>
              );
            }} />
            <Bar dataKey="pPour" stackId="v" fill="var(--good)" stroke="var(--surface)" strokeWidth={1} isAnimationActive radius={[4, 0, 0, 4]} />
            <Bar dataKey="pContre" stackId="v" fill="var(--bad)" stroke="var(--surface)" strokeWidth={1} isAnimationActive />
            <Bar dataKey="pAbst" stackId="v" fill="var(--warn)" stroke="var(--surface)" strokeWidth={1} isAnimationActive />
            <Bar dataKey="pNv" stackId="v" fill="var(--neutral)" stroke="var(--surface)" strokeWidth={1} isAnimationActive radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-ink-2 mt-1">
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-good inline-block" /> pour</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-bad inline-block" /> contre</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-warn inline-block" /> abstention</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-neutral inline-block" /> non votant</span>
      </div>
    </div>
  );
}
