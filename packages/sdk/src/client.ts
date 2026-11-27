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
  CreateStreamParams,
  Distribution,
  DistributionId,
  VerifyProofParams,
  VestingSchedule,
  YieldStreamConfig,
} from "./types.js";
import {
  addressToScVal,
  bytes32ToScVal,
  i128ToScVal,
  scValToBigInt,
  scValToBoolean,
  scValToDistribution,
  scValToOptionalU64,
  scValToVestingSchedule,
  u32ToScVal,
  u64ToScVal,
  vecBytes32ToScVal,
} from "./xdr.js";

function bytesToHex(value: unknown): string {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }
  if (Array.isArray(value)) {
    return Buffer.from(value.map((byte) => Number(byte))).toString("hex");
  }
  throw new Error("Contract did not return a byte array");
}

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
  public async getDistribution(id: DistributionId): Promise<Distribution> {
    const retval = await this.simulateResult("get_distribution", [u32ToScVal(id)]);
    return scValToDistribution(retval);
  }

  /**
   * Fetches a stream's vesting schedule, or null for a non-stream distribution.
   */
  public async getVestingSchedule(
    id: DistributionId
  ): Promise<VestingSchedule | null> {
    const retval = await this.simulateResult("get_vesting_schedule", [
      u32ToScVal(id),
    ]);
    return scValToVestingSchedule(retval);
  }

  /**
   * Fetches the timestamp when a stream was clawed back, or null.
   */
  public async getClawbackTime(id: DistributionId): Promise<bigint | null> {
    const retval = await this.simulateResult("get_clawback_time", [
      u32ToScVal(id),
    ]);
    return scValToOptionalU64(retval);
  }

  /**
   * Fetches the cumulative amount already claimed for a leaf.
   */
  public async getClaimedAmount(
    id: DistributionId,
    index: number
  ): Promise<bigint> {
    const retval = await this.simulateResult("get_claimed_amount", [
      u32ToScVal(id),
      u32ToScVal(index),
    ]);
    return scValToBigInt(retval);
  }

  /**
   * Fetches the amount currently claimable for a leaf.
   */
  public async getClaimableAmount(
    id: DistributionId,
    index: number,
    amount: bigint
  ): Promise<bigint> {
    const retval = await this.simulateResult("get_claimable_amount", [
      u32ToScVal(id),
      u32ToScVal(index),
      i128ToScVal(amount),
    ]);
    return scValToBigInt(retval);
  }

  /**
   * Checks whether a leaf index has already been fully claimed.
   */
  public async isClaimed(id: DistributionId, index: number): Promise<boolean> {
    const retval = await this.simulateResult("is_claimed", [
      u32ToScVal(id),
      u32ToScVal(index),
    ]);
    return scValToBoolean(retval);
  }

  /**
   * Gets the total number of distributions created.
   */
  public async getDistributionCount(): Promise<number> {
    const retval = await this.simulateResult("get_distribution_count", []);
    return Number(scValToBigInt(retval));
  }

  /**
   * Gets the contract administrator address.
   */
  public async getAdmin(): Promise<string> {
    const retval = await this.simulateResult("get_admin", []);
    return String(scValToNative(retval));
  }

  /**
   * Gets the current contract version.
   */
  public async getVersion(): Promise<number> {
    const retval = await this.simulateResult("get_version", []);
    return Number(scValToBigInt(retval));
  }

  /**
   * Computes the canonical leaf hash on-chain for the supplied claim fields.
   */
  public async computeLeaf(params: ClaimParams): Promise<string> {
    const retval = await this.simulateResult("compute_leaf", [
      u32ToScVal(params.distributionId),
      u32ToScVal(params.index),
      addressToScVal(params.recipient),
      i128ToScVal(params.amount),
    ]);
    return bytesToHex(scValToNative(retval));
  }

  /**
   * Verifies a Merkle proof against an on-chain root and leaf.
   */
  public async verifyProof(params: VerifyProofParams): Promise<boolean> {
    const args: xdr.ScVal[] = [
      vecBytes32ToScVal(params.proof),
      bytes32ToScVal(params.root),
      bytes32ToScVal(params.leaf),
    ];
    const retval = await this.simulateResult("verify_proof", args);
    return scValToBoolean(retval);
  }

  /**
   * Convenience helper: derives the leaf and verifies it against the
   * distribution's current on-chain Merkle root.
   */
  public async verify(params: ClaimParams): Promise<boolean> {
    const distribution = await this.getDistribution(params.distributionId);
    const leaf = await this.computeLeaf(params);
    return this.verifyProof({
      proof: params.proof,
      root: distribution.merkleRoot,
      leaf,
    });
  }

  /**
   * Builds an Operation for create_distribution.
   */
  public buildCreateDistributionOp(
    params: CreateDistributionParams
  ): xdr.Operation {
    return this.contract.call(
      "create_distribution",
      addressToScVal(params.creator),
      addressToScVal(params.token),
      bytes32ToScVal(params.root),
      i128ToScVal(params.totalAmount),
      u32ToScVal(params.numRecipients),
      u64ToScVal(params.endTime)
    );
  }

  /**
   * Builds an Operation for create_stream.
   */
  public buildCreateStreamOp(params: CreateStreamParams): xdr.Operation {
    return this.contract.call(
      "create_stream",
      addressToScVal(params.issuer),
      addressToScVal(params.token),
      bytes32ToScVal(params.root),
      i128ToScVal(params.totalAmount),
      u32ToScVal(params.numRecipients),
      u64ToScVal(params.startTime),
      u64ToScVal(params.cliffTime),
      u64ToScVal(params.endTime)
    );
  }

  /**
   * Builds an Operation for claim.
   */
  public buildClaimOp(params: ClaimParams): xdr.Operation {
    return this.contract.call(
      "claim",
      u32ToScVal(params.distributionId),
      u32ToScVal(params.index),
      addressToScVal(params.recipient),
      i128ToScVal(params.amount),
      vecBytes32ToScVal(params.proof)
    );
  }

  /**
   * Builds an Operation for cancel.
   */
  public buildCancelOp(id: DistributionId): xdr.Operation {
    return this.contract.call("cancel", u32ToScVal(id));
  }

  /**
   * Builds an Operation for sweep.
   */
  public buildSweepOp(id: DistributionId, to: string): xdr.Operation {
    return this.contract.call(
      "sweep",
      u32ToScVal(id),
      addressToScVal(to)
    );
  }

  /**
   * Builds an Operation for clawback.
   */
  public buildClawbackOp(id: DistributionId): xdr.Operation {
    return this.contract.call("clawback", u32ToScVal(id));
  }

  /**
   * Builds an un-signed transaction for create_distribution.
   */
  public async buildCreateDistributionTx(
    params: CreateDistributionParams,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    return this.buildPreparedTx(
      this.buildCreateDistributionOp(params),
      sourceAccountAddress
    );
  }

  /**
   * Builds an un-signed transaction for create_stream.
   */
  public async buildCreateStreamTx(
    params: CreateStreamParams,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    return this.buildPreparedTx(
      this.buildCreateStreamOp(params),
      sourceAccountAddress
    );
  }

  /**
   * Builds an un-signed transaction for claiming an allocation.
   */
  public async buildClaimTx(
    params: ClaimParams,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    return this.buildPreparedTx(
      this.buildClaimOp(params),
      sourceAccountAddress
    );
  }

  /**
   * Builds an un-signed transaction for cancelling an active distribution.
   */
  public async buildCancelTx(
    id: DistributionId,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    return this.buildPreparedTx(this.buildCancelOp(id), sourceAccountAddress);
  }

  /**
   * Builds an un-signed transaction for sweeping remaining unclaimed tokens.
   */
  public async buildSweepTx(
    id: DistributionId,
    to: string,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    return this.buildPreparedTx(
      this.buildSweepOp(id, to),
      sourceAccountAddress
    );
  }

  /**
   * Builds an un-signed transaction for clawing back unvested stream tokens.
   */
  public async buildClawbackTx(
    id: DistributionId,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    return this.buildPreparedTx(
      this.buildClawbackOp(id),
      sourceAccountAddress
    );
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

  private async buildPreparedTx(
    operation: xdr.Operation,
    sourceAccountAddress: string
  ): Promise<Transaction> {
    const account = await this.getAccount(sourceAccountAddress);
    const tx = new TransactionBuilder(account, {
      fee: "100000",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(300)
      .build();

    return this.server.prepareTransaction(tx);
  }

  private async getAccount(address: string): Promise<Account> {
    try {
      return await this.server.getAccount(address);
    } catch {
      return new Account(address, "1");
    }
  }

  private async simulateResult(
    method: string,
    args: xdr.ScVal[]
  ): Promise<xdr.ScVal> {
    const tx = await this.buildReadOnlyTx(method, args);
    const sim = await this.server.simulateTransaction(tx);

    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation error for ${method}: ${sim.error}`);
    }

    if (!sim.result?.retval) {
      throw new Error(`No return value for ${method}`);
    }

    return sim.result.retval;
  }

  private async buildReadOnlyTx(
    method: string,
    args: xdr.ScVal[]
  ): Promise<Transaction> {
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
