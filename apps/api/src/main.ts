import Fastify from 'fastify';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;

const server = Fastify({
  logger: true
});

server.get('/health', async () => ({
  status: 'ok',
  service: 'smartseat-api',
  scope: 'initialized only'
}));

const port = Number.parseInt(process.env.API_PORT ?? String(DEFAULT_PORT), 10);
const host = process.env.API_HOST ?? DEFAULT_HOST;

const closeServer = async (signal: NodeJS.Signals) => {
  server.log.info({ signal }, 'Stopping SmartSeat API placeholder service');
  await server.close();
  process.exit(0);
};

process.once('SIGINT', (signal) => {
  void closeServer(signal);
});

process.once('SIGTERM', (signal) => {
  void closeServer(signal);
});

await server.listen({ host, port });
