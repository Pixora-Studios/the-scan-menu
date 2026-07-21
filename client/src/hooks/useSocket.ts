import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
const SOCKET_URL = API_BASE_URL.replace('/api/v1', '');

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

export const useSocket = (authToken?: string | null) => {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Build options with modern standard handshake token authentication
    const options = authToken
      ? { auth: { token: authToken } }
      : {};

    const socketInstance = io(SOCKET_URL, {
      ...options,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      setStatus('connected');
    });

    socketInstance.on('disconnect', () => {
      setStatus('disconnected');
    });

    socketInstance.on('connect_error', () => {
      setStatus('disconnected');
    });

    // Catch-up re-fetching: Invalidate query caches on reconnect to get any missed status updates!
    socketInstance.io.on('reconnect', () => {
      setStatus('connected');
      queryClient.invalidateQueries(); // single REST call re-fetch catch up
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [authToken, queryClient]);

  return {
    socket: socketRef.current,
    status,
  };
};
