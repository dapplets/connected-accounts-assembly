import { getAccount } from './get-account.js'
import { verifyContract } from './verify-contract.js'
import * as dotenv from 'dotenv'
dotenv.config()

async function start() {
    const testnetAccount = await getAccount(
      process.env.TESTNET_PRIVATE_KEY,
      process.env.TESTNET_ORACLE_ACCOUNT_ID,
      'testnet',
      process.env.TESTNET_NODE_URL,
      process.env.TESTNET_WALLET_URL,
      process.env.TESTNET_HELPER_URL,
      process.env.TESTNET_EXPLORER_URL
    )
    const mainnetAccount = await getAccount(
      process.env.MAINNET_PRIVATE_KEY,
      process.env.MAINNET_ORACLE_ACCOUNT_ID,
      'mainnet',
      process.env.MAINNET_NODE_URL,
      process.env.MAINNET_WALLET_URL,
      process.env.MAINNET_HELPER_URL,
      process.env.MAINNET_EXPLORER_URL
    )

    await verifyContract(process.env.TESTNET_CONTRACT_ACCOUNT_ID, testnetAccount)
    await verifyContract(process.env.TESTNET_NEW_CONTRACT_ACCOUNT_ID, testnetAccount)
    await verifyContract(process.env.MAINNET_CONTRACT_ACCOUNT_ID, mainnetAccount)
}

start()
    .then(() => {
        process.exit()
    })
    .catch((e) => {
        console.error(e)
        process.exit()
    })
