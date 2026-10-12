import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { completePastEvents } from './services/eventService.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`EventHub API listening on :${config.port} (${config.env})`);
});


const sweeper = setInterval(() => completePastEvents().catch((e) => console.error('[sweep]', e.message)), 60_000);
sweeper.unref();

function shutdown() {
  clearInterval(sweeper);
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
