import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { Card } from "./Card";
import { ChartSkeleton } from "./Spinner";
import { useChartColors } from "../hooks/useChartColors";
import type { QueueBucket } from "../types";

interface Props {
  data: QueueBucket[] | null;
  loading: boolean;
}

/** Color scale from green (fresh) to red (stale). */
const BUCKET_COLORS: Record<string, string> = {
  "<1h": "#10b981",
  "1-4h": "#84cc16",
  "4-8h": "#eab308",
  "8-24h": "#f59e0b",
  "1-3d": "#f97316",
  "3-7d": "#ef4444",
  ">7d": "#dc2626",
};

function bucketColor(bucket: string): string {
  return BUCKET_COLORS[bucket] || "#6b7280";
}

export function QueueHealth({ data, loading }: Props) {
  const cc = useChartColors();

  const allZero = data ? data.every((d) => d.count === 0) : false;

  const inner =
    loading || !data ? (
      <ChartSkeleton height={240} />
    ) : allZero ? (
      <div className="flex items-center justify-center py-12">
        <p
          className="text-sm font-medium"
          style={{ color: "var(--theme-text-muted)" }}
        >
          No open tickets -- queue is clear!
        </p>
      </div>
    ) : (
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={cc.grid}
            opacity={0.2}
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={{ fill: cc.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="bucket"
            type="category"
            tick={{ fill: cc.tick, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {data.map((entry) => (
              <Cell key={entry.bucket} fill={bucketColor(entry.bucket)} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              style={{ fill: cc.label, fontSize: 11, fontFamily: "monospace" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );

  return <Card title="Queue Health">{inner}</Card>;
}
