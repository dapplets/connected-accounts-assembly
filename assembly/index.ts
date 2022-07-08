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

import {
  Account,
  AccountGlobalId,
  AccountState,
  VerificationRequest
} from './modules';

const NEAR_NETWORK = 'testnet';//      !!! NETWORK TYPE !!!

type NearAccountId = string; //  example: user.near, user.testnet

//// MODELS

// Common
const OWNER_ACCOUNT_KEY = "a";
const INIT_CONTRACT_KEY = "b";
const ACTIVE_CONTRACT_KEY = "c";

// Identity

const _connectedAccounts = new PersistentUnorderedMap<AccountGlobalId, PersistentSet<AccountGlobalId>>("d"); 

const _statuses = new PersistentUnorderedMap<AccountGlobalId, AccountState>("e"); 

const ORACLE_ACCOUNT_KEY = "f";
const MIN_STAKE_AMOUNT_KEY = "g";

// Requests

const verificationRequests = new PersistentVector<VerificationRequest>("h");
const pendingRequests = new PersistentSet<u32>("i");
const approvedRequests = new PersistentSet<u32>("j");

// INITIALIZATION

export function initialize(
  ownerAccountId: NearAccountId,
  oracleAccountId: NearAccountId,
  minStakeAmount: u128,
): void {
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
  const accountGlobalId: AccountGlobalId = accountId + '/' + originId;
  return _getStatus(accountGlobalId);
}

function getAccounts(globalId: AccountGlobalId): Account[] {
  const connectedIds = _connectedAccounts.get(globalId);
  if (connectedIds) {
    const ids = connectedIds.values();
    const accounts: Account[] = ids.map<Account>((id: AccountGlobalId) => new Account(id, new AccountState(_getStatus(id))));
    return accounts;
  } else {
    const res: Account[] = [];
    return res;
  }
}

function getAccountsDeep(
  closeness: i8,
  globalIds: AccountGlobalId[],
  allAccountIdsPlain: AccountGlobalId[],
  allAccountsLayers: Account[][] = []
): Account[][] {
  const currentLayerAccounts: Account[][] = [];
  for (let i = 0; i < globalIds.length; i++) {
    const acc = getAccounts(globalIds[i]);
    if (acc) {
      const uniqueIds: AccountGlobalId[] = [];
      const uniqueAccounts: Account[] = [];
      for (let j = 0; j < acc.length; j++) {
        if (!allAccountIdsPlain.includes(acc[j].id)) {
          uniqueIds.push(acc[j].id);
          allAccountIdsPlain.push(acc[j].id);
          uniqueAccounts.push(acc[j]);
        }
      }
      if (uniqueIds.length !== 0) {
        currentLayerAccounts.push(uniqueAccounts);
      }
    }
  }
  if (currentLayerAccounts.length !== 0) {
    const accounts = currentLayerAccounts.flat();
    allAccountsLayers.push(accounts);
    const accountsIds = accounts.map<AccountGlobalId>((ac) => ac.id);
    if (closeness - 1 === 0) {
      return allAccountsLayers;
    } else {
      return getAccountsDeep(closeness - 1, accountsIds, allAccountIdsPlain, allAccountsLayers);
    }
  } else {
    return allAccountsLayers;
  }
}

