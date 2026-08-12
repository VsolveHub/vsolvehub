@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0quality-static.ps1" %*
