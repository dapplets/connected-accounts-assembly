import * as puppeteer from "puppeteer";

export const verifyGitHub = async (verificationPackage) => {
    const [gitHubAccount, proofUrl, anotherAccount] = verificationPackage;
    const [username] = gitHubAccount.split("/");
    const [anotherUsername] = anotherAccount.split("/");

    if (proofUrl.indexOf("https://github.com") !== 0) {
        console.log(`Invalid proof URL for GitHub: "${proofUrl}".`);
        return false;
    }
    console.log(
        `Processing connection "${anotherAccount}" <=> "${gitHubAccount}" with proof: ${proofUrl}`
    );
    console.log(`Browser launching...`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    console.log(`Browser launched.`);

    await page.goto(proofUrl, { waitUntil: "networkidle2", timeout: 60000 });
    let title = await page.title();
    title = title.toLowerCase();
    console.log(`Downloaded page "${title}".`);

    return (
        title.indexOf(username.toLowerCase()) !== -1 &&
        title.indexOf(anotherUsername.toLowerCase()) !== -1
    );
};
