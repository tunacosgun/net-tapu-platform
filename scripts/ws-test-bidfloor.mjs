/**
 * Test: Bid floor enforcement
 * - Negative amount → rejected
 * - Zero amount → rejected
 * - Non-numeric amount → rejected
 * - Valid amount → passes floor check (may fail on business rules, that's OK)
 */
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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
console.log('║  Bid Floor Enforcement Test              ║');
console.log('╚══════════════════════════════════════════╝');

const socket = io(WS_URL, {
  path: WS_PATH,
  transports: ['websocket'],
  auth: { token },
});

const results = [];
let bidsSent = 0;
let responsesReceived = 0;

socket.on('connect', () => {
  console.log(`Connected: ${socket.id}`);
  socket.emit('join_auction', { auctionId: AUCTION_ID });
});

socket.on('bid_rejected', (data) => {
  responsesReceived++;
  results.push(data);
  console.log(`  ← BID_REJECTED #${responsesReceived}: reason=${data.reason_code}, msg="${data.message}"`);
});

socket.on('bid_accepted', (data) => {
  responsesReceived++;
  results.push({ reason_code: 'accepted' });
  console.log(`  ← BID_ACCEPTED #${responsesReceived}: bid_id=${data.bid_id}`);
});

await new Promise((resolve) => {
  socket.on('auction_state', async () => {
    console.log('Joined auction room.\n');

    const invalidAmounts = [
      { amount: '-100', label: 'Negative amount' },
      { amount: '0', label: 'Zero amount' },
      { amount: 'abc', label: 'Non-numeric string' },
      { amount: '12.34.56', label: 'Double decimal' },
      { amount: '', label: 'Empty string' },
      { amount: '-0.01', label: 'Negative decimal' },
    ];

    for (const { amount, label } of invalidAmounts) {
      console.log(`  → Sending bid: "${amount}" (${label})`);
      socket.emit('place_bid', {
        auctionId: AUCTION_ID,
        amount,
        idempotencyKey: crypto.randomUUID(),
      });
      bidsSent++;
      await sleep(100);
    }

    await sleep(3000);
    resolve();
  });
});

console.log('\n══════════════════════════════════════════');
const floorRejections = results.filter((r) => r.reason_code === 'invalid_amount').length;
console.log(`Bids sent:          ${bidsSent}`);
console.log(`Floor rejections:   ${floorRejections}`);
console.log(`Total responses:    ${responsesReceived}`);
console.log('══════════════════════════════════════════');

if (floorRejections === bidsSent) {
  console.log('PASS: All invalid amounts rejected at floor level');
} else {
  console.log('FAIL: Some invalid amounts passed floor check');
}

socket.disconnect();
process.exit(floorRejections === bidsSent ? 0 : 1);
