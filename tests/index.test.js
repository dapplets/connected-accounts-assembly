import { expect } from '@jest/globals';
import 'regenerator-runtime/runtime';
const nearAPI = require("near-api-js");
const BN = require("bn.js");
const fs = require("fs").promises;

jest.setTimeout(30000);

let aliceUseContract;
let nearAliceId;
let bobUseContract;
let nearBobId;
const nearOriginId = 'near/testnet';

beforeAll(async function () {
    function getConfig(env) {
        switch (env) {
            case "sandbox":
            case "local":
                return {
                    networkId: "sandbox",
                    nodeUrl: "http://localhost:3030",
                    masterAccount: "test.near",
                    contractAccount: "connected-accounts.test.near",
                    keyPath: "/tmp/near-sandbox/validator_key.json",
                };
        }
    }

    const contractMethods = {
        viewMethods: [
            'getConnectedAccounts',
            'getMinStakeAmount',
            'getOracleAccount',
            'getOwnerAccount',
            'getPendingRequests',
            'getVerificationRequest',
            'getStatus',
            'getMainAccount',
            'getRequestStatus',
        ],
        changeMethods: [
            'initialize',
            'approveRequest',
            'rejectRequest',
            'unlinkAll',
            'changeOwnerAccount',
            'changeOracleAccount',
            'changeMinStake',
            'requestVerification',
            'changeStatus',
        ],
    };
    let config;
    let masterAccount;
    let masterKey;
    let pubKey;
    let keyStore;
    let near;

    config = getConfig(process.env.NEAR_ENV || "sandbox");
    const keyFile = require(config.keyPath);
    masterKey = nearAPI.utils.KeyPair.fromString(
        keyFile.secret_key || keyFile.private_key
    );
    pubKey = masterKey.getPublicKey();
    keyStore = new nearAPI.keyStores.InMemoryKeyStore();
    keyStore.setKey(config.networkId, config.masterAccount, masterKey);
    near = await nearAPI.connect({
        deps: {
            keyStore,
        },
        networkId: config.networkId,
        nodeUrl: config.nodeUrl,
    });
    masterAccount = new nearAPI.Account(near.connection, config.masterAccount);
    console.log("Finish init NEAR");

    async function createContractUser(
        accountPrefix,
        contractAccountId,
        contractMethods
    ) {
        let accountId = accountPrefix + "." + config.masterAccount;
        await masterAccount.createAccount(
            accountId,
            pubKey,
            new BN(10).pow(new BN(25))
        );
        keyStore.setKey(config.networkId, accountId, masterKey);
        const account = new nearAPI.Account(near.connection, accountId);
        const accountUseContract = new nearAPI.Contract(
            account,
            contractAccountId,
            contractMethods
        );
        return accountUseContract;
    }

    const contract = await fs.readFile("./out/main.wasm");
    const _contractAccount = await masterAccount.createAndDeployContract(
        config.contractAccount,
        pubKey,
        contract,
        new BN(10).pow(new BN(25))
    );

    aliceUseContract = await createContractUser(
        "alice",
        config.contractAccount,
        contractMethods
    );
    nearAliceId = aliceUseContract.account.accountId;

    bobUseContract = await createContractUser(
        "bob",
        config.contractAccount,
        contractMethods
    );
    nearBobId = bobUseContract.account.accountId;

    console.log("Finish deploy contracts and create test accounts");
});

test('initialize contract', async () => {
    const STAKE = "1000000000000000000000"; // 0.001 NEAR

    await aliceUseContract.initialize({
        args: {
            ownerAccountId: nearAliceId,
            oracleAccountId: nearAliceId,
            minStakeAmount: STAKE,
        }
    })

    const ownerAccountId = await aliceUseContract.getOwnerAccount();
    const oracleAccountId = await aliceUseContract.getOracleAccount();
    const minStakeAmount = await aliceUseContract.getMinStakeAmount();

    expect(ownerAccountId).toMatch(nearAliceId);
    expect(oracleAccountId).toMatch(nearAliceId);
    expect(minStakeAmount).toMatch(STAKE);
});

const ACCOUNT_1 = {
    id: 'username',
    originId: 'social_network'
};

test('linked accounts must be empty', async () => {
    const connectedAccountsToNearAccount = await aliceUseContract.getConnectedAccounts({
        accountId: nearAliceId,
        originId: nearOriginId,
        closeness: 1
    });

    const connectedAccountsToAnotherAccount = await aliceUseContract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId,
        closeness: 1
    });

    expect(connectedAccountsToNearAccount).toEqual([[]]);
    expect(connectedAccountsToAnotherAccount).toEqual([[]]);
});

