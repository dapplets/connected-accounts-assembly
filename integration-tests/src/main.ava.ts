import { Worker, NEAR, NearAccount } from "near-workspaces";
import anyTest, { TestFn } from "ava";
import * as ethers from "ethers";

const test = anyTest as TestFn<{
  worker: Worker;
  accounts: Record<string, NearAccount>;
}>;

test.beforeEach(async (t) => {
  // Init the worker and start a Sandbox server
  const worker = await Worker.init();

  // Deploy contract
  const root = worker.rootAccount;

  // define users

  const alice = await root.createSubAccount("alice", {
    initialBalance: NEAR.parse("30 N").toJSON(),
  });

  const bob = await root.createSubAccount("bob", {
    initialBalance: NEAR.parse("30 N").toJSON(),
  });

  const contract = await root.createSubAccount("contract", {
    initialBalance: NEAR.parse("30 N").toJSON(),
  });

  // Deploy the contract.
  await contract.deploy(process.argv[2]);

  // Save state for test runs, it is unique for each test
  t.context.worker = worker;
  t.context.accounts = { root, contract, alice, bob };

  await root.importContract({
    testnetContract: "dev-1674548694574-99647391067733",
  });
});

test.afterEach(async (t) => {
  // Stop Sandbox server
  await t.context.worker.tearDown().catch((error) => {
    console.log("Failed to stop the Sandbox:", error);
  });
});

// ====== Global Objects ======

const nearOriginId = "near/testnet";
const ethOriginId = "ethereum";

const ACCOUNT_1 = {
  id: "username",
  originId: "social_network",
};

const ACCOUNT_2 = {
  id: "username-2",
  originId: "social_network-2",
};

const ACCOUNT_3 = {
  id: "username-3",
  originId: "social_network-3",
};

const ACCOUNT_4 = {
  id: "username-4",
  originId: "social_network-4",
};

const ACCOUNT_5 = {
  id: "username-5",
  originId: "social_network",
};

// ======= TESTS =======

