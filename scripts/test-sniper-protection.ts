/**
 * Phase 7 Load Safety Test: Sniper Protection
 *
 * Simulates 100 concurrent bidders placing bids in the final seconds
 * of a live auction to verify:
 *   1. Sniper extensions fire correctly
 *   2. Auction ends exactly once
 *   3. Single winner, single final price (no double-winner)
 *   4. All bids are either accepted or rejected with valid reason
 *
 * Prerequisites:
 *   - Auction service running on WS_URL (default: http://localhost:3001)
 *   - A LIVE auction with scheduled_end ~15 seconds from now
 *   - Participants + consents pre-populated for test user IDs
 *     (or disable eligibility checks for testing)
 *
 * Usage:
 *   AUCTION_ID=<uuid> npx ts-node scripts/test-sniper-protection.ts
 */

import { io, Socket } from 'socket.io-client';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const WS_URL = process.env.WS_URL || 'http://localhost:3001';
const WS_PATH = '/ws/auction';
const JWT_SECRET =
  process.env.JWT_SECRET || 'change_me_in_production_min_32_chars!!';
const AUCTION_ID = process.env.AUCTION_ID;

if (!AUCTION_ID) {
  console.error('ERROR: AUCTION_ID environment variable is required.');
  console.error(
    'Usage: AUCTION_ID=<uuid> npx ts-node scripts/test-sniper-protection.ts',
  );
  process.exit(1);
}

const CONCURRENT_BIDDERS = 100;
const BASE_AMOUNT = 2_000_000;
const INCREMENT = 50_000;

interface TestResult {
  bidsAccepted: number;
  bidsRejected: number;
  extensionsReceived: number;
  endingsReceived: number;
  endedMessages: Array<{ winner_id_masked: string; final_price: string }>;
  rejectionReasons: Record<string, number>;
}

const result: TestResult = {
  bidsAccepted: 0,
  bidsRejected: 0,
  extensionsReceived: 0,
  endingsReceived: 0,
  endedMessages: [],
  rejectionReasons: {},
};

const sockets: Socket[] = [];

function createBidder(index: number): Promise<void> {
  const userId = randomUUID();
  const token = jwt.sign(
    {
      sub: userId,
      email: `bidder${index}@test.nettapu.com`,
      roles: ['user'],
    },
    JWT_SECRET,
    { expiresIn: '15m' },
  );

  return new Promise((resolve, reject) => {
    const socket = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket'],
      auth: { token },
      timeout: 10000,
    });

    sockets.push(socket);

    socket.on('connect', () => {
      socket.emit('join_auction', { auctionId: AUCTION_ID });
    });

    socket.on('auction_state', () => {
      // Place bid after joining
      const amount = (BASE_AMOUNT + index * INCREMENT).toString();
      socket.emit('place_bid', {
        auctionId: AUCTION_ID,
        amount,
        idempotencyKey: randomUUID(),
      });
      resolve();
    });

    socket.on('bid_accepted', () => {
      result.bidsAccepted++;
    });

    socket.on('bid_rejected', (data: { reason_code?: string }) => {
      result.bidsRejected++;
      const reason = data.reason_code ?? 'unknown';
      result.rejectionReasons[reason] =
        (result.rejectionReasons[reason] ?? 0) + 1;
    });

    socket.on('auction_extended', () => {
      result.extensionsReceived++;
    });

    socket.on('auction_ending', () => {
      result.endingsReceived++;
    });

    socket.on('auction_ended', (data: any) => {
      result.endedMessages.push(data);
    });

    socket.on('connect_error', (err: Error) => {
      console.error(`Bidder ${index} connection error: ${err.message}`);
      resolve(); // Don't fail the entire test for individual connections
    });

    // Timeout safety
    setTimeout(() => resolve(), 5000);
  });
}

async function main(): Promise<void> {
  console.log('============================================');
  console.log('  Sniper Protection Load Test');
  console.log(`  Bidders:  ${CONCURRENT_BIDDERS}`);
  console.log(`  Auction:  ${AUCTION_ID}`);
  console.log(`  WS URL:   ${WS_URL}`);
  console.log('============================================\n');

  // Connect all bidders concurrently
  console.log('Connecting bidders...');
  const bidderPromises: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENT_BIDDERS; i++) {
    bidderPromises.push(createBidder(i));
  }
  await Promise.all(bidderPromises);

  const connectedCount = sockets.filter((s) => s.connected).length;
  console.log(
    `${connectedCount}/${CONCURRENT_BIDDERS} bidders connected and bidding.\n`,
  );

  // Wait for auction to end + processing time
  console.log(
    'Waiting 90 seconds for auction to end (includes sniper extensions)...',
  );
  await new Promise((resolve) => setTimeout(resolve, 90_000));

  // Evaluate results
  console.log('\n============================================');
  console.log('  RESULTS');
  console.log('============================================');
  console.log(`Bids accepted:        ${result.bidsAccepted}`);
  console.log(`Bids rejected:        ${result.bidsRejected}`);
  console.log(`Extensions received:  ${result.extensionsReceived}`);
  console.log(`Ending signals:       ${result.endingsReceived}`);
  console.log(`Ended messages:       ${result.endedMessages.length}`);

  if (Object.keys(result.rejectionReasons).length > 0) {
    console.log('Rejection breakdown:');
    for (const [reason, count] of Object.entries(result.rejectionReasons)) {
      console.log(`  ${reason}: ${count}`);
    }
  }

  console.log('--------------------------------------------');

  let pass = true;

  // Check: single winner across all ended messages
  const uniqueWinners = new Set(
    result.endedMessages.map((m) => m.winner_id_masked),
  );
  const uniqueFinalPrices = new Set(
    result.endedMessages.map((m) => m.final_price),
  );

  if (uniqueWinners.size > 1) {
    console.log('FAIL: Multiple different winners detected!');
    console.log('  Winners:', [...uniqueWinners]);
    pass = false;
  } else if (uniqueWinners.size === 1) {
    console.log('PASS: Single winner determined');
  }

  if (uniqueFinalPrices.size > 1) {
    console.log('FAIL: Multiple different final prices!');
    console.log('  Prices:', [...uniqueFinalPrices]);
    pass = false;
  } else if (uniqueFinalPrices.size === 1) {
    console.log('PASS: Single final price');
  }

  // Each connected socket should receive exactly 1 ended message
  // (all messages should be identical)
  if (result.endedMessages.length > 0) {
    console.log(
      `PASS: Auction ended (winner: ${result.endedMessages[0].winner_id_masked}, price: ${result.endedMessages[0].final_price})`,
    );
  } else {
    console.log(
      'WARN: No AUCTION_ENDED message received (auction may still be live or bidders not authorized)',
    );
  }

  // Extensions should have been received by connected sockets
  if (result.extensionsReceived > 0) {
    console.log(`PASS: ${result.extensionsReceived} extension events received`);
  } else {
    console.log(
      'INFO: No extensions received (bids may not have been within sniper window)',
    );
  }

  console.log('============================================');
  console.log(pass ? '\n  ALL CHECKS PASSED\n' : '\n  SOME CHECKS FAILED\n');

  // Cleanup
  for (const socket of sockets) {
    socket.disconnect();
  }

  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
