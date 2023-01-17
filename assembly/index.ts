import {
  PersistentUnorderedMap,
  storage,
  Context,
  logging,
  u128,
  ContractPromise,
  ContractPromiseBatch,
  PersistentSet,
  PersistentVector,
} from "near-sdk-core";

import {
  Account,
  AccountGlobalId,
  AccountState,
  LinkingAccount,
  LinkingAccounts,
  Signature,
  VerificationRequest,
  WalletProof,
} from "./modules";
import {
  get_callback_result,
  XCC_SUCCESS,
  TGAS,
  NO_DEPOSIT,
  // GreetingArgs,
  GreetingCallbackArgs,
  EcrecoverOutput,
} from "./external";

const NEAR_NETWORK = "testnet"; //      !!! NETWORK TYPE !!!
const senderOrigin = "near" + "/" + NEAR_NETWORK;

const decentralizedOracleAddress = "dev-1673443756915-97175480951973";

const DEFAULT_FUNC_CALL_GAS = u64(30_000_000_000_000);

type NearAccountId = string; //  example: user.near, user.testnet

//// MODELS

// Common
const OWNER_ACCOUNT_KEY = "a";
const INIT_CONTRACT_KEY = "b";
const ACTIVE_CONTRACT_KEY = "c";

// Identity

const _connectedAccounts = new PersistentUnorderedMap<AccountGlobalId, Set<AccountGlobalId>>("d");

const _statuses = new PersistentUnorderedMap<AccountGlobalId, AccountState>("e");

const ORACLE_ACCOUNT_KEY = "f";
const MIN_STAKE_AMOUNT_KEY = "g";

// Requests

const verificationRequests = new PersistentVector<VerificationRequest>("h");
const pendingRequests = new PersistentSet<u32>("i");
const approvedRequests = new PersistentSet<u32>("j");

// INITIALIZATION

