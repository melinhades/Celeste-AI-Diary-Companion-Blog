package com.mszlu.blog.service.ai.roundtable;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mszlu.blog.dao.mapper.ArticleLikeMapper;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.mapper.DiaryMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.ArticleLike;
import com.mszlu.blog.dao.pojo.Diary;
import com.mszlu.blog.service.ai.AiClient;
import com.mszlu.blog.service.ai.AiMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 圆桌会议议题推荐：
 *   日记困境 / 我写的文章 / 点赞过的文章（代替浏览记录）三路取材，一次 AI 调用生成 6 个可辩论议题。
 *   AI 失败时用标题模板兜底；用户什么数据都没有时给通用议题，保证前端永远有东西可点。
 */
@Service
@Slf4j
public class RoundtableTopicService {

    @Autowired
    private DiaryMapper diaryMapper;
    @Autowired
    private ArticleMapper articleMapper;
    @Autowired
    private ArticleLikeMapper articleLikeMapper;
    @Autowired
    private AiClient aiClient;

    private static final int TAKE = 8;
    private static final int EXCERPT = 260;
    private static final int WANT = 6;

    /** 返回 [{topic, source}]，source ∈ diary / mine / liked / default */
    public List<JSONObject> suggest(String userId) {
        // ---- 取材 ----
        List<Diary> diaries = diaryMapper.selectList(new LambdaQueryWrapper<Diary>()
                .eq(Diary::getUserId, userId)
                .eq(Diary::getType, "day")
                .orderByDesc(Diary::getCreateDate)
                .last("limit " + TAKE));

        List<Article> mine = articleMapper.selectList(new LambdaQueryWrapper<Article>()
                .eq(Article::getAuthorId, userId)
                .orderByDesc(Article::getCreateDate)
                .last("limit " + TAKE));

        List<ArticleLike> likes = articleLikeMapper.selectList(new LambdaQueryWrapper<ArticleLike>()
                .eq(ArticleLike::getUserId, userId)
                .orderByDesc(ArticleLike::getCreateDate)
                .last("limit " + TAKE));
        List<Article> liked = new ArrayList<>();
        if (!likes.isEmpty()) {
            List<String> ids = new ArrayList<>();
            for (ArticleLike l : likes) ids.add(l.getArticleId());
            liked = articleMapper.selectList(new LambdaQueryWrapper<Article>()
                    .in(Article::getId, ids));
            // 按点赞时间倒序
            liked.sort((a, b) -> Integer.compare(
                    ids.indexOf(a.getId()), ids.indexOf(b.getId())));
        }

        // ---- AI 生成 ----
        List<JSONObject> topics = askAi(diaries, mine, liked);
        if (topics == null || topics.isEmpty()) {
            topics = fallback(diaries, mine, liked);
        }
        return topics;
    }

