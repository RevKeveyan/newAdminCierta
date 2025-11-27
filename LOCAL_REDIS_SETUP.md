# Local Redis Setup (Without Docker)

If you prefer not to use Docker, here's how to set up Redis locally on Windows.

## Option 1: Using Chocolatey (Recommended)

1. **Install Chocolatey** (if not already installed):
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **Install Redis**:
   ```powershell
   choco install redis-64
   ```

3. **Start Redis**:
   ```powershell
   redis-server
   ```

## Option 2: Using WSL2 (Windows Subsystem for Linux)

1. **Install WSL2**:
   ```powershell
   wsl --install
   ```

2. **Open WSL2 terminal** and install Redis:
   ```bash
   sudo apt update
   sudo apt install redis-server
   ```

3. **Start Redis**:
   ```bash
   redis-server
   ```

## Option 3: Download Redis for Windows

1. **Download Redis for Windows** from: https://github.com/microsoftarchive/redis/releases
2. **Extract and run** `redis-server.exe`

## Configuration

Once Redis is running locally, update your `.env` file:

```env
# For local Redis (no password)
REDIS_URL=redis://localhost:6379

# For Redis with password
REDIS_URL=redis://:your_password@localhost:6379
```

## Testing Redis Connection

```bash
# Test Redis connection
redis-cli ping

# Should return: PONG
```

## Running Your Application

1. **Start Redis** (using any method above)
2. **Start MongoDB** (local or Atlas)
3. **Run your application**:
   ```bash
   npm start
   ```

## Troubleshooting

### Redis won't start
- Make sure no other service is using port 6379
- Check Windows Firewall settings
- Try running as Administrator

### Connection refused
- Verify Redis is running: `redis-cli ping`
- Check the Redis URL in your `.env` file
- Ensure no firewall is blocking port 6379























