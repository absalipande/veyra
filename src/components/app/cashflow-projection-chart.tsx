"use client";

import { useId } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrencyMiliunits } from "@/lib/currencies";

type CashflowProjectionPoint = {
  date: Date | string;
  balance: number;
  outflow: number;
  dueCount: number;
  income?: number;
  spending?: number;
  transfer?: number;
};

type CashflowProjectionChartProps = {
  points: CashflowProjectionPoint[];
  currency?: string;
  height?: number;
  ariaLabel?: string;
  scaleMode?: "fill" | "fit";
};

type ChartPoint = {
  date: string;
  dateLabel: string;
  shortDateLabel: string;
  balance: number;
  outflow: number;
  dueCount: number;
  income: number;
  spending: number;
  transfer: number;
  lowestBalanceMarker: number | null;
};

function toDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateKey(value: Date | string) {
  const date = toDate(value);
  return date?.toISOString().slice(0, 10) ?? String(value);
}

function toDateLabel(value: Date | string) {
  const date = toDate(value);
  if (!date) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toShortDateLabel(value: Date | string) {
  const date = toDate(value);
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatCompactCurrency(value: number, currency: string) {
  const absoluteValue = Math.abs(value / 1000);
  if (absoluteValue >= 1_000_000) {
    return `${currency} ${(absoluteValue / 1_000_000).toFixed(1)}M`;
  }
  if (absoluteValue >= 1_000) {
    return `${currency} ${(absoluteValue / 1_000).toFixed(0)}K`;
  }
  return formatCurrencyMiliunits(value, currency);
}

function buildChartData(points: CashflowProjectionPoint[]) {
  let lowestIndex = -1;
  for (let index = 0; index < points.length; index += 1) {
    if (lowestIndex < 0 || points[index]!.balance < points[lowestIndex]!.balance) {
      lowestIndex = index;
    }
  }

  return points.map((point, index): ChartPoint => {
    const spending = point.spending ?? point.outflow;
    return {
      date: toDateKey(point.date),
      dateLabel: toDateLabel(point.date),
      shortDateLabel: toShortDateLabel(point.date),
      balance: point.balance,
      outflow: point.outflow,
      dueCount: point.dueCount,
      income: point.income ?? 0,
      spending,
      transfer: point.transfer ?? 0,
      lowestBalanceMarker: index === lowestIndex ? point.balance : null,
    };
  });
}

function CashflowTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ChartPoint }>;
  label?: string | number;
  currency: string;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as ChartPoint | undefined;
  if (!row) return null;

  return (
    <div className="min-w-[12rem] rounded-lg border border-border/70 bg-white/96 px-2.5 py-2 text-[0.72rem] text-foreground shadow-md dark:border-white/8 dark:bg-[#182123]/96">
      <p className="font-medium">{row.dateLabel || label}</p>
      <p className="mt-0.5 text-muted-foreground">
        Balance: {formatCurrencyMiliunits(row.balance, currency)}
      </p>
      <p className="text-emerald-700 dark:text-emerald-300">
        Income spike: {formatCurrencyMiliunits(row.income, currency)}
      </p>
      <p className="text-rose-700 dark:text-rose-300">
        Spending spike: {formatCurrencyMiliunits(row.spending, currency)}
      </p>
      <p className="text-sky-700 dark:text-sky-300">
        Transfer spike: {formatCurrencyMiliunits(row.transfer, currency)}
      </p>
      <p className="text-muted-foreground">
        Due items: {row.dueCount}
        {row.lowestBalanceMarker != null ? " · Lowest point" : ""}
      </p>
    </div>
  );
}

