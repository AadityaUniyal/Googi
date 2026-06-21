# Windows PowerShell Startup Script for Distributed AI Document Intelligence Platform

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  Starting Distributed AI Document Intelligence Platform" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Start Docker Services
Write-Host "[1/4] Starting auxiliary infrastructure (Redis & RabbitMQ)..." -ForegroundColor Yellow
docker-compose up -d

function WaitFor-Port($Port, $Name) {
    Write-Host "Waiting for $Name to be ready on port $Port..." -ForegroundColor Yellow
    while ($true) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("localhost", $Port)
            $tcp.Close()
            Write-Host "$Name is ready!" -ForegroundColor Green
            break
        } catch {
            Start-Sleep -Seconds 1
        }
    }
}

WaitFor-Port 6379 "Redis"
WaitFor-Port 5672 "RabbitMQ"

# 2. Start FastAPI Backend
Write-Host "[2/4] Starting FastAPI Backend on http://localhost:8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Starting FastAPI Backend...' -ForegroundColor Cyan; cd backend; python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

# 3. Start Background Worker
Write-Host "[3/4] Starting Event Processing Worker..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Starting Background Processing Worker...' -ForegroundColor Cyan; cd backend; python -m app.worker"

# 4. Start Next.js Frontend
Write-Host "[4/4] Starting Next.js Dev Server on http://localhost:3000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Starting Next.js Frontend...' -ForegroundColor Cyan; cd frontend; npm run dev"

Write-Host "=================================================================" -ForegroundColor Green
Write-Host "  Platform Launch Complete!" -ForegroundColor Green
Write-Host "  - Next.js Web Portal: http://localhost:3000" -ForegroundColor Green
Write-Host "  - FastAPI Interactive Documentation: http://localhost:8000/docs" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Green
