declare module '@rrweb/record' {
  import type { eventWithTime } from '@rrweb/bigquery-replay-contracts';

  export function record(options: {
    emit?: (event: eventWithTime, isCheckout?: boolean) => void;
    [key: string]: unknown;
  }): () => void;
}
