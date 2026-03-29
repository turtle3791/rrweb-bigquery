# BigQuery Replay Backend

This package exposes the ingest and replay APIs for the rrweb BigQuery replay flow.

## Drivers

- `SESSION_INDEX_DRIVER=file` stores session metadata in `REPLAY_DATA_DIR/sessions-index.json`.
- `SESSION_INDEX_DRIVER=bigquery` writes searchable session rows to BigQuery.
- `OBJECT_STORE_DRIVER=filesystem` stores chunk objects and manifests under `REPLAY_DATA_DIR`.
- `OBJECT_STORE_DRIVER=gcs` stores chunk objects and manifests in Google Cloud Storage.

## Environment

Copy `.env.example` and adjust the values for your environment.

## API

- `POST /sessions/start`
- `POST /sessions/:sessionId/chunks`
- `POST /sessions/:sessionId/finish`
- `GET /sessions?userId=&from=&to=&page=&pageSize=`
- `GET /sessions/:sessionId`
- `GET /sessions/:sessionId/replay`
- `GET /metrics/summary`

## Notes

- Session rows are optimized for queryability. Large rrweb payloads are stored as gzipped chunk objects.
- Each session also keeps a `manifest.json` file that records chunk ordering and payload sizes.
- `GET /metrics/summary` is intended to support the performance-tuning pass from the implementation plan.
