package com.mszlu.blog.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mszlu.blog.dao.mapper.ArticleBodyMapper;
import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.ArticleBody;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.CategoryService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.ArticleVo;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 文章「首次公开时间」publish_time 的正反用例。
 * 覆盖：私密转公开写入时间、已记过时间的文章不被反复切换冲掉、切回私密只动 visibility、
 * 非作者改可见性直接拒绝不写库、历史文章没记时间时下发 null 而不是报错、
 * 没选分类的文章不下发空 CategoryVo（否则详情页多出一枚空胶囊）。
 */
@ExtendWith(MockitoExtension.class)
class ArticleServiceImplPublishTimeTest {

    @Mock
    private ArticleMapper articleMapper;
    @Mock
    private ArticleBodyMapper articleBodyMapper;
    @Mock
    private CategoryService categoryService;
    @InjectMocks
    private ArticleServiceImpl articleService;

    /** Lambda 条件构造器要按实体解析列名，单测里没有 Spring 容器，得手工把 TableInfo 缓存建起来 */
    @BeforeAll
    static void initLambdaColumnCache() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), Article.class);
    }

    @AfterEach
    void tearDown() {
        UserThreadLocal.remove();
    }

    private void loginAs(String userId) {
        SysUser user = new SysUser();
        user.setId(userId);
        user.setAccount("acc" + userId);
        UserThreadLocal.put(user);
    }

    private Article article(Integer visibility, Long publishTime) {
        Article a = new Article();
        a.setId("2001");
        a.setAuthorId("1001");
        a.setBodyId("3001");
        a.setCreateDate(1_700_000_000_000L);
        a.setVisibility(visibility);
        a.setPublishTime(publishTime);
        return a;
    }

    /** 切成公开要求正文非空，这里给一段有内容的正文 */
    private void stubNonEmptyBody() {
        ArticleBody body = new ArticleBody();
        body.setContent("山顶的风");
        when(articleBodyMapper.selectById("3001")).thenReturn(body);
    }

    @SuppressWarnings("unchecked")
    private String capturedSqlSet() {
        ArgumentCaptor<LambdaUpdateWrapper<Article>> captor =
                ArgumentCaptor.forClass((Class) LambdaUpdateWrapper.class);
        verify(articleMapper).update(isNull(), captor.capture());
        return captor.getValue().getSqlSet();
    }

    // ===== 私密转公开 =====

    @Test
    void updateVisibility_firstPublic_stampsPublishTime() {
        loginAs("1001");
        when(articleMapper.selectById("2001")).thenReturn(article(Article.VISIBILITY_PRIVATE, null));
        stubNonEmptyBody();

        Result r = articleService.updateVisibility("2001", Article.VISIBILITY_PUBLIC);

        assertTrue(r.isSuccess());
        String sqlSet = capturedSqlSet();
        assertTrue(sqlSet.contains("visibility"), "可见性仍然要写：" + sqlSet);
        assertTrue(sqlSet.contains("publish_time"), "首次公开应写入 publish_time：" + sqlSet);
    }

    @Test
    void updateVisibility_rePublic_keepsEarliestPublishTime() {
        loginAs("1001");
        // 公开过又被收回私密的旧文章：时间已经有了，不能再覆盖
        when(articleMapper.selectById("2001"))
                .thenReturn(article(Article.VISIBILITY_PRIVATE, 1_700_000_100_000L));
        stubNonEmptyBody();

        articleService.updateVisibility("2001", Article.VISIBILITY_PUBLIC);

        assertFalse(capturedSqlSet().contains("publish_time"));
    }

    @Test
    void updateVisibility_toPrivate_touchesOnlyVisibility() {
        loginAs("1001");
        when(articleMapper.selectById("2001")).thenReturn(article(Article.VISIBILITY_PUBLIC, 1_700_000_100_000L));

        articleService.updateVisibility("2001", Article.VISIBILITY_PRIVATE);

        String sqlSet = capturedSqlSet();
        assertFalse(sqlSet.contains("publish_time"));
        // 收回私密不需要读正文，避免多打一次库
        verify(articleBodyMapper, never()).selectById(any());
    }

    @Test
    void updateVisibility_notAuthor_rejectedBeforeWrite() {
        loginAs("9999");
        when(articleMapper.selectById("2001")).thenReturn(article(Article.VISIBILITY_PRIVATE, null));

        Result r = articleService.updateVisibility("2001", Article.VISIBILITY_PUBLIC);

        assertFalse(r.isSuccess());
        verify(articleMapper, never()).update(any(), any());
    }

    // ===== 下发给前端 =====

    @Test
    void copy_legacyArticleWithoutPublishTime_leavesFieldNull() {
        ArticleVo vo = articleService.copy(article(Article.VISIBILITY_PUBLIC, null), false, false, false);

        assertNull(vo.getPublishTime());
        assertEquals(Integer.valueOf(Article.VISIBILITY_PUBLIC), vo.getVisibility());
    }

    @Test
    void copy_articleWithPublishTime_formatsIt() {
        ArticleVo vo = articleService.copy(
                article(Article.VISIBILITY_PUBLIC, 1_700_000_000_000L), false, false, false);

        assertTrue(vo.getPublishTime().matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}"), vo.getPublishTime());
    }

    @Test
    void copy_articleWithoutCategory_leavesCategoryNullInsteadOfEmptyVo() {
        Article a = article(Article.VISIBILITY_PUBLIC, null);
        a.setCategoryId(null);

        ArticleVo vo = articleService.copy(a, false, false, false, true);

        assertNull(vo.getCategory());
        verify(categoryService, never()).findCategoryById(any());
    }
}
