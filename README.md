<img width="1245" alt="connecting-accounts-smart-contract" src="https://user-images.githubusercontent.com/43613968/225054839-7ebf5656-81f0-45df-a121-c54a67a2dfda.png">

# Connected Accounts Smart Contract

This contract allows you to pair accounts of various social networks with blockchain accounts. Thus, the user can create his own network of accounts, which can be represented as a graph.

Types of links that can be created at the moment:

- NEAR Testnet + Twitter
- NEAR Testnet + GitHub
- NEAR Testnet + Ethereum (using MetaMask signature)
- Twitter + GitHub

Also you can set up one primary account for a network.

See also:

- [NEAR contract verifying the Ethereum signature]
- [Connected Accounts Dapplet]
- [Dapplets Browser Extension]

## Quick Start

Before you compile this code, you will need to install [Node.js] ≥ 12 and [NEAR CLI].

## Exploring The Code

1. The main smart contract code lives in `assembly/index.ts`. You can compile
   it with:

   ```bash
   npm i
   npm run build
   ```

2. Tests: You can run smart contract tests with:

   ```bash
   npm run test
   ```

   This runs integrational tests using [ava].

3. Deployment

   Create an Account and Deploy

   ```bash
   # Automatically deploy the wasm in a new account
   near dev-deploy out/main.wasm
   ```

   Deploy in an Existing Account

   ```bash
   # login into your account
   near login

   # deploy the contract
   near deploy <accountId> out/main.wasm
   ```

   See more in [NEAR Docs].

4. Initialize the contract

   ```bash
   near call <accountId> initialize '{"ownerAccountId": "<accountId>", "oracleAccountId": "<accountId>", "minStakeAmount": "1000000000000000000000"}' --accountId=<accountId>
   ```

## Oracle

The oracle is needed to validate the social network connection conditions. If the verification is successful, it calls the contract method to confirm the connection. If negative — to cancel the request.

Oracle must be installed on a VPS. For its operation, we recommend using the [cron] utility and running it at a frequency of 1 time per second.

The environment variable must contain the address of the deployed contract, as well as the account ID and private key of the NEAR wallet, on behalf of which interactions with the contract will take place. The same ID must be specified when initializing the contract with the second parameter - `oracleAccountId`.

## Built With

A [smart contract] written in [AssemblyScript] for an app initialized with [create-near-app].

[smart contract]: https://docs.near.org/develop/quickstart-guide
[assemblyscript]: https://www.assemblyscript.org/
[create-near-app]: https://github.com/near/create-near-app
[node.js]: https://nodejs.org/en/download/package-manager/
[ava]: https://github.com/avajs/ava
[cron]: https://en.wikipedia.org/wiki/Cron
[connected accounts dapplet]: https://github.com/dapplets/connecting-accounts-dapplet
[dapplets browser extension]: https://github.com/dapplets/dapplet-extension
[near contract verifying the ethereum signature]: https://github.com/dapplets/verify-eth-signature-on-near
[near docs]: https://docs.near.org/develop/deploy
[near cli]: https://www.npmjs.com/package/near-cli
