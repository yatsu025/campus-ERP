"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const NAVY = "#0b1f4a";
const RED = "#b3261e";
const GREEN = "#17784b";
const GRID = "#e6dfd0";

const tooltipStyle = {
  background: "#fffdf9",
  border: "1px solid #d9d2c3",
  borderRadius: 8,
  fontSize: 12,
  boxShadow: "0 8px 24px -12px rgb(11 31 74 / .35)",
};

/** Subject-wise attendance %, with the 75% line. Below 75 = red bar. */
export function SubjectBars({ data, threshold = 75 }: { data: { name: string; value: number }[]; threshold?: number }) {
  return (
    <div className="h-64 w-full" role="img" aria-label="Subject-wise attendance percentage chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11, fill: "#5c6172" }} interval={0} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5c6172" }} />
          <Tooltip cursor={{ fill: "rgb(11 31 74 / .05)" }} contentStyle={tooltipStyle} formatter={(v) => [`${Number(v).toFixed(1)}%`, "Attendance"]} />
          <ReferenceLine y={threshold} stroke={RED} strokeDasharray="5 4" label={{ value: `${threshold}%`, position: "insideTopRight", fill: RED, fontSize: 11 }} />
          <Bar dataKey="value" radius={[5, 5, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.value >= threshold ? NAVY : RED} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Simple trend (admin: weekly uploads) */
export function TrendArea({ data, label = "Uploads" }: { data: { name: string; value: number }[]; label?: string }) {
  return (
    <div className="h-56 w-full" role="img" aria-label={`${label} trend chart`}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={NAVY} stopOpacity={0.28} />
              <stop offset="100%" stopColor={NAVY} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11, fill: "#5c6172" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5c6172" }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, label]} />
          <Area type="monotone" dataKey="value" stroke={NAVY} strokeWidth={2.5} fill="url(#trendFill)" dot={{ r: 3, fill: NAVY }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-color distribution bar (attendance bands) */
export function BandBars({ data }: { data: { name: string; value: number; tone: "ok" | "warn" | "bad" }[] }) {
  const fill = { ok: GREEN, warn: "#a86a0a", bad: RED } as const;
  return (
    <div className="h-56 w-full" role="img" aria-label="Student distribution chart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11, fill: "#5c6172" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5c6172" }} />
          <Tooltip cursor={{ fill: "rgb(11 31 74 / .05)" }} contentStyle={tooltipStyle} formatter={(v) => [v, "Students"]} />
          <Bar dataKey="value" radius={[5, 5, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={fill[d.tone]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
