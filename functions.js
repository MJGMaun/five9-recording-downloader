const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const cheerio = require("cheerio");
const moment = require("moment");
const axios = require("axios");

puppeteer.use(StealthPlugin());

const getPageHTML = async (page) => {
    await page.waitForTimeout(5000);
    // get page html
    const pageHTML = await page.evaluate(() => {
        return {
            html: document.documentElement.innerHTML,
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
        };
    });

    return pageHTML;
};

const getPageData = async (page) => {
    const pageData = await getPageHTML(page);

    return pageData;
};

const getRowsData = async (page) => {
    // use cheerio(jquery)
    const $ = cheerio.load(page.html);

    // get all rows
    const rows = $("#report_content_table tbody tr").slice(2); // remove first 2 (theader)

    // map rows, get data for every row
    let rowsData = rows.map(async (index, row) => {
		let	call_id = '';
		let timestamp = $(row).find("td").eq(1).text();
			timestamp = moment(new Date(timestamp)).format(
		    "YYYY_MM_DD"
		);
		let campaign = $(row).find("td").eq(2).text();

		let mp3 = $(row).find("td").eq(24).find('a').eq(1).attr('onclick');

        if (mp3) {
            // Extract the recording ID from the onclick value
            mp3 = mp3.match(/loadRecording\('([^']+)'\)/)[1];
        } else {
            mp3 = '';
        }

        if (mp3 !== '') {
            call_id = $(row).find("td").eq(0).text().trim();
        }

        return {
			call_id,
            timestamp,
            campaign,
			mp3
        };
    });

    return Promise.all(rowsData);
};

const setFilters = async (page, start_date, end_date) => {
	console.log("Setting filters...");
	// set timezone
	await page.select('select[name="timeZone"]', "America/New_York");
	await page.waitForTimeout(1000);

	// set interval
	await page.select('select[name="time_create_timestamp_kind"]', "SPECIFIED");
	await page.waitForTimeout(3000);

	await page.$eval('#time_create_timestamp_start_input', input => input.value = ''); // clear current value

	await page.type(
		"#time_create_timestamp_start_input",
		start_date + " 12:00 AM"
	);
	await page.waitForTimeout(2000);

	await page.$eval('#time_create_timestamp_end_input', input => input.value = ''); // clear current value
	await page.type("#time_create_timestamp_end_input", end_date + " 11:59 PM");
	await page.waitForTimeout(2000);

	// Run report
	await page.waitForSelector("#rw_run_btn");

	await page.click("#rw_run_btn");
	await page.waitForTimeout(3000);

	return page;
}

const nextDates = async (start_date, end_date) => {
    // Parse input dates using Moment.js
    const startDate = moment(start_date, 'MM/DD/YYYY');
    const endDate = moment(end_date, 'MM/DD/YYYY');

    // Add one day to both start and end dates
    const nextStartDate = startDate.add(1, 'days');
    const nextEndDate = endDate.add(1, 'days');

    // Return the updated dates
    return {
        nextStartDate: nextStartDate.format('MM/DD/YYYY'),
        nextEndDate: nextEndDate.format('MM/DD/YYYY')
    };
};

module.exports = {
	getPageHTML,
	getPageData,
	getRowsData,
	setFilters,
	nextDates
}