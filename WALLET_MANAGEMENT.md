# Multi-Wallet Management

Your NFT minter now supports managing multiple stored wallets for easy switching between different accounts.

## Features

- **Store multiple wallets** in a dedicated `./wallets` directory
- **Interactive wallet selection** when starting the minter
- **Wallet metadata tracking** (creation time, last used, public key)
- **Import existing wallets** from any location
- **Create new named wallets** on demand

## How It Works

### Wallet Storage Structure
```
./wallets/
├── main-wallet.json          # Keypair data (64-byte array)
├── main-wallet-info.json     # Metadata (public key, timestamps)
├── devnet-wallet.json
├── devnet-wallet-info.json
├── production.json
└── production-info.json
```

### Usage

1. **Run with wallet selection:**
   ```bash
   npm start
   ```

2. **Demo wallet management:**
   ```bash
   npm run wallet-demo
   ```

### Interactive Menu
When you start the minter, you'll see:
```
💼 Wallet Selection
Available wallets:
1. main-wallet (main-wallet.json)
2. devnet-wallet (devnet-wallet.json) 
3. production (production.json)
4. Create new wallet
5. Import existing wallet file

Select wallet (1-5):
```

### Creating New Wallets
- Choose "Create new wallet" option
- Enter a name for your wallet (e.g., "testnet", "mainnet", "personal")
- Wallet will be saved as `./wallets/{name}.json`

### Importing Existing Wallets
- Choose "Import existing wallet file"
- Provide the full path to your existing wallet.json file
- The system will use that wallet for the session

### Wallet Information
Each wallet automatically tracks:
- **Public Key**: For easy identification
- **Network**: Last network used (devnet/mainnet)  
- **Created**: When the wallet was first created
- **Last Used**: When the wallet was last selected

## Security Notes

- **Never commit wallet files** to version control
- The `./wallets` directory is in `.gitignore`
- Each wallet file contains sensitive private key data
- Keep wallet files secure and backed up safely

## Configuration

You can customize the wallets directory when creating an NFTMinter:

```javascript
const minter = new NFTMinter({
  walletsDir: './my-custom-wallets-dir',
  // ... other options
});
```

## Benefits

- **Easy account switching** for different environments (devnet/mainnet)
- **Organized wallet management** instead of scattered .json files
- **Usage tracking** to see which wallets are being used
- **Seamless integration** with existing NFT minting workflow