    private List<JSONObject> askAi(List<Diary> diaries, List<Article> mine, List<Article> liked) {
        StringBuilder mat = new StringBuilder();
        if (!diaries.isEmpty()) {
            mat.append("【来源标签 diary：用户最近的日记，重点挖里面的纠结、两难、烦心事】\n");
            for (Diary d : diaries) {
                mat.append("- 标题：").append(nz(d.getTitle()))
                        .append("｜正文摘录：").append(clip(strip(d.getContent()))).append('\n');
            }
        }
        if (!mine.isEmpty()) {
            mat.append("【来源标签 mine：用户自己写的文章，提炼可延伸讨论的议题】\n");
            for (Article a : mine) {
                mat.append("- 标题：").append(nz(a.getTitle()))
                        .append("｜摘要：").append(clip(strip(a.getSummary()))).append('\n');
            }
        }
        if (!liked.isEmpty()) {
            mat.append("【来源标签 liked：用户点赞过的文章，代表他感兴趣的话题】\n");
            for (Article a : liked) {
                mat.append("- 标题：").append(nz(a.getTitle()))
                        .append("｜摘要：").append(clip(strip(a.getSummary()))).append('\n');
            }
        }
        if (mat.length() == 0) {
            // 没有个人素材：让 AI 直接出通用经典议题
            mat.append("【无用户个人素材：请直接产出适合圆桌辩论的普适人生选择题】");
        }

        String system = "你是圆桌会议的议题策划。根据用户素材生成 " + WANT
                + " 个值得五个性格迥异的角色围坐辩论的议题。要求：\n"
                + "1. 议题是第一人称的纠结/选择题或开放问题，15-40 个汉字，口语化、具体，不要空话；\n"
                + "2. 每个议题必须标注 source，只能从它真正取材的那一段标签里取（diary/mine/liked），无素材时用 default；\n"
                + "3. 三个来源都有素材时尽量均衡覆盖，同主题不要重复；\n"
                + "4. 只输出 JSON：{\"topics\":[{\"topic\":\"...\",\"source\":\"diary\"}]}";
        try {
            String out = aiClient.chat(Collections.singletonList(new AiMessage("system",
                    system + "\n\n素材如下：\n" + mat)), true);
            JSONObject obj = JSON.parseObject(out);
            JSONArray arr = obj.getJSONArray("topics");
            List<JSONObject> list = new ArrayList<>();
            for (int i = 0; i < arr.size() && list.size() < WANT; i++) {
                JSONObject o = arr.getJSONObject(i);
                String topic = o.getString("topic");
                String source = o.getString("source");
                if (topic == null || topic.trim().isEmpty()) continue;
                topic = topic.trim();
                if (topic.length() > 60) topic = topic.substring(0, 60);
                if (source == null || (!source.equals("diary") && !source.equals("mine")
                        && !source.equals("liked") && !source.equals("default"))) {
                    source = "default";
                }
                list.add(makeTopic(topic, source));
            }
            return list;
        } catch (Exception e) {
            log.warn("圆桌议题推荐 AI 生成失败，走兜底: {}", e.getMessage());
            return null;
        }
    }

    /** AI 挂了：从标题套模板；实在没数据给通用议题 */
    private List<JSONObject> fallback(List<Diary> diaries, List<Article> mine, List<Article> liked) {
        List<JSONObject> list = new ArrayList<>();
        for (Diary d : diaries) {
            String t = nz(d.getTitle());
            if (t.isEmpty()) t = clip(strip(d.getContent()));
            if (t.isEmpty()) continue;
            list.add(makeTopic("关于「" + clip(t) + "」这件事，我到底该怎么办？", "diary"));
            if (list.size() >= WANT) return list;
        }
        for (Article a : mine) {
            list.add(makeTopic("我写过「" + clip(nz(a.getTitle())) + "」，这事还有别的解法吗？", "mine"));
            if (list.size() >= WANT) return list;
        }
        for (Article a : liked) {
            list.add(makeTopic("「" + clip(nz(a.getTitle())) + "」里的观点，真的站得住脚吗？", "liked"));
            if (list.size() >= WANT) return list;
        }
        String[][] generic = {
                {"两个 offer，一个稳定但无聊，一个有风险但成长快，该怎么选？", "default"},
                {"明知道该努力却提不起劲，逼自己还是放过自己？", "default"},
                {"好朋友犯了错，我该当面指出来还是装不知道？", "default"},
                {"要不要为了合群，假装喜欢自己其实无感的东西？", "default"},
                {"大城市拼一把还是回老家安稳过日子？", "default"},
                {"总在意别人怎么看我，要怎么改掉这个毛病？", "default"}
        };
        for (String[] g : generic) {
            list.add(makeTopic(g[0], g[1]));
            if (list.size() >= WANT) return list;
        }
        return list;
    }

    private JSONObject makeTopic(String topic, String source) {
        JSONObject o = new JSONObject();
        o.put("topic", topic);
        o.put("source", source);
        return o;
    }

    private static String nz(String s) {
        return s == null ? "" : s.trim();
    }

    private static String strip(String s) {
        if (s == null) return "";
        return s.replaceAll("<[^>]+>", "").replaceAll("\\s+", " ").trim();
    }

    private static String clip(String s) {
        if (s == null) return "";
        return s.length() > EXCERPT ? s.substring(0, EXCERPT) : s;
    }
}
