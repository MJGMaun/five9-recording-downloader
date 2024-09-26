const { executablePath } = require("puppeteer");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const cheerio = require("cheerio");
const moment = require("moment");
const fs = require('fs');
const path = require('path');
const tools = require("./functions");
const ctools = require("./common-functions");
require('dotenv').config();

puppeteer.use(StealthPlugin());

// Check if both start_date and end_date arguments are provided
if (process.argv.length < 4) {
    console.log("Please provide both start_date and end_date arguments.");
    process.exit(1);
}

let type = parseInt(process.argv[2]); // 1: Five9 One, 2: Five9 Two
let type_text = type === 1 ? "one" : "two";
let start_date = process.argv[3];
let end_date = process.argv[4];
let reports_page_url = type === 1 ? process.env.FIVE9_ONE_REPORTS_URL : process.env.FIVE9_TWO_REPORTS_URL;
let reports_iframe_url = process.env.FIVE9_REPORTS_IFRAME_URL;

const email = type === 1 ? process.env.FIVE9_ONE_USER : process.env.FIVE9_TWO_USER;
const pass =  type === 1 ? process.env.FIVE9_ONE_PASS : process.env.FIVE9_TWO_PASS;

try {
    start_date_formatted = ctools.parseDate(start_date);
    end_date_formatted = ctools.parseDate(end_date);

    console.log("Start Date:", start_date_formatted);
    console.log("End Date:", end_date_formatted);
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            "--no-sandbox",
            "--disable-gpu",
            "--enable-webgl",
            "--window-size=800,800",
        ],
        executablePath: executablePath(),
    });

    const loginUrl = "https://login.five9.com/";
    const ua =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36";
    let page = await browser.newPage();

    // login
	console.log("Logging in...");
    await page.setUserAgent(ua);
    await page.goto(loginUrl, { waitUntil: "networkidle2" });
    await page.waitForTimeout(3000);
    await page.type('input[name="username"]', email);
    await page.waitForTimeout(2000);
    await page.type('input[type="password"]', pass);
    await page.keyboard.press("Enter");

	// await page.waitForTimeout(25000); // Adjust the time as needed
    await page.waitForNavigation();

	console.log("Going to reports...");
    // go to reports page
    await page.goto(
        reports_page_url,
        { waitUntil: "networkidle2" }
    );


	await page.waitForTimeout(25000); // Adjust the time as needed
	let is_first_run = true;

	while (true) {
		if (is_first_run === false) { // if not first run, go to next day
			let updatedDates = await tools.nextDates(start_date, end_date);
			start_date = updatedDates.nextStartDate;
			end_date = updatedDates.nextEndDate;
		}

		await tools.setFilters(page, start_date, end_date);

		console.log("Getting page data. Please wait...");
		// get page html/data/code
		const main_page_data = await tools.getPageData(page, start_date, end_date);

		// redirect to iframe (reports) table
		const $ = cheerio.load(main_page_data.html); // use jquery
		let iframeSrc = $("#rw_generated_report_content").attr("src"); // Extract the src attribute value from the iframe using its ID
		let report_url = reports_iframe_url + iframeSrc; // full url of table

		await page.goto(report_url, { waitUntil: "networkidle2" }); // go to iframe src

		// get page html/data/code of the redirected reports table
		const report_page_data = await tools.getPageData(page);

		let rowsData = await tools.getRowsData(report_page_data); // parse the row data

		// Filter out rows where timestamp is 'Invalid date'
		rowsData = rowsData.filter(row => row.timestamp !== 'Invalid date');

		let total_calls = rowsData.length;
		let total_files = 0;
		let total_missing_links = 0;

		// Filter out rows with empty mp3 values and count both total and missing links
		rowsData = rowsData.filter(row => {
			if (row.mp3 !== "") {
				total_files += 1;
				return true;  // Include this row in the filtered result
			} else {
				total_missing_links += 1;
				return false;  // Exclude this row from the filtered result
			}
		});

		let data_count = rowsData.length;

		console.log(rowsData);
		console.log('Data count => ', data_count);

		console.log("Going back to the list to download the calls...");
		// go back to main page
		await page.goBack();

		await tools.setFilters(page, start_date, end_date); // set filters again to be able to download the files from parsed data

		await page.waitForTimeout(2000);

		// Inject the loadRecording function into the page context
		await page.evaluate(() => {
			window.loadRecording = function (recId) {
				if (!top || !top.RepUtils) {
					alert($M("RecordingDownloadingAvailableOnly"));
					return false;
				}
				top.RepUtils.downloadRecording(
					"/recordings/download/",
					recId
				);

			};
		});

		for (const [index, row] of rowsData.entries()) { // loop every recording from scraped data
			// log this
			const logText = `${row.timestamp} -- Downloading ${index+1} of ${rowsData.length} || loadRecording('${row.mp3}') || callid ${row.call_id} || campaign ${row.campaign}`;

			// Assuming 'log.log' is the file where you want to log the text
			ctools.logTextToFile(logText, 'rows.log');

			// Execute the function
			if (row.mp3 !== "") {
				console.log(`${row.timestamp} -- Downloading ${index+1} of ${data_count} || loadRecording('${row.mp3}') || callid ${row.call_id} || campaign ${row.campaign}`);

				// Get the directory name
				const currentDir = __dirname;
				const downloadFolder = path.join(currentDir, '..', '..', 'five9_backups_scraped', type_text, row.timestamp, row.campaign);

				// Add the campaign folder if it doesn't already exist
				if (!fs.existsSync(downloadFolder)) {
					fs.mkdirSync(downloadFolder, { recursive: true });
				}

				// Set the download behavior to the specified folder
				const client = await page.target().createCDPSession();
				await client.send("Page.setDownloadBehavior", {
					behavior: "allow",
					downloadPath: downloadFolder,
				});

				// Execute the function in the page context and pass the row data
				await page.evaluate((row) => {
					loadRecording(row.mp3);
				}, row);

				// Wait for the file to download
				await page.waitForTimeout(60000); // Adjust the time as needed

			} else {
				console.log(`${row.timestamp} // Skipped ${index+1} of ${data_count} // Missing MP3 // campaign ${row.campaign}`);
			}

			// Wait for some time to ensure the function is executed
			await page.waitForTimeout(2000); // Adjust the time as needed
		}

		// when done go to the next day

		is_first_run = false;

		// log the summary for this day
		console.log("Logging day summary...");
		const daily_log = `${type_text} --- Start Date: ${moment(start_date, 'MM/DD/YYYY').format('YYYY-MM-DD')} || End Date: ${moment(end_date, 'MM/DD/YYYY').format('YYYY-MM-DD')} || Total calls: ${total_calls} || Total files: ${total_files} || Total missing links: ${total_missing_links}`;
		ctools.logTextToFile(daily_log, './summary.log');
		console.log("Fin...");

		process.exit(0);

		// todo: need to handle a lot of data if getting years/months of recordings
	}
})();
