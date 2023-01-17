//  ***** AccountGlobalId *****
//  SCHEME: accountId + / + (origin or (chain + / + network))
//  Examples:
//  * user.near/near/mainnet
//  * user.testnet/near/testnet
//  * twitter_user/twitter
//  * ins_account/instagram
//  * google_account/google
//  * 0xF64929376812667BDa7D962661229f8b8dd90687/ethereum/goerli
//  * buidl.eth/ethereum/mainnet
//  ***************************

export type AccountGlobalId = string;

@nearBindgen
export class AccountState {
  constructor(
    public isMain: bool = false // true - main, false - not main
  ) {}
}

@nearBindgen
export class Account {
  constructor(public id: AccountGlobalId, public status: AccountState) {}
}

@nearBindgen
export class LinkingAccount {
  constructor(public origin_id: string, public account_id: string) {}
}

@nearBindgen
export class LinkingAccounts {
  constructor(public account_a: LinkingAccount, public account_b: LinkingAccount) {}
}

@nearBindgen
export class Signature {
  constructor(public sig: string, public v: u8, public mc: boolean) {}
}

@nearBindgen
export class WalletProof {
  constructor(public linking_accounts: LinkingAccounts, public signature: Signature) {}
}

@nearBindgen
export class VerificationRequest {
  constructor(
    public firstAccount: AccountGlobalId,
    public secondAccount: AccountGlobalId,
    public isUnlink: boolean,
    public firstProofUrl: string,
    public secondProofUrl: string,
    public transactionSender: AccountGlobalId
  ) {}
}
