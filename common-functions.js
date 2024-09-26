const fs = require('fs');

// Function to parse date string in format MM/DD/YYYY
function parseDate(dateString) {
    const parts = dateString.split('/');
    if (parts.length !== 3) {
        throw new Error("Invalid date format. Please provide date in MM/DD/YYYY format.");
    }
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    if (isNaN(month) || isNaN(day) || isNaN(year)) {
        throw new Error("Invalid date format. Please provide numeric values for month, day, and year.");
    }
    return { month, day, year };
}

// Function to log text to a file
const logTextToFile = (text, filePath) => {
	fs.appendFileSync(filePath, text + '\n');
};

module.exports = {
	parseDate,
	logTextToFile
}