export function getConnectedAccounts(
  accountId: string,
  originId: string,
  closeness: i8 = -1
): Account[][] | null {
  _active();
  const accountGlobalId = accountId + '/' + originId;
  if (closeness === 1) {
    return [getAccounts(accountGlobalId)];
  } else {
    return getAccountsDeep(closeness, [accountGlobalId], [accountGlobalId]);
  }
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

export function changeStatus(
  accountId: string,
  originId: string,
  isMain: bool
): void {
  const requestGlobalId = accountId + '/' + originId;
  const senderGlobalId = Context.sender + '/' + 'near' + '/' + NEAR_NETWORK;
  assert(_getStatus(requestGlobalId) !== isMain, 'The new state is equal to the previous one');
  if (requestGlobalId != senderGlobalId) {
    assert(_connectedAccounts.contains(senderGlobalId), 'Only owner can change status');
    const connectedAccountsGIds = _connectedAccounts.get(senderGlobalId);
    assert(connectedAccountsGIds && connectedAccountsGIds.has(requestGlobalId), 'Only owner can change status');
  }
  if (isMain) {
    if (_connectedAccounts.contains(senderGlobalId)) {
      const connectedAccountsGIds = _connectedAccounts.get(senderGlobalId);
      if (connectedAccountsGIds) {
        const ids = connectedAccountsGIds.values();
        ids.push(senderGlobalId);
        ids.forEach((id: string) => {
          const a = _statuses.get(id);
          if (a && a.isMain) {
            _statuses.set(id, new AccountState(false));
          }
        });
      }
    }
  }
  _statuses.set(requestGlobalId, new AccountState(isMain));
}

export function approveRequest(requestId: u32): void {
  _active();
  _onlyOracle();
  assert(verificationRequests.containsIndex(requestId), "Non-existent request ID");
  assert(pendingRequests.has(requestId), "The request has already been processed");
  const req = verificationRequests[requestId];

  if (req.isUnlink) {
    assert(_connectedAccounts.contains(req.firstAccount), "Account " + req.firstAccount + " not found.");
    const connected1Accounts = _connectedAccounts.get(req.firstAccount);
    assert(connected1Accounts!.has(req.secondAccount), "Account " + req.secondAccount + " was not connected to " + req.firstAccount);
    connected1Accounts!.delete(req.secondAccount);

    assert(_connectedAccounts.contains(req.secondAccount), "Account " + req.secondAccount + " not found.");
    const connected2Accounts = _connectedAccounts.get(req.secondAccount);
    assert(connected2Accounts!.has(req.firstAccount), "Account " + req.firstAccount + " was not connected to " + req.secondAccount);
    connected2Accounts!.delete(req.firstAccount);

    _connectedAccounts.set(req.firstAccount, connected1Accounts!);
    _connectedAccounts.set(req.secondAccount, connected2Accounts!);

    logging.log("Accounts " + req.firstAccount + " and " + req.secondAccount + " are unlinked");
  } else {
    const connected1Accounts = _connectedAccounts.get(req.firstAccount);
    if (!connected1Accounts) {
      const newConnected1Accounts = new PersistentSet<string>('q');
      newConnected1Accounts.add(req.secondAccount);
      _connectedAccounts.set(req.firstAccount, newConnected1Accounts);
    } else {
      assert(!connected1Accounts.has(req.secondAccount), "Account " + req.secondAccount + " has already connected to " + req.firstAccount);
      connected1Accounts.add(req.secondAccount);
      _connectedAccounts.set(req.firstAccount, connected1Accounts);
    }

    const connected2Accounts = _connectedAccounts.get(req.secondAccount);
    if (!connected2Accounts) {
      const newConnected2Accounts = new PersistentSet<string>('w');
      newConnected2Accounts.add(req.firstAccount);
      _connectedAccounts.set(req.secondAccount, newConnected2Accounts);
    } else {
      assert(!connected2Accounts.has(req.firstAccount), "Account " + req.firstAccount + " has already connected to " + req.secondAccount);
      connected2Accounts.add(req.firstAccount);
      _connectedAccounts.set(req.secondAccount, connected2Accounts);
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
}

// Requests

export function requestVerification(
  firstAccountId: string,
  firstOriginId: string,
  secondAccountId: string,
  secondOriginId: string,
  isUnlink: boolean,
  firstProofUrl: string = '',
  secondProofUrl: string = '',
): u32 {
  _active();
  assert(Context.sender == Context.predecessor, "Cross-contract calls is not allowed");
  assert(
    u128.ge(Context.attachedDeposit, storage.get<u128>(MIN_STAKE_AMOUNT_KEY, u128.Zero)!),
    "Insufficient stake amount"
  );

  const senderOrigin = 'near' + '/' + NEAR_NETWORK
  const senderAccount = Context.sender + '/' + senderOrigin;

  const firstAccountGlobalId = firstAccountId + '/' + firstOriginId;
  const secondAccountGlobalId = secondAccountId + '/' + secondOriginId;

  // *********** RESTRICTIONS ************
  //
  // no MAINNET NEAR accounts
  // no TWO TESTNET NEAR accounts directly
  // no ETHEREUM accounts and other blockchains         !!!! ToDo --- TEST IT! ---- !!!!
  // connecting NEAR account should be the Sender
  //
  // *************************************
  // assert(
  //   firstOriginId !== 'near/mainnet' && secondAccountId !== 'near/mainnet',
  //   'Currently you cannot connect two NEAR accounts directly'
  // );
  // assert(
  //   !(firstOriginId === 'near/testnet' && secondAccountId === 'near/testnet'),
  //   'Currently you cannot connect two NEAR accounts directly'
  // );
  // assert(
  //   firstOriginId.split('/')[0] !== 'ethereum' && secondAccountId.split('/')[0] !== 'ethereum',
  //   'Currently you cannot connect Ethereum accounts'
  // );
  // if (firstOriginId === 'near/testnet') assert(
  //   firstAccountId == Context.sender,
  //   'Connecting NEAR account should be the Sender of the transaction'
  // );
  // if (secondOriginId === 'near/testnet') assert(
  //   secondAccountId == Context.sender,
  //   'Connecting NEAR account should be the Sender of the transaction'
  // );
  // *************************************

  if (!_statuses.contains(firstAccountGlobalId)) {
    _statuses.set(firstAccountGlobalId, new AccountState());
  }
  if (!_statuses.contains(secondAccountGlobalId)) {
    _statuses.set(secondAccountGlobalId, new AccountState());
  }

  // ToDo: audit it
  if (isUnlink) {
    assert(_connectedAccounts.contains(secondAccountGlobalId), "Account " + secondAccountId + " doesn't have linked accounts.");
    const connected1Accounts = _connectedAccounts.get(secondAccountGlobalId);
    assert(connected1Accounts!.has(firstAccountGlobalId), "Account " + firstAccountId + " was not connected to " + secondAccountId);

    assert(_connectedAccounts.contains(firstAccountGlobalId), "Account " + firstAccountId + " doesn't have linked accounts.");
    const connected2Accounts = _connectedAccounts.get(firstAccountGlobalId);
    assert(connected2Accounts!.has(secondAccountGlobalId), "Account " + secondAccountId + " was not connected to " + firstAccountId);
  } else {
    const connected1Accounts = _connectedAccounts.get(secondAccountGlobalId);
    if (connected1Accounts) {
      assert(!connected1Accounts.has(firstAccountGlobalId), "Account " + secondAccountId + " has already connected to " + firstAccountId);
    }

    const connected2Accounts = _connectedAccounts.get(firstAccountGlobalId);
    if (connected2Accounts) {
      assert(!connected2Accounts.has(secondAccountGlobalId), "Account " + firstAccountId + " has already connected to " + secondAccountId);
    }
  }

  const id = verificationRequests.push(new VerificationRequest(
    firstAccountGlobalId,
    secondAccountGlobalId,
    isUnlink,
    firstProofUrl,
    secondProofUrl,
    senderAccount
  ));
  pendingRequests.add(id);

  const oracleAccount = storage.get<NearAccountId>(ORACLE_ACCOUNT_KEY)!;
  ContractPromiseBatch.create(oracleAccount).transfer(Context.attachedDeposit);

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
  assert(storage.get<NearAccountId>(ORACLE_ACCOUNT_KEY) == Context.sender, "Only oracle account can write");
}

function _onlyOwner(): void {
  assert(storage.get<NearAccountId>(OWNER_ACCOUNT_KEY) == Context.sender, "Only owner account can write");
}

function _active(): void {
  assert(storage.getPrimitive<bool>(ACTIVE_CONTRACT_KEY, false) == true, "Contract inactive");
}
