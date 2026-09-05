from pathlib import Path
import re

from playwright.sync_api import sync_playwright


ARTIFACTS = Path("tmp_partner_smoke")
ARTIFACTS.mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    )
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.on("console", lambda message: print("CONSOLE", message.type, message.text))
    page.on("requestfailed", lambda request: print("REQUEST_FAILED", request.url, request.failure))
    page.goto("http://localhost:3001/login", wait_until="networkidle")
    page.get_by_label("Mobile number").fill("7030000001")
    page.get_by_role("button", name="Send code").click()
    page.locator('input[name="one-time-code"]').wait_for()
    match = re.search(r"Code: (\d{6})", page.locator("body").inner_text())
    if match is None:
        raise RuntimeError("Development OTP was not published")
    page.get_by_label("6-digit code").fill(match.group(1))
    page.get_by_role("button", name="Verify & Sign In").click()
    page.wait_for_timeout(5_000)
    print("URL", page.url)
    print("TITLE", page.title())
    print("TEXT", page.locator("body").inner_text()[:3000])
    for index, control in enumerate(page.locator("input").all()):
        print(
            "INPUT",
            index,
            control.get_attribute("name"),
            control.get_attribute("placeholder"),
            control.get_attribute("aria-label"),
        )
    page.screenshot(path=str(ARTIFACTS / "after-login.png"), full_page=True)
    browser.close()
