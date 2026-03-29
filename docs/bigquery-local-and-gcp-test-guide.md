# RRWeb BigQuery Backend Test Guide

## Press Ctrl+Shift+V to view the rendering of the files

This guide walks through:

1. Local testing with BigQuery and local filesystem storage
2. Full hybrid testing with BigQuery and GCS
3. Required GCP setup

## Overview

The backend supports:

- `SESSION_INDEX_DRIVER=file` or `bigquery`
- `OBJECT_STORE_DRIVER=filesystem` or `gcs`

Recommended order:

1. Test with `bigquery + filesystem`
2. Then test with `bigquery + gcs`

This isolates BigQuery setup first before adding Cloud Storage.

## Prerequisites

- Node installed
- `corepack` available
- dependencies installed in the repo
- Google Cloud CLI installed if using ADC login
- access to a GCP project

## GCP Setup

### 1. Create or choose a GCP project

Use an existing project or create a new one in the GCP Console.

Save the project ID as:

- `YOUR_PROJECT_ID`

### 2. Enable required APIs

Enable:

- BigQuery API
- Cloud Storage API

Using `gcloud`:

```powershell
gcloud services enable bigquery.googleapis.com storage.googleapis.com --project YOUR_PROJECT_ID
```

### 3. Configure authentication

Choose one of the following.

#### Option A: Application Default Credentials via gcloud

Best for local development.

```powershell
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

#### Option B: Service account key

1. Create a service account in GCP
2. Download the JSON key
3. Set the environment variable

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
```

### 4. IAM permissions

For initial testing, the simplest approach is granting broad temporary roles.

Recommended temporary roles:

- `BigQuery Admin`
- `Storage Object Admin` if using GCS
- optionally `Storage Admin` if you also want to create buckets via CLI

For tighter access later, reduce permissions after validation.

### 5. Create a GCS bucket

Only needed for the GCS phase.

```powershell
gcloud storage buckets create gs://YOUR_BUCKET_NAME --location=US --project YOUR_PROJECT_ID
```

Replace:

- `YOUR_BUCKET_NAME`
- region if needed

## Backend Environment Variables

The backend reads from `process.env`. It does not automatically load `.env`.

Set the variables in PowerShell before starting the backend.

Base variables:

```powershell
$env:REPLAY_HOST="0.0.0.0"
$env:REPLAY_PORT="4318"
$env:REPLAY_ALLOWED_ORIGIN="http://localhost:5173"
$env:BIGQUERY_DATASET="rrweb_replay"
$env:BIGQUERY_TABLE="sessions"
```

## Phase 1: Test With BigQuery + Filesystem

This verifies:

- backend starts
- BigQuery auth works
- dataset/table creation works
- ingest writes session metadata to BigQuery
- replay payloads are stored locally

### 1. Set environment variables

```powershell
$env:REPLAY_HOST="0.0.0.0"
$env:REPLAY_PORT="4318"
$env:REPLAY_ALLOWED_ORIGIN="http://localhost:5173"
$env:REPLAY_DATA_DIR="C:\projects\rrweb\.bigquery-replay"
$env:SESSION_INDEX_DRIVER="bigquery"
$env:OBJECT_STORE_DRIVER="filesystem"
$env:BIGQUERY_DATASET="rrweb_replay"
$env:BIGQUERY_TABLE="sessions"
```

### 2. Start the backend

From the repo root:

```powershell
corepack yarn workspace @rrweb/bigquery-replay-backend start
```

### 3. Verify health

```powershell
curl http://localhost:4318/health
```

Expected response:

```json
{ "status": "ok" }
```

### 4. Start a test session

```powershell
$body = @'
{
  "sessionId": "session-local-001",
  "userId": "1234567890",
  "startedAt": "2026-03-28T10:00:00.000Z",
  "pageUrl": "http://localhost:3000",
  "appVersion": "local-test",
  "environment": "local",
  "tags": ["manual-test"]
}
'@

curl -Method POST http://localhost:4318/sessions/start `
  -ContentType "application/json" `
  -Body $body
```

### 5. Upload one chunk

```powershell
$chunk = @'
{
  "sessionId": "session-local-001",
  "userId": "1234567890",
  "chunkIndex": 0,
  "startedAt": "2026-03-28T10:00:01.000Z",
  "endedAt": "2026-03-28T10:00:02.000Z",
  "events": [
    {
      "timestamp": 1774692001000,
      "type": 2,
      "data": { "source": "test" }
    },
    {
      "timestamp": 1774692002000,
      "type": 3,
      "data": { "source": "test-2" }
    }
  ]
}
'@

curl -Method POST http://localhost:4318/sessions/session-local-001/chunks `
  -ContentType "application/json" `
  -Body $chunk
```

### 6. Finish the session

