// 视图切换 / 窄屏标签 / 议题输入由 Vue 持有；
// 演出管线（席位、transcript、场景画布、共识雷达、历史弹层）仍由下方原生命令式 IIFE 驱动
(function () {
    const { createApp, ref } = Vue;
    const isMock = new URLSearchParams(location.search).has('mock');
    const loggedIn = ref(!!(localStorage.getItem('token') || isMock));
    const view = ref('setup');   // setup | stage
    const tab = ref('main');     // seats | main | side
    const topic = ref('');
    window.__rtUI = { loggedIn, view, tab };
    createApp({
        setup() {
            return {
                loggedIn, view, tab, topic,
                start: () => { if (typeof window.__rtStart === 'function') window.__rtStart(); }
            };
        }
    }).mount('.rt-wrap');
})();
