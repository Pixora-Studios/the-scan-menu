import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';

export class SocketService {
  private static instance: SocketService;
  private io: SocketIOServer | null = null;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public init(httpServer: HTTPServer, corsOrigin: string): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    this.io.on('connection', (socket) => {
      logger.info(`Socket connected: ${socket.id}`);

      socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });

    return this.io;
  }

  public getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error('Socket.io has not been initialized. Call init first.');
    }
    return this.io;
  }
}
export default SocketService;
