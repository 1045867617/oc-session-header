/**
 * opencode 会话头注入 · SillyTavern / TauriTavern 扩展
 *
 * 作用：把扩展（如柏宝书）发往 ST 后端的 /api/backends/chat-completions/generate
 *      请求改写成 custom 源，并补上 x-opencode-session 请求头。
 *
 * 不依赖任何 import，全部走 window.SillyTavern.getContext()，避免路径问题。
 */

const MODULE = 'oc_session_header';

const DEFAULTS = {
    targetHost: 'opencode.ai',
    sessionId: 'b3d0e2a1-4c6f-4d2e-9a71-0f5c8e2b7d13',
    orgId: '',
    userAgent: 'sillytavern/1.0',
    debug: true,
};

const GENERATE_PATH = '/api/backends/chat-completions/generate';

let fallbackSettings = null;

function getContextSafe() {
    try {
        return window.SillyTavern?.getContext?.() ?? null;
    } catch {
        return null;
    }
}

function getStore() {
    const ctx = getContextSafe();
    const store = ctx?.extensionSettings;
    if (!store) return null;
    if (!store[MODULE] || typeof store[MODULE] !== 'object') {
        store[MODULE] = { ...DEFAULTS };
    }
    for (const key of Object.keys(DEFAULTS)) {
        if (store[MODULE][key] === undefined) store[MODULE][key] = DEFAULTS[key];
    }
    return store[MODULE];
}

function getSettings() {
    const store = getStore();
    if (store) return store;
    if (!fallbackSettings) fallbackSettings = { ...DEFAULTS };
    return fallbackSettings;
}

function save() {
    try {
        getContextSafe()?.saveSettingsDebounced?.();
    } catch {
        /* ignore */
    }
}

function log(...args) {
    if (getSettings().debug) console.log('[oc-session]', ...args);
}

function parseHeaders(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return {};
    try {
        const obj = JSON.parse(raw);
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    } catch {
        return {};
    }
}

function patchBody(raw) {
    const s = getSettings();

    let body;
    try {
        body = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!body || typeof body !== 'object') return null;

    const target = body.custom_url || body.reverse_proxy || '';
    if (typeof target !== 'string' || !target.includes(s.targetHost)) return null;

    const headers = parseHeaders(body.custom_include_headers);

    const hasAuth = Object.keys(headers).some(k => k.toLowerCase() === 'authorization');
    if (!hasAuth) headers['Authorization'] = `Bearer ${body.proxy_password || ''}`;

    headers['x-opencode-session'] = s.sessionId;
    if (s.orgId) headers['x-opencode-org-id'] = s.orgId;
    if (s.userAgent) headers['User-Agent'] = s.userAgent;

    body.chat_completion_source = 'custom';
    body.custom_url = target;
    body.custom_include_headers = JSON.stringify(headers);
    delete body.reverse_proxy;
    delete body.proxy_password;

    log('已改写请求 →', headers);
    return JSON.stringify(body);
}

function makeWrapper(baseFetch) {
    return async function (input, init) {
        try {
            const url =
                typeof input === 'string'
                    ? input
                    : input instanceof Request
                      ? input.url
                      : String(input);
            const method = String(
                init?.method || (input instanceof Request ? input.method : 'GET'),
            ).toUpperCase();

            if (url.includes(GENERATE_PATH) && method === 'POST' && typeof init?.body === 'string') {
                const patched = patchBody(init.body);
                if (patched) init = { ...init, body: patched };
            }
        } catch (e) {
            console.error('[oc-session] 改写失败，已按原样放行', e);
        }
        return baseFetch.call(window, input, init);
    };
}

let patchedFetch = makeWrapper(window.fetch.bind(window));
window.fetch = patchedFetch;

// 宿主可能在启动过程中再次替换 window.fetch，定期确认我们的拦截仍在最外层。
setInterval(() => {
    if (window.fetch !== patchedFetch) {
        patchedFetch = makeWrapper(window.fetch.bind(window));
        window.fetch = patchedFetch;
        log('重新挂载 fetch 拦截');
    }
}, 2000);

log('fetch 拦截已挂载');

function buildUi() {
    if (!window.jQuery) return false;
    if (document.getElementById('oc_session_header_settings')) return true;

    const s = getSettings();
    const html = `
    <div id="oc_session_header_settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>opencode 会话头注入</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label>目标地址包含
                    <input id="oc_target_host" class="text_pole" type="text">
                </label>
                <label>x-opencode-session
                    <input id="oc_session_id" class="text_pole" type="text">
                </label>
                <label>x-opencode-org-id（服务账号密钥留空）
                    <input id="oc_org_id" class="text_pole" type="text">
                </label>
                <label>User-Agent
                    <input id="oc_user_agent" class="text_pole" type="text">
                </label>
                <label class="checkbox_label">
                    <input id="oc_debug" type="checkbox">
                    <span>控制台输出调试日志</span>
                </label>
                <small>保存后立即生效。只影响目标地址匹配的请求。</small>
            </div>
        </div>
    </div>`;

    const $ = window.jQuery;
    $('#extensions_settings').append(html);

    $('#oc_target_host').val(s.targetHost).on('input', function () {
        getSettings().targetHost = String($(this).val());
        save();
    });
    $('#oc_session_id').val(s.sessionId).on('input', function () {
        getSettings().sessionId = String($(this).val());
        save();
    });
    $('#oc_org_id').val(s.orgId).on('input', function () {
        getSettings().orgId = String($(this).val());
        save();
    });
    $('#oc_user_agent').val(s.userAgent).on('input', function () {
        getSettings().userAgent = String($(this).val());
        save();
    });
    $('#oc_debug').prop('checked', !!s.debug).on('change', function () {
        getSettings().debug = $(this).is(':checked');
        save();
    });

    return true;
}

(function mountUi(attempt = 0) {
    if (buildUi()) return;
    if (attempt > 40) return;
    setTimeout(() => mountUi(attempt + 1), 500);
})();
