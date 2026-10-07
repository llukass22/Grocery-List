# Recreate the PWA PNGs from Basket's existing basket mark (Windows).
Add-Type -AssemblyName System.Drawing
foreach ($size in @(180, 192, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#244f3d'))
  # Keep the entire mark inside the central safe area for maskable icons.
  $scale = $size / 40.0
  $graphics.TranslateTransform([single]($size * .2), [single]($size * .2))
  $graphics.ScaleTransform([single]$scale, [single]$scale)
  $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, 1.7)
  $pen.StartCap = $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLine($pen, 5, 9, 9, 3)
  $graphics.DrawLine($pen, 19, 9, 15, 3)
  $points = [System.Drawing.PointF[]]@([System.Drawing.PointF]::new(3,9), [System.Drawing.PointF]::new(21,9), [System.Drawing.PointF]::new(19,20), [System.Drawing.PointF]::new(5,20))
  $graphics.DrawPolygon($pen, $points)
  $graphics.DrawLine($pen, 9, 13, 9, 16)
  $graphics.DrawLine($pen, 15, 13, 15, 16)
  $name = if ($size -eq 180) { 'apple-touch-icon.png' } else { "icon-$size.png" }
  $bitmap.Save((Join-Path $PSScriptRoot "../dist/$name"), [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
