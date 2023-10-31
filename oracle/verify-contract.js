import { Contract } from "near-api-js";
import { verifyNear } from "./verify-near.js";
import { verifyTwitter } from "./verify-twitter.js";
import { verifyGitHub } from "./verify-github.js";

export const verifyContract = async (contractAddress, account) => {
    const contract = new Contract(account, contractAddress, {
        viewMethods: [
            "getConnectedAccounts",
            "getOracleAccount",
            "getPendingRequests",
            "getVerificationRequest",
        ],
        changeMethods: ["approveRequest", "rejectRequest"],
        sender: account,
    });

    await contract.getOracleAccount();

    const pendingRequests = await contract.getPendingRequests();

    if (pendingRequests.length === 0) {
        console.log("No pending requests.");
        return;
    }

    console.log(`Found ${pendingRequests.length} pending requests.`);

    const verify = {
        twitter: verifyTwitter,
        x: verifyTwitter,
        github: verifyGitHub,
        near: verifyNear,
    };

    for (let i = 0; i < pendingRequests.length; i++) {
        try {
            const requestId = pendingRequests[i];

            console.log(
                `Verification ${i + 1} of ${pendingRequests.length} request. ID: ${requestId}`
            );
            const request = await contract.getVerificationRequest({ id: requestId });

            const {
                firstAccount,
                secondAccount,
                firstProofUrl,
                secondProofUrl,
                transactionSender,
            } = request;

            const account_1 = firstAccount.toLowerCase();
            const account_2 = secondAccount.toLowerCase();
            const sender = transactionSender.toLowerCase();

            const verificationPackages = [
                [account_1, firstProofUrl, account_2, sender],
                [account_2, secondProofUrl, account_1, sender],
            ];

            let verifications = 0;
            for (const verificationPackage of verificationPackages) {
                const [_, origin] = verificationPackage[0].split("/");
                if (!Object.prototype.hasOwnProperty.call(verify, origin)) {
                    console.log(`Unsupported social network: "${socialNetwork}".`);
                    break;
                }
                let isVerified = verify[origin](verificationPackage);
                if (isVerified instanceof Promise) {
                    isVerified = await isVerified;
                }
                if (isVerified) verifications++;
            }

            if (verifications === 2) {
                console.log(`Approving request...`);
                await contract.approveRequest({ args: { requestId } });
            } else {
                console.log(`Rejecting request...`);
                await contract.rejectRequest({ args: { requestId } });
            }
        } catch (e) {
            console.error(e);
        }
    }
};