test('pending requests must be empty', async () => {
    const pendingRequests = await aliceUseContract.getPendingRequests();
    expect(pendingRequests).toEqual([]);

    const request = await aliceUseContract.getVerificationRequest({ id: 0 });
    expect(request).toBeNull();
});

test('creates request', async () => {
    const id = await aliceUseContract.requestVerification({
        args: {
            firstAccountId: ACCOUNT_1.id,
            firstOriginId: ACCOUNT_1.originId,
            secondAccountId: nearAliceId,
            secondOriginId: nearOriginId,
            isUnlink: false,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });

    const pendingRequests = await aliceUseContract.getPendingRequests();
    expect(pendingRequests).toEqual([id]);

    const request = await aliceUseContract.getVerificationRequest({ id });
    expect(request).toEqual({
        firstAccount: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
        secondAccount: nearAliceId + '/' + nearOriginId,
        isUnlink: false,
        firstProofUrl: "https://example.com",
        secondProofUrl: "",
        transactionSender: "alice.test.near/near/testnet"
    });
});

test('approve the linking request, get the request approve and connect accounts', async () => {
    const pendingRequests = await aliceUseContract.getPendingRequests();
    const requestId = pendingRequests[0];
    await aliceUseContract.approveRequest({ args: { requestId } });

    const connectedAccountsToNearAccount = await aliceUseContract.getConnectedAccounts({
        accountId: nearAliceId,
        originId: nearOriginId,
        closeness: 1
    });

    const connectedAccountsToAnotherAccount = await aliceUseContract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId,
        closeness: 1
    });

    console.log('+++ connectedAccountsToNearAccount', connectedAccountsToNearAccount)
    console.log('+++ connectedAccountsToAnotherAccount', connectedAccountsToAnotherAccount)

    expect(connectedAccountsToNearAccount).toEqual([[
        {
            id: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
            status: {
                isMain: false
            }
        }
    ]]);
    expect(connectedAccountsToAnotherAccount).toEqual([[
        {
            id: nearAliceId + '/' + nearOriginId,
            status: {
                isMain: false
            }
        }
    ]]);
});

test('approve the unlinking request, get the request approve and unconnect accounts', async () => {
    const connectedAccountsToNearAccount = await aliceUseContract.getConnectedAccounts({
        accountId: nearAliceId,
        originId: nearOriginId,
        closeness: 1
    });

    const connectedAccountsToAnotherAccount = await aliceUseContract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId,
        closeness: 1
    });
    expect(connectedAccountsToNearAccount).toEqual([[
        {
            id: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
            status: {
                isMain: false
            }
        }
    ]]);
    expect(connectedAccountsToAnotherAccount).toEqual([[
        {
            id: nearAliceId + '/' + nearOriginId,
            status: {
                isMain: false
            }
        }
    ]]);
    
    const id = await aliceUseContract.requestVerification({
        args: {
            firstAccountId: ACCOUNT_1.id,
            firstOriginId: ACCOUNT_1.originId,
            secondAccountId: nearAliceId,
            secondOriginId: nearOriginId,
            isUnlink: true,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });

    const pendingRequests = await aliceUseContract.getPendingRequests();
    const requestId = pendingRequests[0];
    await aliceUseContract.approveRequest({ args: { requestId } });

    const connectedAccountsToNearAccount2 = await aliceUseContract.getConnectedAccounts({
        accountId: nearAliceId,
        originId: nearOriginId,
        closeness: 1
    });

    const connectedAccountsToAnotherAccount2 = await aliceUseContract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId,
        closeness: 1
    });

    console.log('+++ connectedAccountsToNearAccount2', connectedAccountsToNearAccount)
    console.log('+++ connectedAccountsToAnotherAccount2', connectedAccountsToAnotherAccount)

    expect(connectedAccountsToNearAccount2).toEqual([[]]);
    expect(connectedAccountsToAnotherAccount2).toEqual([[]]);
});

