@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0integration-tests.ps1" %*
