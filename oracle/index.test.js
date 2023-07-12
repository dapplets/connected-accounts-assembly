import { verifyTwitter } from './verify-twitter.js'

test('Twitter verification', async () => {
  const twitterAccount = 'Chris47880'
  const proofUrl = 'https://twitter.com/chris47880'
  const anotherAccount = 'chris326.near'
  const res = await verifyTwitter([twitterAccount, proofUrl, anotherAccount])
  expect(res).toBeTruthy();
}, 200000);