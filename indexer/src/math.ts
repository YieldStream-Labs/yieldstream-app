import { DividendAllocation, Holder } from "./types.js";

/**
 * Converts a decimal balance string (e.g. "123.4567890") into BigInt base stroops
 * without using JavaScript floating point math.
 */
export function parseDecimalToBigInt(valStr: string, decimals = 7): bigint {
  const parts = valStr.trim().split(".");
  const whole = parts[0] || "0";
  const frac = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + frac);
}

/**
 * Calculates dividend allocation for an individual holder:
 * amount_i = floor(pool * balance_i / sum_balances)
 *
 * Implemented using pure BigInt integer division (which truncates towards zero / floor for positives).
 */
export function calculateDividend(
  pool: bigint,
  holderBalance: bigint,
  sumBalances: bigint
): bigint {
  if (sumBalances <= 0n || pool <= 0n || holderBalance <= 0n) {
    return 0n;
  }
  return (pool * holderBalance) / sumBalances;
}

/**
 * Computes deterministic dividend allocations for all holders.
 */
export function calculateAllocations(
  holders: Holder[],
  pool: bigint
): DividendAllocation[] {
  // 1. Filter holders with non-zero balances
  const validHolders = holders.filter((h) => h.rawBalance > 0n);

  // 2. Sort deterministically by address lexicographically
  validHolders.sort((a, b) => a.address.localeCompare(b.address));

  // 3. Sum total balances with BigInt
  const sumBalances = validHolders.reduce(
    (acc, h) => acc + h.rawBalance,
    0n
  );

  // 4. Calculate individual allocations
  const allocations: DividendAllocation[] = [];
  for (let i = 0; i < validHolders.length; i++) {
    const holder = validHolders[i];
    const reward = calculateDividend(pool, holder.rawBalance, sumBalances);
    allocations.push({
      index: i,
      claimant: holder.address,
      holdingBalance: holder.rawBalance,
      rewardAmount: reward,
    });
  }

  return allocations;
}