export function CashflowProjectionChart({
  points,
  currency = "PHP",
  height = 64,
  ariaLabel = "Projected balance trend",
  scaleMode = "fill",
}: CashflowProjectionChartProps) {
  const id = useId().replace(/:/g, "");
  const balanceGradientId = `${id}-balance`;
  const chartData = buildChartData(points);
  const lowestPoint = chartData.find((point) => point.lowestBalanceMarker != null) ?? null;
  const hasActivitySpikes = chartData.some(
    (point) => point.income > 0 || point.spending > 0 || point.transfer > 0
  );

  if (chartData.length === 0) {
    return <div className="h-14 w-full rounded-md border border-dashed border-border/70 bg-background/70" />;
  }

  const margins =
    scaleMode === "fit"
      ? { top: 4, right: 4, bottom: 0, left: 4 }
      : { top: 4, right: 2, bottom: 0, left: 2 };

  return (
    <div className="relative h-full w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={margins}
          barCategoryGap="38%"
          stackOffset="sign"
          accessibilityLayer
        >
          <defs>
            <linearGradient id={balanceGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#14656b" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#14656b" stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <CartesianGrid
            stroke="currentColor"
            strokeDasharray="4 6"
            vertical
            className="text-border/24"
          />
          <XAxis
            dataKey="shortDateLabel"
            axisLine={false}
            tickLine={false}
            tick={false}
            interval="preserveStartEnd"
            height={4}
          />
          <YAxis
            yAxisId="balance"
            hide
            domain={["dataMin", "dataMax"]}
            padding={{ top: 12, bottom: 8 }}
          />
          <YAxis yAxisId="activity" hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "#14656b", strokeOpacity: 0.28, strokeDasharray: "4 4" }}
            content={(props) => <CashflowTooltip {...props} currency={currency} />}
          />

          {hasActivitySpikes ? (
            <>
              <Bar
                yAxisId="activity"
                dataKey="income"
                name="Income"
                fill="#059669"
                fillOpacity={0.44}
                radius={[5, 5, 0, 0]}
                maxBarSize={12}
              />
              <Bar
                yAxisId="activity"
                dataKey="spending"
                name="Spending"
                fill="#e11d48"
                fillOpacity={0.32}
                radius={[5, 5, 0, 0]}
                maxBarSize={12}
              />
              <Bar
                yAxisId="activity"
                dataKey="transfer"
                name="Transfer"
                fill="#0284c7"
                fillOpacity={0.34}
                radius={[5, 5, 0, 0]}
                maxBarSize={12}
              />
            </>
          ) : null}

          <Area
            yAxisId="balance"
            type="monotone"
            dataKey="balance"
            stroke="#14656b"
            strokeOpacity={0.3}
            fill={`url(#${balanceGradientId})`}
            strokeWidth={1}
            activeDot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="balance"
            type="monotone"
            dataKey="balance"
            stroke="#10292b"
            strokeWidth={1.6}
            dot={(props) => {
              const point = props.payload as ChartPoint;
              if (point.dueCount <= 0 && point.outflow <= 0) return <g />;
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={Math.min(4, 2.4 + point.dueCount * 0.4)}
                  className="fill-[#e9f6f5] stroke-[#14656b] dark:fill-[#203032] dark:stroke-[#6bd0c2]"
                  strokeWidth={1.25}
                />
              );
            }}
            activeDot={{
              r: 4,
              stroke: "#14656b",
              strokeWidth: 1.4,
              fill: "#ffffff",
            }}
            isAnimationActive={false}
            className="dark:[&_path]:stroke-[#b9eeea]"
          />

          {lowestPoint ? (
            <ReferenceDot
              yAxisId="balance"
              x={lowestPoint.shortDateLabel}
              y={lowestPoint.balance}
              r={4.5}
              fill="#fff1f2"
              stroke="#e11d48"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>

      {hasActivitySpikes ? null : (
        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[0.68rem] text-muted-foreground/70">
          No scheduled spikes
        </div>
      )}

      <span className="sr-only">
        {chartData
          .slice(0, 3)
          .map(
            (point) =>
              `${point.dateLabel}: balance ${formatCompactCurrency(point.balance, currency)}, spending spike ${formatCompactCurrency(point.spending, currency)}`
          )
          .join("; ")}
      </span>
    </div>
  );
}
