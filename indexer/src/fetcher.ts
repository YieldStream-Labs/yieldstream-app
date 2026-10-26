import { Asset, Horizon } from "@stellar/stellar-sdk";
import { parseDecimalToBigInt } from "./math.js";
import { Holder } from "./types.js";

/**
 * Fetches all non-zero balance holders of a given asset from a Horizon server.
 */
export function createHorizonServer(horizonUrl: string): Horizon.Server {
  return new Horizon.Server(horizonUrl);
}

export async function fetchAssetHolders(
  horizonUrl: string,
  assetCode: string,
  assetIssuer: string,
  _snapshotLedger?: number
): Promise<Holder[]> {
  const server = createHorizonServer(horizonUrl);
  const asset = new Asset(assetCode, assetIssuer);
  const holders: Holder[] = [];

  let page: Horizon.ServerApi.CollectionPage<Horizon.ServerApi.AccountRecord> =
    await server
      .accounts()
      .forAsset(asset)
      .limit(200)
      .call();

  while (page.records.length > 0) {
    for (const record of page.records) {
      const balanceLine = record.balances.find((b) => {
        if ("asset_code" in b && "asset_issuer" in b) {
          return b.asset_code === assetCode && b.asset_issuer === assetIssuer;
        }
        return false;
      });

      if (balanceLine && "balance" in balanceLine) {
        const rawBalance = parseDecimalToBigInt(balanceLine.balance);
        if (rawBalance > 0n) {
          holders.push({
            address: record.account_id,
            rawBalance,
          });
        }
      }
    }

    if (page.records.length < 200) {
      break;
    }

    page = await page.next();
  }

  return holders;
}
