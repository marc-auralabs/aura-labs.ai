/**
 * WebSocket Endpoints
 *
 * Domain: Message Routing
 * - GET /ws/scout  — Scout real-time connection (stub)
 * - GET /ws/beacon — Beacon real-time connection (stub)
 *
 * SECURITY: 64KB payload limit, safe JSON parsing, no raw echo.
 */

// SECURITY: WebSocket payload size limit (64 KB)
const WS_MAX_PAYLOAD = 64 * 1024;

/**
 * Register WebSocket routes as a Fastify plugin.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {object} opts - Shared dependencies
 */
export async function registerWebSocketRoutes(app, opts) {
  app.get('/ws/scout', { websocket: true }, (connection) => {
    // SECURITY: Close connections that send oversized payloads
    connection.socket._socket?.setMaxListeners?.(20);

    connection.socket.on('message', (message) => {
      const raw = message.toString();

      // SECURITY: Reject oversized payloads
      if (raw.length > WS_MAX_PAYLOAD) {
        connection.socket.send(JSON.stringify({ type: 'error', message: 'Payload too large' }));
        connection.socket.close(1009, 'Payload too large');
        return;
      }

      // SECURITY: Safe JSON parsing — don't crash on malformed input
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        connection.socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      app.log.info({ type: 'scout_message', messageType: data?.type });
      // SECURITY: Don't echo back raw user data — only acknowledge with type
      connection.socket.send(JSON.stringify({ type: 'ack', messageType: data?.type }));
    });
    connection.socket.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to AURA Core as Scout',
      note: 'WebSocket support is for future real-time updates. Use REST API for MVP.',
    }));
  });

  app.get('/ws/beacon', { websocket: true }, (connection) => {
    connection.socket.on('message', (message) => {
      const raw = message.toString();

      // SECURITY: Reject oversized payloads
      if (raw.length > WS_MAX_PAYLOAD) {
        connection.socket.send(JSON.stringify({ type: 'error', message: 'Payload too large' }));
        connection.socket.close(1009, 'Payload too large');
        return;
      }

      // SECURITY: Safe JSON parsing
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        connection.socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      app.log.info({ type: 'beacon_message', messageType: data?.type });
      // SECURITY: Don't echo back raw user data
      connection.socket.send(JSON.stringify({ type: 'ack', messageType: data?.type }));
    });
    connection.socket.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to AURA Core as Beacon',
      note: 'WebSocket support is for future real-time updates. Use REST API for MVP.',
    }));
  });
}
