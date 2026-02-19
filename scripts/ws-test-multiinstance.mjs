/**
 * Test 3: Multi-instance Redis pub/sub
 * - Client A connects to instance 1 (port 3001)
 * - Client B connects to instance 2 (port 3002)
 * - Both join same auction room
 * - Client A places a bid via instance 1
 * - Verify Client B on instance 2 receives the bid_accepted broadcast
 */
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const WS_PATH = '/ws/auction';
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production_min_32_chars!!';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const AUCTION_ID = 'a9487930-9a68-4cfa-9905-c7d246b49bb2';

const INSTANCE_1 = 'http://localhost:3001';
const INSTANCE_2 = 'http://localhost:3002';

const token = jwt.sign(
  { sub: USER_ID, email: 'test@nettapu.com', roles: ['user'] },
  JWT_SECRET,
  { expiresIn: '15m' },
);

console.log('╔══════════════════════════════════════════╗');
console.log('║  Multi-Instance Redis Pub/Sub Test       ║');
console.log('╚══════════════════════════════════════════╝');

let clientAJoined = false;
let clientBJoined = false;
let clientBReceivedBid = false;

// Client A → Instance 1
const clientA = io(INSTANCE_1, {
  path: WS_PATH,
  transports: ['websocket'],
  auth: { token },
});

// Client B → Instance 2
const clientB = io(INSTANCE_2, {
  path: WS_PATH,
  transports: ['websocket'],
  auth: { token },
});

clientA.on('connect', () => {
  console.log(`Client A connected to instance 1: ${clientA.id}`);
  clientA.emit('join_auction', { auctionId: AUCTION_ID });
});

clientB.on('connect', () => {
  console.log(`Client B connected to instance 2: ${clientB.id}`);
  clientB.emit('join_auction', { auctionId: AUCTION_ID });
});

clientA.on('connect_error', (err) => {
  console.log(`Client A connection error: ${err.message}`);
});

clientB.on('connect_error', (err) => {
  console.log(`Client B connection error: ${err.message}`);
});

clientA.on('auction_state', () => {
  clientAJoined = true;
  console.log('Client A joined auction room (instance 1)');
  maybeStartBid();
});

clientB.on('auction_state', () => {
  clientBJoined = true;
  console.log('Client B joined auction room (instance 2)');
  maybeStartBid();
});

// When Client B receives a bid_accepted → cross-instance pub/sub works
clientB.on('bid_accepted', (data) => {
  clientBReceivedBid = true;
  console.log(`\n  ★ Client B (instance 2) received bid_accepted:`);
  console.log(`    ${JSON.stringify(data, null, 2)}`);
});

function maybeStartBid() {
  if (clientAJoined && clientBJoined) {
    console.log('\nBoth clients joined. Client A placing bid via instance 1...');
    // amount must be >= starting_price + minimum_increment (1500000 + 50000)
    clientA.emit('place_bid', {
      auctionId: AUCTION_ID,
      amount: '1550000.00',
      idempotencyKey: crypto.randomUUID(),
    });
  }
}

clientA.on('bid_accepted', (data) => {
  console.log(`\n  Client A (instance 1) received bid_accepted: bid_id=${data.bid_id}`);
});

clientA.on('bid_rejected', (data) => {
  console.log(`\n  Client A bid rejected: ${data.reason_code} – ${data.message}`);
});

// Wait and evaluate
setTimeout(() => {
  console.log('\n══════════════════════════════════════════');
  console.log(`Client A joined: ${clientAJoined}`);
  console.log(`Client B joined: ${clientBJoined}`);
  console.log(`Client B received cross-instance bid: ${clientBReceivedBid}`);
  console.log('══════════════════════════════════════════');

  if (clientBReceivedBid) {
    console.log('PASS: Redis pub/sub works across instances');
  } else {
    console.log('FAIL: Client B did NOT receive bid from instance 1');
  }

  clientA.disconnect();
  clientB.disconnect();
  process.exit(clientBReceivedBid ? 0 : 1);
}, 10000);
