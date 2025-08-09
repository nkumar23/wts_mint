# Balance Fetching Troubleshooting

## The "Balance: NaN SOL" Issue

This typically happens due to RPC rate limiting or network connectivity issues when fetching wallet balance.

## Quick Fix

### 1. Set up Helius API (Recommended)
```bash
npm run setup-helius
```
Follow the prompts to configure your Helius API key for reliable balance fetching.

### 2. Manual Setup
Create a `.env` file:
```bash
cp .env.example .env
```

Edit `.env` and add your Helius API key:
```
HELIUS_API_KEY=your_key_here
NETWORK=devnet
```

## Solutions by Priority

### Priority 1: Use Helius RPC
- **Why**: Helius provides higher rate limits and better reliability
- **Get API Key**: https://dashboard.helius.dev (free tier available)
- **Setup**: `npm run setup-helius`

### Priority 2: Check Network Issues
```bash
# Test basic connectivity
curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getVersion","params":[]}' https://api.devnet.solana.com
```

### Priority 3: Verify Wallet Address
The balance fetching will retry 3 times with exponential backoff. Check console for:
```
   Fetching balance (attempt 1/3)...
   Fetching balance (attempt 2/3)...
   Fetching balance (attempt 3/3)...
```

## Enhanced Error Handling

The new balance fetching system includes:

- **Retry Logic**: 3 attempts with exponential backoff
- **Input Validation**: Ensures balance is a valid number
- **Detailed Logging**: Shows each attempt and failure reason
- **Fallback Handling**: Graceful degradation when balance can't be fetched

## Debug Balance Issues

### Check RPC Endpoint
```javascript
console.log('RPC URL:', minter.rpcUrl);
```

### Manual Balance Check
```bash
# Using Solana CLI
solana balance <WALLET_ADDRESS> --url devnet

# Using curl
curl -X POST -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "getAccountInfo",
  "params": ["<WALLET_ADDRESS>"]
}' https://api.devnet.solana.com
```

## Common Issues

### 1. Rate Limiting
**Symptoms**: "429 Too Many Requests" or timeout errors
**Solution**: Use Helius API key

### 2. Network Selection
**Symptoms**: Balance shows 0 when you know there's SOL
**Solution**: Ensure correct network in .env (mainnet-beta vs devnet)

### 3. Wallet Address Issues
**Symptoms**: "Account not found" errors
**Solution**: Verify wallet address is correct and has been used

## Test Your Setup

```bash
# Run the wallet demo to test balance fetching
npm run wallet-demo

# Or test with the main application
npm start
```

## Support

If issues persist after trying Helius API:
1. Check your internet connection
2. Try a different RPC endpoint
3. Verify the wallet address on a block explorer
4. Check if the network (devnet/mainnet) matches your wallet's network