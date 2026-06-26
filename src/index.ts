import { createApp } from './server';
import { config } from './config';

async function main() {
  const { httpServer, pubClient, subClient } = await createApp();

  httpServer.listen(config.port, () => {
    console.log(`Signaling server listening on port ${config.port}`);
  });

  const shutdown = async () => {
    console.log('Shutting down...');
    httpServer.close();
    await pubClient.quit();
    await subClient.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
