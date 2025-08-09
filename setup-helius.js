#!/usr/bin/env node

import { promises as fs } from 'fs';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function setupHelius() {
  console.log('🚀 Helius API Setup for Better Balance Fetching\n');
  
  console.log('Helius provides reliable RPC endpoints and higher rate limits.');
  console.log('Get your free API key at: https://dashboard.helius.dev\n');
  
  const apiKey = await new Promise((resolve) => {
    rl.question('Enter your Helius API key (or press Enter to skip): ', (key) => {
      resolve(key.trim());
    });
  });
  
  const network = await new Promise((resolve) => {
    rl.question('Select network (mainnet/devnet) [devnet]: ', (net) => {
      const selected = net.trim().toLowerCase() || 'devnet';
      resolve(selected === 'mainnet' ? 'mainnet-beta' : 'devnet');
    });
  });
  
  rl.close();
  
  // Check if .env exists
  let envContent = '';
  try {
    envContent = await fs.readFile('.env', 'utf8');
  } catch (error) {
    // .env doesn't exist, will create new one
  }
  
  // Update or add environment variables
  const lines = envContent.split('\n');
  const newLines = [];
  let foundHelius = false;
  let foundNetwork = false;
  
  for (const line of lines) {
    if (line.startsWith('HELIUS_API_KEY=')) {
      if (apiKey) {
        newLines.push(`HELIUS_API_KEY=${apiKey}`);
        foundHelius = true;
      }
    } else if (line.startsWith('NETWORK=')) {
      newLines.push(`NETWORK=${network}`);
      foundNetwork = true;
    } else if (line.trim()) {
      newLines.push(line);
    }
  }
  
  // Add new entries if not found
  if (!foundHelius && apiKey) {
    newLines.push(`HELIUS_API_KEY=${apiKey}`);
  }
  if (!foundNetwork) {
    newLines.push(`NETWORK=${network}`);
  }
  
  // Add bundlr address based on network
  const bundlrFound = newLines.some(line => line.startsWith('BUNDLR_ADDRESS='));
  if (!bundlrFound) {
    const bundlrAddress = network === 'mainnet-beta' 
      ? 'https://node1.bundlr.network' 
      : 'https://devnet.bundlr.network';
    newLines.push(`BUNDLR_ADDRESS=${bundlrAddress}`);
  }
  
  // Write .env file
  await fs.writeFile('.env', newLines.join('\n') + '\n');
  
  console.log('\n✅ Configuration saved to .env file');
  console.log(`🌐 Network: ${network}`);
  if (apiKey) {
    console.log('🔑 Helius API key configured');
    console.log('📈 You should now see reliable balance fetching!');
  } else {
    console.log('⚠️  No API key provided - using default RPC (may have rate limits)');
  }
  
  console.log('\n🚀 Run "npm start" to begin minting with improved balance fetching!');
}

setupHelius().catch(console.error);