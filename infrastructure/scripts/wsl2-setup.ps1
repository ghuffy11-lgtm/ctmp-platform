# WSL2 + Docker Desktop Setup Script for Windows Server 2022
# Run as Administrator

param(
    [switch]$SkipRestart = $false,
    [switch]$InstallDockerDesktop = $false
)

Write-Host "=== WSL2 Setup for CTMP ===" -ForegroundColor Blue
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must run as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator', then re-run this script."
    exit 1
}

Write-Host "Enabling Windows features..." -ForegroundColor Green
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -NoRestart

if ($SkipRestart) {
    Write-Host ""
    Write-Host "Features enabled. Restart your computer and run this script again:" -ForegroundColor Yellow
    Write-Host "  powershell -ExecutionPolicy Bypass -File infrastructure\scripts\wsl2-setup.ps1" -ForegroundColor Cyan
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "RESTART REQUIRED" -ForegroundColor Yellow
Write-Host "Your computer will restart in 30 seconds to apply changes."
Write-Host "After restart, run again:"
Write-Host "  powershell -ExecutionPolicy Bypass -File infrastructure\scripts\wsl2-setup.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to cancel restart..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host "Restarting..." -ForegroundColor Green
Restart-Computer -Force
