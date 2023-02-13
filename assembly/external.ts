import { context, ContractPromise, ContractPromiseResult, u128 } from "near-sdk-as";
import { WalletProof } from "./modules";

// Constants
export const TGAS: u64 = 1000000000000;
export const NO_DEPOSIT: u128 = u128.Zero;
export const XCC_SUCCESS = 1;

// Auxiliary Method: Make the callback private and return its result
export function get_callback_result(): ContractPromiseResult {
  assert(
    context.predecessor == context.contractName,
    "Only the contract itself can call this method"
  );

  // Return the result from the external pool
  const results = ContractPromise.getResults();
  assert(results.length == 1, "This is a callback method");
  return results[0];
}

@nearBindgen
export class GreetingCallbackArgs {
  constructor(public id: u32, public accountId: string) {}
}

@nearBindgen
export class EcrecoverOutput {
  constructor(public address: string) {}
}
