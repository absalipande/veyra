"use client";

import { useCallback, useId, useMemo, useState } from "react";

import { formatCurrencyMiliunits } from "@/lib/currencies";

type CashflowProjectionPoint = {
  date: Date | string;
  balance: number;
  outflow: number;
  dueCount: number;
};

type CashflowProjectionChartProps = {
  points: CashflowProjectionPoint[];
  currency?: string;
  height?: number;
  ariaLabel?: string;
  scaleMode?: "fill" | "fit";
};

type PlotPoint = {
  x: number;
  y: number;
  balance: number;
  dueCount: number;
  outflow: number;
  date: Date | string;
};

const VIEWBOX_WIDTH = 320;

function toDateLabel(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toPlotPoints(points: CashflowProjectionPoint[], height: number): PlotPoint[] {
  if (points.length === 0) return [];

  const topPadding = 6;
  const bottomPadding = 4;
  const plotHeight = Math.max(12, height - topPadding - bottomPadding);
  const balances = points.map((point) => point.balance);
  const min = Math.min(...balances);
  const max = Math.max(...balances);
  const span = max - min;

  return points.map((point, index) => {
    const x =
      points.length === 1
        ? VIEWBOX_WIDTH / 2
        : (index / Math.max(1, points.length - 1)) * VIEWBOX_WIDTH;
    const normalized = span === 0 ? 0.5 : (point.balance - min) / span;
    const y = topPadding + (1 - normalized) * plotHeight;
    return {
      x,
      y,
      balance: point.balance,
      dueCount: point.dueCount,
      outflow: point.outflow,
      date: point.date,
    };
  });
}

function buildSteppedPath(points: PlotPoint[]) {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const point = points[0];
    return point ? `M${point.x.toFixed(2)} ${point.y.toFixed(2)}` : "";
  }

  const cornerRadius = 6;
  let path = `M${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const next = points[i]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;

    if (dy === 0 || dx === 0) {
      path += ` H${next.x.toFixed(2)} V${next.y.toFixed(2)}`;
      continue;
    }

    const signX = dx >= 0 ? 1 : -1;
    const signY = dy >= 0 ? 1 : -1;
    const r = Math.min(cornerRadius, Math.abs(dx) * 0.45, Math.abs(dy) * 0.45);

    if (r <= 0) {
      path += ` H${next.x.toFixed(2)} V${next.y.toFixed(2)}`;
      continue;
    }

    const bendStartX = next.x - signX * r;
    const bendEndY = prev.y + signY * r;
    path += ` H${bendStartX.toFixed(2)} Q${next.x.toFixed(2)} ${prev.y.toFixed(2)} ${next.x.toFixed(2)} ${bendEndY.toFixed(2)} V${next.y.toFixed(2)}`;
  }

  return path;
}

function buildAreaPath(linePath: string, points: PlotPoint[], height: number) {
  if (!linePath || points.length === 0) return "";
  const baseline = Math.max(0, height - 2);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath} L${last.x.toFixed(2)} ${baseline.toFixed(2)} L${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`;
}