test('approve two linking requests, get the requests approves and connect accounts', async () => {
    await aliceUseContract.requestVerification({
        args: {
            firstAccountId: ACCOUNT_1.id,
            firstOriginId: ACCOUNT_1.originId,
            secondAccountId: nearAliceId,
            secondOriginId: nearOriginId,
            isUnlink: false,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });

    await bobUseContract.requestVerification({
        args: {
            firstAccountId: ACCOUNT_1.id,
            firstOriginId: ACCOUNT_1.originId,
            secondAccountId: nearBobId,
            secondOriginId: nearOriginId,
            isUnlink: false,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });

    const pendingRequests = await aliceUseContract.getPendingRequests();
    expect(pendingRequests.length).toBe(2);

    const aliceRequestId = pendingRequests[0];
    await aliceUseContract.approveRequest({ args: { requestId: aliceRequestId } });

    const bobRequestId = pendingRequests[1];
    await aliceUseContract.approveRequest({ args: { requestId: bobRequestId } });

    const connectedAccountsToAliseAccount = await aliceUseContract.getConnectedAccounts({
        accountId: nearAliceId,
        originId: nearOriginId,
        closeness: 1
    });

    const connectedAccountsToBobAccount = await bobUseContract.getConnectedAccounts({
        accountId: nearBobId,
        originId: nearOriginId,
        closeness: 1
    });

    const connectedAccountsToAnotherAccount = await aliceUseContract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId,
        closeness: 1
    });

    console.log('+++ connectedAccountsToAliseAccount', connectedAccountsToAliseAccount)
    console.log('+++ connectedAccountsToBobAccount', connectedAccountsToBobAccount)
    console.log('+++ connectedAccountsToAnotherAccount', connectedAccountsToAnotherAccount)

    expect(connectedAccountsToAliseAccount).toEqual([[
        {
            id: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
            status: {
                isMain: false
            }
        }
    ]]);
    expect(connectedAccountsToBobAccount).toEqual([[
        {
            id: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
            status: {
                isMain: false
            }
        }
    ]]);
    expect(connectedAccountsToAnotherAccount).toEqual([[
        {
            id: nearAliceId + '/' + nearOriginId,
            status: {
                isMain: false
            }
        },
        {
            id: nearBobId + '/' + nearOriginId,
            status: {
                isMain: false
            }
        }
    ]]);
});

test('get account status', async () => {
    const ACCOUNT_1Status = await aliceUseContract.getStatus({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId
    });
    expect(ACCOUNT_1Status).toBe(false);
    const aliceStatus = await aliceUseContract.getStatus({
        accountId: nearAliceId,
        originId: nearOriginId
    });
    expect(aliceStatus).toBe(false);
    const bobStatus = await aliceUseContract.getStatus({
        accountId: nearBobId,
        originId: nearOriginId
    });
    expect(bobStatus).toBe(false);
});

test('change account status', async () => {
    await aliceUseContract.changeStatus({
        args: {
            accountId: nearAliceId,
            originId: nearOriginId,
            isMain: true
        }
    });

    const aliceStatus = await aliceUseContract.getStatus({
        accountId: nearAliceId,
        originId: nearOriginId
    });
    expect(aliceStatus).toBe(true);

    await aliceUseContract.changeStatus({
        args: {
            accountId: ACCOUNT_1.id,
            originId: ACCOUNT_1.originId,
            isMain: true
        }
    });

    const ACCOUNT_1Status = await aliceUseContract.getStatus({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId
    });
    expect(ACCOUNT_1Status).toBe(true);

    const aliceStatus2 = await aliceUseContract.getStatus({
        accountId: nearAliceId,
        originId: nearOriginId
    });
    expect(aliceStatus2).toBe(false);

    const bobStatus = await aliceUseContract.getStatus({
        accountId: nearBobId,
        originId: nearOriginId
    });
    expect(bobStatus).toBe(false);
});

const ACCOUNT_2 = {
    id: 'username-2',
    originId: 'social_network-2'
};

const ACCOUNT_3 = {
    id: 'username-3',
    originId: 'social_network-3'
};

const ACCOUNT_4 = {
    id: 'username-4',
    originId: 'social_network-4'
};

