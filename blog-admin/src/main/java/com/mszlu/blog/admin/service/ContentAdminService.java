package com.mszlu.blog.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mszlu.blog.admin.mapper.ArticleBodyMapper;
import com.mszlu.blog.admin.mapper.ArticleLikeMapper;
import com.mszlu.blog.admin.mapper.ArticleMapper;
import com.mszlu.blog.admin.mapper.ArticleTagMapper;
import com.mszlu.blog.admin.mapper.CategoryMapper;
import com.mszlu.blog.admin.mapper.CommentMapper;
import com.mszlu.blog.admin.mapper.DiaryCompanionMapper;
import com.mszlu.blog.admin.mapper.DiaryMapper;
import com.mszlu.blog.admin.mapper.DocumentChunkMapper;
import com.mszlu.blog.admin.mapper.SysUserMapper;
import com.mszlu.blog.admin.mapper.TagMapper;
import com.mszlu.blog.admin.model.params.ArticlePageParam;
import com.mszlu.blog.admin.model.params.CommentPageParam;
import com.mszlu.blog.admin.model.params.DiaryPageParam;
import com.mszlu.blog.admin.model.params.PageParam;
import com.mszlu.blog.admin.pojo.Article;
import com.mszlu.blog.admin.pojo.ArticleBody;
import com.mszlu.blog.admin.pojo.ArticleTag;
import com.mszlu.blog.admin.pojo.Category;
import com.mszlu.blog.admin.pojo.Comment;
import com.mszlu.blog.admin.pojo.Diary;
import com.mszlu.blog.admin.pojo.SysUser;
import com.mszlu.blog.admin.pojo.Tag;
import com.mszlu.blog.admin.vo.PageResult;
import com.mszlu.blog.admin.vo.Result;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 后台内容管理：文章 / 日记 / 评论 / 分类 / 标签 / 用户 / 仪表盘。
 * blog-admin 与 blog-api 共用同一个 blog 库，但两者的登录态不互通，
 * 因此这里直接通过 MyBatis-Plus 读写库表，并补齐删除时的关联数据清理。
 */
@Service
public class ContentAdminService {

    private static final ZoneId ZONE = ZoneId.systemDefault();
    private static final DateTimeFormatter DAY_KEY = DateTimeFormatter.ofPattern("MM-dd");

    private final ArticleMapper articleMapper;
    private final ArticleBodyMapper articleBodyMapper;
    private final ArticleTagMapper articleTagMapper;
    private final ArticleLikeMapper articleLikeMapper;
    private final DiaryMapper diaryMapper;
    private final DiaryCompanionMapper diaryCompanionMapper;
    private final DocumentChunkMapper documentChunkMapper;
    private final CommentMapper commentMapper;
    private final CategoryMapper categoryMapper;
    private final TagMapper tagMapper;
    private final SysUserMapper sysUserMapper;

    public ContentAdminService(ArticleMapper articleMapper,
                               ArticleBodyMapper articleBodyMapper,
                               ArticleTagMapper articleTagMapper,
                               ArticleLikeMapper articleLikeMapper,
                               DiaryMapper diaryMapper,
                               DiaryCompanionMapper diaryCompanionMapper,
                               DocumentChunkMapper documentChunkMapper,
                               CommentMapper commentMapper,
                               CategoryMapper categoryMapper,
                               TagMapper tagMapper,
                               SysUserMapper sysUserMapper) {
        this.articleMapper = articleMapper;
        this.articleBodyMapper = articleBodyMapper;
        this.articleTagMapper = articleTagMapper;
        this.articleLikeMapper = articleLikeMapper;
        this.diaryMapper = diaryMapper;
        this.diaryCompanionMapper = diaryCompanionMapper;
        this.documentChunkMapper = documentChunkMapper;
        this.commentMapper = commentMapper;
        this.categoryMapper = categoryMapper;
        this.tagMapper = tagMapper;
        this.sysUserMapper = sysUserMapper;
    }

