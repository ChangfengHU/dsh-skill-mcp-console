"""Real UI acceptance; confirmation is opt-in and never starts an Agent."""
import json
import os
import time
from urllib.parse import urlencode
from playwright.sync_api import sync_playwright, expect

keys = json.loads(os.environ.get('DSH_BATCH_KEYS', '["skill:harness-capability-acceptance","mcp:vyibc-image"]'))
confirm = os.environ.get('DSH_BATCH_CONFIRM') == '1'
sid = 'flow-minute-20261008a'
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors, blocked, installs = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    def guard(route):
        method = route.request.url.split('/api/')[-1].split('?')[0]
        if method == 'skillMcp/startCapabilityInstall':
            if confirm:
                installs.append(method)
                route.continue_()
            else:
                blocked.append(method)
                route.abort()
            return
        if any(name in method for name in ['session.create', 'session.prompt', 'session.cancel', 'session.delete', 'session.archive', 'fireTask', 'saveAgent', 'launchWorkflow', 'setSession', 'startAppInstall', 'uninstallApp']):
            blocked.append(method)
            route.abort()
            return
        route.continue_()
    page.route('**/api/**', guard)
    start = time.monotonic()
    fleet_checked = False
    if os.environ.get('DSH_BATCH_VIA_FLEET') == '1':
        page.goto('https://fleet.vyibc.com/#/hub', wait_until='domcontentloaded', timeout=45000)
        frame = page.frame_locator('#hubWorkspaceFrame')
        expect(frame.locator('#tabCapabilities')).to_be_visible(timeout=60000)
        expect(frame.locator('#syncStatus')).to_contain_text('实时目录', timeout=60000)
        frame.locator('#tabCapabilities').click()
        for key in keys:
            frame.locator('#search').fill(key.split(':', 1)[1])
            box = frame.locator('[data-select-capability="'+key+'"]')
            expect(box).to_be_enabled(timeout=15000)
            box.check()
        frame.locator('#selectionDsh').click()
        expect(frame.locator('#clientTarget')).to_have_value('dsh')
        link = frame.locator('#openDshBatch')
        expect(link).to_be_visible()
        from urllib.parse import urlparse, parse_qs
        actual = json.loads(parse_qs(urlparse(link.get_attribute('href')).query)['installCapabilities'][0])
        assert set(actual) == set(keys), 'handoff must match exactly the selected independent capabilities'
        fleet_checked = True
    page.goto('https://dsh.vyibc.com/?'+urlencode({'session': sid, 'installCapabilities': json.dumps(keys, separators=(',', ':'))}), wait_until='domcontentloaded', timeout=45000)
    dialog = page.get_by_role('dialog', name='批量安装到 DSH')
    expect(dialog).to_be_visible(timeout=60000)
    expect(dialog.get_by_role('button', name='确认批量安装')).to_be_enabled(timeout=60000)
    expect(page.locator('.dsm-app-grid').get_by_role('button').filter(has_text='Flow')).to_be_visible(timeout=20000)
    for width in [1440, 390]:
        page.set_viewport_size({'width': width, 'height': 1000})
        page.wait_for_timeout(250)
        assert dialog.bounding_box()['width'] <= width, 'modal exceeds viewport'
    if confirm:
        dialog.get_by_role('button', name='确认批量安装').click()
        expect(dialog.locator('.dsm-app-report')).to_be_visible(timeout=60000)
        expect(dialog.locator('.dsm-app-report .dsm-err')).to_have_count(0)
        expect(dialog.locator('.dsm-app-report')).to_contain_text('批量安装完成')
        assert installs == ['skillMcp/startCapabilityInstall'], 'unexpected duplicate installation'
    assert not errors, {'pageErrorCount': len(errors)}
    assert all(method == 'session.create' for method in blocked), {'unexpectedMutationCount': len(blocked)}
    print(json.dumps({'fleetLibraryVerified': fleet_checked, 'appsVisible': True, 'batchPreviewVisible': True, 'confirmationCount': len(installs), 'pageErrors': len(errors), 'blockedBlankSessionCreates': len(blocked), 'elapsedSeconds': round(time.monotonic()-start, 2), 'widths': [1440, 390]}))
    browser.close()
