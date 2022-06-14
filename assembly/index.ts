import {
  PersistentUnorderedMap,
  storage,
  Context,
  logging,
  u128,
  ContractPromiseBatch,
  PersistentSet,
  PersistentVector,
} from "near-sdk-core";

type NearAccount = string; // example: user.near, user.testnet
type ExternalAccount = string; // example: twitter/user

//// MODELS

// Common
const OWNER_ACCOUNT_KEY = "a";
const INIT_CONTRACT_KEY = "l";
const ACTIVE_CONTRACT_KEY = "m";

// Identity

const externalByNear = new PersistentUnorderedMap<NearAccount, ExternalAccount>("b");
const nearByExternal = new PersistentUnorderedMap<ExternalAccount, NearAccount>("c");
const ORACLE_ACCOUNT_KEY = "d";
const MIN_STAKE_AMOUNT_KEY = "e";

// Requests

@nearBindgen
export class VerificationRequest {
  constructor(
    public nearAccount: NearAccount,
    public externalAccount: ExternalAccount,
    public isUnlink: boolean,
    public proofUrl: string
  ) {}
}

const verificationRequests = new PersistentVector<VerificationRequest>("f");
const pendingRequests = new PersistentSet<u32>("g");
const approvedRequests = new PersistentSet<u32>("k");

// INITIALIZATION

export function initialize(
  ownerAccountId: NearAccount,
  oracleAccountId: NearAccount,
  minStakeAmount: u128,
): void {
  assert(storage.getPrimitive<bool>(INIT_CONTRACT_KEY, false) == false, "Contract already initialized");

  storage.set<NearAccount>(OWNER_ACCOUNT_KEY, ownerAccountId);
  storage.set<NearAccount>(ORACLE_ACCOUNT_KEY, oracleAccountId);
  storage.set<u128>(MIN_STAKE_AMOUNT_KEY, minStakeAmount);
  storage.set<bool>(INIT_CONTRACT_KEY, true);
  storage.set<bool>(ACTIVE_CONTRACT_KEY, true);

  logging.log(
    "Init contract with owner: " +
      ownerAccountId +
      ", oracle: " +
      oracleAccountId +
      " and min stake: " +
      minStakeAmount.toString()
  );
}

//// READ

// Identity

export function getExternalAccount(nearAccount: NearAccount): ExternalAccount | null {
  _active();
  return externalByNear.get(nearAccount);
}

export function getNearAccount(externalAccount: ExternalAccount): NearAccount | null {
  _active();
  return nearByExternal.get(externalAccount);
}

export function getOwnerAccount(): NearAccount | null {
  _active();
  return storage.get<NearAccount>(OWNER_ACCOUNT_KEY);
}

export function getOracleAccount(): NearAccount | null {
  _active();
  return storage.get<NearAccount>(ORACLE_ACCOUNT_KEY);
}

export function getMinStakeAmount(): u128 {
  _active();
  return storage.get<u128>(MIN_STAKE_AMOUNT_KEY, u128.Zero)!;
}

// Requests

export function getPendingRequests(): u32[] {
  _active();
  return pendingRequests.values();
}

export function getVerificationRequest(id: u32): VerificationRequest | null {
  _active();
  if (!verificationRequests.containsIndex(id)) return null;
  return verificationRequests[id];
}

export function getRequestStatus(id: u32): u8 {
  _active();
  if (!verificationRequests.containsIndex(id)) {
    return u8(0); // not found
  } else if (pendingRequests.has(id)) {
    return u8(1); // pending
  } else if (approvedRequests.has(id)) {
    return u8(2); // approved
  } else {
    return u8(3); // rejected
  }
}

// WRITE

// Identity

export function approveRequest(requestId: u32): void {
  _active();
  _onlyOracle();
  assert(verificationRequests.containsIndex(requestId), "Non-existent request ID");
  assert(pendingRequests.has(requestId), "The request has already been processed");
  const req = verificationRequests[requestId];

  if (req.isUnlink) {
    externalByNear.delete(req.nearAccount);
    nearByExternal.delete(req.externalAccount);
    logging.log("Accounts " + req.nearAccount + " and " + req.externalAccount + " are unlinked");
  } else {
    externalByNear.set(req.nearAccount, req.externalAccount);
    nearByExternal.set(req.externalAccount, req.nearAccount);
    logging.log("Accounts " + req.nearAccount + " and " + req.externalAccount + " are linked");
  }

  pendingRequests.delete(requestId);
  approvedRequests.add(requestId);
}

export function rejectRequest(requestId: u32): void {
  _active();
  _onlyOracle();
  assert(verificationRequests.containsIndex(requestId), "Non-existent request ID");
  assert(pendingRequests.has(requestId), "The request has already been processed");
  pendingRequests.delete(requestId);
}

export function changeOwnerAccount(newAccountId: NearAccount): void {
  _active();
  _onlyOwner();
  storage.set(OWNER_ACCOUNT_KEY, newAccountId);
  logging.log("Changed owner: " + newAccountId);
}

export function changeOracleAccount(newAccountId: NearAccount): void {
  _active();
  _onlyOwner();
  storage.set(ORACLE_ACCOUNT_KEY, newAccountId);
  logging.log("Changed oracle: " + newAccountId);
}

export function changeMinStake(minStakeAmount: u128): void {
  _active();
  _onlyOwner();
  storage.set<u128>(MIN_STAKE_AMOUNT_KEY, minStakeAmount);
  logging.log("Changed min stake: " + minStakeAmount.toString());
}

export function unlinkAll(): void {
  _active();
  _onlyOwner();
  externalByNear.clear();
  nearByExternal.clear();
}

// Requests

export function requestVerification(externalAccount: ExternalAccount, isUnlink: boolean, url: string): u32 {
  _active();

  assert(Context.sender == Context.predecessor, "Cross-contract calls is not allowed");
  assert(
    u128.ge(Context.attachedDeposit, storage.get<u128>(MIN_STAKE_AMOUNT_KEY, u128.Zero)!),
    "Insufficient stake amount"
  );

  // ToDo: audit it
  if (isUnlink) {
    assert(externalByNear.contains(Context.sender), "The NEAR account doesn't have a linked account");
    assert(nearByExternal.contains(externalAccount), "The external account doesn't have a linked account");

    // ToDo: 
    // assert(nearByExternal.get(externalAccount) == Context.sender, "");
    // assert(nearByExternal.get(Context.sender) == externalAccount, "");
  } else {
    assert(!externalByNear.contains(Context.sender), "The NEAR account already has a linked account");
    assert(!nearByExternal.contains(externalAccount), "The external account already has a linked account");
  }

  const id = verificationRequests.push(new VerificationRequest(Context.sender, externalAccount, isUnlink, url));
  pendingRequests.add(id);

  const oracleAccount = storage.get<NearAccount>(ORACLE_ACCOUNT_KEY)!;
  ContractPromiseBatch.create(oracleAccount).transfer(Context.attachedDeposit);

  logging.log(
    Context.sender + " requests to link " + externalAccount + " account. Proof ID: " + id.toString() + " URL: " + url
  );

  return id;
}

// HELPERS

function _onlyOracle(): void {
  assert(storage.get<NearAccount>(ORACLE_ACCOUNT_KEY) == Context.sender, "Only oracle account can write");
}

function _onlyOwner(): void {
  assert(storage.get<NearAccount>(OWNER_ACCOUNT_KEY) == Context.sender, "Only owner account can write");
}

function _active(): void {
  assert(storage.getPrimitive<bool>(ACTIVE_CONTRACT_KEY, false) == true, "Contract inactive");
}
