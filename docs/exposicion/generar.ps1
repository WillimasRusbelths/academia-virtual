param([switch]$SoloVerificar)
$ErrorActionPreference = 'Stop'
$deckPath = Join-Path $PSScriptRoot 'academia-virtual-arquitectura.pptx'
$model = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'presentacion.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$renderPath = Join-Path $PSScriptRoot 'render'
[void](New-Item -ItemType Directory -Path $renderPath -Force)
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$bitmapPath = Join-Path $repoRoot '.cache/exposicion-render'
[void](New-Item -ItemType Directory -Path $bitmapPath -Force)
Add-Type -AssemblyName System.Drawing

function Color([string]$hex) {
    return [Convert]::ToInt32($hex.Substring(0,2),16) + 256 * [Convert]::ToInt32($hex.Substring(2,2),16) + 65536 * [Convert]::ToInt32($hex.Substring(4,2),16)
}
function Add-Text($slide,$item) {
    $shape = $slide.Shapes.AddTextbox(1,[single]$item.x,[single]$item.y,[single]$item.w,[single]$item.h)
    $shape.Name = 'Texto-' + $slide.Shapes.Count
    $frame = $shape.TextFrame
    $frame.MarginLeft=0; $frame.MarginRight=0; $frame.MarginTop=0; $frame.MarginBottom=0
    $frame.WordWrap=-1; $frame.AutoSize=0
    $range=$frame.TextRange
    $range.Text=([string]$item.text).Replace("`n","`r")
    $range.Font.Name='Arial'; $range.Font.Size=[single]$item.size
    $range.Font.Color.RGB=(Color $item.color)
    $range.Font.Bold=0
    if($item.bold) { $range.Font.Bold=-1 }
    $range.ParagraphFormat.SpaceBefore=0; $range.ParagraphFormat.SpaceAfter=0
    $range.ParagraphFormat.Alignment=1
    if($item.align -eq 'center') { $range.ParagraphFormat.Alignment=2 }
    if($item.align -eq 'right') { $range.ParagraphFormat.Alignment=3 }
    # PowerPoint's default textbox style can re-enable shape fitting while editing.
    # Lock both text APIs after formatting, then restore the specified geometry.
    $shape.TextFrame2.AutoSize=0
    $shape.TextFrame2.WordWrap=-1
    $shape.TextFrame2.MarginLeft=0; $shape.TextFrame2.MarginRight=0
    $shape.TextFrame2.MarginTop=0; $shape.TextFrame2.MarginBottom=0
    $shape.Left=[single]$item.x; $shape.Top=[single]$item.y
    $shape.Width=[single]$item.w; $shape.Height=[single]$item.h
    return $shape
}
function Add-Rect($slide,$item) {
    $shape=$slide.Shapes.AddShape(1,[single]$item.x,[single]$item.y,[single]$item.w,[single]$item.h)
    $shape.Fill.Solid(); $shape.Fill.ForeColor.RGB=(Color $item.fill)
    $shape.Line.Visible=0
    if($item.stroke) {
        $shape.Line.Visible=-1; $shape.Line.ForeColor.RGB=(Color $item.stroke); $shape.Line.Weight=1
        if($item.dash) { $shape.Line.DashStyle=4 }
    }
}
function Add-Line($slide,$item) {
    for($j=0;$j -lt $item.points.Count-1;$j++) {
        $a=$item.points[$j];$b=$item.points[$j+1]
        $shape=$slide.Shapes.AddLine([single]$a[0],[single]$a[1],[single]$b[0],[single]$b[1])
        $shape.Line.ForeColor.RGB=(Color '45647C');$shape.Line.Weight=1.5
        if($item.dash) { $shape.Line.DashStyle=4 }
        if(($j -eq $item.points.Count-2) -and $item.arrow -and !$item.hollow) { $shape.Line.EndArrowheadStyle=2 }
    }
    if($item.hollow) {
        # Source C4 uses realization, not inheritance between classes: hollow triangle.
        $last=$item.points[$item.points.Count-1]
        $triangle=$slide.Shapes.AddShape(7,[single]($last[0]),[single]($last[1]-6),12,12)
        $triangle.Rotation=270
        $triangle.Fill.Solid();$triangle.Fill.ForeColor.RGB=(Color 'FFFFFF')
        $triangle.Line.ForeColor.RGB=(Color '45647C');$triangle.Line.Weight=1.2
    }
}