    // ==================== 仪表盘 ====================

    public Result overview() {
        Map<String, Object> data = new LinkedHashMap<>();

        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("article", articleMapper.selectCount(null));
        counts.put("publicArticle", articleMapper.selectCount(
                new LambdaQueryWrapper<Article>().eq(Article::getVisibility, 1)));
        counts.put("diary", diaryMapper.selectCount(null));
        counts.put("comment", commentMapper.selectCount(null));
        counts.put("user", sysUserMapper.selectCount(null));
        counts.put("like", articleLikeMapper.selectCount(null));
        counts.put("category", categoryMapper.selectCount(null));
        counts.put("tag", tagMapper.selectCount(null));
        data.put("counts", counts);

        LocalDate today = LocalDate.now(ZONE);
        long todayStartMillis = today.atStartOfDay(ZONE).toInstant().toEpochMilli();
        LocalDateTime todayStart = today.atStartOfDay();

        Map<String, Object> todayCounts = new LinkedHashMap<>();
        todayCounts.put("article", articleMapper.selectCount(
                new LambdaQueryWrapper<Article>().ge(Article::getCreateDate, todayStartMillis)));
        todayCounts.put("diary", diaryMapper.selectCount(
                new LambdaQueryWrapper<Diary>().ge(Diary::getCreateDate, todayStart)));
        todayCounts.put("comment", commentMapper.selectCount(
                new LambdaQueryWrapper<Comment>().ge(Comment::getCreateDate, todayStartMillis)));
        data.put("today", todayCounts);

        // 近 7 天趋势：数据量小，直接取近 7 天记录在内存里按天聚合
        LocalDate from = today.minusDays(6);
        long fromMillis = from.atStartOfDay(ZONE).toInstant().toEpochMilli();
        LocalDateTime fromTime = from.atStartOfDay();

        List<Article> recentArticles = articleMapper.selectList(
                new LambdaQueryWrapper<Article>().ge(Article::getCreateDate, fromMillis));
        List<Diary> recentDiaries = diaryMapper.selectList(
                new LambdaQueryWrapper<Diary>().ge(Diary::getCreateDate, fromTime));

        Map<String, int[]> trendMap = new LinkedHashMap<>();
        for (int i = 0; i < 7; i++) {
            trendMap.put(from.plusDays(i).format(DAY_KEY), new int[]{0, 0});
        }
        for (Article a : recentArticles) {
            if (a.getCreateDate() == null) {
                continue;
            }
            String key = Instant.ofEpochMilli(a.getCreateDate()).atZone(ZONE).toLocalDate().format(DAY_KEY);
            int[] pair = trendMap.get(key);
            if (pair != null) {
                pair[0]++;
            }
        }
        for (Diary d : recentDiaries) {
            if (d.getCreateDate() == null) {
                continue;
            }
            String key = d.getCreateDate().toLocalDate().format(DAY_KEY);
            int[] pair = trendMap.get(key);
            if (pair != null) {
                pair[1]++;
            }
        }
        List<Map<String, Object>> trend = new ArrayList<>();
        trendMap.forEach((day, pair) -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("day", day);
            item.put("article", pair[0]);
            item.put("diary", pair[1]);
            trend.add(item);
        });
        data.put("trend", trend);

        List<Map<String, Object>> latestArticles = new ArrayList<>();
        for (Article a : articleMapper.selectList(new LambdaQueryWrapper<Article>()
                .orderByDesc(Article::getCreateDate).last("limit 5"))) {
            latestArticles.add(articleBrief(a));
        }
        data.put("recentArticles", latestArticles);