export function initialize(ownerAccountId: NearAccountId, oracleAccountId: NearAccountId, minStakeAmount: u128): void {
  assert(storage.getPrimitive<bool>(INIT_CONTRACT_KEY, false) == false, "Contract already initialized");

  storage.set<NearAccountId>(OWNER_ACCOUNT_KEY, ownerAccountId);
  storage.set<NearAccountId>(ORACLE_ACCOUNT_KEY, oracleAccountId);
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

function _getStatus(id: AccountGlobalId): bool {
  if (_statuses.contains(id)) {
    const res = _statuses.get(id);
    if (res) {
      return res.isMain;
    }
  }
  return false;
}

export function getStatus(accountId: string, originId: string): bool {
  _active();
  const accountGlobalId: AccountGlobalId = accountId + "/" + originId;
  return _getStatus(accountGlobalId);
}

function _getIds(globalId: AccountGlobalId): AccountGlobalId[] {
  const connectedIds = _connectedAccounts.get(globalId);
  if (connectedIds) {
    const ids = connectedIds.values();
    return ids;
  } else {
    const res: AccountGlobalId[] = [];
    return res;
  }
}

function _getIdsDeep(
  closeness: i8,
  prevLayerIds: AccountGlobalId[],
  accountIdsPlain: AccountGlobalId[],
  accountIdsLayers: AccountGlobalId[][] = []
): AccountGlobalId[][] {
  const unicIds: AccountGlobalId[] = [];
  for (let i = 0; i < prevLayerIds.length; i++) {
    const acc = _getIds(prevLayerIds[i]);
    for (let j = 0; j < acc.length; j++) {
      if (!accountIdsPlain.includes(acc[j])) {
        accountIdsPlain.push(acc[j]);
        unicIds.push(acc[j]);
      }
    }
  }
  if (unicIds.length !== 0) {
    accountIdsLayers.push(unicIds);
    if (closeness - 1 === 0) {
      return accountIdsLayers;
    } else {
      return _getIdsDeep(closeness - 1, unicIds, accountIdsPlain, accountIdsLayers);
    }
  } else {
    return accountIdsLayers;
  }
}

function _getAccountsDeep(
  closeness: i8,
  globalIds: AccountGlobalId[],
  allAccountIdsPlain: AccountGlobalId[]
): Account[][] {
  const ids = _getIdsDeep(closeness, globalIds, allAccountIdsPlain);
  const accounts: Account[][] = [];
  for (let i = 0; i < ids.length; i++) {
    const accLayer: Account[] = [];
    for (let j = 0; j < ids[i].length; j++) {
      accLayer.push(new Account(ids[i][j], new AccountState(_getStatus(ids[i][j]))));
    }
    accounts.push(accLayer);
  }
  return accounts;
}

export function getConnectedAccounts(accountId: string, originId: string, closeness: i8 = -1): Account[][] | null {
  _active();
  const accountGlobalId = accountId + "/" + originId;
  if (closeness === 1) {
    const ids = _getIds(accountGlobalId);
    const accounts: Account[] = [];
    for (let i = 0; i < ids.length; i++) {
      accounts.push(new Account(ids[i], new AccountState(_getStatus(ids[i]))));
    }
    return [accounts];
  } else {
    return _getAccountsDeep(closeness, [accountGlobalId], [accountGlobalId]);
  }
}

function _getMainAccountDeep(
  prevLevelIds: AccountGlobalId[],
  allAccountIdsPlain: AccountGlobalId[]
): AccountGlobalId | null {
  const uniqueIds: AccountGlobalId[] = [];
  for (let i = 0; i < prevLevelIds.length; i++) {
    const ids = _getIds(prevLevelIds[i]);
    for (let j = 0; j < ids.length; j++) {
      const accStatus = _statuses.get(ids[j]);
      if (accStatus && accStatus.isMain) return ids[j];
      if (!allAccountIdsPlain.includes(ids[j])) {
        uniqueIds.push(ids[j]);
        allAccountIdsPlain.push(ids[j]);
      }
    }
  }
  if (uniqueIds.length !== 0) {
    return _getMainAccountDeep(uniqueIds, allAccountIdsPlain);
  } else {
    return null;
  }
}

export function getMainAccount(accountId: string, originId: string): AccountGlobalId | null {
  _active();
  const accountGlobalId = accountId + "/" + originId;
  const currentIdState = _getStatus(accountGlobalId);
  if (currentIdState) return accountGlobalId;
  return _getMainAccountDeep([accountGlobalId], [accountGlobalId]);
}

export function getOwnerAccount(): NearAccountId | null {
  _active();
  return storage.get<NearAccountId>(OWNER_ACCOUNT_KEY);
}

export function getOracleAccount(): NearAccountId | null {
  _active();
  return storage.get<NearAccountId>(ORACLE_ACCOUNT_KEY);
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
  } else if (approvedRequests.has(id)) {
    return u8(2); // approved
  } else if (pendingRequests.has(id)) {
    return u8(1); // pending
  } else {
    return u8(3); // rejected
  }
}

// WRITE

// Identity

export function changeStatus(accountId: string, originId: string, isMain: bool): void {
  _active();
  const requestGlobalId = accountId + "/" + originId;
  const senderGlobalId = Context.sender + "/" + senderOrigin;
  assert(_getStatus(requestGlobalId) !== isMain, "The new state is equal to the previous one");
  let connectedAccountsIds: string[][] = [[]];
  if (requestGlobalId != senderGlobalId) {
    assert(
      _connectedAccounts.contains(senderGlobalId),
      "Transaction sender does not have connected accounts. Only owner can change status."
    );
    connectedAccountsIds = _getIdsDeep(-1, [senderGlobalId], [senderGlobalId]);
    const connectedAccountsGIdsPlain: AccountGlobalId[] = [];
    for (let i = 0; i < connectedAccountsIds.length; i++) {
      for (let k = 0; k < connectedAccountsIds[i].length; k++) {
        connectedAccountsGIdsPlain.push(connectedAccountsIds[i][k]);
      }
    }
    assert(
      connectedAccountsGIdsPlain.includes(requestGlobalId),
      "Requested account is not in the transaction senders net. Only owner can change status."
    );
  }
  if (isMain) {
    if (_connectedAccounts.contains(senderGlobalId)) {
      const senderStatus = _statuses.get(senderGlobalId);
      if (senderStatus && senderStatus.isMain) {
        _statuses.set(senderGlobalId, new AccountState(false));
      }
      if (connectedAccountsIds[0].length === 0) {
        connectedAccountsIds = _getIdsDeep(-1, [senderGlobalId], [senderGlobalId]);
      }
      for (let i = 0; i < connectedAccountsIds.length; i++) {
        for (let k = 0; k < connectedAccountsIds[i].length; k++) {
          const a = _statuses.get(connectedAccountsIds[i][k]);
          if (a && a.isMain) {
            _statuses.set(connectedAccountsIds[i][k], new AccountState(false));
          }
        }
      }
    }
  }
  _statuses.set(requestGlobalId, new AccountState(isMain));
}

