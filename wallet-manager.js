import { promises as fs } from 'fs';
import path from 'path';
import readline from 'readline';

export class WalletManager {
  constructor(walletsDir = './wallets') {
    this.walletsDir = walletsDir;
  }

  async ensureWalletsDirectory() {
    try {
      await fs.mkdir(this.walletsDir, { recursive: true });
    } catch (error) {
      // Directory already exists
    }
  }

  async listStoredWallets() {
    await this.ensureWalletsDirectory();
    
    try {
      const files = await fs.readdir(this.walletsDir);
      const walletFiles = files.filter(file => 
        file.endsWith('.json') && 
        file !== 'config.json'
      );
      
      const wallets = [];
      
      for (const file of walletFiles) {
        try {
          const filePath = path.join(this.walletsDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          const keypairArray = JSON.parse(data);
          
          if (Array.isArray(keypairArray) && keypairArray.length === 64) {
            // Get public key for display (first 32 bytes for private, but we'll derive public)
            const name = file.replace('.json', '');
            wallets.push({
              name,
              path: filePath,
              filename: file
            });
          }
        } catch (error) {
          console.log(`⚠️  Skipping invalid wallet file: ${file}`);
        }
      }
      
      return wallets;
    } catch (error) {
      return [];
    }
  }

  async promptWalletSelection() {
    const wallets = await this.listStoredWallets();
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n💼 Wallet Selection');
    
    if (wallets.length === 0) {
      console.log('No stored wallets found.');
      console.log('1. Create new wallet');
      console.log('2. Import existing wallet file');
      
      return new Promise((resolve) => {
        rl.question('\nChoose option (1 or 2): ', async (choice) => {
          if (choice === '2') {
            rl.question('Enter path to existing wallet file: ', async (walletPath) => {
              const exists = await this.fileExists(walletPath);
              if (exists) {
                rl.close();
                resolve(walletPath);
              } else {
                console.log(`❌ File not found: ${walletPath}`);
                rl.close();
                resolve(await this.createNewWallet());
              }
            });
          } else {
            rl.close();
            resolve(await this.createNewWallet());
          }
        });
      });
    }

    console.log('Available wallets:');
    wallets.forEach((wallet, index) => {
      console.log(`${index + 1}. ${wallet.name} (${wallet.filename})`);
    });
    console.log(`${wallets.length + 1}. Create new wallet`);
    console.log(`${wallets.length + 2}. Import existing wallet file`);

    return new Promise((resolve) => {
      rl.question(`\nSelect wallet (1-${wallets.length + 2}): `, async (choice) => {
        const index = parseInt(choice) - 1;
        
        if (index >= 0 && index < wallets.length) {
          rl.close();
          resolve(wallets[index].path);
        } else if (index === wallets.length) {
          rl.close();
          resolve(await this.createNewWallet());
        } else if (index === wallets.length + 1) {
          rl.question('Enter path to existing wallet file: ', async (walletPath) => {
            const exists = await this.fileExists(walletPath);
            if (exists) {
              rl.close();
              resolve(walletPath);
            } else {
              console.log(`❌ File not found: ${walletPath}`);
              rl.close();
              resolve(await this.createNewWallet());
            }
          });
        } else {
          console.log('❌ Invalid selection');
          rl.close();
          resolve(await this.promptWalletSelection());
        }
      });
    });
  }

  async createNewWallet(name = null) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    if (!name) {
      name = await new Promise((resolve) => {
        rl.question('Enter wallet name: ', (walletName) => {
          rl.close();
          resolve(walletName || `wallet-${Date.now()}`);
        });
      });
    }

    await this.ensureWalletsDirectory();
    const walletPath = path.join(this.walletsDir, `${name}.json`);
    
    console.log(`🔑 Creating new wallet: ${walletPath}`);
    return walletPath;
  }

  async saveWalletInfo(walletPath, publicKey, network = 'devnet') {
    const infoPath = walletPath.replace('.json', '-info.json');
    const info = {
      publicKey: publicKey.toString(),
      network,
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };
    
    try {
      await fs.writeFile(infoPath, JSON.stringify(info, null, 2));
    } catch (error) {
      console.log('⚠️  Could not save wallet info:', error.message);
    }
  }

  async updateLastUsed(walletPath) {
    const infoPath = walletPath.replace('.json', '-info.json');
    
    try {
      const data = await fs.readFile(infoPath, 'utf8');
      const info = JSON.parse(data);
      info.lastUsed = new Date().toISOString();
      await fs.writeFile(infoPath, JSON.stringify(info, null, 2));
    } catch (error) {
      // Info file doesn't exist or couldn't be updated
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getWalletInfo(walletPath) {
    const infoPath = walletPath.replace('.json', '-info.json');
    
    try {
      const data = await fs.readFile(infoPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
}