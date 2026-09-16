param(
    [int]$Port = 8080
)

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $baseDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
    $listener.Start()
    Write-Host "=================================================="
    Write-Host "Local HTTP Server running on http://localhost:$Port/"
    Write-Host "Serving files from: $baseDir"
    Write-Host "=================================================="
} catch {
    Write-Error "Failed to start HttpListener on port $Port : $_"
    exit 1
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $rawUrl = [System.Uri]::UnescapeDataString($request.RawUrl)
        if ($rawUrl.Contains("?")) {
            $rawUrl = $rawUrl.Substring(0, $rawUrl.IndexOf("?"))
        }

        # CORS Preflight
        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 204
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            $response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
            $response.OutputStream.Close()
            continue
        }

        # AI Resume Analysis API Endpoint
        if ($request.HttpMethod -eq "POST" -and $rawUrl -like "/api/analyze-resume*") {
            $response.ContentType = "application/json; charset=utf-8"
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")

            try {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()

                $pythonScript = [System.IO.Path]::Combine($baseDir, "backend", "resume_analyzer.py")
                $tempInputFile = [System.IO.Path]::GetTempFileName()
                [System.IO.File]::WriteAllText($tempInputFile, $body, [System.Text.Encoding]::UTF8)

                $psi = New-Object System.Diagnostics.ProcessStartInfo
                $psi.FileName = "python"
                $psi.Arguments = "`"$pythonScript`""
                $psi.RedirectStandardInput = $true
                $psi.RedirectStandardOutput = $true
                $psi.RedirectStandardError = $true
                $psi.UseShellExecute = $false
                $psi.CreateNoWindow = $true

                $proc = [System.Diagnostics.Process]::Start($psi)
                $proc.StandardInput.Write($body)
                $proc.StandardInput.Close()
                $output = $proc.StandardOutput.ReadToEnd()
                $errOutput = $proc.StandardError.ReadToEnd()
                $proc.WaitForExit()

                if ([System.IO.File]::Exists($tempInputFile)) {
                    [System.IO.File]::Delete($tempInputFile)
                }

                if (-not [string]::IsNullOrWhiteSpace($output)) {
                    $responseBytes = [System.Text.Encoding]::UTF8.GetBytes($output)
                    $response.StatusCode = 200
                } else {
                    $errJson = @{
                        success = $false
                        readable = $false
                        error = if ($errOutput) { $errOutput } else { "Failed to run Python analyzer." }
                    } | ConvertTo-Json
                    $responseBytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                    $response.StatusCode = 200
                }
            } catch {
                $errJson = @{
                    success = $false
                    readable = $false
                    error = $_.Exception.Message
                } | ConvertTo-Json
                $responseBytes = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                $response.StatusCode = 500
            }

            $response.ContentLength64 = $responseBytes.Length
            $response.OutputStream.Write($responseBytes, 0, $responseBytes.Length)
            $response.OutputStream.Close()
            continue
        }

        if ($rawUrl -eq "/" -or [string]::IsNullOrWhiteSpace($rawUrl)) {
            $rawUrl = "/index.html"
        }

        $relativePath = $rawUrl.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        $localPath = [System.IO.Path]::Combine($baseDir, $relativePath)

        if ([System.IO.File]::Exists($localPath)) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $mime = "application/octet-stream"
            if ($mimeTypes.ContainsKey($ext)) {
                $mime = $mimeTypes[$ext]
            }

            $response.ContentType = $mime
            $response.StatusCode = 200
            $response.AddHeader("Access-Control-Allow-Origin", "*")
            $response.AddHeader("Cache-Control", "no-cache, no-store, must-revalidate")

            $bytes = [System.IO.File]::ReadAllBytes($localPath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawUrl")
            $response.ContentLength64 = $notFoundBytes.Length
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
        }
        $response.OutputStream.Close()
    } catch {
        # Continue listening
    }
}
