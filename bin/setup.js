#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const configPath = path.join(__dirname, '../data/keys.json');

const validateKey = (input) => {
  if (!input || input.length < 20) {
    return 'API key must be at least 20 characters';
  }
  return true;
};

const keyQuestions = [
  {
    type: 'password',
    name: 'keyValue',
    message: 'Enter the API key:',
    validate: validateKey
  },
  {
    type: 'confirm',
    name: 'addAnother',
    message: 'Would you like to add another API key?',
    default: false
  }
];

const initialQuestion = [{
  type: 'confirm',
  name: 'addKeys',
  message: 'Would you like to add API keys?',
  default: true
}];

async function main() {
  try {
    // Ensure data directory exists
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    
    // Load existing keys or initialize empty array
    let keys = [];
    try {
      const data = await fs.readFile(configPath, 'utf8');
      keys = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') { // Only ignore "file not found" error
        throw error;
      }
      // Create empty keys.json file
      await fs.writeFile(configPath, '[]');
    }

    const { addKeys } = await inquirer.prompt(initialQuestion);
    
    let addMore = addKeys;
    while (addMore) {
      const { keyValue, addAnother } = await inquirer.prompt(keyQuestions);
      
      // Add new key in KeyManager's expected format
      keys.push({
        key: keyValue,
        isActive: true,
        lastUsed: null,
        failureCount: 0
      });
      console.log(`✅ Added key ${keys.length}`);

      addMore = addAnother;
    }

    // Ensure data directory exists and save keys
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(keys, null, 2));
    console.log(`\n🎉 Configuration saved to ${configPath}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();