test('recursively getting the entire network of connected accounts', async () => {
    await aliceUseContract.requestVerification({
        args: {
            firstAccountId: ACCOUNT_2.id,
            firstOriginId: ACCOUNT_2.originId,
            secondAccountId: nearAliceId,
            secondOriginId: nearOriginId,
            isUnlink: false,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });

    await bobUseContract.requestVerification({
        args: {
            firstAccountId: ACCOUNT_3.id,
            firstOriginId: ACCOUNT_3.originId,
            secondAccountId: nearBobId,
            secondOriginId: nearOriginId,
            isUnlink: false,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });

    await bobUseContract.requestVerification({
        args: {
            firstAccountId: ACCOUNT_4.id,
            firstOriginId: ACCOUNT_4.originId,
            secondAccountId: nearBobId,
            secondOriginId: nearOriginId,
            isUnlink: false,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });

    const pendingRequests = await aliceUseContract.getPendingRequests();
    expect(pendingRequests.length).toBe(3);

    const aliceRequestId = pendingRequests[0];
    await aliceUseContract.approveRequest({ args: { requestId: aliceRequestId } });

    const bobRequestId1 = pendingRequests[1];
    await aliceUseContract.approveRequest({ args: { requestId: bobRequestId1 } });

    const bobRequestId2 = pendingRequests[2];
    await aliceUseContract.approveRequest({ args: { requestId: bobRequestId2 } });

    const connectedAccountsToAliseAccount = await aliceUseContract.getConnectedAccounts({
        accountId: nearAliceId,
        originId: nearOriginId
    });

    console.log('*** connectedAccountsToAliseAccount', connectedAccountsToAliseAccount)

    expect(connectedAccountsToAliseAccount).toEqual([
        [
            {
                id: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
                status: {
                    isMain: true
                }
            },
            {
                id: ACCOUNT_2.id + '/' + ACCOUNT_2.originId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: nearBobId + '/' + nearOriginId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_3.id + '/' + ACCOUNT_3.originId,
                status: {
                    isMain: false
                }
            },
            {
                id: ACCOUNT_4.id + '/' + ACCOUNT_4.originId,
                status: {
                    isMain: false
                }
            }
        ]
    ]);

    const connectedAccountsTo4Account = await aliceUseContract.getConnectedAccounts({
        accountId: ACCOUNT_4.id,
        originId: ACCOUNT_4.originId
    });
    console.log('*** connectedAccounts to ACCOUNT_4', connectedAccountsTo4Account)


    expect(connectedAccountsTo4Account).toEqual([
        [
            {
                id: nearBobId + '/' + nearOriginId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
                status: {
                    isMain: true
                }
            },
            {
                id: ACCOUNT_3.id + '/' + ACCOUNT_3.originId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: nearAliceId + '/' + nearOriginId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_2.id + '/' + ACCOUNT_2.originId,
                status: {
                    isMain: false
                }
            }
        ]
    ]);
});

test('recursively getting 2 levels of the connected accounts network', async () => {
    const connectedAccountsToAliseAccount = await aliceUseContract.getConnectedAccounts({
        accountId: nearAliceId,
        originId: nearOriginId,
        closeness: 2
    });

    console.log('*** connectedAccountsToAliseAccount', connectedAccountsToAliseAccount)

    expect(connectedAccountsToAliseAccount).toEqual([
        [
            {
                id: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
                status: {
                    isMain: true
                }
            },
            {
                id: ACCOUNT_2.id + '/' + ACCOUNT_2.originId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: nearBobId + '/' + nearOriginId,
                status: {
                    isMain: false
                }
            }
        ]
    ]);
});

test('get main account', async () => {
    const mainAccountId = await aliceUseContract.getMainAccount({
        accountId: ACCOUNT_4.id,
        originId: ACCOUNT_4.originId
    });
    expect(mainAccountId).toBe(ACCOUNT_1.id + '/' + ACCOUNT_1.originId);
});

const ACCOUNT_5 = {
    id: 'username-5',
    originId: 'social_network'
};

test('merge 2 nets with main accouts', async () => {
    const id_1 = await bobUseContract.requestVerification({
        args: {
            firstAccountId: ACCOUNT_1.id,
            firstOriginId: ACCOUNT_1.originId,
            secondAccountId: nearBobId,
            secondOriginId: nearOriginId,
            isUnlink: true,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });
    await aliceUseContract.approveRequest({ args: { requestId: id_1 } });

    const connectedAccounts_1 = await aliceUseContract.getConnectedAccounts({
        accountId: nearBobId,
        originId: nearOriginId
    });

    console.log('*** connectedAccountsToBobAccount', connectedAccounts_1)

    expect(connectedAccounts_1).toEqual([
        [
            {
                id: ACCOUNT_3.id + '/' + ACCOUNT_3.originId,
                status: {
                    isMain: false
                }
            },
            {
                id: ACCOUNT_4.id + '/' + ACCOUNT_4.originId,
                status: {
                    isMain: false
                }
            }
        ]
    ]);

    const connectedAccounts_2 = await aliceUseContract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId
    });

    console.log('*** connectedAccountsToACCOUNT_1.id', connectedAccounts_2)

    expect(connectedAccounts_2).toEqual([
        [
            {
                id: nearAliceId + '/' + nearOriginId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_2.id + '/' + ACCOUNT_2.originId,
                status: {
                    isMain: false
                }
            }
        ]
    ]);

    const id_2 = await bobUseContract.requestVerification({
        args: {
            firstAccountId: ACCOUNT_5.id,
            firstOriginId: ACCOUNT_5.originId,
            secondAccountId: ACCOUNT_3.id,
            secondOriginId: ACCOUNT_3.originId,
            isUnlink: false,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });
    await aliceUseContract.approveRequest({ args: { requestId: id_2 } });

    await bobUseContract.changeStatus({
        args: {
            accountId: ACCOUNT_5.id,
            originId: ACCOUNT_5.originId,
            isMain: true
        }
    });

    const connectedAccountsToACCOUNT_4 = await aliceUseContract.getConnectedAccounts({
        accountId: ACCOUNT_4.id,
        originId: ACCOUNT_4.originId
    });

    console.log('*** connectedAccountsToACCOUNT_4', connectedAccountsToACCOUNT_4);

    expect(connectedAccountsToACCOUNT_4).toEqual([
        [
            {
                id: nearBobId + '/' + nearOriginId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_3.id + '/' + ACCOUNT_3.originId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_5.id + '/' + ACCOUNT_5.originId,
                status: {
                    isMain: true
                }
            }
        ]
    ]);

    const connectedAccountsToBob = await aliceUseContract.getConnectedAccounts({
        accountId: nearBobId,
        originId: nearOriginId
    });

    console.log('*** connectedAccountsToACCOUNT_4', connectedAccountsToBob);

    expect(connectedAccountsToBob).toEqual([
        [
            {
                id: ACCOUNT_3.id + '/' + ACCOUNT_3.originId,
                status: {
                    isMain: false
                }
            },
            {
                id: ACCOUNT_4.id + '/' + ACCOUNT_4.originId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_5.id + '/' + ACCOUNT_5.originId,
                status: {
                    isMain: true
                }
            }
        ]
    ]);

    const id_3 = await bobUseContract.requestVerification({
        args: {
            firstAccountId: nearBobId,
            firstOriginId: nearOriginId,
            secondAccountId: ACCOUNT_1.id,
            secondOriginId: ACCOUNT_1.originId,
            isUnlink: false,
            firstProofUrl: "https://example.com"
        },
        amount: "1000000000000000000000"
    });
    await aliceUseContract.approveRequest({ args: { requestId: id_3 } });

    const connectedAccountsToACCOUNT_1 = await aliceUseContract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId
    });

    console.log('*** connectedAccountsToACCOUNT_1', connectedAccountsToACCOUNT_1)

    expect(connectedAccountsToACCOUNT_1).toEqual([
        [
            {
                id: nearAliceId + '/' + nearOriginId,
                status: {
                    isMain: false
                }
            },
            {
                id: nearBobId + '/' + nearOriginId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_2.id + '/' + ACCOUNT_2.originId,
                status: {
                    isMain: false
                }
            },
            {
                id: ACCOUNT_3.id + '/' + ACCOUNT_3.originId,
                status: {
                    isMain: false
                }
            },
            {
                id: ACCOUNT_4.id + '/' + ACCOUNT_4.originId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_5.id + '/' + ACCOUNT_5.originId,
                status: {
                    isMain: false
                }
            }
        ]
    ]);

    const connectedAccountsToBobAccount = await aliceUseContract.getConnectedAccounts({
        accountId: nearBobId,
        originId: nearOriginId
    });

    console.log('*** connectedAccountsToBobAccount', connectedAccountsToBobAccount)

    expect(connectedAccountsToBobAccount).toEqual([
        [
            {
                id: ACCOUNT_3.id + '/' + ACCOUNT_3.originId,
                status: {
                    isMain: false
                }
            },
            {
                id: ACCOUNT_4.id + '/' + ACCOUNT_4.originId,
                status: {
                    isMain: false
                }
            },
            {
                id: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_5.id + '/' + ACCOUNT_5.originId,
                status: {
                    isMain: false
                }
            },
            {
                id: nearAliceId + '/' + nearOriginId,
                status: {
                    isMain: false
                }
            }
        ],
        [
            {
                id: ACCOUNT_2.id + '/' + ACCOUNT_2.originId,
                status: {
                    isMain: false
                }
            }
        ]
    ]);
});
