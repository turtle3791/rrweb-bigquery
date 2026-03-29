import type { PerformanceMetricSnapshot } from '@rrweb/bigquery-replay-contracts';

type IngestEntry = {
  durationMs: number;
  payloadBytes: number;
  storedBytes: number;
};

type ReplayEntry = {
  fetchDurationMs: number;
};

export class PerformanceMetricsStore {
  private readonly ingests: IngestEntry[] = [];
  private readonly queries: number[] = [];
  private readonly replays: ReplayEntry[] = [];

  recordIngest(entry: IngestEntry): void {
    this.ingests.push(entry);
  }

  recordQueryDuration(durationMs: number): void {
    this.queries.push(durationMs);
  }

  recordReplay(entry: ReplayEntry): void {
    this.replays.push(entry);
  }

  snapshot(): PerformanceMetricSnapshot {
    return {
      ingestCount: this.ingests.length,
      replayCount: this.replays.length,
      averageIngestDurationMs: average(
        this.ingests.map((entry) => entry.durationMs),
      ),
      averageReplayFetchDurationMs: average(
        this.replays.map((entry) => entry.fetchDurationMs),
      ),
      averageChunkPayloadBytes: average(
        this.ingests.map((entry) => entry.payloadBytes),
      ),
      averageStoredChunkBytes: average(
        this.ingests.map((entry) => entry.storedBytes),
      ),
      averageBigQueryQueryDurationMs: average(this.queries),
    };
  }
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
