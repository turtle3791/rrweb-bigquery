import Fastify from 'fastify';
import type { FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { DEFAULT_SEARCH_PAGE_SIZE } from '@rrweb/bigquery-replay-contracts';
import { readServerConfig, type ServerConfig } from './config.js';
import { PerformanceMetricsStore } from './metrics.js';
import {
  FileSystemObjectStore,
  GoogleCloudStorageObjectStore,
} from './object-store.js';
import {
  NotFoundError,
  SessionService,
  ValidationError,
} from './session-service.js';
import {
  BigQuerySessionIndex,
  FileSessionIndex,
} from './session-index.js';

export async function createServer(config: ServerConfig = readServerConfig()) {
  const app = Fastify({
    logger: true,
  });
  await app.register(cors, {
    origin: config.allowedOrigin,
  });

  const metricsStore = new PerformanceMetricsStore();
  const objectStore =
    config.objectStoreDriver === 'gcs'
      ? new GoogleCloudStorageObjectStore(
          requireConfig(config.gcsBucket, 'GCS_BUCKET'),
          config.gcsPrefix,
        )
      : new FileSystemObjectStore(config.dataDir);
  const sessionIndex =
    config.sessionIndexDriver === 'bigquery'
      ? new BigQuerySessionIndex(
          requireConfig(config.bigQueryDataset, 'BIGQUERY_DATASET'),
          requireConfig(config.bigQueryTable, 'BIGQUERY_TABLE'),
        )
      : new FileSessionIndex(config.dataDir);
  const sessionService = new SessionService(
    sessionIndex,
    objectStore,
    metricsStore,
  );
  await sessionService.ensureReady();

  app.get('/health', async () => ({
    status: 'ok',
  }));

  app.get('/metrics/summary', async () => metricsStore.snapshot());

  app.post('/sessions/start', async (request, reply) => {
    try {
      const response = await sessionService.startSession(
        request.body as Parameters<typeof sessionService.startSession>[0],
      );
      return reply.code(201).send(response);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/sessions/:sessionId/chunks', async (request, reply) => {
    try {
      const response = await sessionService.appendChunk(
        request.body as Parameters<typeof sessionService.appendChunk>[0],
      );
      return reply.code(201).send(response);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/sessions/:sessionId/finish', async (request, reply) => {
    try {
      const response = await sessionService.finishSession(
        String((request.params as Record<string, string>).sessionId),
        request.body as Parameters<typeof sessionService.finishSession>[1],
      );
      return reply.send(response);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/sessions', async (request, reply) => {
    try {
      const query = request.query as Record<string, string | undefined>;
      const page = Number(query.page ?? '0');
      const pageSize = Number(query.pageSize ?? DEFAULT_SEARCH_PAGE_SIZE);
      const response = await sessionService.searchSessions({
        userId: query.userId,
        from: query.from,
        to: query.to,
        status: query.status as Parameters<
          typeof sessionService.searchSessions
        >[0]['status'],
        page,
        pageSize,
      });
      return reply.send(response);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/sessions/:sessionId', async (request, reply) => {
    try {
      const replay = await sessionService.getSessionOverview(
        String((request.params as Record<string, string>).sessionId),
      );
      return reply.send({ session: replay.session, manifest: replay.manifest });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/sessions/:sessionId/replay', async (request, reply) => {
    try {
      return reply.send(
        await sessionService.getReplay(
          String((request.params as Record<string, string>).sessionId),
        ),
      );
    } catch (error) {
      return sendError(reply, error);
    }
  });

  return app;
}

function requireConfig(value: string | undefined, envName: string): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${envName}`);
  }

  return value;
}

function sendError(
  reply: FastifyReply,
  error: unknown,
) {
  if (error instanceof NotFoundError) {
    return reply.code(404).send({ message: error.message });
  }

  if (error instanceof ValidationError) {
    return reply.code(400).send({ message: error.message });
  }

  throw error;
}
