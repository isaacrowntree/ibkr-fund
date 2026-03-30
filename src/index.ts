/**
 * IBKR Fund — Main entry point
 * Starts status server in daemon mode.
 * Individual agents are invoked separately via --once.
 */
import { startStatusServer } from './status/server.js';
import { log } from './log.js';

function main(): void {
  log('IBKR Fund starting (daemon mode)');
  startStatusServer();
}

if (!process.argv.includes('--once')) {
  main();
}
