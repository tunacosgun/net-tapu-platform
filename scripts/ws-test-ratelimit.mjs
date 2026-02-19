/**
 * Test 2: WebSocket Rate Limiting
 * - Send 5 bids rapidly → all should be accepted
 * - Send 6th bid within 3s window → should be rate-limited
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

console.log('╔══════════════════════════════════════════╗');
console.log('║  WebSocket Rate Limit Test               ║');
console.log('╚══════════════════════════════════════════╝');

const socket = io(WS_URL, {
  path: WS_PATH,
  transports: ['websocket'],
  auth: { token },
});

let acceptedCount = 0;
let rejectedCount = 0;
let rateLimited = false;
const totalBids = 8;
let bidsSent = 0;

socket.on('connect', () => {
  console.log(`Connected: ${socket.id}`);
  socket.emit('join_auction', { auctionId: AUCTION_ID });
});

socket.on('auction_state', () => {
  console.log('Joined auction room. Firing 8 rapid bids...\n');

  // Fire 8 bids as fast as possible
  for (let i = 1; i <= totalBids; i++) {
    const amount = (1000000 + i * 100000).toString();
    socket.emit('place_bid', {
      auctionId: AUCTION_ID,
      amount,
      idempotencyKey: crypto.randomUUID(),
    });
    bidsSent++;
    console.log(`  → Bid #${i} sent (amount=${amount})`);
  }
});

socket.on('bid_accepted', (data) => {
  acceptedCount++;
  console.log(`  ← BID_ACCEPTED #${acceptedCount}: amount=${data.amount}, bid_id=${data.bid_id}`);
});

socket.on('bid_rejected', (data) => {
  rejectedCount++;
  if (data.reason_code === 'rate_limited') {
    rateLimited = true;
    console.log(`  ← BID_REJECTED (RATE LIMITED) #${rejectedCount}: ${data.message}`);
  } else {
    console.log(`  ← BID_REJECTED #${rejectedCount}: reason=${data.reason_code}, msg=${data.message}`);
  }
});

// Wait for all responses
setTimeout(() => {
  console.log('\n══════════════════════════════════════════');
  console.log(`Bids sent: ${bidsSent}`);
  console.log(`Accepted:  ${acceptedCount}`);
  console.log(`Rejected:  ${rejectedCount}`);
  console.log(`Rate limited: ${rateLimited}`);
  console.log('══════════════════════════════════════════');

  if (rateLimited) {
    console.log('PASS: Rate limiting triggered correctly');
  } else {
    console.log('FAIL: Rate limiting was NOT triggered');
  }

  socket.disconnect();
  process.exit(rateLimited ? 0 : 1);
}, 8000);