        List<Map<String, Object>> latestDiaries = new ArrayList<>();
        for (Diary d : diaryMapper.selectList(new LambdaQueryWrapper<Diary>()
                .orderByDesc(Diary::getCreateDate).last("limit 5"))) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", d.getId());
            item.put("title", d.getTitle());
            item.put("emotion", d.getEmotion());
            item.put("createDate", d.getCreateDate());
            latestDiaries.add(item);
        }
        data.put("recentDiaries", latestDiaries);

        List<Map<String, Object>> latestComments = new ArrayList<>();
        for (Comment c : commentMapper.selectList(new LambdaQueryWrapper<Comment>()
                .orderByDesc(Comment::getCreateDate).last("limit 5"))) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", c.getId());
            item.put("content", c.getContent());
            item.put("articleId", c.getArticleId());
            item.put("createDate", c.getCreateDate());
            latestComments.add(item);
        }
        data.put("recentComments", latestComments);

        return Result.success(data);
    }

    // ==================== 文章 ====================

    public Result articlePage(ArticlePageParam param) {
        LambdaQueryWrapper<Article> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.isNotBlank(param.getQueryString())) {
            wrapper.like(Article::getTitle, param.getQueryString());
        }
        if (param.getCategoryId() != null) {
            wrapper.eq(Article::getCategoryId, param.getCategoryId());
        }
        if (param.getVisibility() != null) {
            wrapper.eq(Article::getVisibility, param.getVisibility());
        }
        wrapper.orderByDesc(Article::getCreateDate);

        Page<Article> page = articleMapper.selectPage(
                new Page<>(param.getCurrentPage(), param.getPageSize()), wrapper);
        List<Long> ids = page.getRecords().stream().map(Article::getId).collect(Collectors.toList());

        // Article.categoryId 是 String，键必须同型，否则 get 永远拿不到值（SpotBugs GC_UNRELATED_TYPES）
        Map<String, String> categoryNames = categoryMapper.selectList(null).stream()
                .collect(Collectors.toMap(c -> String.valueOf(c.getId()), Category::getCategoryName, (a, b) -> a));
        Map<Long, List<String>> tagNames = new HashMap<>();
        if (!ids.isEmpty()) {
            List<ArticleTag> relations = articleTagMapper.selectList(
                    new LambdaQueryWrapper<ArticleTag>().in(ArticleTag::getArticleId, ids));
            if (!relations.isEmpty()) {
                Set<Long> tagIds = relations.stream().map(ArticleTag::getTagId).collect(Collectors.toSet());
                Map<Long, String> tagNameMap = tagMapper.selectBatchIds(tagIds).stream()
                        .collect(Collectors.toMap(Tag::getId, Tag::getTagName, (a, b) -> a));
                for (ArticleTag relation : relations) {
                    String name = tagNameMap.get(relation.getTagId());
                    if (name != null) {
                        tagNames.computeIfAbsent(relation.getArticleId(), k -> new ArrayList<>()).add(name);
                    }
                }
            }
        }

        List<Map<String, Object>> list = new ArrayList<>();
        for (Article a : page.getRecords()) {
            Map<String, Object> item = articleBrief(a);
            item.put("summary", a.getSummary());
            item.put("viewCounts", a.getViewCounts());
            item.put("commentCounts", a.getCommentCounts());
            item.put("categoryId", a.getCategoryId());
            item.put("categoryName", a.getCategoryId() == null ? null
                    : categoryNames.get(String.valueOf(a.getCategoryId())));
            item.put("tags", tagNames.getOrDefault(a.getId(), Collections.emptyList()));
            item.put("publishTime", a.getPublishTime());
            item.put("sourceType", a.getSourceType());
            list.add(item);
        }
        PageResult<Map<String, Object>> result = new PageResult<>();
        result.setList(list);
        result.setTotal(page.getTotal());
        return Result.success(result);
    }

    public Result articleDetail(Long id) {
        Article article = articleMapper.selectById(id);
        if (article == null) {
            return Result.fail(404, "文章不存在");
        }
        Map<String, Object> data = articleBrief(article);
        data.put("summary", article.getSummary());
        data.put("viewCounts", article.getViewCounts());
        data.put("commentCounts", article.getCommentCounts());
        data.put("sourceType", article.getSourceType());
        data.put("publishTime", article.getPublishTime());

        Category category = article.getCategoryId() == null ? null : categoryMapper.selectById(article.getCategoryId());
        data.put("categoryName", category == null ? null : category.getCategoryName());

        ArticleBody body = articleBodyMapper.selectOne(
                new LambdaQueryWrapper<ArticleBody>().eq(ArticleBody::getArticleId, id).last("limit 1"));
        data.put("content", body == null ? null : body.getContent());
        data.put("contentHtml", body == null ? null : body.getContentHtml());

        List<ArticleTag> relations = articleTagMapper.selectList(
                new LambdaQueryWrapper<ArticleTag>().eq(ArticleTag::getArticleId, id));
        List<String> tags = relations.isEmpty() ? Collections.emptyList()
                : tagMapper.selectBatchIds(relations.stream().map(ArticleTag::getTagId).collect(Collectors.toSet()))
                .stream().map(Tag::getTagName).collect(Collectors.toList());
        data.put("tags", tags);
        return Result.success(data);
    }

    public Result articleVisibility(Long id, Integer visibility) {
        if (visibility == null || (visibility != 0 && visibility != 1)) {
            return Result.fail(400, "可见性参数不合法");
        }
        Article article = new Article();
        article.setId(id);
        article.setVisibility(visibility);
        int rows = articleMapper.updateById(article);
        if (rows <= 0) {
            return Result.fail(500, "更新失败，文章不存在");
        }
        return Result.success(null);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result deleteArticle(Long id) {
        Article article = articleMapper.selectById(id);
        if (article == null) {
            return Result.fail(404, "文章不存在");
        }
        articleTagMapper.delete(new LambdaQueryWrapper<ArticleTag>().eq(ArticleTag::getArticleId, id));
        articleBodyMapper.delete(new LambdaQueryWrapper<ArticleBody>().eq(ArticleBody::getArticleId, id));
        commentMapper.delete(new LambdaQueryWrapper<Comment>().eq(Comment::getArticleId, id));
        articleLikeMapper.delete(new LambdaQueryWrapper<com.mszlu.blog.admin.pojo.ArticleLike>()
                .eq(com.mszlu.blog.admin.pojo.ArticleLike::getArticleId, String.valueOf(id)));
        articleMapper.deleteById(id);
        return Result.success(null);
    }

    // ==================== 日记 ====================

    public Result diaryPage(DiaryPageParam param) {
        LambdaQueryWrapper<Diary> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.isNotBlank(param.getQueryString())) {
            String query = param.getQueryString();
            wrapper.and(w -> w.like(Diary::getTitle, query).or().like(Diary::getContent, query));
        }
        if (StringUtils.isNotBlank(param.getEmotion())) {
            wrapper.eq(Diary::getEmotion, param.getEmotion());
        }
        wrapper.orderByDesc(Diary::getCreateDate);

        Page<Diary> page = diaryMapper.selectPage(
                new Page<>(param.getCurrentPage(), param.getPageSize()), wrapper);
        List<Map<String, Object>> list = new ArrayList<>();
        for (Diary d : page.getRecords()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", d.getId());
            item.put("title", d.getTitle());
            item.put("emotion", d.getEmotion());
            item.put("type", d.getType());
            item.put("userId", d.getUserId());
            item.put("createDate", d.getCreateDate());
            item.put("charCount", d.getContent() == null ? 0 : d.getContent().length());
            item.put("excerpt", excerpt(d.getContent(), 80));
            list.add(item);
        }
        PageResult<Map<String, Object>> result = new PageResult<>();
        result.setList(list);
        result.setTotal(page.getTotal());
        return Result.success(result);
    }

    public Result diaryDetail(String id) {
        Diary diary = diaryMapper.selectById(id);
        if (diary == null) {
            return Result.fail(404, "日记不存在");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", diary.getId());
        data.put("userId", diary.getUserId());
        data.put("title", diary.getTitle());
        data.put("content", diary.getContent());
        data.put("emotion", diary.getEmotion());
        data.put("emotionDetail", diary.getEmotionDetail());
        data.put("type", diary.getType());
        data.put("createDate", diary.getCreateDate());
        data.put("updateDate", diary.getUpdateDate());
        data.put("companionCount", diaryCompanionMapper.selectCount(
                new LambdaQueryWrapper<com.mszlu.blog.admin.pojo.DiaryCompanion>()
                        .eq(com.mszlu.blog.admin.pojo.DiaryCompanion::getDiaryId, id)));
        return Result.success(data);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result deleteDiary(String id) {
        Diary diary = diaryMapper.selectById(id);
        if (diary == null) {
            return Result.fail(404, "日记不存在");
        }
        diaryCompanionMapper.delete(new LambdaQueryWrapper<com.mszlu.blog.admin.pojo.DiaryCompanion>()
                .eq(com.mszlu.blog.admin.pojo.DiaryCompanion::getDiaryId, id));
        documentChunkMapper.delete(new LambdaQueryWrapper<com.mszlu.blog.admin.pojo.DocumentChunk>()
                .eq(com.mszlu.blog.admin.pojo.DocumentChunk::getSource, "diary")
                .eq(com.mszlu.blog.admin.pojo.DocumentChunk::getRefId, id));
        diaryMapper.deleteById(id);
        return Result.success(null);
    }

    // ==================== 评论 ====================

    public Result commentPage(CommentPageParam param) {
        LambdaQueryWrapper<Comment> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.isNotBlank(param.getQueryString())) {
            wrapper.like(Comment::getContent, param.getQueryString());
        }
        if (param.getArticleId() != null) {
            wrapper.eq(Comment::getArticleId, param.getArticleId());
        }
        wrapper.orderByDesc(Comment::getCreateDate);

        Page<Comment> page = commentMapper.selectPage(
                new Page<>(param.getCurrentPage(), param.getPageSize()), wrapper);

        Set<Long> articleIds = page.getRecords().stream().map(Comment::getArticleId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        Map<Long, String> articleTitles = articleIds.isEmpty() ? Collections.emptyMap()
                : articleMapper.selectBatchIds(articleIds).stream()
                .collect(Collectors.toMap(Article::getId, Article::getTitle, (a, b) -> a));

        Set<Long> authorIds = page.getRecords().stream().map(Comment::getAuthorId)
                .filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        Map<Long, SysUser> authors = authorIds.isEmpty() ? Collections.emptyMap()
                : sysUserMapper.selectBatchIds(authorIds).stream()
                .collect(Collectors.toMap(SysUser::getId, Function.identity(), (a, b) -> a));

        List<Map<String, Object>> list = new ArrayList<>();
        for (Comment c : page.getRecords()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", c.getId() == null ? null : String.valueOf(c.getId()));
            item.put("content", c.getContent());
            item.put("createDate", c.getCreateDate());
            item.put("articleId", c.getArticleId() == null ? null : String.valueOf(c.getArticleId()));
            item.put("articleTitle", articleTitles.get(c.getArticleId()));
            item.put("authorId", c.getAuthorId());
            SysUser author = authors.get(c.getAuthorId());
            item.put("authorName", author == null ? null
                    : StringUtils.defaultIfBlank(author.getNickname(), author.getAccount()));
            item.put("anonymous", c.getAnonymous());
            item.put("parentId", c.getParentId());
            item.put("level", c.getLevel());
            list.add(item);
        }
        PageResult<Map<String, Object>> result = new PageResult<>();
        result.setList(list);
        result.setTotal(page.getTotal());
        return Result.success(result);
    }

    @Transactional(rollbackFor = Exception.class)
    public Result deleteComment(Long id) {
        Comment comment = commentMapper.selectById(id);
        if (comment == null) {
            return Result.fail(404, "评论不存在");
        }
        commentMapper.delete(new LambdaQueryWrapper<Comment>().eq(Comment::getParentId, id));
        commentMapper.deleteById(id);
        return Result.success(null);
    }

    // ==================== 分类 / 标签 ====================

    public Result categoryList() {
        return Result.success(categoryMapper.selectList(
                new LambdaQueryWrapper<Category>().orderByAsc(Category::getId)));
    }

    public Result addCategory(Category category) {
        if (StringUtils.isBlank(category.getCategoryName())) {
            return Result.fail(400, "分类名称不能为空");
        }
        category.setId(null);
        categoryMapper.insert(category);
        return Result.success(null);
    }

    public Result updateCategory(Category category) {
        if (category.getId() == null) {
            return Result.fail(400, "缺少分类 id");
        }
        if (StringUtils.isBlank(category.getCategoryName())) {
            return Result.fail(400, "分类名称不能为空");
        }
        int rows = categoryMapper.updateById(category);
        return rows > 0 ? Result.success(null) : Result.fail(500, "更新失败，分类不存在");
    }

    public Result deleteCategory(Long id) {
        long used = articleMapper.selectCount(
                new LambdaQueryWrapper<Article>().eq(Article::getCategoryId, id));
        if (used > 0) {
            return Result.fail(409, "该分类下还有 " + used + " 篇文章，不能删除");
        }
        int rows = categoryMapper.deleteById(id);
        return rows > 0 ? Result.success(null) : Result.fail(500, "删除失败，分类不存在");
    }

    public Result tagList() {
        return Result.success(tagMapper.selectList(
                new LambdaQueryWrapper<Tag>().orderByAsc(Tag::getId)));
    }

    public Result addTag(Tag tag) {
        if (StringUtils.isBlank(tag.getTagName())) {
            return Result.fail(400, "标签名称不能为空");
        }
        tag.setId(null);
        tagMapper.insert(tag);
        return Result.success(null);
    }

    public Result updateTag(Tag tag) {
        if (tag.getId() == null) {
            return Result.fail(400, "缺少标签 id");
        }
        if (StringUtils.isBlank(tag.getTagName())) {
            return Result.fail(400, "标签名称不能为空");
        }
        int rows = tagMapper.updateById(tag);
        return rows > 0 ? Result.success(null) : Result.fail(500, "更新失败，标签不存在");
    }

    public Result deleteTag(Long id) {
        long used = articleTagMapper.selectCount(
                new LambdaQueryWrapper<ArticleTag>().eq(ArticleTag::getTagId, id));
        if (used > 0) {
            return Result.fail(409, "该标签已被 " + used + " 篇文章使用，不能删除");
        }
        int rows = tagMapper.deleteById(id);
        return rows > 0 ? Result.success(null) : Result.fail(500, "删除失败，标签不存在");
    }

    // ==================== 用户（只读） ====================

    public Result userPage(PageParam param) {
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.isNotBlank(param.getQueryString())) {
            String query = param.getQueryString();
            wrapper.and(w -> w.like(SysUser::getNickname, query)
                    .or().like(SysUser::getAccount, query)
                    .or().like(SysUser::getEmail, query));
        }
        wrapper.orderByDesc(SysUser::getCreateDate);
        Page<SysUser> page = sysUserMapper.selectPage(
                new Page<>(param.getCurrentPage(), param.getPageSize()), wrapper);
        PageResult<SysUser> result = new PageResult<>();
        result.setList(page.getRecords());
        result.setTotal(page.getTotal());
        return Result.success(result);
    }

    // ==================== 工具 ====================

    private Map<String, Object> articleBrief(Article article) {
        Map<String, Object> item = new LinkedHashMap<>();
        // 雪花 id 超出 JS 安全整数范围，统一按字符串下发
        item.put("id", article.getId() == null ? null : String.valueOf(article.getId()));
        item.put("title", article.getTitle());
        item.put("visibility", article.getVisibility());
        item.put("weight", article.getWeight());
        item.put("createDate", article.getCreateDate());
        return item;
    }

    private String excerpt(String content, int max) {
        if (content == null) {
            return "";
        }
        String plain = content.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
        return plain.length() <= max ? plain : plain.substring(0, max) + "…";
    }
}
