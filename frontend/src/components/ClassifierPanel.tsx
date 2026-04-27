import { useState, useEffect } from "react";
import { api } from "../api/client";
import { Card } from "./Card";
import { Spinner } from "./Spinner";
import type { ClassifierStats, ClassifierRunResult } from "../types";

interface Props {
  isAdmin: boolean;
}

export function ClassifierPanel({ isAdmin }: Props) {
  const [stats, setStats] = useState<ClassifierStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<ClassifierRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    setStatsLoading(true);
    setStatsError(null);
    api
      .getClassifierStats()
      .then((data) => setStats(data))
      .catch((e) => setStatsError(e instanceof Error ? e.message : "Failed to load stats"))
      .finally(() => setStatsLoading(false));
  }, [isAdmin]);

  if (!isAdmin) return null;

  async function handleRun(useLlm: boolean) {
    setRunning(true);
    setRunResult(null);
    setRunError(null);
    try {
      const result = await api.runClassifier({ use_llm: useLlm });
      setRunResult(result);
      // Refresh stats after run
      const updated = await api.getClassifierStats();
      setStats(updated);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Classifier run failed");
    } finally {
      setRunning(false);
    }
  }

  const classifiedPct =
    stats && stats.total > 0
      ? Math.round((stats.classified / stats.total) * 100)
      : 0;

  const topBreakdown = stats
    ? [...stats.breakdown]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    : [];

  return (
    <Card title="Attack Category Classifier">
      {statsLoading ? (
        <Spinner />
      ) : statsError ? (
        <p className="text-sm py-4" style={{ color: "#ef4444" }}>
          {statsError}
        </p>
      ) : stats ? (
        <div className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--theme-text-secondary)" }}
              >
                Classification Progress
              </span>
              <span
                className="text-xs font-mono tabular-nums"
                style={{ color: "var(--theme-text-muted)" }}
              >
                {stats.classified.toLocaleString()} / {stats.total.toLocaleString()} ({classifiedPct}% classified)
              </span>
            </div>
            <div
              className="h-2.5 w-full rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--theme-surface-border)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${classifiedPct}%`,
                  backgroundColor: classifiedPct >= 80 ? "#10b981" : classifiedPct >= 50 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--theme-text-muted)" }}>
              <span>{stats.unclassified.toLocaleString()} unclassified</span>
              <span>·</span>
              <span>{stats.classification_rate.toFixed(1)}% rate</span>
            </div>
          </div>

          {/* Category breakdown badges */}
          {topBreakdown.length > 0 && (
            <div>
              <p
                className="text-[11px] font-medium mb-2 uppercase tracking-wider"
                style={{ color: "var(--theme-text-muted)" }}
              >
                Top Categories
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topBreakdown.map((item) => (
                  <span
                    key={item.category}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
                    style={{
                      backgroundColor: "var(--theme-surface-raised)",
                      color: "var(--theme-text-secondary)",
                      border: "1px solid var(--theme-surface-border)",
                    }}
                  >
                    {item.category}
                    <span
                      className="font-mono tabular-nums"
                      style={{ color: "var(--theme-text-muted)" }}
                    >
                      {item.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Run buttons / running state */}
          {running ? (
            <div className="flex items-center gap-3 py-2">
              <Spinner className="py-0" />
              <span
                className="text-sm"
                style={{ color: "var(--theme-text-secondary)" }}
              >
                Processing...
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleRun(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:opacity-90"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--theme-accent) 15%, transparent)",
                  color: "var(--theme-accent)",
                  border: "1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent)",
                }}
              >
                Run Regex Classification
              </button>
              <button
                onClick={() => handleRun(true)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors hover:opacity-90"
                style={{
                  backgroundColor: "color-mix(in srgb, #10b981 15%, transparent)",
                  color: "#10b981",
                  border: "1px solid color-mix(in srgb, #10b981 30%, transparent)",
                }}
              >
                Run with LLM Fallback
              </button>
            </div>
          )}

          {/* Run error */}
          {runError && (
            <p className="text-xs" style={{ color: "#ef4444" }}>
              Error: {runError}
            </p>
          )}

          {/* Run result */}
          {runResult && (
            <div
              className="rounded-lg p-3 text-xs space-y-1"
              style={{
                backgroundColor: "color-mix(in srgb, #10b981 10%, transparent)",
                border: "1px solid color-mix(in srgb, #10b981 25%, transparent)",
              }}
            >
              <p
                className="font-medium mb-1.5"
                style={{ color: "#10b981" }}
              >
                Run Complete
              </p>
              <div
                className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono tabular-nums"
                style={{ color: "var(--theme-text-secondary)" }}
              >
                <span>Processed:</span>
                <span>{runResult.total_processed.toLocaleString()}</span>
                <span>Regex classified:</span>
                <span>{runResult.regex_classified.toLocaleString()}</span>
                <span>LLM classified:</span>
                <span>{runResult.llm_classified.toLocaleString()}</span>
                <span>Skipped:</span>
                <span>{runResult.skipped.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}
