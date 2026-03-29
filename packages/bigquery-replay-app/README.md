# BigQuery Replay App

This package provides the replay UI for stored rrweb sessions.

## Features

- search sessions by `userId`
- filter by time window
- replay a stored session with `rrweb-player`
- display query and replay fetch timing returned by the backend

## Environment

- `VITE_REPLAY_API_BASE_URL`: backend API origin, defaults to `http://localhost:4318`
