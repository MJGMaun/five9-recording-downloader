// node index.js 03/02/2024 03/09/2024

const { Keyboard } = require("puppeteer");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const cheerio = require("cheerio");
const moment = require("moment");
const axios = require("axios");
const ctools = require("./common-functions");

puppeteer.use(StealthPlugin());

// require executablePath from puppeteer
const { executablePath } = require("puppeteer");

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

const sendCalls = async (calls) => {
    console.log("sent calls => ", calls);
    let responseData = [];
    await axios
        .post(
            "http://localhost/recstorage/API/call/create_batch?api_key=b58ba5d3-d102-4193-a18f-45791cb668c3",
            JSON.stringify(calls),
            {
                // https://rec-storage.com/ // http://localhost/recstorage
                headers: {
                    "Content-Type": "application/json",
                },
            }
        )
        .then(function (response) {
            responseData = response.data;
            console.log("response from API => ", response.data);
        })
        .catch(function (error) {
            // reload page, get data
            console.log(error);
            responseData = [];
        });

    return responseData;
};

const checkLastDataDate = async () => {
    let date = null;
    await axios
        .get(
            "http://localhost/recstorage/API/call/get_last_downloaded_call?api_key=b58ba5d3-d102-4193-a18f-45791cb668c3"
        ) // https://rec-storage.com/ // http://localhost/recstorage
        .then(function (response) {
            date =
                response.data.length !== 0 ? response.data[0].datetime : null;
        })
        .catch(function (error) {
            return [];
        });

    return date === null ? "2023-12-10" : date;
};

const runInitialProcess = async (page) => {
    // call
    const lastDataDate = await checkLastDataDate(); // check data last date from db
    const pageData = await getPageData(
        page,
        moment(new Date(lastDataDate)).format("YYYY-MM-DD")
    );
    const rowsData = await getRowsData(pageData);
    const result = await sendCalls(rowsData);
};

const runProcessAgain = async (page) => {
    // call
    // const lastDataDate = await checkLastDataDate(); // check data last date from db
    // const pageData = await getPageData(page, moment(new Date(lastDataDate)).format("YYYY-MM-DD"));
    const pageData = await getPageHTML(page);
    const rowsData = await getRowsData(pageData);
    const result = await sendCalls(rowsData);

    return result.data;
};

const goToNextPage = async (page) => {
    pageData = await getPageHTML(page);
    const $ = await cheerio.load(pageData.html);

    try {
        await page.waitForTimeout(2000);
        let currentButtonPageText = await $(
            "button.MuiButtonBase-root.MuiPaginationItem-root.MuiPaginationItem-page.Mui-selected"
        ).attr("aria-label");
        let currentPageNumber =
            (await parseInt(currentButtonPageText.replace("page ", ""))) ?? 1;
        let nextPageNumber = currentPageNumber + 1;

        await page.click(`button[aria-label='Go to page ${nextPageNumber}']`); // sort date asc

        return 1;
    } catch (error) {
        let soryByText = await $('div[data-field="phpcallstring"]').attr(
            "aria-sort"
        );
        // await page.reload();
        const lastDataDate = moment(new Date(await checkLastDataDate())).format(
            "YYYY-MM-DD"
        );
        let callUrl = `https://app.kixie.com/history/call-history?start=${lastDataDate}&tz=America%2FNew_York`;
        await page.goto(callUrl, { waitUntil: "networkidle2" }); // redirect to call
        await page.waitForTimeout(5000);

        if (soryByText === "ascending") {
            await page.click(
                "button.MuiButtonBase-root.MuiIconButton-root.MuiIconButton-sizeSmall"
            ); // sort date asc
            await page.waitForTimeout(5000);
        }
        return 1;
    }
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
	sendCalls,
	checkLastDataDate,
	runInitialProcess,
	runProcessAgain,
	goToNextPage,
	setFilters,
	nextDates
}