test("integration test", async (t) => {
  // == TEST 1 ==
  console.log("== TEST 1 ==: initialize contract");
  // ============

  const STAKE = "1000000000000000000000"; // 0.001 NEAR
  const { alice, bob, contract } = t.context.accounts;
  console.log("alice.accountId", alice.accountId);
  await alice.call(contract, "initialize", {
    ownerAccountId: alice.accountId,
    oracleAccountId: alice.accountId,
    minStakeAmount: STAKE,
  });

  const ownerAccountId = await contract.view("getOwnerAccount", {});
  const oracleAccountId = await contract.view("getOracleAccount", {});
  const minStakeAmount = await contract.view("getMinStakeAmount", {});

  t.is(ownerAccountId, alice.accountId);
  t.is(oracleAccountId, alice.accountId);
  t.is(minStakeAmount, STAKE);

  // ============ ALIASES =============

  const getCA = (accountId: string, originId: string, closeness?: number): Promise<any> =>
    contract.view("getConnectedAccounts", {
      accountId,
      originId,
      closeness,
    });

  const getPRequests = (): Promise<number[]> => contract.view("getPendingRequests", {});

  interface IVerificationRequest {
    firstAccount: string;
    secondAccount: string;
    isUnlink: boolean;
    firstProofUrl: string;
    secondProofUrl: string;
    transactionSender: string;
  }

  const getVRequest = (id: number): Promise<IVerificationRequest | null> =>
    contract.view("getVerificationRequest", { id });

  const requestVerification = (
    acc: NearAccount,
    firstAccountId: string,
    firstOriginId: string,
    secondAccountId: string,
    secondOriginId: string,
    signature: any,
    isUnlink: boolean,
    statement?: string
  ): Promise<number> =>
    acc.call(
      contract,
      "requestVerification",
      {
        firstAccountId,
        firstOriginId,
        secondAccountId,
        secondOriginId,
        signature,
        isUnlink,
        firstProofUrl: firstOriginId === "social_network" ? "https://example.com" : "",
        secondProofUrl: secondOriginId === "social_network" ? "https://example.com" : "",
        statement,
      },
      {
        attachedDeposit:
          firstOriginId !== "ethereum" && secondOriginId !== "ethereum"
            ? NEAR.parse("0.001 N").toString()
            : undefined,
        gas:
          firstOriginId === "ethereum" || secondOriginId === "ethereum"
            ? "300000000000000"
            : undefined,
      }
    );

  const aliceRequestVerification = (
    firstAccountId: string,
    firstOriginId: string,
    secondAccountId: string,
    secondOriginId: string,
    signature: any,
    isUnlink: boolean,
    statement?: string
  ): Promise<number> =>
    requestVerification(
      alice,
      firstAccountId,
      firstOriginId,
      secondAccountId,
      secondOriginId,
      signature,
      isUnlink,
      statement
    );

  const bobRequestVerification = (
    firstAccountId: string,
    firstOriginId: string,
    secondAccountId: string,
    secondOriginId: string,
    signature: any,
    isUnlink: boolean,
    statement?: string
  ): Promise<number> =>
    requestVerification(
      bob,
      firstAccountId,
      firstOriginId,
      secondAccountId,
      secondOriginId,
      signature,
      isUnlink,
      statement
    );

  const aliceApproveRequest = (requestId: number): Promise<void> =>
    alice.call(contract, "approveRequest", { requestId });

  const bobApproveRequest = (requestId: number): Promise<void> =>
    bob.call(contract, "approveRequest", { requestId });

  const aliceRejectRequest = (requestId: number): Promise<void> =>
    alice.call(contract, "rejectRequest", { requestId });

  const bobRejectRequest = (requestId: number): Promise<void> =>
    bob.call(contract, "rejectRequest", { requestId });

  const getStatus = (accountId: string, originId: string): Promise<boolean> =>
    contract.view("getStatus", {
      accountId,
      originId,
    });

  const aliceChangeStatus = (accountId: string, originId: string, isMain: true): Promise<void> =>
    alice.call(contract, "changeStatus", {
      accountId,
      originId,
      isMain,
    });

  const bobChangeStatus = (accountId: string, originId: string, isMain: true): Promise<void> =>
    bob.call(contract, "changeStatus", {
      accountId,
      originId,
      isMain,
    });

  const getMainAccount = (accountId: string, originId: string): Promise<string | null> =>
    contract.view("getMainAccount", {
      accountId,
      originId,
    });

  const getRequestStatus = (id: number): Promise<number> =>
    contract.view("getRequestStatus", {
      id,
    });

  // ============ CONSTANTS ===========

  const gAliceID = alice.accountId + "/" + nearOriginId;
  const gBobID = bob.accountId + "/" + nearOriginId;
  const gAcc_1ID = ACCOUNT_1.id + "/" + ACCOUNT_1.originId;
  const gAcc_2ID = ACCOUNT_2.id + "/" + ACCOUNT_2.originId;
  const gAcc_3ID = ACCOUNT_3.id + "/" + ACCOUNT_3.originId;
  const gAcc_4ID = ACCOUNT_4.id + "/" + ACCOUNT_4.originId;
  const gAcc_5ID = ACCOUNT_5.id + "/" + ACCOUNT_5.originId;

  // ==================================

  // == TEST 2 ==
  console.log("== TEST 2 ==: linked accounts must be empty");
  // ============

  const connectedAccountsToNearAccount = await getCA(alice.accountId, nearOriginId, 1);
  const connectedAccountsToAnotherAccount = await getCA(ACCOUNT_1.id, ACCOUNT_1.originId, 1);

  t.deepEqual(connectedAccountsToNearAccount, [[]]);
  t.deepEqual(connectedAccountsToAnotherAccount, [[]]);

  // == TEST 3 ==
  console.log("== TEST 3 ==: pending requests must be empty");
  // ============

  const pendingRequests = await getPRequests();
  t.deepEqual(pendingRequests, []);

  const request = await getVRequest(0);
  t.is(request, null);

  // == TEST 4 ==
  console.log("== TEST 4 ==: creates request");
  // ============

  const id_1 = await aliceRequestVerification(
    ACCOUNT_1.id,
    ACCOUNT_1.originId,
    alice.accountId,
    nearOriginId,
    null,
    false
  );

  const pendingRequests_1 = await getPRequests();
  t.deepEqual(pendingRequests_1, [id_1]);

  const request_1 = await getVRequest(id_1);
  t.deepEqual(request_1, {
    firstAccount: gAcc_1ID,
    secondAccount: gAliceID,
    isUnlink: false,
    firstProofUrl: "https://example.com",
    secondProofUrl: "",
    transactionSender: "alice.test.near/near/testnet",
  });

  // == TEST 5 ==
  console.log(
    "== TEST 5 ==: approve the linking request, get the request approve and connect accounts"
  );
  // ============

  const pendingRequests_2 = await getPRequests();
  const requestId_2 = pendingRequests_2[0];
  await aliceApproveRequest(requestId_2);

  const connectedAccountsToNearAccount_2 = await getCA(alice.accountId, nearOriginId, 1);
  const connectedAccountsToAnotherAccount_2 = await getCA(ACCOUNT_1.id, ACCOUNT_1.originId, 1);

  console.log("+++ connectedAccountsToNearAccount_2", connectedAccountsToNearAccount_2);
  console.log("+++ connectedAccountsToAnotherAccount_2", connectedAccountsToAnotherAccount_2);

  t.deepEqual(connectedAccountsToNearAccount_2, [
    [
      {
        id: gAcc_1ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);
  t.deepEqual(connectedAccountsToAnotherAccount_2, [
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  // == TEST 6 ==
  console.log(
    "== TEST 6 ==: approve the unlinking request, get the request approve and unconnect accounts"
  );
  // ============

  const connectedAccountsToNearAccount_3 = await getCA(alice.accountId, nearOriginId, 1);
  const connectedAccountsToAnotherAccount_3 = await getCA(ACCOUNT_1.id, ACCOUNT_1.originId, 1);

  t.deepEqual(connectedAccountsToNearAccount_3, [
    [
      {
        id: gAcc_1ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);
  t.deepEqual(connectedAccountsToAnotherAccount_3, [
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  await aliceRequestVerification(
    ACCOUNT_1.id,
    ACCOUNT_1.originId,
    alice.accountId,
    nearOriginId,
    null,
    true
  );

  const pendingRequests_3 = await getPRequests();
  const requestId_3 = pendingRequests_3[0];
  await aliceApproveRequest(requestId_3);

  const connectedAccountsToNearAccount2_3 = await getCA(alice.accountId, nearOriginId, 1);
  const connectedAccountsToAnotherAccount2_3 = await getCA(ACCOUNT_1.id, ACCOUNT_1.originId, 1);

  console.log("+++ connectedAccountsToNearAccount2_3", connectedAccountsToNearAccount2_3);
  console.log("+++ connectedAccountsToAnotherAccount2_3", connectedAccountsToAnotherAccount2_3);

  t.deepEqual(connectedAccountsToNearAccount2_3, [[]]);
  t.deepEqual(connectedAccountsToAnotherAccount2_3, [[]]);

  // == TEST 7 ==
  console.log(
    "== TEST 7 ==: approve two linking requests, get the requests approves and connect accounts"
  );
  // ============

  await aliceRequestVerification(
    ACCOUNT_1.id,
    ACCOUNT_1.originId,
    alice.accountId,
    nearOriginId,
    null,
    false
  );

  await bobRequestVerification(
    ACCOUNT_1.id,
    ACCOUNT_1.originId,
    bob.accountId,
    nearOriginId,
    null,
    false
  );

  const pendingRequests_4 = await getPRequests();
  t.is(pendingRequests_4.length, 2);

  const aliceRequestId_4 = pendingRequests_4[0];
  await aliceApproveRequest(aliceRequestId_4);

  const bobRequestId_4 = pendingRequests_4[1];
  await aliceApproveRequest(bobRequestId_4);

  const connectedAccountsToAliseAccount_4 = await getCA(alice.accountId, nearOriginId, 1);

  const connectedAccountsToBobAccount_4 = await getCA(bob.accountId, nearOriginId, 1);

  const connectedAccountsToAnotherAccount_4 = await getCA(ACCOUNT_1.id, ACCOUNT_1.originId, 1);

  console.log("+++ connectedAccountsToAliseAccount_4", connectedAccountsToAliseAccount_4);
  console.log("+++ connectedAccountsToBobAccount_4", connectedAccountsToBobAccount_4);
  console.log("+++ connectedAccountsToAnotherAccount_4", connectedAccountsToAnotherAccount_4);

  t.deepEqual(connectedAccountsToAliseAccount_4, [
    [
      {
        id: gAcc_1ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);
  t.deepEqual(connectedAccountsToBobAccount_4, [
    [
      {
        id: gAcc_1ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);
  t.deepEqual(connectedAccountsToAnotherAccount_4, [
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
      {
        id: gBobID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  // == TEST 8 ==
  console.log("== TEST 8 ==: get account status");
  // ============

  const ACCOUNT_1Status_8 = await getStatus(ACCOUNT_1.id, ACCOUNT_1.originId);
  t.is(ACCOUNT_1Status_8, false);
  const aliceStatus_8 = await getStatus(alice.accountId, nearOriginId);
  t.is(aliceStatus_8, false);
  const bobStatus_8 = await getStatus(bob.accountId, nearOriginId);
  t.is(bobStatus_8, false);

  // == TEST 9 ==
  console.log("== TEST 9 ==: change account status");
  // ============

  await aliceChangeStatus(alice.accountId, nearOriginId, true);

  const aliceStatus_9 = await getStatus(alice.accountId, nearOriginId);
  t.is(aliceStatus_9, true);

  await aliceChangeStatus(ACCOUNT_1.id, ACCOUNT_1.originId, true);

  const ACCOUNT_1Status_9 = await getStatus(ACCOUNT_1.id, ACCOUNT_1.originId);
  t.is(ACCOUNT_1Status_9, true);

  const aliceStatus_9_2 = await getStatus(alice.accountId, nearOriginId);
  t.is(aliceStatus_9_2, false);

  const bobStatus_9 = await getStatus(bob.accountId, nearOriginId);
  t.is(bobStatus_9, false);

  // == TEST 10 ==
  console.log("== TEST 10 ==: recursively getting the entire network of connected accounts");
  // =============

  await aliceRequestVerification(
    ACCOUNT_2.id,
    ACCOUNT_2.originId,
    alice.accountId,
    nearOriginId,
    null,
    false
  );

  await bobRequestVerification(
    ACCOUNT_3.id,
    ACCOUNT_3.originId,
    bob.accountId,
    nearOriginId,
    null,
    false
  );

  await bobRequestVerification(
    ACCOUNT_4.id,
    ACCOUNT_4.originId,
    bob.accountId,
    nearOriginId,
    null,
    false
  );

  const pendingRequests_10 = await getPRequests();
  t.is(pendingRequests_10.length, 3);

  const aliceRequestId_10 = pendingRequests_10[0];
  await aliceApproveRequest(aliceRequestId_10);

  const bobRequestId1_10 = pendingRequests_10[1];
  await aliceApproveRequest(bobRequestId1_10);

  const bobRequestId2_10 = pendingRequests_10[2];
  await aliceApproveRequest(bobRequestId2_10);

  const connectedAccountsToAliseAccount_10 = await getCA(alice.accountId, nearOriginId);

  console.log("*** connectedAccountsToAliseAccount_10", connectedAccountsToAliseAccount_10);

  t.deepEqual(connectedAccountsToAliseAccount_10, [
    [
      {
        id: gAcc_1ID,
        status: {
          isMain: true,
        },
      },
      {
        id: gAcc_2ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gBobID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_4ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  const connectedAccountsTo4Account_10 = await getCA(ACCOUNT_4.id, ACCOUNT_4.originId);
  console.log("*** connectedAccounts to ACCOUNT_4_9", connectedAccountsTo4Account_10);

  t.deepEqual(connectedAccountsTo4Account_10, [
    [
      {
        id: gBobID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_1ID,
        status: {
          isMain: true,
        },
      },
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_2ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  // == TEST 11 ==
  console.log("== TEST 11 ==: recursively getting 2 levels of the connected accounts network");
  // =============

  const connectedAccountsToAliseAccount_11 = await getCA(alice.accountId, nearOriginId, 2);

  console.log("*** connectedAccountsToAliseAccount_11", connectedAccountsToAliseAccount_11);

  t.deepEqual(connectedAccountsToAliseAccount_11, [
    [
      {
        id: gAcc_1ID,
        status: {
          isMain: true,
        },
      },
      {
        id: gAcc_2ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gBobID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  // == TEST 12 ==
  console.log("== TEST 12 ==: get main account");
  // =============

  const mainAccountId = await getMainAccount(ACCOUNT_4.id, ACCOUNT_4.originId);
  t.is(mainAccountId, gAcc_1ID);

  // == TEST 13 ==
  console.log("== TEST 13 ==: merge 2 nets with main accouts");
  // =============

  const id_13_1 = await bobRequestVerification(
    ACCOUNT_1.id,
    ACCOUNT_1.originId,
    bob.accountId,
    nearOriginId,
    null,
    true
  );
  await aliceApproveRequest(id_13_1);

  const connectedAccounts_13_1 = await getCA(bob.accountId, nearOriginId);

  console.log("*** connectedAccountsToBobAccount", connectedAccounts_13_1);

  t.deepEqual(connectedAccounts_13_1, [
    [
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_4ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  const connectedAccounts_13_2 = await getCA(ACCOUNT_1.id, ACCOUNT_1.originId);

  console.log("*** connectedAccountsToACCOUNT_1.id", connectedAccounts_13_2);

  t.deepEqual(connectedAccounts_13_2, [
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_2ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  const id_13_2 = await bobRequestVerification(
    ACCOUNT_5.id,
    ACCOUNT_5.originId,
    ACCOUNT_3.id,
    ACCOUNT_3.originId,
    null,
    false
  );
  await aliceApproveRequest(id_13_2);

  await bobChangeStatus(ACCOUNT_5.id, ACCOUNT_5.originId, true);

  const connectedAccountsToACCOUNT_13_4 = await getCA(ACCOUNT_4.id, ACCOUNT_4.originId);

  console.log("*** connectedAccountsToACCOUNT_13_4", connectedAccountsToACCOUNT_13_4);

  t.deepEqual(connectedAccountsToACCOUNT_13_4, [
    [
      {
        id: gBobID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_5ID,
        status: {
          isMain: true,
        },
      },
    ],
  ]);

  const connectedAccountsToBob_13 = await getCA(bob.accountId, nearOriginId);

  console.log("*** connectedAccountsToBob_13", connectedAccountsToBob_13);

  t.deepEqual(connectedAccountsToBob_13, [
    [
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_4ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_5ID,
        status: {
          isMain: true,
        },
      },
    ],
  ]);

  const id_13_3 = await bobRequestVerification(
    bob.accountId,
    nearOriginId,
    ACCOUNT_1.id,
    ACCOUNT_1.originId,
    null,
    false
  );
  await aliceApproveRequest(id_13_3);

  const connectedAccountsToACCOUNT_13_1 = await getCA(ACCOUNT_1.id, ACCOUNT_1.originId);

  console.log("*** connectedAccountsToACCOUNT_13_1", connectedAccountsToACCOUNT_13_1);

  t.deepEqual(connectedAccountsToACCOUNT_13_1, [
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
      {
        id: gBobID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_2ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_4ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_5ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  const connectedAccountsToBobAccount_13 = await getCA(bob.accountId, nearOriginId);

  console.log("*** connectedAccountsToBobAccount_13", connectedAccountsToBobAccount_13);

  t.deepEqual(connectedAccountsToBobAccount_13, [
    [
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_4ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_1ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_5ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_2ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  // == TEST 14 ==
  console.log("== TEST 14 ==: getting request status");
  // =============

  const requests_14_1 = await getPRequests();
  t.deepEqual(requests_14_1, []);

  const id_14_1 = await bobRequestVerification(
    ACCOUNT_3.id,
    ACCOUNT_3.originId,
    bob.accountId,
    nearOriginId,
    null,
    true
  );
  const id_14_2 = await bobRequestVerification(
    ACCOUNT_4.id,
    ACCOUNT_4.originId,
    bob.accountId,
    nearOriginId,
    null,
    true
  );
  const requests_14_2 = await getPRequests();
  t.is(requests_14_2.length, 2);

  await aliceApproveRequest(id_14_1);

  const id_1Status_14 = await getRequestStatus(id_14_1);
  const id_2Status_14 = await getRequestStatus(id_14_2);
  const nonexistentStatus_14 = await getRequestStatus(9753);

  const requests_14_3 = await getPRequests();
  t.is(requests_14_3.length, 1);

  t.is(id_1Status_14, 2);
  t.is(id_2Status_14, 1);
  t.is(nonexistentStatus_14, 0);

  await aliceRejectRequest(id_14_2);

  const id_2NewStatus_14 = await getRequestStatus(id_14_2);
  t.is(id_2NewStatus_14, 3);

  const requests_14_4 = await getPRequests();
  t.deepEqual(requests_14_4, []);

  const connectedAccountsToBobAccount_14 = await getCA(bob.accountId, nearOriginId);
  console.log("*** connectedAccountsToBobAccount_14", connectedAccountsToBobAccount_14);
  t.deepEqual(connectedAccountsToBobAccount_14, [
    [
      {
        id: gAcc_4ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_1ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_2ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  const connectedAccountsToACCOUNT_14_3 = await getCA(ACCOUNT_3.id, ACCOUNT_3.originId);
  console.log("*** connectedAccountsToACCOUNT_14_3", connectedAccountsToACCOUNT_14_3);
  t.deepEqual(connectedAccountsToACCOUNT_14_3, [
    [
      {
        id: gAcc_5ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  // == TEST 15 ==
  console.log(
    "== TEST 15 ==: merge 2 nets with one main accout and set the main account in the different part"
  );
  // =============

  await bobChangeStatus(ACCOUNT_2.id, ACCOUNT_2.originId, true);
  const requestId_15 = await bobRequestVerification(
    bob.accountId,
    nearOriginId,
    ACCOUNT_3.id,
    ACCOUNT_3.originId,
    null,
    false
  );

  await aliceApproveRequest(requestId_15);
  const ca_15_1 = await getCA(bob.accountId, nearOriginId);
  console.log("*** connectedAccountsToBobAccount", ca_15_1);
  t.deepEqual(ca_15_1, [
    [
      {
        id: gAcc_4ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_1ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_5ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_2ID,
        status: {
          isMain: true,
        },
      },
    ],
  ]);

  await bobChangeStatus(ACCOUNT_5.id, ACCOUNT_5.originId, true);
  const ca_15_2 = await getCA(bob.accountId, nearOriginId);
  console.log("*** connectedAccountsToBobAccount", ca_15_2);
  t.deepEqual(ca_15_2, [
    [
      {
        id: gAcc_4ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_1ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_5ID,
        status: {
          isMain: true,
        },
      },
    ],
    [
      {
        id: gAcc_2ID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);

  // == TEST 16 ==
  console.log("== TEST 16 ==: two requests with the same accounts");
  // =============

  const requestId_16 = await bobRequestVerification(
    bob.accountId,
    nearOriginId,
    ACCOUNT_1.id,
    ACCOUNT_1.originId,
    null,
    true
  );

  await t.throwsAsync(async () =>
    bobRequestVerification(
      bob.accountId,
      nearOriginId,
      ACCOUNT_1.id,
      ACCOUNT_1.originId,
      null,
      true
    )
  );

  await t.throwsAsync(async () =>
    bobRequestVerification(
      bob.accountId,
      nearOriginId,
      ACCOUNT_1.id,
      ACCOUNT_1.originId,
      null,
      false
    )
  );

  await aliceRejectRequest(requestId_16);

  // == TEST 17 ==
  console.log("== TEST 17 ==: single account cannot have main status");
  // =============

  const mainAccountId_17 = await getMainAccount(alice.accountId, nearOriginId);
  console.log("mainAccountId_17", mainAccountId_17);
  t.is(mainAccountId_17, gAcc_5ID);

  const ACCOUNT_5Status_17_1 = await getStatus(ACCOUNT_5.id, ACCOUNT_5.originId);
  t.is(ACCOUNT_5Status_17_1, true);

  const requestId_17 = await aliceRequestVerification(
    ACCOUNT_3.id,
    ACCOUNT_3.originId,
    ACCOUNT_5.id,
    ACCOUNT_5.originId,
    null,
    true
  );

  await aliceApproveRequest(requestId_17);

  const ACCOUNT_5Status_17_2 = await getStatus(ACCOUNT_5.id, ACCOUNT_5.originId);
  t.is(ACCOUNT_5Status_17_2, false);

  const requestId_17_2 = await aliceRequestVerification(
    ACCOUNT_3.id,
    ACCOUNT_3.originId,
    ACCOUNT_5.id,
    ACCOUNT_5.originId,
    null,
    false
  );

  await aliceApproveRequest(requestId_17_2);

  const newMainAccountId_17 = await getMainAccount(alice.accountId, nearOriginId);
  console.log("newMainAccountId_17", newMainAccountId_17);
  t.is(newMainAccountId_17, null);

  // == TEST 18 ==
  console.log("== TEST 18 ==: connect Ethereum account");
  // =============

  const wallet = ethers.Wallet.createRandom();
  const expectedAddress = wallet.address.toLowerCase();
  const statement =
    "I confirm that I am the owner of Account A and Account B and I want to link them in the Connected Accounts service.";
  const data = {
    types: {
      LinkingAccounts: [
        { name: "account_a", type: "LinkingAccount" },
        { name: "account_b", type: "LinkingAccount" },
        { name: "statement", type: "string" },
      ],
      LinkingAccount: [
        { name: "origin_id", type: "string" },
        { name: "account_id", type: "string" },
      ],
    },
    domain: {
      name: "Connected Accounts",
      version: "1",
      chainId: 5,
      verifyingContract: "0x0000000000000000000000000000000000000000", // The Ethereum address of the contract that will verify the signature (accessible via this)
    },
    primaryType: "LinkingAccounts",
    message: {
      account_a: {
        origin_id: nearOriginId,
        account_id: alice.accountId,
      },
      account_b: {
        origin_id: ethOriginId,
        account_id: expectedAddress,
      },
      statement,
    },
  };

  const signature = await wallet._signTypedData(data.domain, data.types, data.message);

  const sig = signature.slice(2, 130); // first 64 bytes without 0x
  const v = signature.slice(130, 132); // last 1 byte
  const compatibleV = parseInt("0x" + v) - 27;

  console.log("*** wallet.address", wallet.address);
  console.log("*** data.message", data.message);
  console.log("*** sig", sig);
  console.log("*** compatibleV", compatibleV);

  try {
    const result_18 = await aliceRequestVerification(
      alice.accountId,
      nearOriginId,
      expectedAddress,
      ethOriginId,
      {
        sig: sig,
        v: compatibleV,
        mc: false,
      },
      false,
      statement
    );
    console.log("*** result_18", result_18);
  } catch (err) {
    console.log("*** ERROR.", err);
  }

  const gEthID = expectedAddress + "/" + ethOriginId;

  const ca_18 = await getCA(bob.accountId, nearOriginId);
  console.log("*** connectedAccountsToBobAccount", ca_18);
  t.deepEqual(ca_18, [
    [
      {
        id: gAcc_4ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_1ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_3ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAliceID,
        status: {
          isMain: false,
        },
      },
      {
        id: gAcc_5ID,
        status: {
          isMain: false,
        },
      },
    ],
    [
      {
        id: gAcc_2ID,
        status: {
          isMain: false,
        },
      },
      {
        id: gEthID,
        status: {
          isMain: false,
        },
      },
    ],
  ]);
});
