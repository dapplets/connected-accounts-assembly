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

// !!! NETWORK TYPE !!!
const NEAR_NETWORK = 'testnet';

type NearAccount = string; // example: user.near, user.testnet

//  *****
//  SCHEME: accountId + / + origin or chain + / + network
//  Examples:
//  * user.near/near/mainnet
//  * user.testnet/near/testnet
//  * twitter_user/twitter
//  * ins_account/instagram
//  * google_account/google
//  * 0xF64929376812667BDa7D962661229f8b8dd90687/ethereum/goerli
//  * buidl.eth/ethereum/mainnet
//  *****
type Account = string;


//// MODELS

// Common
const OWNER_ACCOUNT_KEY = "a";
const INIT_CONTRACT_KEY = "l";
const ACTIVE_CONTRACT_KEY = "m";

// Identity

//  *****
//  accounts: account ----> linked accounts, closeness=1
//  *****
const accounts = new PersistentUnorderedMap<string, PersistentSet<string>>("b"); 

const ORACLE_ACCOUNT_KEY = "d";
const MIN_STAKE_AMOUNT_KEY = "e";

// Requests

@nearBindgen
export class VerificationRequest {
  constructor(
    public firstAccount: Account,
    public secondAccount: Account,
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

export function getConnectedAccounts(
  accountId: string,
  originId: string,
  closeness: u8
): string[] | null {
  _active();
  if (closeness === 1) {
    const a = accounts.get(accountId + '/' + originId);
    if (a) {
      const b = a.values();
      return b;
    } else {
      return null;
    }
  } else {
    const a = accounts.get(accountId + '/' + originId);
    if (a) {
      const b = a.values();
      return b;
    } else {
      return null;
    }
  }
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
    assert(accounts.contains(req.firstAccount), "Account " + req.firstAccount + " not found.");
    const connected1Accounts = accounts.get(req.firstAccount);
    assert(connected1Accounts!.has(req.secondAccount), "Account " + req.secondAccount + " was not connected to " + req.firstAccount);
    connected1Accounts!.delete(req.secondAccount);

    assert(accounts.contains(req.secondAccount), "Account " + req.secondAccount + " not found.");
    const connected2Accounts = accounts.get(req.secondAccount);
    assert(connected2Accounts!.has(req.firstAccount), "Account " + req.firstAccount + " was not connected to " + req.secondAccount);
    connected2Accounts!.delete(req.firstAccount);

    accounts.set(req.firstAccount, connected1Accounts!);
    accounts.set(req.secondAccount, connected2Accounts!);

    logging.log("Accounts " + req.firstAccount + " and " + req.secondAccount + " are unlinked");
  } else {
    const connected1Accounts = accounts.get(req.firstAccount);
    if (!connected1Accounts) {
      const newConnected1Accounts = new PersistentSet<string>('q');
      newConnected1Accounts.add(req.secondAccount);
      accounts.set(req.firstAccount, newConnected1Accounts);
    } else {
      assert(!connected1Accounts.has(req.secondAccount), "Account " + req.secondAccount + " has already connected to " + req.firstAccount);
      connected1Accounts.add(req.secondAccount);
      accounts.set(req.firstAccount, connected1Accounts);
    }

    const connected2Accounts = accounts.get(req.secondAccount);
    if (!connected2Accounts) {
      const newConnected2Accounts = new PersistentSet<string>('w');
      newConnected2Accounts.add(req.firstAccount);
      accounts.set(req.secondAccount, newConnected2Accounts);
    } else {
      assert(!connected2Accounts.has(req.firstAccount), "Account " + req.firstAccount + " has already connected to " + req.secondAccount);
      connected2Accounts.add(req.firstAccount);
      accounts.set(req.secondAccount, connected2Accounts);
    }

    logging.log("Accounts " + req.firstAccount + " and " + req.secondAccount + " are linked");
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
  accounts.clear();
}

// Requests

export function requestVerification(
  accountId: string,
  originId: string,
  isUnlink: boolean,
  url: string
): u32 {
  _active();

  assert(Context.sender == Context.predecessor, "Cross-contract calls is not allowed");
  assert(
    u128.ge(Context.attachedDeposit, storage.get<u128>(MIN_STAKE_AMOUNT_KEY, u128.Zero)!),
    "Insufficient stake amount"
  );

  const firstAccount = accountId + '/' + originId;
  const senderOrigin = 'near' + '/' + NEAR_NETWORK
  const secondAccount = Context.sender + '/' + senderOrigin;

  // ToDo: audit it
  if (isUnlink) {
    assert(accounts.contains(firstAccount), "Account " + accountId + " doesn't have linked accounts.");
    const connected1Accounts = accounts.get(firstAccount);
    assert(connected1Accounts!.has(secondAccount), "Account " + Context.sender + " was not connected to " + accountId);

    assert(accounts.contains(secondAccount), "Account " + Context.sender + " doesn't have linked accounts.");
    const connected2Accounts = accounts.get(secondAccount);
    assert(connected2Accounts!.has(firstAccount), "Account " + accountId + " was not connected to " + Context.sender);
  } else {
    const connected1Accounts = accounts.get(firstAccount);
    if (connected1Accounts) {
      assert(!connected1Accounts.has(secondAccount), "Account " + accountId + " has already connected to " + Context.sender);
    }

    const connected2Accounts = accounts.get(secondAccount);
    if (connected2Accounts) {
      assert(!connected2Accounts.has(firstAccount), "Account " + Context.sender + " has already connected to " + accountId);
    }
  }

  const id = verificationRequests.push(new VerificationRequest(
    secondAccount,
    firstAccount,
    isUnlink,
    url
  ));
  pendingRequests.add(id);

  const oracleAccount = storage.get<NearAccount>(ORACLE_ACCOUNT_KEY)!;
  ContractPromiseBatch.create(oracleAccount).transfer(Context.attachedDeposit);

  logging.log(
    Context.sender + " requests to link " + accountId + " account. Proof ID: " + id.toString() + " URL: " + url
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
