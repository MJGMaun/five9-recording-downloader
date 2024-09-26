# Five9 Recording Downloader

**Five9MP3Downloader** is a NodeJS tool that automates the downloading of MP3 recordings from the Five9 platform within a specified date range. It scans available recordings based on given start and end dates.

## Features

- Automatically download MP3 recordings from Five9.
- Specify a date range for filtering recordings.

## Requirements

- Node.js

## Usage

```
node index.js <type> <start_date> <end_date>
```

For example:
```
node index.js 1 09/24/2024 09/24/2024
```

### Notes:
- Ensure the `<type>` parameter '1' or '2'.
- Ensure you add .env and add your credentials and urls
- Don't forget to NPM install! :)

Let me know if you’d like further modifications!