export function approveRequest(requestId: u32): void {
  logging.log(`Trying to approve`);
  _active();
  _onlyOracle();
  assert(verificationRequests.containsIndex(requestId), "Non-existent request ID");
  assert(pendingRequests.has(requestId), "The request has already been processed");
  const req = verificationRequests[requestId];
  const firstAccount = req.firstAccount;
  const secondAccount = req.secondAccount;

  if (req.isUnlink) {
    assert(_connectedAccounts.contains(firstAccount), "Account " + firstAccount + " not found.");
    const connected1Accounts = _connectedAccounts.get(firstAccount);
    assert(
      connected1Accounts!.has(secondAccount),
      "Account " + secondAccount + " is not directly connected to " + firstAccount
    );
    connected1Accounts!.delete(secondAccount);

    assert(_connectedAccounts.contains(secondAccount), "Account " + secondAccount + " not found.");
    const connected2Accounts = _connectedAccounts.get(secondAccount);
    assert(
      connected2Accounts!.has(firstAccount),
      "Account " + firstAccount + " is not directly connected to " + secondAccount
    );
    connected2Accounts!.delete(firstAccount);

    _connectedAccounts.set(firstAccount, connected1Accounts!);
    _connectedAccounts.set(secondAccount, connected2Accounts!);

    if (connected1Accounts!.size == 0) {
      const status = _getStatus(firstAccount);
      if (status) {
        _statuses.set(firstAccount, new AccountState());
      }
    }

    if (connected2Accounts!.size == 0) {
      const status = _getStatus(secondAccount);
      if (status) {
        _statuses.set(secondAccount, new AccountState());
      }
    }

    logging.log("Accounts " + firstAccount + " and " + secondAccount + " are unlinked");
  } else {
    const connected1Accounts = _connectedAccounts.get(firstAccount);
    if (!connected1Accounts) {
      const newConnected1Accounts = new Set<string>();
      newConnected1Accounts.add(secondAccount);
      _connectedAccounts.set(firstAccount, newConnected1Accounts);
    } else {
      assert(
        !connected1Accounts.has(secondAccount),
        "Account " + secondAccount + " has already connected to " + firstAccount
      );
      connected1Accounts.add(secondAccount);
      _connectedAccounts.set(firstAccount, connected1Accounts);
    }

    const connected2Accounts = _connectedAccounts.get(secondAccount);
    if (!connected2Accounts) {
      const newConnected2Accounts = new Set<string>();
      newConnected2Accounts.add(firstAccount);
      _connectedAccounts.set(secondAccount, newConnected2Accounts);
    } else {
      assert(
        !connected2Accounts.has(firstAccount),
        "Account " + firstAccount + " has already connected to " + secondAccount
      );
      connected2Accounts.add(firstAccount);
      _connectedAccounts.set(secondAccount, connected2Accounts);
    }

    const connectedAccounts = _getAccountsDeep(-1, [firstAccount], [firstAccount]);
    const connectedAccountsPlain: Account[] = [];
    for (let i = 0; i < connectedAccounts.length; i++) {
      for (let k = 0; k < connectedAccounts[i].length; k++) {
        connectedAccountsPlain.push(connectedAccounts[i][k]);
      }
    }
    connectedAccountsPlain.push(new Account(firstAccount, new AccountState(_getStatus(firstAccount))));

    let mainConnectedAccounts: AccountGlobalId[] = [];
    for (let i = 0; i < connectedAccountsPlain.length; i++) {
      if (connectedAccountsPlain[i].status.isMain) {
        mainConnectedAccounts.push(connectedAccountsPlain[i].id);
      }
    }
    if (mainConnectedAccounts.length > 1) {
      for (let i = 0; i < mainConnectedAccounts.length; i++) {
        _statuses.set(mainConnectedAccounts[i], new AccountState());
      }
    }

    logging.log("Accounts " + firstAccount + " and " + secondAccount + " are linked");
  }

  pendingRequests.delete(requestId);
  approvedRequests.add(requestId);
  logging.log(`Approving done`);
}

