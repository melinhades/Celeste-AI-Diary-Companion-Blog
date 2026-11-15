/* 后台统一请求封装：同源 session 鉴权，统一错误信息 */
(function () {
    'use strict';

    async function request(url, options) {
        const opts = Object.assign({
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }
        }, options || {});
        const res = await fetch(url, opts);
        if (res.status === 401) {
            location.href = '/login.html';
            throw new Error('登录已失效');
        }
        if (res.status === 403) {
            throw new Error('没有访问权限');
        }
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('响应格式错误（HTTP ' + res.status + '）');
        }
        if (!data.success) {
            throw new Error(data.msg || '请求失败');
        }
        return data.data;
    }

    window.AdminApi = {
        get: function (url) { return request(url, { method: 'GET' }); },
        post: function (url, body) {
            return request(url, { method: 'POST', body: JSON.stringify(body || {}) });
        }
    };
})();
