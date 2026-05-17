
# fix_page_alert_history_handler_once.ps1
# page.tsx의 handleDeleteFlightAlertHistoryItem 누락 오류를 한 번에 수정합니다.

$ErrorActionPreference = "Stop"

$Root = "C:\DATA\My DATA\에어제타\cargo-ops-webapp-main"
$Page = Join-Path $Root "frontend\app\page.tsx"

if (!(Test-Path $Page)) {
  throw "page.tsx 파일을 찾지 못했습니다: $Page"
}

$Text = Get-Content -Raw -Encoding UTF8 $Page

# 1) 함수 정의가 없으면 handleClearFlightAlertHistory 바로 앞에 삽입
if ($Text -notmatch "const handleDeleteFlightAlertHistoryItem\s*=") {
  $Handler = @'

  const handleDeleteFlightAlertHistoryItem = (targetItem: FlightAlertHistoryItem) => {
    const nextItems = flightAlertHistory.filter((item) => {
      const itemKey = `${item.key}|${item.title}|${item.description}|${item.checkedAt}`;
      const targetKey = `${targetItem.key}|${targetItem.title}|${targetItem.description}|${targetItem.checkedAt}`;
      return itemKey !== targetKey;
    });

    setFlightAlertHistory(nextItems);
    saveFlightAlertHistory(nextItems);
    setNotice("\uC120\uD0DD\uD55C \uCD9C\uB3C4\uCC29 \uC54C\uB9BC \uC774\uB825\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.");
  };

'@

  $Marker = "  const handleClearFlightAlertHistory = () => {"

  if (-not $Text.Contains($Marker)) {
    throw "handleClearFlightAlertHistory 위치를 찾지 못했습니다. page.tsx 구조 확인 필요."
  }

  $Text = $Text.Replace($Marker, $Handler + $Marker)
}

# 2) FlightAlertHistoryCard 호출부에 onDeleteItem 전달이 없으면 추가
if ($Text -match "<FlightAlertHistoryCard" -and $Text -notmatch "onDeleteItem=\{handleDeleteFlightAlertHistoryItem\}") {
  $Text = $Text -replace 'historyItems=\{flightAlertHistory\}\r?\n\s+onClear=\{handleClearFlightAlertHistory\}', "historyItems={flightAlertHistory}`r`n          onDeleteItem={handleDeleteFlightAlertHistoryItem}`r`n          onClear={handleClearFlightAlertHistory}"
}

Set-Content -Encoding UTF8 -Path $Page -Value $Text

Write-Host "OK: page.tsx 수정 완료"
Write-Host ""
Write-Host "확인 명령:"
Write-Host 'Select-String -Path "frontend\app\page.tsx" -Pattern "handleDeleteFlightAlertHistoryItem" -Context 0,3'
Write-Host ""
Write-Host "빌드 명령:"
Write-Host 'cd "C:\DATA\My DATA\에어제타\cargo-ops-webapp-main\frontend"'
Write-Host "npm run build"
