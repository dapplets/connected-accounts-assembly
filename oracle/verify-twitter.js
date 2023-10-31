import * as puppeteer from "puppeteer";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const xpaths = {
    modal_header: '//*[@id="modal-header"]/span/span',
    modal_input: '//*[@id="layers"]//input',
    modal_next_button: '//*[@id="layers"]//span[text()="Next"]',
    modal_login_button: '//*[@id="layers"]//span[text()="Log in"]',
};
const defaultTypeOptions = { delay: 30 };
const defaultWaitForSelectorOptions = { visible: true, timeout: 30000 };

const sleep = (waitTimeInMs) => new Promise((resolve) => setTimeout(resolve, waitTimeInMs));

export const verifyTwitter = async (verificationPackage) => {
    const [twitterAccount, proofUrl, anotherAccount] = verificationPackage;
    const [username] = twitterAccount.split("/");
    const [anotherUsername] = anotherAccount.split("/");

    if (proofUrl.indexOf("https://twitter.com") !== 0 && proofUrl.indexOf("https://x.com") !== 0) {
        console.log(`Invalid proof URL for X: "${proofUrl}".`);
        return false;
    }
    console.log(
        `Processing connection "${anotherAccount}" <=> "${twitterAccount}" with proof: ${proofUrl}`
    );
    console.log(`Browser launching...`);

    const browser = await puppeteer.launch({
        headless: false,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    if (fs.existsSync("cookies.json")) {
        const cookies = fs.readFileSync("cookies.json", "utf8");
        const deserializedCookies = JSON.parse(cookies);
        await page.setCookie(...deserializedCookies);
    }

    console.log(`Browser launched.`);

    await page.goto(proofUrl, { waitUntil: "networkidle2", timeout: 120000 });

    const getTitle = async () => {
        let title = await page.title();
        title = title.toLowerCase();
        console.log(`Downloaded page "${title}".`);
        return title;
    };

    const title = await getTitle();

    const finish = async (message) => {
        await browser.close();
        return (
            message.indexOf("@" + username.toLowerCase()) !== -1 &&
            message.indexOf(anotherUsername.toLowerCase()) !== -1
        );
    };

    if (title.indexOf("log in") === -1) {
        return finish(title);
    }

    // If the authorisation page was opened we should authorise the oracle user

    const emailInput = await page.waitForXPath(xpaths.modal_input, defaultWaitForSelectorOptions);
    await emailInput.type(process.env.TWITTER_EMAIL, defaultTypeOptions);

    const nextButton = await page.waitForXPath(xpaths.modal_next_button, { visible: true });
    await nextButton.click();

    const modal = await page.waitForXPath(xpaths.modal_header, defaultWaitForSelectorOptions);
    const usernameText = await page.evaluate((el) => el.textContent, modal);

    if (usernameText.includes("Enter your phone number or username")) {
        const usernameInput = await page.waitForXPath(
            xpaths.modal_input,
            defaultWaitForSelectorOptions
        );
        await usernameInput.type(process.env.TWITTER_USERNAME, defaultTypeOptions);

        const nextButtonVerify = await page.waitForXPath(
            xpaths.modal_next_button,
            defaultWaitForSelectorOptions
        );
        await nextButtonVerify.click();
    }

    const passwordInput = await page.waitForXPath(
        xpaths.modal_input,
        defaultWaitForSelectorOptions
    );
    await passwordInput.type(process.env.TWITTER_PASSWORD, defaultTypeOptions);

    const nextButtonLogin = await page.waitForXPath(
        xpaths.modal_login_button,
        defaultWaitForSelectorOptions
    );
    await nextButtonLogin.click();

    await sleep(3000);

    // Go back to the checking page, save cookies and get title

    await page.goto(proofUrl, { waitUntil: "networkidle2", timeout: 120000 });

    const cookies = await page.cookies();
    fs.writeFileSync("cookies.json", JSON.stringify(cookies));

    const title2 = await getTitle();
    return finish(title2);
};
