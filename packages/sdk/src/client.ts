import {
  Account,
  Contract,
  Keypair,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import {
  ClaimParams,
  CreateDistributionParams,
  Distribution,
  YieldStreamConfig,
} from "./types.js";
import {
  addressToScVal,
  bytes32ToScVal,
  i128ToScVal,
  scValToDistribution,
  u32ToScVal,
  u64ToScVal,
  vecBytes32ToScVal,
} from "./xdr.js";

export class YieldStreamClient {
  public readonly server: rpc.Server;
  public readonly networkPassphrase: string;
  public readonly contractId: string;
  public readonly contract: Contract;

  constructor(config: YieldStreamConfig) {
    this.server = new rpc.Server(config.rpcUrl);
    this.networkPassphrase = config.networkPassphrase;
    this.contractId = config.contractId;
    this.contract = new Contract(config.contractId);
  }

  /**
   * Fetches distribution details by ID via read-only simulation.
   */
  public async getDistribution(id: bigint | number): Promise<Distribution> {
    const tx = await this.buildReadOnlyTx("get_distribution", [u64ToScVal(id)]);
    const sim = await this.server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation error fetching distribution ${id}: ${sim.error}`);
    }

    if (!sim.result?.retval) {
      throw new Error(`No return value for distribution ${id}`);
    }

    return scValToDistribution(sim.result.retval);
  }

  /**
   * Verifies proof inclusion against on-chain contract state via simulation.
   */
  public async verify(params: ClaimParams): Promise<boolean> {
    const args: xdr.ScVal[] = [
      u64ToScVal(params.id),
      u32ToScVal(params.index),
      addressToScVal(params.claimant),
      i128ToScVal(params.amount),
      vecBytes32ToScVal(params.proof),
    ];

    const tx = await this.buildReadOnlyTx("verify", args);
    const sim = await this.server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      return false;
    }

    if (!sim.result?.retval) {
      return false;
    }

    return Boolean(scValToNative(sim.result.retval));
  }

  /**
   * Builds an un-signed transaction for create_distribution.
   */
  public async buildCreateDistributionTx(
    params: CreateDistributionParams,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    const account = await this.getAccount(sourceAccountAddress);

    const args: xdr.ScVal[] = [
      addressToScVal(params.issuer),
      addressToScVal(params.token),
      i128ToScVal(params.total),
      bytes32ToScVal(params.root),
      u32ToScVal(params.leafCount),
      u32ToScVal(params.snapshotLedger ?? 0),
      bytes32ToScVal(params.metaHash ?? Buffer.alloc(32)),
      u64ToScVal(params.opensAt ?? 0),
      u64ToScVal(params.expiresAt),
    ];

    const operation = this.contract.call("create_distribution", ...args);

    const tx = new TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(300)
      .build();

    return this.server.prepareTransaction(tx);
  }

  /**
   * Builds an un-signed transaction for claiming an allocation.
   */
  public async buildClaimTx(
    params: ClaimParams,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    const account = await this.getAccount(sourceAccountAddress);

    const args: xdr.ScVal[] = [
      u64ToScVal(params.id),
      u32ToScVal(params.index),
      addressToScVal(params.claimant),
      i128ToScVal(params.amount),
      vecBytes32ToScVal(params.proof),
    ];

    const operation = this.contract.call("claim", ...args);

    const tx = new TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(300)
      .build();

    return this.server.prepareTransaction(tx);
  }

  /**
   * Builds an un-signed transaction for cancelling an active distribution.
   */
  public async buildCancelTx(
    id: bigint | number,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    const account = await this.getAccount(sourceAccountAddress);

    const operation = this.contract.call("cancel", u64ToScVal(id));

    const tx = new TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(300)
      .build();

    return this.server.prepareTransaction(tx);
  }

  /**
   * Builds an un-signed transaction for sweeping remaining unclaimed tokens.
   */
  public async buildSweepTx(
    id: bigint | number,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    const account = await this.getAccount(sourceAccountAddress);

    const operation = this.contract.call("sweep", u64ToScVal(id));

    const tx = new TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(300)
      .build();

    return this.server.prepareTransaction(tx);
  }

  /**
   * Simulates a transaction and returns resource footprint and estimated fee.
   */
  public async simulate(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse> {
    return this.server.simulateTransaction(tx);
  }

  /**
   * Submits a signed transaction and polls for success.
   */
  public async submitTransaction(
    signedTx: Transaction
  ): Promise<rpc.Api.GetSuccessfulTransactionResponse> {
    const response = await this.server.sendTransaction(signedTx);

    if (response.status === "ERROR") {
      throw new Error(`Transaction submission error: ${JSON.stringify(response.errorResult)}`);
    }

    let statusRes = await this.server.getTransaction(response.hash);
    let attempts = 0;
    while (statusRes.status === "NOT_FOUND" && attempts < 15) {
      await new Promise((res) => setTimeout(res, 1000));
      statusRes = await this.server.getTransaction(response.hash);
      attempts++;
    }

    if (statusRes.status === "SUCCESS") {
      return statusRes;
    }

    throw new Error(`Transaction failed or timed out: ${statusRes.status}`);
  }

  private async getAccount(address: string): Promise<Account> {
    try {
      return await this.server.getAccount(address);
    } catch {
      // Fallback for simulation / mock account
      return new Account(address, "1");
    }
  }

  private async buildReadOnlyTx(method: string, args: xdr.ScVal[]): Promise<Transaction> {
    const dummyKey = Keypair.random();
    const account = new Account(dummyKey.publicKey(), "1");
    const op = this.contract.call(method, ...args);

    return new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(0)
      .build();
  }
}