```powershell
$finish = @'
{
  "endedAt": "2026-03-28T10:00:05.000Z",
  "status": "completed"
}
'@

curl -Method POST http://localhost:4318/sessions/session-local-001/finish `
  -ContentType "application/json" `
  -Body $finish
```

### 7. Query sessions

```powershell
curl "http://localhost:4318/sessions?userId=1234567890&page=0&pageSize=20"
```

### 8. Fetch replay data

```powershell
curl "http://localhost:4318/sessions/session-local-001/replay"
```

### 9. Fetch performance metrics

```powershell
curl "http://localhost:4318/metrics/summary"
```

### 10. Verify local filesystem output

Check the local storage directory under:

- `C:\projects\rrweb\.bigquery-replay`

You should see session files including:

- `manifest.json`
- chunk `.json.gz` files

### 11. Verify BigQuery rows

In BigQuery, run:

```sql
SELECT *
FROM `YOUR_PROJECT_ID.rrweb_replay.sessions`
ORDER BY startedAt DESC
LIMIT 20;
```

Expected:

- one row for `session-local-001`
- `userId = 1234567890`
- event and chunk counts populated

## Phase 2: Test With BigQuery + GCS

This verifies the full hybrid architecture:

- metadata in BigQuery
- replay chunks in GCS

### 1. Create a bucket if you have not already

```powershell
gcloud storage buckets create gs://YOUR_BUCKET_NAME --location=US --project YOUR_PROJECT_ID
```

### 2. Set environment variables

```powershell
$env:REPLAY_HOST="0.0.0.0"
$env:REPLAY_PORT="4318"
$env:REPLAY_ALLOWED_ORIGIN="http://localhost:5173"
$env:SESSION_INDEX_DRIVER="bigquery"
$env:OBJECT_STORE_DRIVER="gcs"
$env:BIGQUERY_DATASET="rrweb_replay"
$env:BIGQUERY_TABLE="sessions"
$env:GCS_BUCKET="YOUR_BUCKET_NAME"
$env:GCS_PREFIX="rrweb-replay"
```

If using a service account key:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
```

### 3. Restart the backend

```powershell
corepack yarn workspace @rrweb/bigquery-replay-backend start
```

### 4. Repeat the API flow

Run again:

1. `POST /sessions/start`
2. `POST /sessions/:sessionId/chunks`
3. `POST /sessions/:sessionId/finish`
4. `GET /sessions?userId=...`
5. `GET /sessions/:sessionId/replay`

Use a new session ID such as:

- `session-gcs-001`

### 5. Verify GCS objects

In the bucket, confirm objects exist under a prefix like:

- `rrweb-replay/sessions/session-gcs-001/manifest.json`
- `rrweb-replay/sessions/session-gcs-001/chunks/000000.json.gz`

Example CLI check:

```powershell
gcloud storage ls gs://YOUR_BUCKET_NAME/rrweb-replay/sessions/session-gcs-001/**
```

### 6. Verify BigQuery rows again

Run:

```sql
SELECT *
FROM `YOUR_PROJECT_ID.rrweb_replay.sessions`
ORDER BY startedAt DESC
LIMIT 20;
```

Expected:

- the new session is present
- metadata is queryable by `userId` and time

## Optional: Test With The Replay UI

### 1. Set the frontend API URL

```powershell
$env:VITE_REPLAY_API_BASE_URL="http://localhost:4318"
```

### 2. Start the replay app

```powershell
corepack yarn workspace @rrweb/bigquery-replay-app dev
```

### 3. Test the UI

In the browser:

1. search by `userId`
2. open the returned session
3. verify replay loads

## Optional: Test With The Recorder Package

Example usage:

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

This package automatically:

- generates `sessionId`
- generates a 10-digit `userId`
- batches events
- uploads them to the backend

## Troubleshooting

### `Missing required environment variable`

Set the required env vars in PowerShell before starting the backend.

### BigQuery auth errors

Check:

- `gcloud auth application-default login`
- `gcloud config set project YOUR_PROJECT_ID`
- or `GOOGLE_APPLICATION_CREDENTIALS`

### GCS bucket errors

Confirm:

- bucket exists
- service account or ADC has storage permissions
- `GCS_BUCKET` is set correctly

### Search returns no sessions

Check:

- `/sessions/start` succeeded
- `/chunks` succeeded
- `/finish` succeeded
- BigQuery dataset/table are correct

### Replay fetch works but UI fails

Confirm:

- backend is running
- `VITE_REPLAY_API_BASE_URL` is correct
- session exists in search results
- replay endpoint returns events

## Success Criteria

### Filesystem phase success

- backend starts
- `/health` returns OK
- session row appears in BigQuery
- chunk files appear in local storage
- replay endpoint returns stored events

### GCS phase success

- backend starts with GCS mode
- session row appears in BigQuery
- manifest and chunk objects appear in GCS
- replay endpoint reads data successfully
- replay UI can search and open a session
