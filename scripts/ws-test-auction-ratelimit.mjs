/**
 * Test: Per-auction rate limit (50 bids per 3s per auction room)
 * - Spawn multiple clients, flood >50 bids rapidly
 * - Verify that bids beyond 50 get auction_rate_limited
 */
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { execSync } from 'child_process';

const WS_URL = 'http://localhost:3001';
const WS_PATH = '/ws/auction';
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production_min_32_chars!!';
const AUCTION_ID = 'a9487930-9a68-4cfa-9905-c7d246b49bb2';

const USER_COUNT = 12;
const BIDS_PER_USER = 5;

console.log('╔══════════════════════════════════════════╗');
console.log('║  Per-Auction Rate Limit Test             ║');
console.log('╚══════════════════════════════════════════╝');

const userIds = [];
for (let i = 0; i < USER_COUNT; i++) {
  userIds.push(`10000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
}

// Seed all test users + participants + consents
console.log(`Seeding ${USER_COUNT} test participants...`);
for (const uid of userIds) {
  try {
    execSync(
      `docker exec nettapu-postgres psql -U nettapu_app -d nettapu -c "INSERT INTO auth.users (id, email, password_hash, first_name, last_name) VALUES ('${uid}', '${uid}@test.com', 'hash', 'Test', 'User') ON CONFLICT (id) DO NOTHING;"`,
      { stdio: 'pipe' },
    );
  } catch (e) { /* ignore */ }
  try {
    execSync(
      `docker exec nettapu-postgres psql -U nettapu_app -d nettapu -c "INSERT INTO auctions.auction_participants (id, auction_id, user_id, deposit_id, eligible, registered_at) VALUES (gen_random_uuid(), '${AUCTION_ID}', '${uid}', gen_random_uuid(), true, NOW()) ON CONFLICT DO NOTHING;"`,
      { stdio: 'pipe' },
    );
  } catch (e) { /* ignore */ }
  try {
    execSync(
      `docker exec nettapu-postgres psql -U nettapu_app -d nettapu -c "INSERT INTO auctions.auction_consents (id, auction_id, user_id, consent_text_hash, accepted_at) VALUES (gen_random_uuid(), '${AUCTION_ID}', '${uid}', 'e3b0c44298fc1c149afbf4c8996fb924', NOW()) ON CONFLICT DO NOTHING;"`,
      { stdio: 'pipe' },
    );
  } catch (e) { /* ignore */ }
}
console.log('Seeding complete.\n');

let auctionRateLimited = false;
let auctionRateLimitCount = 0;
let userRateLimitCount = 0;
let otherRejections = 0;
let accepted = 0;
let totalSent = 0;

function connectAndBid(userId, bidCount) {
  return new Promise((resolve) => {
    const token = jwt.sign(
      { sub: userId, email: `${userId}@test.com`, roles: ['user'] },
      JWT_SECRET,
      { expiresIn: '15m' },
    );

    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token },
    });

    let received = 0;

    socket.on('connect', () => {
      socket.emit('join_auction', { auctionId: AUCTION_ID });
    });

    socket.on('connect_error', (err) => {
      console.log(`  Connect error for ${userId}: ${err.message}`);
      resolve();
    });

    socket.on('auction_state', () => {
      for (let i = 0; i < bidCount; i++) {
        const amount = (2000000 + Math.random() * 1000000).toFixed(2);
        socket.emit('place_bid', {
          auctionId: AUCTION_ID,
          amount,
          idempotencyKey: crypto.randomUUID(),
        });
        totalSent++;
      }
    });

    socket.on('error', (data) => {
      // join_auction may be denied if seeding failed
      console.log(`  Error for ${userId}: ${JSON.stringify(data)}`);
      socket.disconnect();
      resolve();
    });

    socket.on('bid_accepted', () => {
      accepted++;
      received++;
      if (received >= bidCount) { socket.disconnect(); resolve(); }
    });

    socket.on('bid_rejected', (data) => {
      if (data.reason_code === 'auction_rate_limited') {
        auctionRateLimited = true;
        auctionRateLimitCount++;
      } else if (data.reason_code === 'rate_limited') {
        userRateLimitCount++;
      } else {
        otherRejections++;
      }
      received++;
      if (received >= bidCount) { socket.disconnect(); resolve(); }
    });

    setTimeout(() => {
      socket.disconnect();
      resolve();
    }, 15000);
  });
}

// Fire all users in parallel
const promises = userIds.map((uid) => connectAndBid(uid, BIDS_PER_USER));
await Promise.all(promises);

// Wait for stragglers
await new Promise((r) => setTimeout(r, 2000));

console.log('\n══════════════════════════════════════════');
console.log(`Total bids sent:            ${totalSent}`);
console.log(`Accepted:                   ${accepted}`);
console.log(`Auction rate limited:       ${auctionRateLimitCount}`);
console.log(`User rate limited:          ${userRateLimitCount}`);
console.log(`Other rejections:           ${otherRejections}`);
console.log(`Auction rate limit hit:     ${auctionRateLimited}`);
console.log('══════════════════════════════════════════');

if (auctionRateLimited) {
  console.log('PASS: Per-auction rate limiting triggered');
} else {
  console.log('FAIL: Per-auction rate limiting was NOT triggered');
}

process.exit(auctionRateLimited ? 0 : 1);
