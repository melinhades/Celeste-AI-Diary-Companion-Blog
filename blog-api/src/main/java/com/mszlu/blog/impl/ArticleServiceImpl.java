package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mszlu.blog.dao.dos.Archives;
import com.mszlu.blog.dao.mapper.ArticleBodyMapper;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.ArticleBody;
import com.mszlu.blog.vo.params.ArticleTag;
import com.mszlu.blog.dao.pojo.Category;
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
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
    private CategoryService categoryService;

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

    private List<ArticleVo> copyList(List<Article> records, boolean isAuthor, boolean isBody, boolean isTags, boolean isCategory){
        List<ArticleVo> articleVoList = new ArrayList<>();
        for (Article article : records) {
            ArticleVo articleVo = copy(article, isAuthor, isBody, isTags, isCategory);
            articleVoList.add(articleVo);
        }
        return articleVoList;
    }
    @Override
    public List<ArticleVo> listArticlesPage(PageParams pageParams) {
        QueryWrapper<Article> queryWrapper = new QueryWrapper<>();
        Page<Article> page = new Page<>(pageParams.getPage(), pageParams.getPageSize());
        Page<Article> articlePage = articleMapper.selectPage(page, queryWrapper);
        List<ArticleVo> articleVoList = copyList(articlePage.getRecords(), true, false, true);
        return articleVoList;
    }

    @Override
    public Result hotArticle(int limit) {
        LambdaQueryWrapper<Article> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.orderByDesc(Article::getViewCounts);
        queryWrapper.select(Article::getId, Article::getTitle);
        queryWrapper.last("limit " + limit);
        List<Article> articles = articleMapper.selectList(queryWrapper);
        return Result.success(copyList(articles, false, false, false));
    }
    @Override
    public Result newArticles(int limit) {
        LambdaQueryWrapper<Article> queryWrapper = new LambdaQueryWrapper<>();
        queryWrapper.orderByDesc(Article::getCreateDate);
        queryWrapper.select(Article::getId, Article::getTitle);
        queryWrapper.last("limit " + limit);
        List<Article> articles = articleMapper.selectList(queryWrapper);
        return Result.success(copyList(articles, false, false, false));

    }

    public Result listArticle(PageParams pageParams) {
        Page<Article> page = new Page<>(pageParams.getPage(),pageParams.getPageSize());
        IPage<Article> articleIPage = articleMapper.listArticle(page,pageParams.getCategoryId(),pageParams.getTagId(),pageParams.getYear(),pageParams.getMonth());
        List<Article> records = articleIPage.getRecords();
        return Result.success(copyList(records,true,true,true));


    }


    @Override
    public Result findArticlesById(String articleId) {
        /*1.根据id查询 文章信息
        2.根据bodyId和categoryId 去做关联查询
         */
        Article article = this.articleMapper.selectById(articleId);
        ArticleVo articleVo =copy(article,true,true,true,true);
        //查看完文章增加阅读数后更新时有写加锁，导致性能降低
        //线程池 可以把更新操作扔到线程池中去执行，和主线程就不相关了
        threadService.updateArticleViewCount(articleMapper,article);
        return Result.success(articleVo);
    }
    @Autowired
    private ArticleBodyMapper articleBodyMapper;

    @Autowired
    private ThreadService threadService;
    private ArticleBodyVo findArticleBodyById(String bodyId) {
        ArticleBody articleBody = articleBodyMapper.selectById(bodyId);
        ArticleBodyVo articleBodyVo = new ArticleBodyVo();
        articleBodyVo.setContent(articleBody.getContent());
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
        article.setCategoryId(articleParam.getCategory().getId());

        //插入之后 会生成一个文章id
        this.articleMapper.insert(article);

        //tag
        List<TagVo> tags = articleParam.getTags();
        if(tags != null) {
            for (TagVo tag : tags) {
                String articleId = article.getId();
                ArticleTag articleTag = new ArticleTag();
                articleTag.setTagId(tag.getId());
                articleTag.setArticleId(articleId);
                articleTagMapper.insert(articleTag);
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
    public Result listArchives() {
        List<Archives> archivesList = articleMapper.listArchives();
        return Result.success(archivesList);
    }
}
