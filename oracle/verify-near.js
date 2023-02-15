export const verifyNear = (verificationPackage) => {
  const [nearAccount, _, __, transactionSender] = verificationPackage
  return nearAccount === transactionSender
}