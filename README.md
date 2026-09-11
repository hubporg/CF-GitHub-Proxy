# CF-Workers-GitHub-Proxy
#### 2025.5.25修改，现已支持github api加速！🎉🎉🎉
## 桌面端预览
![desktop](src/desktop.png)
## 移动端预览
![mobile](src/mobile.png)
## 简介
github release、archive以及项目文件的加速项目，支持clone，github api，Cloudflare Workers 版本

## 使用

直接在copy出来的url前加`https://ghfile.geekertao.top/`,`https://gh.geekertao.top/`,`https://github.dpik.top/`或`https://gh.felicity.ac.cn/`即可

也可以直接访问，在input输入

***大量使用建议自行部署，以上域名仅为演示使用，可以轻量使用。***

访问私有仓库可以通过

`git clone https://user:TOKEN@ghfile.geekertao.top/https://github.com/xxxx/xxxx`，`git clone https://user:TOKEN@github.dpik.top/https://github.com/xxxx/xxxx`，`git clone https://user:TOKEN@gh.felicity.ac.cn/https://github.com/xxxx/xxxx` [#71](https://github.com/hunshcn/gh-proxy/issues/71)

以下都是合法输入（仅示例，文件不存在）：

- 分支源码：https://github.com/hunshcn/project/archive/master.zip

- release源码：https://github.com/hunshcn/project/archive/v0.1.0.tar.gz

- release文件：https://github.com/hunshcn/project/releases/download/v0.1.0/example.zip

- 分支文件：https://github.com/hunshcn/project/blob/master/filename

- commit文件：https://github.com/hunshcn/project/blob/1111111111111111111111111111/filename

- gist：https://gist.githubusercontent.com/cielpy/351557e6e465c12986419ac5a4dd2568/raw/cmd.py

- api：https://api.github.com/repos/Geekertao/CF-Workers-GitHub-Proxy

- release 资产直链（GitHub 签名地址）：https://release-assets.githubusercontent.com/github-production-release-asset/xxxxx/xxxxx?sp=r&sig=xxx

- 源码归档分流地址：https://codeload.github.com/hunshcn/project/tar.gz/refs/tags/v0.1.0

- Git LFS 媒体文件：https://media.githubusercontent.com/media/hunshcn/project/master/filename

## Workers 部署方法
### 部署 Cloudflare Worker：

   - 在 Cloudflare Worker 控制台中创建一个新的 Worker。
   - 将 [workers.js](./workers.js)  的内容粘贴到 Worker 编辑器中。

## Snippets 部署方法

### ⚠️ Snippets 限制须知（部署前务必阅读）

Snippets 与 Workers 不是同一个运行环境，限额严格（详见 [Cloudflare 官方文档](https://developers.cloudflare.com/rules/snippets/)）：

| 项目 | 限制 |
| --- | --- |
| 可用套餐 | Free ❌ 不可用；Pro / Business / Enterprise ✅ |
| **subrequest 上限** | **Pro 2 / Business 3 / Enterprise 5** |
| 单次执行 CPU | 5 ms |
| 内存 | 2 MB |
| 代码体积 | 32 KB |

**subrequest 是本项目最需要关注的一项**。官方规定「重定向链中的每一跳都计入 subrequest」，
因此 `https://<域名>/https://github.com/<owner>/<repo>/releases/download/...` 这类请求会依次访问
`github.com` → `release-assets.githubusercontent.com`，**消耗 2 个 subrequest**：

- **Pro 套餐（上限 2）**：可用，但没有余量。若 GitHub 未来增加一跳重定向，就会触发
  `1202 Snippets exceeded subrequests limit`。
- **Business / Enterprise（3 / 5）**：有余量，无风险。

**应急方案**：若线上出现 `1202`，把 `snippets.js` 顶部的 `Config.rewriteAssetRedirect` 改为 `1`。
此时遇到签名跳转会返回 302，由客户端再请求一次代理，使单次请求只消耗 1 个 subrequest
（代价：客户端多一次往返，且真实文件链接会出现在地址栏）。

> 高并发或大流量场景，建议优先使用 Workers 版本部署。

### 部署 Snippets：

   - 需要检查是否开通了 Snippets 功能，订阅pro以上计划或灰度测试到才可以使用，使用以下代码在F12开发者控制台输入查看哪些已经开通了Snippets功能：

   ```javascript
   
   (async function main() {
    const zonesUrl = (page = 1) =>
        `https://dash.cloudflare.com/api/v4/zones?type=full,partial,secondary&per_page=100&page=${page}`;

    async function fetchJson(url) {
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return res.json();
    }

    try {
        const results = [];
        let page = 1;

        while (true) {
            const zonesData = await fetchJson(zonesUrl(page));
            const zones = Array.isArray(zonesData.result) ? zonesData.result : [];
            if (zones.length === 0) break;

            for (const zone of zones) {
                const entitlementsUrl = `https://dash.cloudflare.com/api/v4/zones/${zone.id}/entitlements`;
                const entData = await fetchJson(entitlementsUrl);
                const entResults = Array.isArray(entData.result) ? entData.result : [];
                const rule = entResults.find(r => r.feature?.key === "rulesets.snippets_rule_max");
                const value = rule?.allocation?.value ?? 0;
                if (value > 0) {
                    results.push({
                        zone_id: zone.id,
                        zone_name: zone.name,
                        rulesets_snippets_rule_max: value
                    });
                }
            }

            const info = zonesData.result_info || {};
            if (!info.page || info.page >= (info.total_pages || info.page)) break;
            page++;
        }

        console.log(results);
    } catch (err) {
        console.error("请求失败:", err);
    }
})();

   ```
     
   
   来自<https://blog.cmliussss.com/p/BPSUB/#%F0%9F%A4%96-%E8%87%AA%E5%8A%A8%E6%A3%80%E6%B5%8B>
   - 在 Snippets 平台中创建一个新的 Snippet。
   - 将 [snippets.js](./snippets.js)  的内容粘贴到 Snippet 编辑器中。
   - 编辑页添加“片段规则”为“自定义筛选表达式“中的”“当传入请求匹配时...”，输入以下表达式：

   ```
   (http.host eq "yourghproxydomain.com")
   ```
注：请将 `yourghproxydomain.com` 替换为你实际使用的域名，且为有经过 Cloudflare 代理的域名，否则无法生效，添加优选CNAME也可。

- 保存并部署 Snippet。


## 项目文件说明

-  **`workers.js`**  ：基于 [gh-proxy](https://github.com/hunshcn/gh-proxy) 项目的 [`index.js`](https://github.com/hunshcn/gh-proxy/blob/master/index.js) 修改，已将 `ASSET_URL` 配置为我的 GitHub Pages 地址。
- **自定义配置**：如需修改 GitHub Pages 地址，请前往 [Geekertao.github.io](https://github.com/Geekertao/Geekertao.github.io/tree/main/gh-proxy) 仓库下载源码后编辑。
- **页面代码**：HTML 部分参考自 [CF-Workers-GitHub](https://github.com/cmliu/CF-Workers-GitHub/) 项目的 [`_worker.js`](https://github.com/cmliu/CF-Workers-GitHub/blob/main/_worker.js) 文件。

# 致谢
[gh-proxy](https://github.com/hunshcn/gh-proxy)、[jsproxy](https://github.com/EtherDream/jsproxy/)、[CF-Workers-GitHub](https://github.com/cmliu/CF-Workers-GitHub/)

# 赞助
<a href="https://afdian.com/a/Geekertao" target="_blank" rel="noopener noreferrer" style="flex-shrink: 0;">
      <img src="https://img.shields.io/badge/💵_爱发电-FF4D4D?style=flat-square&logo=usd&logoColor=white" alt="爱发电" style="max-height: 50px;">
    </a>


