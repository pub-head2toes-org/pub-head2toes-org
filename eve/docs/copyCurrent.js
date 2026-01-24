const fs = require('fs').promises;
const path = require('path');

async function copyCurrentKey(inputFilePath, outputFilePath) {
    try {
        // Read the input JSON file
        const data = await fs.readFile(inputFilePath, 'utf-8');
        const jsonData = JSON.parse(data);

        // Validate that 'current' key exists
        if (!jsonData.current) {
            throw new Error('The input JSON file does not contain a "current" key');
        }

        // Create new data object with only the current key
        const newData = { current: jsonData.current };

        // Write to output file
        await fs.writeFile(outputFilePath, JSON.stringify(newData, null, 2), 'utf-8');
        console.log(`Successfully copied 'current' key to ${outputFilePath}`);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

copyCurrentKey('eveAppData - 1769111559946.data', 'eveAppData-WriteAssistantExample.data');