export function CashflowProjectionChart({
  points,
  currency = "PHP",
  height = 64,
  ariaLabel = "Projected balance trend",
  scaleMode = "fill",
}: CashflowProjectionChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const areaGradientId = `${gradientId}-area`;
  const lineGradientId = `${gradientId}-line`;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { plotPoints, linePath, areaPath, lowestIndex } = useMemo(() => {
    const plotPoints = toPlotPoints(points, height);
    const linePath = buildSteppedPath(plotPoints);
    const areaPath = buildAreaPath(linePath, plotPoints, height);

    let lowestIndex = -1;
    for (let i = 0; i < plotPoints.length; i += 1) {
      if (lowestIndex < 0 || plotPoints[i]!.balance < plotPoints[lowestIndex]!.balance) {
        lowestIndex = i;
      }
    }

    return { plotPoints, linePath, areaPath, lowestIndex };
  }, [height, points]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) {
        setHoveredIndex(null);
        return;
      }

      const relativeX = ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (let i = 0; i < plotPoints.length; i += 1) {
        const distance = Math.abs(plotPoints[i]!.x - relativeX);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      }

      setHoveredIndex(nearestIndex);
    },
    [plotPoints]
  );

  if (plotPoints.length === 0) {
    return <div className="h-14 w-full rounded-md border border-dashed border-border/70 bg-background/70" />;
  }

  const dueMarkers = plotPoints.filter((point) => point.dueCount > 0 || point.outflow > 0);
  const hoveredPoint = hoveredIndex != null ? (plotPoints[hoveredIndex] ?? null) : null;
  const hoveredPointIsLowest =
    hoveredPoint && lowestIndex >= 0 ? plotPoints[lowestIndex] === hoveredPoint : false;
  const hoverLeftPct = hoveredPoint ? (hoveredPoint.x / VIEWBOX_WIDTH) * 100 : 0;
  const hoverTopPct = hoveredPoint ? (hoveredPoint.y / height) * 100 : 0;
  const tooltipShiftClass =
    hoverLeftPct > 82 ? "-translate-x-full" : hoverLeftPct < 18 ? "translate-x-0" : "-translate-x-1/2";
  const tooltipVerticalClass = hoverTopPct < 38 ? "translate-y-3" : "-translate-y-[calc(100%+0.55rem)]";

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="h-full w-full"
        preserveAspectRatio={scaleMode === "fit" ? "xMidYMid meet" : "none"}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id={lineGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgb(20 101 107)" />
            <stop offset="100%" stopColor="rgb(16 41 43)" />
          </linearGradient>
          <linearGradient id={areaGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgb(20 101 107 / 0.18)" />
            <stop offset="100%" stopColor="rgb(20 101 107 / 0.02)" />
          </linearGradient>
        </defs>

        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line
            key={`h-${ratio}`}
            x1="0"
            y1={height * ratio}
            x2={VIEWBOX_WIDTH}
            y2={height * ratio}
            className="stroke-border/20"
          />
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line
            key={`v-${ratio}`}
            x1={VIEWBOX_WIDTH * ratio}
            y1="0"
            x2={VIEWBOX_WIDTH * ratio}
            y2={height}
            className="stroke-border/18"
            strokeDasharray="3 4"
          />
        ))}
        <line x1="0" y1={height - 2} x2={VIEWBOX_WIDTH} y2={height - 2} className="stroke-border/45" />

        {areaPath ? <path d={areaPath} fill={`url(#${areaGradientId})`} /> : null}
        <path
          d={linePath}
          fill="none"
          stroke={`url(#${lineGradientId})`}
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="dark:opacity-85"
        />

        {hoveredPoint ? (
          <line
            x1={hoveredPoint.x}
            y1={0}
            x2={hoveredPoint.x}
            y2={height}
            className="stroke-[#14656b]/35 dark:stroke-[#6bd0c2]/40"
            strokeDasharray="4 4"
          />
        ) : null}

        {dueMarkers.map((point, index) => (
          <circle
            key={`${point.x}-${point.y}-${index}`}
            cx={point.x}
            cy={point.y}
            r={Math.min(4.2, 2.3 + point.dueCount * 0.45)}
            className="fill-[#e9f6f5] stroke-[#14656b] dark:fill-[#203032] dark:stroke-[#6bd0c2]"
            strokeWidth="1.35"
          >
            <title>
              {`Due date marker (${point.dueCount} item${point.dueCount === 1 ? "" : "s"}) · ${toDateLabel(point.date)}`}
            </title>
          </circle>
        ))}

        {lowestIndex >= 0 ? (
          <>
            <circle
              cx={plotPoints[lowestIndex]!.x}
              cy={plotPoints[lowestIndex]!.y}
              r="4.7"
              className="fill-rose-50/95 stroke-rose-500 dark:fill-rose-500/20 dark:stroke-rose-300"
              strokeWidth="1.5"
            >
              <title>Lowest projected balance point</title>
            </circle>
            <circle
              cx={plotPoints[lowestIndex]!.x}
              cy={plotPoints[lowestIndex]!.y}
              r="1.7"
              className="fill-rose-500 dark:fill-rose-300"
            />
          </>
        ) : null}

        {hoveredPoint ? (
          <circle
            cx={hoveredPoint.x}
            cy={hoveredPoint.y}
            r="4.8"
            className="fill-white stroke-[#14656b] dark:fill-[#182123] dark:stroke-[#6bd0c2]"
            strokeWidth="1.8"
          />
        ) : null}
      </svg>

      {hoveredPoint ? (
        <div
          className={`pointer-events-none absolute z-10 ${tooltipShiftClass} ${tooltipVerticalClass}`}
          style={{ left: `${hoverLeftPct}%`, top: `${hoverTopPct}%` }}
        >
          <div className="min-w-[11rem] rounded-lg border border-border/70 bg-white/96 px-2.5 py-2 text-[0.72rem] text-foreground shadow-md dark:bg-[#182123]/96">
            <p className="font-medium">{toDateLabel(hoveredPoint.date)}</p>
            <p className="mt-0.5 text-muted-foreground">
              Balance: {formatCurrencyMiliunits(hoveredPoint.balance, currency)}
            </p>
            <p className="text-muted-foreground">
              Outflow: {formatCurrencyMiliunits(hoveredPoint.outflow, currency)}
            </p>
            <p className="text-muted-foreground">
              Due items: {hoveredPoint.dueCount}
              {hoveredPointIsLowest ? " · Lowest point" : ""}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
