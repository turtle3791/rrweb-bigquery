# BigQuery Replay Recorder

This package wraps `@rrweb/record` with:

- a generated `sessionId`
- a generated 10-digit `userId`
- chunk buffering
- periodic uploads to the backend ingest API

## Example

```ts
import { createBigQueryReplayRecorder } from '@rrweb/bigquery-replay-recorder';

const recorder = createBigQueryReplayRecorder({
  apiBaseUrl: 'http://localhost:4318',
  appVersion: 'web-frontend-1.0.0',
  environment: 'local',
});

await recorder.start();

window.addEventListener('beforeunload', () => {
  void recorder.stop();
});
```
