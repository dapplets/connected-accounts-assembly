export type AccountGlobalId = string; // accountId + '/' + origin

@nearBindgen
export class AccountState {
  constructor(
    public isMain: bool = false, // true - main, false - not main
  ) {}
}

@nearBindgen
export class Account {
  constructor(
    public id: AccountGlobalId,
    public status: AccountState,
  ) {}
}

@nearBindgen
export class VerificationRequest {
  constructor(
    public firstAccount: AccountGlobalId,
    public secondAccount: AccountGlobalId,
    public isUnlink: boolean,
    public proofUrl: string,
  ) {}
}
