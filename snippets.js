'use strict'

const ASSET_URL = 'https://geekertao.github.io/gh-proxy/'
const PREFIX = '/'

const Config = {
    jsdelivr: 0,
    // 是否把「签名资源跳转」重写为 302 返回给客户端。
    //   0 = 内部自动跟随 302，直接流式返回文件内容（默认；客户端只发 1 次请求）
    //   1 = 返回 302 让客户端再请求一次代理（仅作为 Snippets 触发 1202 时的应急开关）
    //
    // 默认 0 与 workers.js 行为一致：GitHub 域名链接由代理内部跟随到真实文件后透传内容，
    // 客户端不会看到真实文件链接，也不会多一次往返。
    rewriteAssetRedirect: 0
}

const whiteList = []

const PREFLIGHT_INIT = {
    status: 204,
    headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
        'access-control-max-age': '1728000',
    },
}

const exp1 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i
const exp2 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i
const exp3 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i
const exp4 = /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i
const exp5 = /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i
const exp6 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i
const exp7 = /^(?:https?:\/\/)?api\.github\.com\/.*$/i
// —— GitHub 资源 CDN（签名直链 / 归档分流）——
const exp8 = /^(?:https?:\/\/)?(?:release-assets|objects|github-releases)\.githubusercontent\.com\/.*$/i
const exp9 = /^(?:https?:\/\/)?codeload\.github\.com\/.*$/i
const exp10 = /^(?:https?:\/\/)?media\.githubusercontent\.com\/.*$/i

const ENTRY_EXPS = [exp1, exp2, exp3, exp4, exp5, exp6, exp7]
const ASSET_EXPS = [exp8, exp9, exp10]

function makeRes(body, status = 200, headers = {}) {
    headers['access-control-allow-origin'] = '*'
    return new Response(body, { status, headers })
}

function newUrl(urlStr) {
    try {
        return new URL(urlStr)
    } catch {
        return null
    }
}

function checkUrl(u) {
    for (let i of [...ENTRY_EXPS, ...ASSET_EXPS]) {
        if (u.search(i) === 0) return true
    }
    return false
}

function isEntryUrl(u) {
    for (let i of ENTRY_EXPS) {
        if (u.search(i) === 0) return true
    }
    return false
}

/**
 * ✅ Snippet 入口（ES Module）
 */
export default {
    async fetch(request, env, ctx) {
        try {
            return await fetchHandler(request)
        } catch (err) {
            return makeRes("cfworker error:\n" + err.stack, 502)
        }
    }
}

async function fetchHandler(req) {
    const urlObj = new URL(req.url)
    let path = urlObj.searchParams.get('q')

    if (path) {
        return Response.redirect('https://' + urlObj.host + PREFIX + path, 301)
    }

    path = urlObj.href
        .substr(urlObj.origin.length + PREFIX.length)
        .replace(/^https?:\/+/, 'https://')

    if (path.search(exp7) === 0) {
        return httpHandler(req, path)
    } else if (
        path.search(exp1) === 0 ||
        path.search(exp5) === 0 ||
        path.search(exp6) === 0 ||
        path.search(exp3) === 0 ||
        path.search(exp4) === 0 ||
        path.search(exp8) === 0 ||
        path.search(exp9) === 0 ||
        path.search(exp10) === 0
    ) {
        return httpHandler(req, path)
    } else if (path.search(exp2) === 0) {
        if (Config.jsdelivr) {
            const newUrl = path
                .replace('/blob/', '@')
                .replace(/^(?:https?:\/\/)?github\.com/, 'https://cdn.jsdelivr.net/gh')
            return Response.redirect(newUrl, 302)
        } else {
            path = path.replace('/blob/', '/raw/')
            return httpHandler(req, path)
        }
    } else if (path.search(exp4) === 0) {
        const newUrl = path
            .replace(/(?<=com\/.+?\/.+?)\/(.+?\/)/, '@$1')
            .replace(/^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com/, 'https://cdn.jsdelivr.net/gh')
        return Response.redirect(newUrl, 302)
    } else {
        return fetch(ASSET_URL + path)
    }
}

function httpHandler(req, pathname) {
    const reqHdrRaw = req.headers

    if (req.method === 'OPTIONS' &&
        reqHdrRaw.has('access-control-request-headers')
    ) {
        return new Response(null, PREFLIGHT_INIT)
    }

    const reqHdrNew = new Headers(reqHdrRaw)

    let urlStr = pathname
    let flag = !Boolean(whiteList.length)

    for (let i of whiteList) {
        if (urlStr.includes(i)) {
            flag = true
            break
        }
    }

    if (!flag) {
        return new Response("blocked", { status: 403 })
    }

    if (urlStr.search(/^https?:\/\//) !== 0) {
        urlStr = 'https://' + urlStr
    }

    const urlObj = newUrl(urlStr)

    const reqInit = {
        method: req.method,
        headers: reqHdrNew,
        redirect: 'manual',
        body: req.body
    }

    return proxy(urlObj, reqInit)
}

async function proxy(urlObj, reqInit) {
    const res = await fetch(urlObj.href, reqInit)

    const resHdrNew = new Headers(res.headers)
    const status = res.status

    if (resHdrNew.has('location')) {
        let loc = resHdrNew.get('location')

        // 入口链接仍按旧逻辑重写；签名 CDN 跳转默认内部跟随（避免多一次往返/签名暴露）
        if (isEntryUrl(loc) || (Config.rewriteAssetRedirect && checkUrl(loc))) {
            resHdrNew.set('location', PREFIX + loc)
        } else {
            reqInit.redirect = 'follow'
            return proxy(newUrl(loc), reqInit)
        }
    }

    resHdrNew.set('access-control-expose-headers', '*')
    resHdrNew.set('access-control-allow-origin', '*')

    resHdrNew.delete('content-security-policy')
    resHdrNew.delete('content-security-policy-report-only')
    resHdrNew.delete('clear-site-data')

    return new Response(res.body, {
        status,
        headers: resHdrNew,
    })
}