export function rejectRequest(requestId: u32): void {
  logging.log(`Trying to reject`);
  _active();
  _onlyOracle();
  assert(verificationRequests.containsIndex(requestId), "Non-existent request ID");
  assert(pendingRequests.has(requestId), "The request has already been processed");
  pendingRequests.delete(requestId);
  logging.log(`Reject done`);
}

export function changeOwnerAccount(newAccountId: NearAccountId): void {
  _active();
  _onlyOwner();
  storage.set(OWNER_ACCOUNT_KEY, newAccountId);
  logging.log("Changed owner: " + newAccountId);
}

export function changeOracleAccount(newAccountId: NearAccountId): void {
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
  _connectedAccounts.clear();
  _statuses.clear();
}

export function verifyWallet(walletProof: WalletProof, id: u32, accountId: string): void {
  assert(Context.prepaidGas >= 25 * TGAS, "Please attach at least 25 Tgas");
  const promise: ContractPromise = ContractPromise.create(
    // hello_address,
    decentralizedOracleAddress,
    "eth_verify_eip712",
    walletProof.encode(),
    5 * TGAS,
    NO_DEPOSIT
  );

  const args: GreetingCallbackArgs = new GreetingCallbackArgs(id, accountId);
  const callbackPromise = promise.then(
    Context.contractName,
    "verifyWalletCallback",
    args.encode(),
    10 * TGAS,
    NO_DEPOSIT
  );

  callbackPromise.returnAsResult();
}

export function verifyWalletCallback(id: u32, accountId: string): bool {
  const response = get_callback_result();
  if (response.status == XCC_SUCCESS) {
    const result: EcrecoverOutput = decode<EcrecoverOutput>(response.buffer);
    const receivedAddress = "0x" + result.address.toLowerCase();
    logging.log(`The received address is "${receivedAddress}"`);
    if (receivedAddress == accountId) {
      logging.log(`Let's approve"`);
      approveRequest(id);
    } else {
      logging.log(`Let's reject"`);
      rejectRequest(id);
    }
    return true;
  } else {
    logging.log(`There was an error contacting Ecrecover Verification contract`);
    return false;
  }
}

// Requests

