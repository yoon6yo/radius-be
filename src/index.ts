import { createApp } from './server';
import { config } from './config';

async function main() {
  const { httpServer, io, pubClient, subClient } = await createApp();

  httpServer.listen(config.port, () => {
    console.log(`Signaling server listening on port ${config.port}`);
  });

  const shutdown = async () => {
    console.log('Shutting down...');
    // io.close()가 먼저 모든 Socket.io 연결을 종료해야
    // peer-disconnected 이벤트가 상대방에게 전달된다
    io.close();
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
