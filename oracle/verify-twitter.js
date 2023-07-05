import * as puppeteer from 'puppeteer'

export const verifyTwitter = async (verificationPackage) => {
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
  console.log(`Browser launching...`)

  const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()

  if (process.env.TWITTER_COOKIES) {
    const deserializedCookies = JSON.parse(process.env.TWITTER_COOKIES);
    await page.setCookie(...deserializedCookies);
  }

  console.log(`Browser launched.`)

  await page.goto(proofUrl, { waitUntil: 'networkidle2', timeout: 60000 })
  let title = await page.title()
  title = title.toLowerCase()
  console.log(`Downloaded page "${title}".`)

  return title.indexOf('@' + username) !== -1 && title.indexOf(anotherUsername) !== -1
}