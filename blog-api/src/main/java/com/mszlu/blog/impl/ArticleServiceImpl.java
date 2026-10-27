package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mszlu.blog.dao.dos.Archives;
import com.mszlu.blog.dao.mapper.ArticleBodyMapper;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.mapper.DiaryMapper;
import com.mszlu.blog.dao.mapper.TagMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.ArticleBody;
import com.mszlu.blog.dao.pojo.Diary;
import com.mszlu.blog.dao.pojo.Tag;
import com.mszlu.blog.vo.params.ArticleTag;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.dao.mapper.ArticleTagMapper;
import com.mszlu.blog.service.ArticleService;
import com.mszlu.blog.service.CategoryService;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.service.TagService;
import com.mszlu.blog.service.ThreadService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.params.*;
import com.mszlu.blog.vo.Result;
import org.joda.time.DateTime;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ArticleServiceImpl implements ArticleService {
    @Autowired
    private ArticleMapper articleMapper;
    @Autowired
    private SysUserService sysUserService;
    @Autowired
    private TagService tagService;
    @Autowired
    private ArticleTagMapper articleTagMapper;
    @Autowired
    private TagMapper tagMapper;
    @Autowired
    private ArticleBodyMapper articleBodyMapper;
    @Autowired
    private CategoryService categoryService;
    @Autowired
    private DiaryMapper diaryMapper;

    public ArticleVo copy(Article article, boolean isAuthor, boolean isBody, boolean isTags) {
        ArticleVo articleVo = new ArticleVo();
        articleVo.setId(article.getId());
        BeanUtils.copyProperties(article, articleVo);
        if (isAuthor) {
            SysUser sysUser = sysUserService.findUserById(article.getAuthorId());
            articleVo.setAuthor(sysUser.getNickname());
        }
        articleVo.setCreateDate(new DateTime(article.getCreateDate()).toString("yyyy-MM-dd HH:mm"));
        if (isTags) {
            List<TagVo> tags = tagService.findTagsByArticleId(article.getId());
            articleVo.setTags(tags);
        }
        if(isBody){
            String bodyId = article.getBodyId();
            articleVo.setBody(findArticleBodyById(bodyId));
        }
        return articleVo;
    }

    public ArticleVo copy(Article article, boolean isAuthor, boolean isBody, boolean isTags, boolean isCategory) {
        ArticleVo articleVo = copy(article, isAuthor, isBody, isTags);
        if(isCategory){
            String categoryId = article.getCategoryId();
            CategoryVo categoryVo = categoryService.findCategoryById(categoryId);
            articleVo.setCategory(categoryVo);
        }
        return articleVo;
    }

    private List<ArticleVo> copyList(List<Article> records, boolean isAuthor, boolean isBody, boolean isTags) {
        List<ArticleVo> articleVoList = new ArrayList<>();
        for (Article article : records) {
            ArticleVo articleVo = copy(article, isAuthor, isBody, isTags);
            articleVoList.add(articleVo);
        }
        return articleVoList;
    }

    @Override
    public List<ArticleVo> listArticlesPage(PageParams pageParams) {
        QueryWrapper<Article> queryWrapper = new QueryWrapper<>();
        queryWrapper.eq("visibility", Article.VISIBILITY_PUBLIC);
        Page<Article> page = new Page<>(pageParams.getPage(), pageParams.getPageSize());
        Page<Article> articlePage = articleMapper.selectPage(page, queryWrapper);
        List<ArticleVo> articleVoList = copyList(articlePage.getRecords(), true, false, true);
        return articleVoList;
    }

    @Override
    public Result hotArticle(int limit) {
        LambdaQueryWrapper<Article> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(Article::getVisibility, Article.VISIBILITY_PUBLIC);
        queryWrapper.orderByDesc(Article::getViewCounts);
        queryWrapper.select(Article::getId, Article::getTitle);
        queryWrapper.last("limit " + limit);
        List<Article> articles = articleMapper.selectList(queryWrapper);
        return Result.success(copyList(articles, false, false, false));
    }
    @Override
    public Result newArticles(int limit) {
        LambdaQueryWrapper<Article> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.eq(Article::getVisibility, Article.VISIBILITY_PUBLIC);
        queryWrapper.orderByDesc(Article::getCreateDate);
        queryWrapper.select(Article::getId, Article::getTitle);
        queryWrapper.last("limit " + limit);
        List<Article> articles = articleMapper.selectList(queryWrapper);
        return Result.success(copyList(articles, false, false, false));

    }


    @Override
    public Result listArticle(PageParams pageParams) {
        Page<Article> page = new Page<>(pageParams.getPage(), pageParams.getPageSize());
        IPage<Article> articleIPage = articleMapper.listArticle(page, pageParams.getCategoryId(), pageParams.getTagId(), pageParams.getYear(), pageParams.getMonth(), pageParams.getKeyword());
        List<Article> records = articleIPage.getRecords();
        List<ArticleVo> voList = copyList(records, true, false, true);
        for (int i = 0; i < voList.size(); i++) {
            ArticleBody body = articleBodyMapper.selectById(records.get(i).getBodyId());
            voList.get(i).setImages(extractImages(body == null ? null : body.getContent()));
        }
        Map<String, Object> data = new HashMap<>();
        data.put("records", voList);
        data.put("total", articleIPage.getTotal());
        return Result.success(data);
    }

    private List<String> extractImages(String content) {
        List<String> imgs = new ArrayList<>();
        if (content == null || content.isEmpty()) return imgs;
        Matcher m = Pattern.compile("<img[^>]+src\\s*=\\s*[\"']([^\"']+)[\"']").matcher(content);
        while (m.find() && imgs.size() < 3) imgs.add(m.group(1));
        if (imgs.isEmpty()) {
            Matcher m2 = Pattern.compile("!\\[[^\\]]*\\]\\(([^)]+)\\)").matcher(content);
            while (m2.find() && imgs.size() < 3) imgs.add(m2.group(1));
        }
        return imgs;
    }

    @Override
    public Result findArticlesById(String articleId) {
        /*1.根据id查询 文章信息
        2.根据bodyId和categoryId 去做关联查询
         */
        Article article = this.articleMapper.selectById(articleId);
        if (article == null) {
            return Result.fail(404, "文章不存在");
        }
        // 私密文章只有作者本人能看
        if (article.getVisibility() != null && article.getVisibility() == Article.VISIBILITY_PRIVATE) {
            SysUser current = UserThreadLocal.get();
            if (current == null || !current.getId().equals(article.getAuthorId())) {
                return Result.fail(403, "该文章未公开");
            }
        }
        ArticleVo articleVo =copy(article,true,true,true,true);
        //查看完文章增加阅读数后更新时有写加锁，导致性能降低
        //线程池 可以把更新操作扔到线程池中去执行，和主线程就不相关了
        threadService.updateArticleViewCount(articleMapper,article);
        return Result.success(articleVo);
    }

    @Autowired
    private ThreadService threadService;
    private ArticleBodyVo findArticleBodyById(String bodyId) {
        ArticleBody articleBody = articleBodyMapper.selectById(bodyId);
        ArticleBodyVo articleBodyVo = new ArticleBodyVo();
        if (articleBody != null) {
            articleBodyVo.setContent(articleBody.getContent());
        }
        return articleBodyVo;
    }

    public Result publish(ArticleParam articleParam){
        //此接口 要加入到拦截器中
        SysUser sysUser = UserThreadLocal.get();
        /**
         * 1.发布文章 目的 构建Article对象
         * 2.作者id（当前的登录用户）
         * 3.标签 要将标签加入到关联列表中
         * 4.body 内容存储 articleBody
         */
        Article article = new Article();
        article.setAuthorId(sysUser.getId());
        article.setWeight(Article.Article_Common);
        article.setViewCounts(0);
        article.setTitle(articleParam.getTitle());
        article.setSummary(articleParam.getSummary());
        article.setCreateDate(System.currentTimeMillis());
        // 处理分类，如果没有选择分类则设置为null
        if (articleParam.getCategory() != null && articleParam.getCategory().getId() != null) {
            article.setCategoryId(articleParam.getCategory().getId());
        }

        //插入之后 会生成一个文章id
        this.articleMapper.insert(article);

        //tag - 处理标签，如果标签没有ID则先创建标签
        List<TagVo> tags = articleParam.getTags();
        if(tags != null) {
            for (TagVo tag : tags) {
                String articleId = article.getId();
                String tagId = tag.getId();

                // 如果标签没有ID，说明是新标签，需要先创建
                if (tagId == null && tag.getTagName() != null) {
                    Tag newTag = new Tag();
                    newTag.setTagName(tag.getTagName());
                    newTag.setAvatar("/static/img/logo.b3a48c0.png");
                    tagMapper.insert(newTag);
                    tagId = newTag.getId();
                }

                if (tagId != null) {
                    ArticleTag articleTag = new ArticleTag();
                    articleTag.setTagId(tagId);
                    articleTag.setArticleId(articleId);
                    articleTagMapper.insert(articleTag);
                }
            }
        }
        //body
        ArticleBody articleBody = new ArticleBody();
        articleBody.setArticleId(article.getId());
        articleBody.setContent(articleParam.getBody().getContent());
        articleBody.setContentHtml(articleParam.getBody().getContentHtml());
        articleBodyMapper.insert(articleBody);
        article.setBodyId(articleBody.getId());
        articleMapper.updateById(article);
        Map<String ,String> map=new HashMap<>();
        map.put("id",article.getId());
        return Result.success(map);
    }

    @Override
    public Result update(ArticleParam articleParam) {
        SysUser sysUser = UserThreadLocal.get();
        Article article = articleMapper.selectById(articleParam.getId());
        if (article == null) {
            return Result.fail(404, "文章不存在");
        }
        if (!article.getAuthorId().equals(sysUser.getId())) {
            return Result.fail(403, "只能编辑自己的文章");
        }
        article.setTitle(articleParam.getTitle());
        article.setSummary(articleParam.getSummary());
        if (articleParam.getCategory() != null && articleParam.getCategory().getId() != null) {
            article.setCategoryId(articleParam.getCategory().getId());
        } else {
            article.setCategoryId(null);
        }
        articleMapper.updateById(article);

        articleTagMapper.delete(new LambdaQueryWrapper<ArticleTag>().eq(ArticleTag::getArticleId, article.getId()));
        List<TagVo> tags = articleParam.getTags();
        if (tags != null) {
            for (TagVo tag : tags) {
                String tagId = tag.getId();
                if (tagId == null && tag.getTagName() != null) {
                    Tag newTag = new Tag();
                    newTag.setTagName(tag.getTagName());
                    newTag.setAvatar("/static/img/logo.b3a48c0.png");
                    tagMapper.insert(newTag);
                    tagId = newTag.getId();
                }
                if (tagId != null) {
                    ArticleTag articleTag = new ArticleTag();
                    articleTag.setTagId(tagId);
                    articleTag.setArticleId(article.getId());
                    articleTagMapper.insert(articleTag);
                }
            }
        }

        ArticleBody articleBody = article.getBodyId() != null ? articleBodyMapper.selectById(article.getBodyId()) : null;
        if (articleBody == null) {
            articleBody = new ArticleBody();
            articleBody.setArticleId(article.getId());
            articleBody.setContent(articleParam.getBody().getContent());
            articleBody.setContentHtml(articleParam.getBody().getContentHtml());
            articleBodyMapper.insert(articleBody);
            article.setBodyId(articleBody.getId());
            articleMapper.updateById(article);
        } else {
            articleBody.setContent(articleParam.getBody().getContent());
            articleBody.setContentHtml(articleParam.getBody().getContentHtml());
            articleBodyMapper.updateById(articleBody);
        }
        Map<String, String> result = new HashMap<>();
        result.put("id", article.getId());
        return Result.success(result);
    }

    /**
     * 日记一键发布为博客。
     * 事务只包住两次写库（article + article_body）；没有 AI 调用等慢操作。
     * 幂等：先查一次，并发时由 uk_article_source 唯一索引兜底。
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Result publishFromDiary(String diaryId) {
        SysUser user = UserThreadLocal.get();
        if (user == null) {
            return Result.fail(401, "未登录");
        }
        Diary diary = diaryMapper.selectById(diaryId);
        if (diary == null) {
            return Result.fail(404, "日记不存在");
        }
        if (!user.getId().equals(diary.getUserId())) {
            return Result.fail(403, "只能发布自己的日记");
        }
        String content = diary.getContent();
        if (content == null || content.trim().isEmpty()) {
            return Result.fail(400, "日记内容为空，无法发布");
        }

        Article existed = findDiaryArticle(user.getId(), diaryId);
        if (existed != null) {
            return Result.success(publishResult(existed.getId(), true, existed.getVisibility()));
        }

        Article article = new Article();
        article.setAuthorId(user.getId());
        article.setTitle(buildDiaryTitle(diary));
        article.setSummary(buildDiarySummary(content));
        article.setWeight(Article.Article_Common);
        article.setViewCounts(0);
        article.setCreateDate(System.currentTimeMillis());
        // 日记更私人：发布后先私密，由作者确认再切公开
        article.setVisibility(Article.VISIBILITY_PRIVATE);
        article.setSourceType("diary");
        article.setSourceId(diaryId);

        try {
            articleMapper.insert(article);
        } catch (DuplicateKeyException e) {
            // 并发双击/重试：唯一索引挡住第二次，返回已发布的文章
            Article published = findDiaryArticle(user.getId(), diaryId);
            if (published != null) {
                return Result.success(publishResult(published.getId(), true, published.getVisibility()));
            }
            throw e;
        }

        ArticleBody body = new ArticleBody();
        body.setArticleId(article.getId());
        body.setContent(content);
        // 简短版：正文按 Markdown 原文存一份，渲染交给前端
        body.setContentHtml(content);
        articleBodyMapper.insert(body);

        article.setBodyId(body.getId());
        articleMapper.updateById(article);

        return Result.success(publishResult(article.getId(), false, Article.VISIBILITY_PRIVATE));
    }

    /** 切换可见性。单列更新，天然原子，不需要事务。 */
    @Override
    public Result updateVisibility(String articleId, int visibility) {
        SysUser user = UserThreadLocal.get();
        if (user == null) {
            return Result.fail(401, "未登录");
        }
        Article article = articleMapper.selectById(articleId);
        if (article == null) {
            return Result.fail(404, "文章不存在");
        }
        if (!user.getId().equals(article.getAuthorId())) {
            return Result.fail(403, "只能修改自己的文章");
        }
        if (visibility == Article.VISIBILITY_PUBLIC) {
            ArticleBody body = article.getBodyId() == null ? null : articleBodyMapper.selectById(article.getBodyId());
            if (body == null || body.getContent() == null || body.getContent().trim().isEmpty()) {
                return Result.fail(400, "正文为空，无法公开");
            }
        }
        // 用 UpdateWrapper 只 set 一列：updateById 会把 weight 等默认值一起写回
        articleMapper.update(null, new LambdaUpdateWrapper<Article>()
                .eq(Article::getId, articleId)
                .set(Article::getVisibility, visibility));
        return Result.success(null);
    }

    private Article findDiaryArticle(String authorId, String diaryId) {
        LambdaQueryWrapper<Article> qw = new LambdaQueryWrapper<>();
        qw.eq(Article::getAuthorId, authorId)
                .eq(Article::getSourceType, "diary")
                .eq(Article::getSourceId, diaryId);
        return articleMapper.selectOne(qw);
    }

    private Map<String, Object> publishResult(String articleId, boolean existed, Integer visibility) {
        Map<String, Object> data = new HashMap<>();
        data.put("id", articleId);
        data.put("existed", existed);
        data.put("visibility", visibility);
        return data;
    }

    private String buildDiaryTitle(Diary diary) {
        if (diary.getTitle() != null && !diary.getTitle().trim().isEmpty()) {
            return diary.getTitle().trim();
        }
        String date = diary.getCreateDate() == null
                ? new DateTime().toString("yyyy-MM-dd")
                : new DateTime(diary.getCreateDate()).toString("yyyy-MM-dd");
        return "日记 · " + date;
    }

    /** 摘要直接从正文截取，不调 AI —— 慢调用不能进事务 */
    private String buildDiarySummary(String content) {
        String plain = content
                .replaceAll("!\\[[^\\]]*\\]\\([^)]*\\)", "")
                .replaceAll("\\[([^\\]]*)\\]\\([^)]*\\)", "$1")
                .replaceAll("[#>*`_~\\-]", " ")
                .replaceAll("\\s+", " ")
                .trim();
        return plain.length() > 120 ? plain.substring(0, 120) + "…" : plain;
    }

    @Override
    public Result listArchives() {
        List<Archives> archivesList = articleMapper.listArchives();
        return Result.success(archivesList);
    }
}
