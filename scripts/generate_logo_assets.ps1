Add-Type -AssemblyName System.Drawing

$srcPath = "D:\New folder\CRM\public\Logo\744488654_18070821146437633_245573810599239769_n.jpg"
$bmp = New-Object System.Drawing.Bitmap($srcPath)

# 1. First, create high-res cropped transparent S-emblem (512x512)
# Bounds in source: X: 332 to 750 (W=419), Y: 185 to 667 (H=483)
$cropX = 320
$cropY = 175
$cropW = 442
$cropH = 500

$emblem512 = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($emblem512)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# We will sample from source, removing white background
# Let's create an intermediate unscaled bitmap with alpha transparency
$rawEmblem = New-Object System.Drawing.Bitmap($cropW, $cropH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

for ($y = 0; $y -lt $cropH; $y++) {
    for ($x = 0; $x -lt $cropW; $x++) {
        $p = $bmp.GetPixel($cropX + $x, $cropY + $y)
        $dr = 255 - $p.R
        $dg = 255 - $p.G
        $db = 255 - $p.B
        $dist = [Math]::Sqrt($dr*$dr + $dg*$dg + $db*$db)
        
        if ($dist -lt 9.0) {
            $rawEmblem.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } elseif ($dist -lt 28.0) {
            $alpha = [int]([Math]::Min(255, [Math]::Max(0, ($dist - 9.0) / 19.0 * 255)))
            $rawEmblem.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $p.R, $p.G, $p.B))
        } else {
            $rawEmblem.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $p.R, $p.G, $p.B))
        }
    }
}

# Draw rawEmblem centered into 512x512
# S is taller than wide (442 x 500). In 512x512, let's make it 440 x 498
$drawH = 480
$drawW = [int]($cropW * ($drawH / $cropH))
$drawX = [int]((512 - $drawW) / 2)
$drawY = [int]((512 - $drawH) / 2)

$g.DrawImage($rawEmblem, $drawX, $drawY, $drawW, $drawH)
$g.Dispose()

$emblem512.Save("D:\New folder\CRM\public\skylance-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Created public/skylance-icon.png (512x512 transparent)"

# 2. Create a clean ROUND favicon (512x512)
# Round circular badge with transparent outside:
$round512 = New-Object System.Drawing.Bitmap(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$gr = [System.Drawing.Graphics]::FromImage($round512)
$gr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gr.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gr.Clear([System.Drawing.Color]::Transparent)

# Draw a smooth anti-aliased white circular background disc
$circleMargin = 16
$circleSize = 512 - ($circleMargin * 2) # 480x480 circle
$circleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
$circlePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(40, 0, 0, 0), 2.0)

$gr.FillEllipse($circleBrush, $circleMargin, $circleMargin, $circleSize, $circleSize)
$gr.DrawEllipse($circlePen, $circleMargin, $circleMargin, $circleSize, $circleSize)

# Draw the emblem inside the circle, beautifully scaled (about 76% of circle)
$innerH = 360
$innerW = [int]($cropW * ($innerH / $cropH))
$innerX = [int]((512 - $innerW) / 2)
$innerY = [int]((512 - $innerH) / 2)

$gr.DrawImage($rawEmblem, $innerX, $innerY, $innerW, $innerH)
$gr.Dispose()

$round512.Save("D:\New folder\CRM\public\skylance-round.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Created public/skylance-round.png (512x512 round badge)"

# 3. Also create pure transparent emblem favicon without any circle (public/favicon-pure.png)
# and the round favicon (public/favicon-round.png)
# and generate multi-resolution favicons
function Resize-Bitmap($src, $w, $h) {
    $res = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g2 = [System.Drawing.Graphics]::FromImage($res)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g2.Clear([System.Drawing.Color]::Transparent)
    $g2.DrawImage($src, 0, 0, $w, $h)
    $g2.Dispose()
    return $res
}

# Let's save 32x32, 64x64, 180x180 (apple touch), 192x192, 512x512
$favRound64 = Resize-Bitmap $round512 64 64
$favRound64.Save("D:\New folder\CRM\public\favicon-round.png", [System.Drawing.Imaging.ImageFormat]::Png)
$favRound64.Dispose()

$favPure64 = Resize-Bitmap $emblem512 64 64
$favPure64.Save("D:\New folder\CRM\public\favicon-transparent.png", [System.Drawing.Imaging.ImageFormat]::Png)
$favPure64.Dispose()

# Also save Apple touch icon
$appleTouch = Resize-Bitmap $round512 180 180
$appleTouch.Save("D:\New folder\CRM\public\apple-touch-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$appleTouch.Dispose()

# Save primary favicon.png
# Let's check which favicon is preferred:
# Round favicon has the clean white circular disc with transparent background outside, exactly fitting "make it round and clean like without the background like a professional icon on the top"
$round128 = Resize-Bitmap $round512 128 128
$round128.Save("D:\New folder\CRM\public\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$round128.Dispose()

$rawEmblem.Dispose()
$emblem512.Dispose()
$round512.Dispose()
$bmp.Dispose()
Write-Host "All assets generated successfully!"
