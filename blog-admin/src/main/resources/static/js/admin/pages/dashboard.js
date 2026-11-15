/* 仪表盘：总量、今日新增、近 7 天趋势、最近内容 */
(function () {
    'use strict';
    const ui = window.AdminUI;

    function statCard(label, value, foot) {
        return '<div class="stat"><div class="glow"></div>'
            + '<div class="stat-label">' + label + '</div>'
            + '<div class="stat-value">' + value + '</div>'
            + '<div class="stat-foot">' + foot + '</div></div>';
    }

    function renderStats(counts, today) {
        document.getElementById('statGrid').innerHTML =
            statCard('文章', counts.article,
                '公开 <b>' + counts.publicArticle + '</b> · 今日 <b>+' + today.article + '</b>')
            + statCard('日记', counts.diary,
                '今日 <b>+' + today.diary + '</b> · RAG 可检索')
            + statCard('评论', counts.comment,
                '今日 <b>+' + today.comment + '</b> · 全站汇总')
            + statCard('用户', counts.user,
                '分类 <b>' + counts.category + '</b> · 标签 <b>' + counts.tag + '</b>');
    }

    function renderTrend(trend) {
        const max = Math.max(1, trend.reduce(function (m, d) {
            return Math.max(m, d.article, d.diary);
        }, 0));
        let html = '<div class="chart">';
        trend.forEach(function (d) {
            const h1 = Math.max(2, Math.round(d.article / max * 150));
            const h2 = Math.max(2, Math.round(d.diary / max * 150));
            html += '<div class="chart-col">'
                + '<div class="chart-bars">'
                + '<div class="chart-bar" style="height:' + h1 + 'px" title="文章 ' + d.article + '"></div>'
                + '<div class="chart-bar blue" style="height:' + h2 + 'px" title="日记 ' + d.diary + '"></div>'
                + '</div>'
                + '<div class="chart-day">' + ui.esc(d.day) + '</div>'
                + '</div>';
        });
        html += '</div>';
        document.getElementById('trendChart').innerHTML = html;
    }

    function renderRecent(data) {
        let html = '<div class="recent-list">';
        if (!data.recentArticles.length && !data.recentDiaries.length) {
            html += '<div class="empty">还没有内容</div>';
        }
        data.recentArticles.forEach(function (a) {
            html += '<div class="recent-item"><span class="dot"></span><div class="txt">'
                + '<div class="t">' + ui.esc(a.title || '无题') + '</div>'
                + '<div class="m">文章 · ' + ui.fmtTime(a.createDate)
                + ' · ' + (a.visibility === 1 ? '公开' : '私密') + '</div>'
                + '</div></div>';
        });
        data.recentDiaries.forEach(function (d) {
            html += '<div class="recent-item"><span class="dot"></span><div class="txt">'
                + '<div class="t">' + ui.esc(d.title || '无题日记') + '</div>'
                + '<div class="m">日记 · ' + ui.fmtTime(d.createDate)
                + (d.emotion ? ' · ' + ui.esc(d.emotion) : '') + '</div>'
                + '</div></div>';
        });
        html += '</div>';
        document.getElementById('recentList').innerHTML = html;
    }

    window.AdminPages = window.AdminPages || {};
    window.AdminPages.dashboard = {
        render: function (view) {
            view.innerHTML =
                '<div class="stat-grid" id="statGrid">'
                + '<div class="stat"><div class="skeleton-row"></div></div>'
                + '<div class="stat"><div class="skeleton-row"></div></div>'
                + '<div class="stat"><div class="skeleton-row"></div></div>'
                + '<div class="stat"><div class="skeleton-row"></div></div>'
                + '</div>'
                + '<div class="dash-grid">'
                + '<div class="card"><div class="card-head">'
                + '<div class="card-title">近 7 天发布<small>文章 / 日记</small></div></div>'
                + '<div id="trendChart"></div>'
                + '<div class="chart-legend">'
                + '<span class="a"><i></i>文章</span><span class="b"><i></i>日记</span></div>'
                + '</div>'
                + '<div class="card"><div class="card-head">'
                + '<div class="card-title">最近内容<small>最新 5 篇</small></div></div>'
                + '<div id="recentList"></div></div>'
                + '</div>';
            return window.AdminApi.get('/admin/dashboard/overview').then(function (data) {
                renderStats(data.counts, data.today);
                renderTrend(data.trend || []);
                renderRecent(data);
            });
        }
    };
})();
