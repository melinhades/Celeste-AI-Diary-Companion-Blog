package com.mszlu.blog.impl;

import com.mszlu.blog.dao.mapper.ArticleMapper;
import com.mszlu.blog.dao.mapper.CommentsMapper;
import com.mszlu.blog.dao.mapper.NotificationMapper;
import com.mszlu.blog.dao.pojo.Article;
import com.mszlu.blog.dao.pojo.Comment;
import com.mszlu.blog.dao.pojo.Notification;
import com.mszlu.blog.dao.pojo.SysUser;
import com.mszlu.blog.service.SysUserService;
import com.mszlu.blog.utils.UserThreadLocal;
import com.mszlu.blog.vo.Result;
import com.mszlu.blog.vo.params.CommentParam;
import com.mszlu.blog.vo.params.CommentVo;
import com.mszlu.blog.vo.params.UserVo;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 匿名评论的正反用例。
 * 覆盖：写库携带匿名标记、通知同步匿名标记、空 toUserId 归一、匿名行不下发 author、
 * 公开行照常解析作者、历史行 anonymous=null 按非匿名处理。
 */
@ExtendWith(MockitoExtension.class)
class CommentsServiceImplTest {

    @Mock
    private CommentsMapper commentsMapper;
    @Mock
    private SysUserService sysUserService;
    @Mock
    private ArticleMapper articleMapper;
    @Mock
    private NotificationMapper notificationMapper;
    @InjectMocks
    private CommentsServiceImpl commentsService;

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

    private Article articleOwnedBy(String authorId) {
        Article article = new Article();
        article.setId("2001");
        article.setAuthorId(authorId);
        return article;
    }

    private CommentParam param(String content, Boolean anonymous) {
        CommentParam p = new CommentParam();
        p.setArticleId("2001");
        p.setContent(content);
        p.setAnonymous(anonymous);
        return p;
    }

    private Comment row(String id, int level, Integer anonymous) {
        Comment c = new Comment();
        c.setId(id);
        c.setArticleId("2001");
        c.setAuthorId("1001");
        c.setContent("c" + id);
        c.setLevel(level);
        c.setParentId("0");
        c.setToUid("0");
        c.setAnonymous(anonymous);
        return c;
    }

    // ===== 写库 =====

    @Test
    void comment_anonymous_storesFlagAndMasksNotificationSender() {
        loginAs("1001");
        when(articleMapper.selectById("2001")).thenReturn(articleOwnedBy("9001"));

        Result r = commentsService.comment(param("hi", true));
        assertTrue(r.isSuccess());

        ArgumentCaptor<Comment> saved = ArgumentCaptor.forClass(Comment.class);
        verify(commentsMapper).insert(saved.capture());
        assertEquals(Integer.valueOf(1), saved.getValue().getAnonymous());
        // 顶级评论没有回复对象，toUid 归一成 "0"
        assertEquals("0", saved.getValue().getToUid());

        ArgumentCaptor<Notification> notif = ArgumentCaptor.forClass(Notification.class);
        verify(notificationMapper).insert(notif.capture());
        assertEquals(Integer.valueOf(1), notif.getValue().getAnonymous());
        assertEquals("9001", notif.getValue().getUserId());
    }

    @Test
    void comment_anonymousNotPassed_treatedAsPublic() {
        loginAs("1001");
        when(articleMapper.selectById("2001")).thenReturn(articleOwnedBy("9001"));

        commentsService.comment(param("hi", null));

        ArgumentCaptor<Comment> saved = ArgumentCaptor.forClass(Comment.class);
        verify(commentsMapper).insert(saved.capture());
        assertEquals(Integer.valueOf(0), saved.getValue().getAnonymous());

        ArgumentCaptor<Notification> notif = ArgumentCaptor.forClass(Notification.class);
        verify(notificationMapper).insert(notif.capture());
        assertEquals(Integer.valueOf(0), notif.getValue().getAnonymous());
    }

    @Test
    void comment_replyToAnonymousTarget_blankToUserIdFallsBackToArticleAuthor() {
        loginAs("1001");
        when(articleMapper.selectById("2001")).thenReturn(articleOwnedBy("9001"));

        CommentParam p = param("回复一下", true);
        p.setParent("500");
        // 匿名评论的 author 不下发 id，前端只能传空串
        p.setToUserId("");
        commentsService.comment(p);

        ArgumentCaptor<Comment> saved = ArgumentCaptor.forClass(Comment.class);
        verify(commentsMapper).insert(saved.capture());
        assertEquals("0", saved.getValue().getToUid());
        assertEquals(Integer.valueOf(2), saved.getValue().getLevel());

        ArgumentCaptor<Notification> notif = ArgumentCaptor.forClass(Notification.class);
        verify(notificationMapper).insert(notif.capture());
        assertEquals("9001", notif.getValue().getUserId());
    }

    // ===== 读库下发 =====

    @SuppressWarnings("unchecked")
    private List<CommentVo> voList(Result r) {
        return (List<CommentVo>) r.getData();
    }

    @Test
    void commentsByArticleId_anonymousRow_omitsAuthorAndSkipsUserLookup() {
        when(commentsMapper.selectList(any()))
                .thenReturn(List.of(row("1", 1, 1)), Collections.emptyList());

        List<CommentVo> vos = voList(commentsService.commentsByArticleId("2001"));

        assertEquals(1, vos.size());
        assertEquals(Integer.valueOf(1), vos.get(0).getAnonymous());
        assertNull(vos.get(0).getAuthor());
        verify(sysUserService, never()).findUserVoById(anyString());
    }

    @Test
    void commentsByArticleId_publicRow_resolvesAuthor() {
        when(commentsMapper.selectList(any()))
                .thenReturn(List.of(row("2", 1, 0)), Collections.emptyList());
        UserVo author = new UserVo();
        author.setId("1001");
        author.setNickname("Alice");
        when(sysUserService.findUserVoById("1001")).thenReturn(author);

        List<CommentVo> vos = voList(commentsService.commentsByArticleId("2001"));

        assertEquals("Alice", vos.get(0).getAuthor().getNickname());
        assertEquals(Integer.valueOf(0), vos.get(0).getAnonymous());
    }

    @Test
    void commentsByArticleId_legacyRowWithoutAnonymous_isPublic() {
        when(commentsMapper.selectList(any()))
                .thenReturn(List.of(row("3", 1, null)), Collections.emptyList());
        UserVo author = new UserVo();
        author.setId("1001");
        author.setNickname("Bob");
        when(sysUserService.findUserVoById("1001")).thenReturn(author);

        List<CommentVo> vos = voList(commentsService.commentsByArticleId("2001"));

        assertEquals(Integer.valueOf(0), vos.get(0).getAnonymous());
        assertEquals("Bob", vos.get(0).getAuthor().getNickname());
    }
}