$ppt=$null;$presentation=$null;$originalAlerts=$null
try {
    Write-Output 'Iniciando PowerPoint por COM (presentacion sin ventana)...'
    $ppt=New-Object -ComObject PowerPoint.Application
    $originalAlerts=$ppt.DisplayAlerts
    $ppt.DisplayAlerts=1
    $version=$ppt.Version
    if(!$SoloVerificar) {
        $presentation=$ppt.Presentations.Add(0)
        $presentation.PageSetup.SlideWidth=[single]$model.width
        $presentation.PageSetup.SlideHeight=[single]$model.height
        $n=0
        foreach($spec in $model.slides) {
            $n++
            $slide=$presentation.Slides.Add($n,12)
            $slide.Name=('AV-{0:D2}' -f $n)
            $slide.FollowMasterBackground=0;$slide.Background.Fill.Solid();$slide.Background.Fill.ForeColor.RGB=(Color 'FFFFFF')
            foreach($item in $spec.items) {
                switch($item.kind) {
                    'text' { [void](Add-Text $slide $item) }
                    'rect' { Add-Rect $slide $item }
                    'line' { Add-Line $slide $item }
                    default { throw ('Forma desconocida: '+$item.kind) }
                }
            }
            $notes="TIEMPO ORIENTATIVO: $($spec.seconds) segundos.`r`rEXPLICACION`r$($spec.explanation)`r`rTRANSICION`r$($spec.transition)`r`rPREGUNTA POSIBLE Y RESPUESTA`r$($spec.question)`r`rFUENTES (rutas relativas a la raiz del repositorio)`r$($spec.sources -join "`r")"
            if($spec.diagram) {
                $notes+="`r`rDIAGRAMA SINCRONIZADO`r$($spec.diagram.file) / $($spec.diagram.page). Seleccion editable: se redistribuyen nodos y se abrevian etiquetas para legibilidad; fronteras, estados y aristas seleccionadas se conservan. Etiquetas originales en presentacion.json."
            }
            $body=$null
            foreach($placeholder in $slide.NotesPage.Shapes.Placeholders) {
                if($placeholder.PlaceholderFormat.Type -eq 2) {$body=$placeholder;break}
            }
            if(!$body) {throw "Falta cuerpo de notas en diapositiva $n"}
            $body.TextFrame.TextRange.Text=$notes
            $slide.SlideShowTransition.AdvanceOnClick=-1
            $slide.SlideShowTransition.AdvanceOnTime=0
            Write-Output ('Generada {0:D2}: {1}' -f $n,$spec.title)
        }
        $presentation.SaveAs($deckPath,24)
        $presentation.Close();$presentation=$null
        Write-Output 'PPTX guardado; reabriendo desde disco para verificar y renderizar...'
    }
    # Reopen the actual saved PPTX, read-only and without a window; no model-only previews.
    $presentation=$ppt.Presentations.Open($deckPath,-1,0,0)
    if($presentation.Slides.Count -ne 16) {throw 'Numero de diapositivas incorrecto'}
    $issues=@();$slideResults=@();$n=0
    foreach($slide in $presentation.Slides) {
        $n++;$notesText=''
        foreach($placeholder in $slide.NotesPage.Shapes.Placeholders) {
            if($placeholder.PlaceholderFormat.Type -eq 2) {$notesText=$placeholder.TextFrame.TextRange.Text}
        }
        foreach($required in @('EXPLICACION','TRANSICION','PREGUNTA POSIBLE','FUENTES','docs/')) {
            if(!$notesText.Contains($required)) {throw "Notas incompletas en $n : $required"}
        }
        $textCount=0
        foreach($shape in $slide.Shapes) {
            if($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
                $textCount++
                $range=$shape.TextFrame.TextRange
                if($range.BoundHeight -gt $shape.Height+1.5 -or $range.BoundWidth -gt $shape.Width+1.5) {
                    $issues+=@{slide=$n;shape=$shape.Name;text=$range.Text;height=[math]::Round($range.BoundHeight,2);availableHeight=$shape.Height;width=[math]::Round($range.BoundWidth,2);availableWidth=$shape.Width}
                }
            }
        }
        $png=Join-Path $renderPath ('diapositiva-{0:D2}.png' -f $n)
        # Native PNG export can use an indexed palette with visible dithering.
        # Export full-colour BMP from the actual reopened slide, then lossless PNG.
        $bmp=Join-Path $bitmapPath ('diapositiva-{0:D2}.bmp' -f $n)
        $slide.Export($bmp,'BMP',1920,1080)
        $bitmap=[Drawing.Image]::FromFile($bmp)
        try {
            $pixelFormat=$bitmap.PixelFormat.ToString()
            $bitmap.Save($png,[Drawing.Imaging.ImageFormat]::Png)
        } finally { $bitmap.Dispose() }
        $slideResults+=@{slide=$n;notesLength=$notesText.Length;editableTextShapes=$textCount;render=[IO.Path]::GetFileName($png);nativeBitmapFormat=$pixelFormat}
        Write-Output ('Renderizada y verificada {0:D2}' -f $n)
    }
    $result=@{application='Microsoft PowerPoint';version=$version;width=$presentation.PageSetup.SlideWidth;height=$presentation.PageSetup.SlideHeight;slides=$slideResults;textOverflows=$issues;referenceCommit='542c341';durationSeconds=900}
    $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'verificacion.json') -Encoding UTF8
    $presentation.Close();$presentation=$null
    if($issues.Count -gt 0) { Write-Output ($issues | ConvertTo-Json -Depth 6); throw "$($issues.Count) textos exceden sus cajas; corregir antes de entregar." }
    Write-Output '16/16: apertura real, notas completas, textos editables y render PNG. Sin desbordamientos medidos.'
} finally {
    if($presentation) {$presentation.Close()}
    if($ppt) {
        if($null -ne $originalAlerts) {$ppt.DisplayAlerts=$originalAlerts}
        # Only quit if our document is closed and no user presentation is open.
        if($ppt.Presentations.Count -eq 0) {$ppt.Quit()}
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ppt)
    }
}
