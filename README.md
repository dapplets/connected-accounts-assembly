# Connected Accounts Smart Contract

A [smart contract] written in [AssemblyScript] for an app initialized with [create-near-app]

## Quick Start

Before you compile this code, you will need to install [Node.js] ≥ 12

## Exploring The Code

1. The main smart contract code lives in `assembly/index.ts`. You can compile
   it with the `./compile` script.
2. Tests: You can run smart contract tests with the `./test` script. This runs
   standard AssemblyScript tests using [as-pect].

[smart contract]: https://docs.near.org/docs/roles/developer/contracts/intro
[assemblyscript]: https://www.assemblyscript.org/
[create-near-app]: https://github.com/near/create-near-app
[node.js]: https://nodejs.org/en/download/package-manager/
[as-pect]: https://www.npmjs.com/package/@as-pect/cli

## Run the test

To run the test you need to run the NEAR Sandbox locally.

More info:

- https://github.com/near/sandbox
- https://docs.near.org/docs/develop/contracts/sandbox#
- https://docs.near.org/develop/testing/integration-test#sandbox-testing

Steps:

1. Install NEAR Sandbox

```
npm i -g near-sandbox
```

2. Go to the directory

```
cd ~/nearcore
```

2. Run the node

```
target/debug/neard-sandbox --home /tmp/near-sandbox init
target/debug/neard-sandbox --home /tmp/near-sandbox run
```

4. Stop: Ctrl-C

5. Clean up the data

```
rm -rf /tmp/near-sandbox
```

You should run the sandbox before running the test and clean up the data after the test is complete.