export function requestVerification(
  firstAccountId: string,
  firstOriginId: string,
  secondAccountId: string,
  secondOriginId: string,
  isUnlink: boolean,
  signature: Signature | null,
  firstProofUrl: string = "",
  secondProofUrl: string = ""
): u32 {
  _active();
  assert(Context.sender == Context.predecessor, "Cross-contract calls is not allowed");
  if (isNull(signature)) {
    assert(
      u128.ge(Context.attachedDeposit, storage.get<u128>(MIN_STAKE_AMOUNT_KEY, u128.Zero)!),
      "Insufficient stake amount"
    );
  } else {
    assert(Context.prepaidGas >= 50 * TGAS, "Please attach at least 50 Tgas");
  }

  const senderAccount = Context.sender + "/" + senderOrigin;
  const firstAccountGlobalId = firstAccountId + "/" + firstOriginId;
  const secondAccountGlobalId = secondAccountId + "/" + secondOriginId;

  // Check if there are pending requests with the same two accounts
  const a = getPendingRequests();
  for (let i = 0; i < a.length; i++) {
    const b = getVerificationRequest(a[i]);
    const first = b!.firstAccount;
    const second = b!.secondAccount;
    assert(
      !(first == firstAccountGlobalId && second == secondAccountGlobalId) &&
        !(first == secondAccountGlobalId && second == firstAccountGlobalId),
      "There is a pending request with the same two accounts. Try again later."
    );
  }
  //

  if (!_statuses.contains(firstAccountGlobalId)) {
    _statuses.set(firstAccountGlobalId, new AccountState());
  }
  if (!_statuses.contains(secondAccountGlobalId)) {
    _statuses.set(secondAccountGlobalId, new AccountState());
  }

  // ToDo: audit it
  if (isUnlink) {
    assert(
      _connectedAccounts.contains(secondAccountGlobalId),
      "Account " + secondAccountId + " doesn't have connected accounts."
    );
    const connected1Accounts = _connectedAccounts.get(secondAccountGlobalId);
    assert(
      connected1Accounts!.has(firstAccountGlobalId),
      "Account " + firstAccountId + " is not directly connected to " + secondAccountId
    );

    assert(
      _connectedAccounts.contains(firstAccountGlobalId),
      "Account " + firstAccountId + " doesn't have connected accounts."
    );
    const connected2Accounts = _connectedAccounts.get(firstAccountGlobalId);
    assert(
      connected2Accounts!.has(secondAccountGlobalId),
      "Account " + secondAccountId + " is not directly connected to " + firstAccountId
    );
  } else {
    const connected1Accounts = _connectedAccounts.get(secondAccountGlobalId);
    if (connected1Accounts) {
      assert(
        !connected1Accounts.has(firstAccountGlobalId),
        "Account " + secondAccountId + " has already connected to " + firstAccountId
      );
    }

    const connected2Accounts = _connectedAccounts.get(firstAccountGlobalId);
    if (connected2Accounts) {
      assert(
        !connected2Accounts.has(secondAccountGlobalId),
        "Account " + firstAccountId + " has already connected to " + secondAccountId
      );
    }
  }

  const id = verificationRequests.push(
    new VerificationRequest(
      firstAccountGlobalId,
      secondAccountGlobalId,
      isUnlink,
      firstProofUrl,
      secondProofUrl,
      senderAccount
    )
  );
  pendingRequests.add(id);

  // Connect decentralized accounts
  if (isNull(signature)) {
    const oracleAccount = storage.get<NearAccountId>(ORACLE_ACCOUNT_KEY)!;
    ContractPromiseBatch.create(oracleAccount).transfer(Context.attachedDeposit);
  } else {
    let walletProof: WalletProof;
    if (firstOriginId == NEAR_NETWORK) {
      assert(Context.sender == firstAccountId, "You must sign the request with the NEAR wallet you are linking.");
      walletProof = new WalletProof(
        new LinkingAccounts(
          new LinkingAccount(firstOriginId, firstAccountId),
          new LinkingAccount(secondOriginId, secondAccountId)
        ),
        signature!
      );
    } else {
      assert(Context.sender == secondAccountId, "You must sign the request with the NEAR wallet you are linking.");
      walletProof = new WalletProof(
        new LinkingAccounts(
          new LinkingAccount(secondOriginId, secondAccountId),
          new LinkingAccount(firstOriginId, firstAccountId)
        ),
        signature!
      );
    }
    verifyWallet(walletProof, id, firstOriginId == senderOrigin ? secondAccountId : firstAccountId);
  }
  //

  logging.log(`
    ${firstAccountId} requests to link ${secondAccountId} account.
    Proof ID: ${id.toString()}
    1st URL: ${firstProofUrl}
    2nd URL: ${secondProofUrl}
  `);

  return id;
}

// HELPERS

function _onlyOracle(): void {
  assert(
    storage.get<NearAccountId>(ORACLE_ACCOUNT_KEY) == Context.sender || Context.predecessor == Context.contractName,
    "Only oracle account can write"
  );
}

function _onlyOwner(): void {
  assert(storage.get<NearAccountId>(OWNER_ACCOUNT_KEY) == Context.sender, "Only owner account can write");
}

function _active(): void {
  assert(storage.getPrimitive<bool>(ACTIVE_CONTRACT_KEY, false) == true, "Contract inactive");
}
