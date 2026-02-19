/**
 * Test 1: WebSocket Authentication
 * - Connect WITHOUT token → should be rejected
 * - Connect WITH valid token → should succeed
 * - Connect WITH expired/invalid token → should be rejected
 */
import { io } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const WS_URL = 'http://localhost:3001';
const WS_PATH = '/ws/auction';
const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_production_min_32_chars!!';
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const AUCTION_ID = 'a9487930-9a68-4cfa-9905-c7d246b49bb2';

function makeToken(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m', ...options });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testNoToken() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 1a: Connect WITHOUT token');
  console.log('══════════════════════════════════════════');

  return new Promise((resolve) => {
    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('FAIL: Connected without token (should not happen)');
      socket.disconnect();
      resolve(false);
    });

    socket.on('connect_error', (err) => {
      console.log('PASS: Connection rejected');
      console.log(`  Error: ${err.message}`);
      socket.disconnect();
      resolve(true);
    });

    setTimeout(() => {
      console.log('TIMEOUT: No response');
      socket.disconnect();
      resolve(false);
    }, 5000);
  });
}

async function testInvalidToken() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 1b: Connect with INVALID token');
  console.log('══════════════════════════════════════════');

  return new Promise((resolve) => {
    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token: 'this.is.not.a.valid.jwt' },
    });

    socket.on('connect', () => {
      console.log('FAIL: Connected with invalid token');
      socket.disconnect();
      resolve(false);
    });

    socket.on('connect_error', (err) => {
      console.log('PASS: Connection rejected');
      console.log(`  Error: ${err.message}`);
      socket.disconnect();
      resolve(true);
    });

    setTimeout(() => {
      console.log('TIMEOUT: No response');
      socket.disconnect();
      resolve(false);
    }, 5000);
  });
}

async function testExpiredToken() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 1c: Connect with EXPIRED token');
  console.log('══════════════════════════════════════════');

  const expiredToken = jwt.sign(
    { sub: USER_ID, email: 'test@test.com', roles: ['user'] },
    JWT_SECRET,
    { expiresIn: '-1s' },
  );

  return new Promise((resolve) => {
    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token: expiredToken },
    });

    socket.on('connect', () => {
      console.log('FAIL: Connected with expired token');
      socket.disconnect();
      resolve(false);
    });

    socket.on('connect_error', (err) => {
      console.log('PASS: Connection rejected');
      console.log(`  Error: ${err.message}`);
      socket.disconnect();
      resolve(true);
    });

    setTimeout(() => {
      console.log('TIMEOUT: No response');
      socket.disconnect();
      resolve(false);
    }, 5000);
  });
}

async function testValidToken() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 1d: Connect with VALID token');
  console.log('══════════════════════════════════════════');

  const token = makeToken({
    sub: USER_ID,
    email: 'test@nettapu.com',
    roles: ['user'],
  });

  return new Promise((resolve) => {
    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token },
    });

    socket.on('connect', () => {
      console.log('PASS: Connected successfully');
      console.log(`  Socket ID: ${socket.id}`);
      socket.disconnect();
      resolve(true);
    });

    socket.on('connect_error', (err) => {
      console.log(`FAIL: Connection rejected – ${err.message}`);
      socket.disconnect();
      resolve(false);
    });

    setTimeout(() => {
      console.log('TIMEOUT: No response');
      socket.disconnect();
      resolve(false);
    }, 5000);
  });
}

async function testParticipantOnlyJoin() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 1e: Join auction as NON-participant');
  console.log('══════════════════════════════════════════');

  // Use a different user ID that is NOT a participant
  const nonParticipantId = '00000000-0000-0000-0000-000000000099';
  const token = makeToken({
    sub: nonParticipantId,
    email: 'stranger@nettapu.com',
    roles: ['user'],
  });

  return new Promise((resolve) => {
    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token },
    });

    socket.on('connect', () => {
      console.log('  Connected (auth passed — non-participant user)');
      socket.emit('join_auction', { auctionId: AUCTION_ID });
    });

    socket.on('error', (data) => {
      console.log('PASS: Join rejected');
      console.log(`  Error: ${JSON.stringify(data)}`);
      socket.disconnect();
      resolve(true);
    });

    socket.on('auction_state', (data) => {
      console.log('FAIL: Received auction_state (should not happen)');
      console.log(`  Data: ${JSON.stringify(data)}`);
      socket.disconnect();
      resolve(false);
    });

    setTimeout(() => {
      console.log('TIMEOUT: No error/auction_state received');
      socket.disconnect();
      resolve(false);
    }, 5000);
  });
}

async function testParticipantJoin() {
  console.log('\n══════════════════════════════════════════');
  console.log('TEST 1f: Join auction as PARTICIPANT');
  console.log('══════════════════════════════════════════');

  const token = makeToken({
    sub: USER_ID,
    email: 'test@nettapu.com',
    roles: ['user'],
  });

  return new Promise((resolve) => {
    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token },
    });

    socket.on('connect', () => {
      console.log('  Connected (auth passed)');
      socket.emit('join_auction', { auctionId: AUCTION_ID });
    });

    socket.on('auction_state', (data) => {
      console.log('PASS: Received auction_state snapshot');
      console.log(`  ${JSON.stringify(data, null, 2)}`);
      socket.disconnect();
      resolve(true);
    });

    socket.on('error', (data) => {
      console.log(`FAIL: Join rejected – ${JSON.stringify(data)}`);
      socket.disconnect();
      resolve(false);
    });

    setTimeout(() => {
      console.log('TIMEOUT: No auction_state received');
      socket.disconnect();
      resolve(false);
    }, 5000);
  });
}

// ── Run all ──────────────────────────────────────────────
console.log('╔══════════════════════════════════════════╗');
console.log('║  WebSocket Authentication Tests          ║');
console.log('╚══════════════════════════════════════════╝');

const results = [];
results.push(await testNoToken());
results.push(await testInvalidToken());
results.push(await testExpiredToken());
results.push(await testValidToken());
results.push(await testParticipantOnlyJoin());
results.push(await testParticipantJoin());

console.log('\n══════════════════════════════════════════');
console.log(`RESULTS: ${results.filter(Boolean).length}/${results.length} passed`);
console.log('══════════════════════════════════════════');

process.exit(results.every(Boolean) ? 0 : 1);
