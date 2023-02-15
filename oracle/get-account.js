import { connect, keyStores, KeyPair } from 'near-api-js'

export const getAccount = async (
  privateKey,
  oracleAccountId,
  networkType,
  networkId,
  nodeUrl,
  walletUrl,
  helperUrl,
  explorerUrl
) => {
  const keyStore = new keyStores.InMemoryKeyStore()
  const keyPair = KeyPair.fromString(privateKey)
  await keyStore.setKey(networkType, oracleAccountId, keyPair)

  const config = {
      keyStore,
      networkId,
      nodeUrl,
      walletUrl,
      helperUrl,
      explorerUrl,
  }

  const near = await connect(config)
  const account = await near.account(oracleAccountId)
  return account
}