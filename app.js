const express = require('express');
const { MongoClient } = require('mongodb');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

const app = express();
const port = 4000;

// MongoDB database and collection configuration
const dbConfig = {
    host: '0.0.0.0',
    port: 27017,
    database: 'batchexceltest',
    collection: 'batchimport',
    username: 'user',
    password: 'pass'
};

// Connection URI
const mongoURI = `mongodb://${dbConfig.username}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}`;

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Serve static files (HTML, CSS, JavaScript)
app.use(express.static(path.join(__dirname, 'public')));

// Define route for uploading Excel file
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded');
        }

        // Connect to MongoDB
        const client = new MongoClient(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();

        const db = client.db(dbConfig.database);
        const collection = db.collection(dbConfig.collection);

        // Read the uploaded Excel file
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // Extract column names
        const columnNames = [];
        const range = xlsx.utils.decode_range(sheet['!ref']);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = xlsx.utils.encode_cell({ r: 0, c: C });
            const header = sheet[address];
            if (header && header.t) {
                columnNames.push(header.v);
            }
        }

        // Insert data into the specified collection
        const data = xlsx.utils.sheet_to_json(sheet);

        // Generate Excel report as HTML file
        const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Excel Report</title>
        </head>
        <body>
            <h1>Inserted Rows Report</h1>
            <table border="1">
                <tr>
                    ${columnNames.map(name => `<th>${name}</th>`).join('')}
                </tr>
                ${data.map(row => `
                    <tr>
                        ${columnNames.map(name => `<td>${row[name]}</td>`).join('')}
                    </tr>
                `).join('')}
            </table>
        </body>
        </html>
        `;

        const reportFileName = 'inserted_rows_report' + randomUUID() + '.html';
        const reportFilePath = path.join(__dirname, reportFileName);
        fs.writeFileSync(reportFilePath, htmlContent);

        // Delete existing documents and insert new ones
        await collection.deleteMany({});

        // Log every row that has been updated in the database
        data.forEach((row, index) => {
            console.log(`Inserted Row ${index + 1}`);
        });

        await collection.insertMany(data);

        // Close the connection
        await client.close();

        // Inside the POST '/upload' route handler after inserting rows into the database
        const response = {
            message: `Data imported to the table successfully and ${data.length} rows were inserted and HTML report of inserted rows has been downloaded to your computer!`,
            data: data,
            reportFileName: reportFileName,
            reportFilePath: reportFilePath
        };

        res.status(200).send(response);

    } catch (error) {
        console.error(error);
        res.status(500).send('Internal server error');
    }
});

// Define route to download HTML report
app.get('/:reportFileName', (req, res) => {
    const reportFileName = req.params.reportFileName;
    const reportFilePath = path.join(__dirname, reportFileName);
    
    // Check if the file exists
    fs.access(reportFilePath, fs.constants.F_OK, (err) => {
        if (err) {
            // If the file does not exist, send a 404 response
            console.error(err);
            res.status(404).send('Report file not found');
        } else {
            // If the file exists, initiate download
            res.download(reportFilePath, (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).send('Error downloading the report file');
                } else {
                    // Delete the file after it has been downloaded
                }
            });
        }
    });
});


// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
