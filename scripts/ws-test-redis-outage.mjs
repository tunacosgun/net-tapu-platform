/**
 * Test: Redis failover protection
 * 1. Connect and join auction (Redis healthy)
 * 2. Stop Redis container to trigger ioredis close/error events
 * 3. Wait for detection
 * 4. Try to place a bid → should be rejected with service_unavailable
 * 5. Restart Redis
 * 6. Wait for reconnection → try bid again
 */
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { execSync } from 'child_process';

const WS_URL = 'http://localhost:3001';
const WS_PATH = '/ws/auction';
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production_min_32_chars!!';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const AUCTION_ID = 'a9487930-9a68-4cfa-9905-c7d246b49bb2';

const token = jwt.sign(
  { sub: USER_ID, email: 'test@nettapu.com', roles: ['user'] },
  JWT_SECRET,
  { expiresIn: '15m' },
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log('╔══════════════════════════════════════════╗');
console.log('║  Redis Failover Protection Test          ║');
console.log('╚══════════════════════════════════════════╝');

const socket = io(WS_URL, {
  path: WS_PATH,
  transports: ['websocket'],
  auth: { token },
});

let serviceUnavailable = false;

socket.on('connect', () => {
  console.log(`Connected: ${socket.id}`);
  socket.emit('join_auction', { auctionId: AUCTION_ID });
});

socket.on('bid_rejected', (data) => {
  console.log(`  ← BID_REJECTED: reason=${data.reason_code}, msg="${data.message}"`);
  if (data.reason_code === 'service_unavailable') {
    serviceUnavailable = true;
  }
});

socket.on('bid_accepted', (data) => {
  console.log(`  ← BID_ACCEPTED: bid_id=${data.bid_id}`);
});

await new Promise((resolve) => {
  socket.on('auction_state', async () => {
    console.log('Joined auction room.\n');

    // Step 1: Stop Redis — triggers TCP close which ioredis detects immediately
    console.log('Step 1: Stopping Redis container...');
    try {
      execSync('docker stop nettapu-redis', { timeout: 15000 });
    } catch (e) {
      // May timeout if stop takes too long; that's OK
    }
    console.log('  Redis STOPPED\n');

    // Step 2: Wait for ioredis to detect the outage
    console.log('Step 2: Waiting 5s for Redis outage detection...');
    await sleep(5000);

    // Step 3: Try to bid during outage
    console.log('Step 3: Attempting bid during Redis outage...');
    socket.emit('place_bid', {
      auctionId: AUCTION_ID,
      amount: '9999999.00',
      idempotencyKey: crypto.randomUUID(),
    });

    // Wait for response
    await sleep(5000);

    // Step 4: Restart Redis
    console.log('\nStep 4: Starting Redis container...');
    execSync('docker start nettapu-redis');
    console.log('  Redis STARTED\n');

    // Step 5: Wait for reconnection
    console.log('Step 5: Waiting 10s for Redis reconnection...');
    await sleep(10000);

    resolve();
  });
});

console.log('\n══════════════════════════════════════════');
console.log(`Service unavailable during outage: ${serviceUnavailable}`);
console.log('══════════════════════════════════════════');

if (serviceUnavailable) {
  console.log('PASS: Bidding blocked during Redis outage');
} else {
  console.log('FAIL: Bidding was NOT blocked during Redis outage');
}

socket.disconnect();
process.exit(serviceUnavailable ? 0 : 1);
