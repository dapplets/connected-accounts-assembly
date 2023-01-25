const { connect, keyStores, Contract, KeyPair } = require('near-api-js')
const puppeteer = require('puppeteer')

require('dotenv').config()

async function start() {
    const keyStore = new keyStores.InMemoryKeyStore()
    const keyPair = KeyPair.fromString(process.env.PRIVATE_KEY)
    await keyStore.setKey(process.env.NETWORK_ID, process.env.ORACLE_ACCOUNT_ID, keyPair)

    const config = {
        keyStore,
        networkId: process.env.NETWORK_ID,
        nodeUrl: process.env.NODE_URL,
        walletUrl: process.env.WALLET_URL,
        helperUrl: process.env.HELPER_URL,
        explorerUrl: process.env.EXPLORER_URL,
    }

    const near = await connect(config)
    const account = await near.account(process.env.ORACLE_ACCOUNT_ID)

    const verifyContract = async (contractAddress) => {
        const contract = new Contract(account, contractAddress, {
            viewMethods: [
                'getConnectedAccounts',
                'getOracleAccount',
                'getPendingRequests',
                'getVerificationRequest',
            ],
            changeMethods: ['approveRequest', 'rejectRequest'],
            sender: account,
        })

        await contract.getOracleAccount()

        const pendingRequests = await contract.getPendingRequests()

        if (pendingRequests.length === 0) {
            console.log('No pending requests.')
            return
        }

        console.log(`Found ${pendingRequests.length} pending requests.`)
        console.log(`Browser launching...`)

        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        })
        const page = await browser.newPage()

        console.log(`Browser launched.`)

        const verifyTwitter = async (verificationPackage) => {
            const [twitterAccount, proofUrl, anotherAccount] = verificationPackage
            const [username] = twitterAccount.split('/')
            const [anotherUsername] = anotherAccount.split('/')

            if (proofUrl.indexOf('https://twitter.com') !== 0) {
                console.log(`Invalid proof URL for Twitter: "${proofUrl}".`)
                return false
            }
            console.log(
                `Processing connection "${anotherAccount}" <=> "${twitterAccount}" with proof: ${proofUrl}`
            )

            await page.goto(proofUrl, { waitUntil: 'networkidle2', timeout: 60000 })
            let title = await page.title()
            title = title.toLowerCase()
            console.log(`Downloaded page "${title}".`)

            return title.indexOf('@' + username) !== -1 && title.indexOf(anotherUsername) !== -1
        }

        const verifyGitHub = async (verificationPackage) => {
            const [gitHubAccount, proofUrl, anotherAccount] = verificationPackage
            const [username] = gitHubAccount.split('/')
            const [anotherUsername] = anotherAccount.split('/')

            if (proofUrl.indexOf('https://github.com') !== 0) {
                console.log(`Invalid proof URL for Twitter: "${proofUrl}".`)
                return false
            }
            console.log(
                `Processing connection "${anotherAccount}" <=> "${gitHubAccount}" with proof: ${proofUrl}`
            )

            await page.goto(proofUrl, { waitUntil: 'networkidle2', timeout: 60000 })
            let title = await page.title()
            title = title.toLowerCase()
            console.log(`Downloaded page "${title}".`)

            return (
                title.indexOf(username.toLowerCase()) !== -1 &&
                title.indexOf(anotherUsername.toLowerCase()) !== -1
            )
        }

        const verifyNear = (verificationPackage) => {
            const [nearAccount, _, __, transactionSender] = verificationPackage
            return nearAccount === transactionSender
        }

        const verify = {
            twitter: verifyTwitter,
            github: verifyGitHub,
            near: verifyNear,
        }

        for (let i = 0; i < pendingRequests.length; i++) {
            try {
                const requestId = pendingRequests[i]

                console.log(
                    `Verification ${i + 1} of ${pendingRequests.length} request. ID: ${requestId}`
                )
                const request = await contract.getVerificationRequest({ id: requestId })

                const {
                    firstAccount,
                    secondAccount,
                    firstProofUrl,
                    secondProofUrl,
                    transactionSender,
                } = request

                const account_1 = firstAccount.toLowerCase()
                const account_2 = secondAccount.toLowerCase()
                const sender = transactionSender.toLowerCase()

                const verificationPackages = [
                    [account_1, firstProofUrl, account_2, sender],
                    [account_2, secondProofUrl, account_1, sender],
                ]

                let verifications = 0
                for (const verificationPackage of verificationPackages) {
                    const [_, origin] = verificationPackage[0].split('/')
                    if (!Object.prototype.hasOwnProperty.call(verify, origin)) {
                        console.log(`Unsupported social network: "${socialNetwork}".`)
                        break
                    }
                    let isVerified = verify[origin](verificationPackage)
                    if (isVerified instanceof Promise) {
                        isVerified = await isVerified
                    }
                    if (isVerified) verifications++
                }

                if (verifications === 2) {
                    console.log(`Approving request...`)
                    await contract.approveRequest({ args: { requestId } })
                } else {
                    console.log(`Rejecting request...`)
                    await contract.rejectRequest({ args: { requestId } })
                }
            } catch (e) {
                console.error(e)
            }
        }

        await browser.close()
    }

    await verifyContract(process.env.CONTRACT_ACCOUNT_ID)
    await verifyContract(process.env.NEW_CONTRACT_ACCOUNT_ID)
}

start()
    .then(() => {
        process.exit()
    })
    .catch((e) => {
        console.error(e)
        process.exit()
    })
