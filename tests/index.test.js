import { expect } from '@jest/globals';
import 'regenerator-runtime/runtime';

jest.setTimeout(30000);

let near;
let contract;
let nearAccountId;
const nearOriginId = 'near/goerli';

beforeAll(async function () {
    near = await nearlib.connect(nearConfig);
    nearAccountId = nearConfig.contractName;
    contract = await near.loadContract(nearConfig.contractName, {
        viewMethods: [
            'getConnectedAccounts',
            'getMinStakeAmount',
            'getOracleAccount',
            'getOwnerAccount',
            'getPendingRequests',
            'getVerificationRequest'
        ],
        changeMethods: [
            'initialize',
            'approveRequest',
            'rejectRequest',
            'unlinkAll',
            'changeOwnerAccount',
            'changeOracleAccount',
            'changeMinStake',
            'requestVerification'
        ],
        sender: nearAccountId,
    });
});

test('initialize contract', async () => {
    const STAKE = "1000000000000000000000"; // 0.001 NEAR

    await contract.initialize({
        args: {
            ownerAccountId: nearAccountId,
            oracleAccountId: nearAccountId,
            minStakeAmount: STAKE,
        }
    })

    const ownerAccountId = await contract.getOwnerAccount();
    const oracleAccountId = await contract.getOracleAccount();
    const minStakeAmount = await contract.getMinStakeAmount();

    expect(ownerAccountId).toMatch(nearAccountId);
    expect(oracleAccountId).toMatch(nearAccountId);
    expect(minStakeAmount).toMatch(STAKE);
});

const ACCOUNT_1 = {
    id: 'username',
    originId: 'social_network'
};

test('linked accounts must be empty', async () => {
    const connectedAccountsToNearAccount = await contract.getConnectedAccounts({
        accountId: nearAccountId,
        originId: nearOriginId,
        closeness: 1
    });

    const connectedAccountsToAnotherAccount = await contract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId,
        closeness: 1
    });

    expect(connectedAccountsToNearAccount).toBeNull();
    expect(connectedAccountsToAnotherAccount).toBeNull();
});

test('pending requests must be empty', async () => {
    const pendingRequests = await contract.getPendingRequests();
    expect(pendingRequests).toMatchObject([]);

    const request = await contract.getVerificationRequest({ id: 0 });
    expect(request).toBeNull();
});

test('creates request', async () => {
    const id = await contract.requestVerification({
        args: { 
            accountId: ACCOUNT_1.id,
            originId: ACCOUNT_1.originId,
            isUnlink: false,
            url: "https://example.com"
        },
        amount: "1000000000000000000000"
    });

    const pendingRequests = await contract.getPendingRequests();
    expect(pendingRequests).toMatchObject([id]);

    const request = await contract.getVerificationRequest({ id: id });
    expect(request).toMatchObject({
        firstAccount: nearAccountId + '/' + nearOriginId,
        secondAccount: ACCOUNT_1.id + '/' + ACCOUNT_1.originId,
        isUnlink: false,
        proofUrl: "https://example.com"
    });
});

test('approve the linking request, get the request approve and connect accounts', async () => {
    const pendingRequests = await contract.getPendingRequests();
    const requestId = pendingRequests[0];
    await contract.approveRequest({ args: { requestId } });

    const connectedAccountsToNearAccount = await contract.getConnectedAccounts({
        accountId: nearAccountId,
        originId: nearOriginId,
        closeness: 1
    });

    const connectedAccountsToAnotherAccount = await contract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId,
        closeness: 1
    });

    expect(connectedAccountsToNearAccount).toMatchObject([ACCOUNT_1.id + '/' + ACCOUNT_1.originId]);
    expect(connectedAccountsToAnotherAccount).toMatchObject([nearAccountId + '/' + nearOriginId]);
});

test('approve the unlinking request, get the request approve and connect accounts', async () => {
    const id = await contract.requestVerification({
        args: { 
            accountId: ACCOUNT_1.id,
            originId: ACCOUNT_1.originId,
            isUnlink: true,
            url: "https://example.com"
        },
        amount: "1000000000000000000000"
    });

    const pendingRequests = await contract.getPendingRequests();
    const requestId = pendingRequests[0];
    await contract.approveRequest({ args: { requestId } });

    const connectedAccountsToNearAccount = await contract.getConnectedAccounts({
        accountId: nearAccountId,
        originId: nearOriginId,
        closeness: 1
    });

    const connectedAccountsToAnotherAccount = await contract.getConnectedAccounts({
        accountId: ACCOUNT_1.id,
        originId: ACCOUNT_1.originId,
        closeness: 1
    });

    expect(connectedAccountsToNearAccount).toMatchObject([]);
    expect(connectedAccountsToAnotherAccount).toMatchObject([]);
});