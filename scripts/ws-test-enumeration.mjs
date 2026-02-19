/**
 * Test: Anti-enumeration
 * - Try joining with non-existent auction UUID → generic "Unable to join auction"
 * - Try joining with garbage string → generic "Unable to join auction"
 * - Try joining with real auction but non-participant → generic "Unable to join auction"
 * All 3 must return the SAME generic error (no info leak).
 */
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const WS_URL = 'http://localhost:3001';
const WS_PATH = '/ws/auction';
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production_min_32_chars!!';
const REAL_AUCTION = 'a9487930-9a68-4cfa-9905-c7d246b49bb2';

function makeToken(sub) {
  return jwt.sign(
    { sub, email: 'test@nettapu.com', roles: ['user'] },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

function testJoin(label, userId, auctionId) {
  return new Promise((resolve) => {
    const token = makeToken(userId);
    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token },
    });

    socket.on('connect', () => {
      socket.emit('join_auction', { auctionId });
    });

    socket.on('error', (data) => {
      console.log(`  ${label}: error → "${data.message}"`);
      socket.disconnect();
      resolve(data.message);
    });

    socket.on('auction_state', () => {
      console.log(`  ${label}: FAIL — received auction_state`);
      socket.disconnect();
      resolve('UNEXPECTED_SUCCESS');
    });

    setTimeout(() => {
      console.log(`  ${label}: TIMEOUT`);
      socket.disconnect();
      resolve('TIMEOUT');
    }, 5000);
  });
}

console.log('╔══════════════════════════════════════════╗');
console.log('║  Anti-Enumeration Test                   ║');
console.log('╚══════════════════════════════════════════╝');

const nonParticipant = '00000000-0000-0000-0000-000000000099';
const nonExistentAuction = '00000000-0000-0000-0000-000000000001';
const garbageId = 'not-a-uuid-at-all!!!';

const r1 = await testJoin('Non-existent auction (valid UUID)', nonParticipant, nonExistentAuction);
const r2 = await testJoin('Garbage auction ID', nonParticipant, garbageId);
const r3 = await testJoin('Real auction, non-participant', nonParticipant, REAL_AUCTION);

console.log('\n══════════════════════════════════════════');
const allSame = r1 === r2 && r2 === r3 && r1 === 'Unable to join auction';
if (allSame) {
  console.log('PASS: All 3 attempts returned identical generic error');
  console.log(`  Message: "${r1}"`);
} else {
  console.log('FAIL: Responses differ (information leak detected)');
  console.log(`  r1="${r1}" r2="${r2}" r3="${r3}"`);
}
console.log('══════════════════════════════════════════');

process.exit(allSame ? 0 : 1);
