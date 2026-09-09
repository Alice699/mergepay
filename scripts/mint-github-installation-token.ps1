<#
.SYNOPSIS
  Mint a short-lived GitHub App installation token for local MergePay testing.

.DESCRIPTION
  The script signs a GitHub App JWT with the downloaded private key and exchanges
  it for an installation access token. It never writes the private key or token
  to the repository.
#>

[CmdletBinding()]
param(
  [string]$AppId,
  [string]$InstallationId,
  [string]$PrivateKeyPath
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AppId)) {
  $AppId = Read-Host "GitHub App ID"
}

if ([string]::IsNullOrWhiteSpace($InstallationId)) {
  $InstallationId = Read-Host "GitHub App installation ID"
}

if ([string]::IsNullOrWhiteSpace($PrivateKeyPath)) {
  $downloadRoot = Join-Path $env:USERPROFILE "Downloads"
  $pemFiles = @(Get-ChildItem -LiteralPath $downloadRoot -Filter "*.pem" -File -ErrorAction SilentlyContinue)
  if ($pemFiles.Count -eq 1) {
    $PrivateKeyPath = $pemFiles[0].FullName
    Write-Host "Using private key: $PrivateKeyPath"
  } else {
    $PrivateKeyPath = Read-Host "Full path to the downloaded .pem private key"
  }
}

if (-not (Test-Path -LiteralPath $PrivateKeyPath -PathType Leaf)) {
  throw "Private key file was not found: $PrivateKeyPath"
}

function ConvertTo-Base64Url([byte[]]$Bytes) {
  [Convert]::ToBase64String($Bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

# Windows PowerShell 5.1 does not expose RSA.ImportFromPem, so keep a small
# PKCS#1/PKCS#8 reader here instead of requiring another runtime or package.
function Read-DerLength([byte[]]$Bytes, [ref]$Offset) {
  if ($Offset.Value -ge $Bytes.Length) { throw "Invalid private key encoding." }
  $first = [int]$Bytes[$Offset.Value]
  $Offset.Value++
  if (($first -band 0x80) -eq 0) { return $first }

  $count = $first -band 0x7f
  if ($count -eq 0 -or $count -gt 4 -or $Offset.Value + $count -gt $Bytes.Length) {
    throw "Invalid private key length encoding."
  }
  $length = 0
  for ($index = 0; $index -lt $count; $index++) {
    $length = ($length -shl 8) -bor [int]$Bytes[$Offset.Value]
    $Offset.Value++
  }
  return $length
}

function Read-DerInteger([byte[]]$Bytes, [ref]$Offset) {
  if ($Offset.Value -ge $Bytes.Length -or $Bytes[$Offset.Value] -ne 0x02) {
    throw "Invalid RSA private key integer."
  }
  $Offset.Value++
  # $Offset is already a PSReference inside this helper; do not wrap it again.
  $length = Read-DerLength $Bytes $Offset
  if ($length -le 0 -or $Offset.Value + $length -gt $Bytes.Length) {
    throw "Invalid RSA private key integer length."
  }
  $value = New-Object byte[] $length
  [Array]::Copy($Bytes, $Offset.Value, $value, 0, $length)
  $Offset.Value += $length
  while ($value.Length -gt 1 -and $value[0] -eq 0) {
    $trimmed = New-Object byte[] ($value.Length - 1)
    [Array]::Copy($value, 1, $trimmed, 0, $trimmed.Length)
    $value = $trimmed
  }
  return ,$value
}

function Read-Pkcs1RsaParameters([byte[]]$Der) {
  $offset = 0
  if ($Der[$offset] -ne 0x30) { throw "Invalid RSA private key sequence." }
  $offset++
  $sequenceLength = Read-DerLength $Der ([ref]$offset)
  if ($offset + $sequenceLength -gt $Der.Length) { throw "Invalid RSA private key sequence length." }

  [void](Read-DerInteger $Der ([ref]$offset)) # version
  $parameters = New-Object System.Security.Cryptography.RSAParameters
  $parameters.Modulus = Read-DerInteger $Der ([ref]$offset)
  $parameters.Exponent = Read-DerInteger $Der ([ref]$offset)
  $parameters.D = Read-DerInteger $Der ([ref]$offset)
  $parameters.P = Read-DerInteger $Der ([ref]$offset)
  $parameters.Q = Read-DerInteger $Der ([ref]$offset)
  $parameters.DP = Read-DerInteger $Der ([ref]$offset)
  $parameters.DQ = Read-DerInteger $Der ([ref]$offset)
  $parameters.InverseQ = Read-DerInteger $Der ([ref]$offset)
  return $parameters
}

function Convert-PemToRsaParameters([string]$Pem) {
  $base64 = $Pem -replace '-----BEGIN [^-]+-----', '' -replace '-----END [^-]+-----', '' -replace '\s', ''
  $der = [Convert]::FromBase64String($base64)
  if ($Pem -match 'BEGIN PRIVATE KEY') {
    $offset = 0
    if ($der[$offset] -ne 0x30) { throw "Invalid PKCS#8 private key sequence." }
    $offset++
    [void](Read-DerLength $der ([ref]$offset))
    [void](Read-DerInteger $der ([ref]$offset)) # version
    if ($der[$offset] -ne 0x30) { throw "Invalid PKCS#8 algorithm sequence." }
    $offset++
    $algorithmLength = Read-DerLength $der ([ref]$offset)
    $offset += $algorithmLength
    if ($der[$offset] -ne 0x04) { throw "Invalid PKCS#8 private key payload." }
    $offset++
    $payloadLength = Read-DerLength $der ([ref]$offset)
    $payload = New-Object byte[] $payloadLength
    [Array]::Copy($der, $offset, $payload, 0, $payloadLength)
    return Read-Pkcs1RsaParameters $payload
  }
  return Read-Pkcs1RsaParameters $der
}

$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$header = ConvertTo-Base64Url(
  [Text.Encoding]::UTF8.GetBytes('{"alg":"RS256","typ":"JWT"}')
)
$payloadJson = @{
  iat = $now - 60
  exp = $now + 540
  iss = $AppId
} | ConvertTo-Json -Compress
$payload = ConvertTo-Base64Url([Text.Encoding]::UTF8.GetBytes($payloadJson))

$rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider
try {
  $rsa.ImportParameters(
    (Convert-PemToRsaParameters (Get-Content -LiteralPath $PrivateKeyPath -Raw))
  )
  $signingInput = [Text.Encoding]::UTF8.GetBytes("$header.$payload")
  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    $signature = ConvertTo-Base64Url($rsa.SignData($signingInput, $sha256))
  } finally {
    $sha256.Dispose()
  }
} finally {
  $rsa.Dispose()
}

$jwt = "$header.$payload.$signature"
$headers = @{
  Accept = "application/vnd.github+json"
  Authorization = "Bearer $jwt"
  "X-GitHub-Api-Version" = "2026-03-10"
}

$response = Invoke-RestMethod `
  -Method Post `
  -Uri "https://api.github.com/app/installations/$InstallationId/access_tokens" `
  -Headers $headers

Write-Host ""
Write-Host "Installation token created. It expires at $($response.expires_at)." -ForegroundColor Green
Write-Host "Copy this token into apps/web/.env.local as GITHUB_APP_INSTALLATION_TOKEN." -ForegroundColor Yellow
Write-Host "Do not commit it or send it in chat." -ForegroundColor Yellow
Write-Host ""
Write-Host $response.token
